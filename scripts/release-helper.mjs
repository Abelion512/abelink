import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const CONF_PATH = path.join(ROOT, 'src-tauri/tauri.conf.json')
const RELEASES_PATH = path.join(ROOT, 'src/data/releases.json')
const WHATSNEW_PATH = path.join(ROOT, 'src/data/whats-new.json')

// ============================================================
// Helpers
// ============================================================

function formatDate() {
  const now = new Date()
  const months = [
    'Januari','Februari','Maret','April','Mei','Juni',
    'Juli','Agustus','September','Oktober','November','Desember'
  ]
  return `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`
}

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe','pipe','pipe'], ...opts }).trim()
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().trim() : e.message
    throw new Error(`Command failed: ${cmd}\n${msg}`)
  }
}

// Get the latest release tag REACHABLE from the current HEAD.
// Uses `git tag --merged HEAD` to guarantee ancestry — prevents
// old tags from other branches (e.g. v2.0.0 on master) from
// becoming accidental baselines.
function getLastReleaseTag() {
  // Step 1: Only tags that are ancestors of current HEAD
  let reachable = []
  try {
    const mergedTags = run('git tag --merged HEAD').split('\n').filter(Boolean)
    reachable = mergedTags.filter(t => t.startsWith('v'))
  } catch {
    // Fallback: no tags reachable (first release case)
    return null
  }

  if (reachable.length === 0) return null

  // Step 2: Filter for valid semver alpha/beta/stable releases
  const validReleases = reachable
    .map(t => t.replace(/^v/, ''))
    .filter(v => semver.valid(v) && (v.includes('-alpha.') || v.includes('-beta.') || !v.includes('-')))

  if (validReleases.length === 0) return null

  // Step 3: Sort by semver descending and return highest
  validReleases.sort((a, b) => semver.rcompare(a, b))
  return validReleases[0]
}

function getCommitsSince(version) {
  const tag = version ? `v${version}` : null
  const range = tag ? `${tag}..HEAD` : 'HEAD'
  const out = run(`git log --oneline ${range}`)
  return out.split('\n').filter(Boolean).map(line => {
    const [hash, ...rest] = line.split(' ')
    const msg = rest.join(' ')
    const m = msg.match(/^(\w+)(?:\([^)]+\))?:\s*(.*)/)
    return {
      hash,
      msg,
      type: m ? m[1] : null,
      scope: m ? m[2] : msg
    }
  })
}

function readConf() {
  return JSON.parse(fs.readFileSync(CONF_PATH, 'utf8'))
}

function writeConf(version) {
  const conf = readConf()
  conf.version = version
  fs.writeFileSync(CONF_PATH, JSON.stringify(conf, null, 2) + '\n')
}

// ============================================================
// Commit classification
// ============================================================

function isReleasable(commit) {
  return ['feat', 'fix', 'security'].includes(commit.type)
}

function shouldIncludeInNotes(commit) {
  // Include all conventional commits except ci-only internal ones
  return commit.type !== null && !commit.type.startsWith('ci:')
}

function classifyChange(commit) {
  if (commit.type === 'feat') return 'features'
  if (commit.type === 'fix') return 'fixes'
  if (commit.type === 'security') return 'security'
  if (['docs', 'test'].includes(commit.type)) return 'docs'
  if (commit.type === 'chore') return 'docs'
  return 'docs'
}

// Human-friendly: simplify without destroying technical meaning
// Stripping is conservative — only removes commit-message artifacts
function humanify(scope) {
  let s = scope
    .replace(/^\[.*?\]\s*/, '')          // [refs/xxx]
    .replace(/\([^)]*\)/g, '')           // (scope): prefix already stripped
    .replace(/\b(?:fix|feat|chore|docs|test|ci|security|refactor|build)\b/gi, '')
    .replace(/\s+/g, ' ').trim()
  if (!s) s = scope
  s = s.charAt(0).toUpperCase() + s.slice(1)
  return s
}

// ============================================================
// PR management
// ============================================================

function findReleasePR(version) {
  const targetBranch = `release/v${version}`
  try {
    const out = run(`gh pr list --base linux --label release --state open --json number,headRefName --jq '.[] | select(.headRefName == "${targetBranch}") | .number'`)
    if (!out) return null
    return parseInt(out)
  } catch {
    return null
  }
}

// Create new Release PR (called only for new releases)
function createReleasePR(version, changes) {
  const branch = `release/v${version}`
  const prBody = buildPRBody(changes)

  // Create branch from current linux HEAD (already on linux when called)
  run(`git checkout -b ${branch}`)

  // Generate files on the new branch
  writeAllFiles(version, changes)
  run('bun run sync-version')

  // Stage and commit generated files
  run('git add src/data/releases.json src/data/whats-new.json src-tauri/tauri.conf.json package.json src-tauri/Cargo.toml')
  try {
    run(`git commit -m "chore(release): v${version}"`)
  } catch {
    // Nothing to commit (files unchanged)
  }

  // Push branch (no force)
  run(`git push -u origin ${branch}`)

  // Create PR
  run(`gh pr create --base linux --head ${branch} --title "Release v${version}" --body "${prBody}" --label release`)
}

// ============================================================
// File generation
// ============================================================

function writeReleasesFile(version, changes) {
  let releases = []
  if (fs.existsSync(RELEASES_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(RELEASES_PATH, 'utf8'))
      releases = raw.releases || []
    } catch {
      releases = []
    }
  }

  const sections = {
    features: (changes.features || []).map(e => ({ msg: e.msg })),
    fixes: (changes.fixes || []).map(e => ({ msg: e.msg })),
    security: (changes.security || []).map(e => ({ msg: e.msg })),
    docs: (changes.docs || []).map(e => ({ msg: e.msg })),
  }

  // Check if this version already exists in releases.json (idempotency)
  const existingIndex = releases.findIndex(r => r.version === version)
  if (existingIndex >= 0) {
    // Update existing entry
    releases[existingIndex] = {
      version,
      date: formatDate(),
      summary: generateSummary(sections),
      sections
    }
  } else {
    releases.unshift({
      version,
      date: formatDate(),
      summary: generateSummary(sections),
      sections
    })
  }

  releases = releases.slice(0, 50)
  fs.writeFileSync(RELEASES_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), releases }, null, 2) + '\n')
}

function writeWhatsNewFile(version, changes) {
  // Compatibility projection for existing WhatNew.jsx
  // Maps semantic categories to legacy type labels
  const legacyMap = {
    features: 'AUTO',
    fixes: 'ATM',
    security: 'SECURITY',
    docs: 'DOCS'
  }

  const flatChanges = []
  for (const [section, legacyType] of Object.entries(legacyMap)) {
    for (const item of (changes[section] || [])) {
      flatChanges.push({ type: legacyType, msg: item.msg })
    }
  }

  const data = {
    version,
    date: formatDate(),
    summary: generateSummary({
      features: changes.features || [],
      fixes: changes.fixes || [],
      security: changes.security || [],
      docs: changes.docs || []
    }),
    linearUrl: 'https://linear.app/abelion/project/mark-agent-for-linux-10ceec65c326',
    changes: flatChanges
  }
  fs.writeFileSync(WHATSNEW_PATH, JSON.stringify(data, null, 2) + '\n')
}

function generateSummary(sections) {
  const counts = {
    features: (sections.features || []).length,
    fixes: (sections.fixes || []).length,
    security: (sections.security || []).length,
    docs: (sections.docs || []).length,
  }

  const parts = []
  if (counts.features) parts.push(`${counts.features} fitur baru`)
  if (counts.fixes) parts.push(`${counts.fixes} perbaikan`)
  if (counts.security) parts.push(`${counts.security} peningkatan keamanan`)
  if (counts.docs) parts.push(`${counts.docs} pembaruan dokumentasi`)

  if (parts.length === 0) return 'Peningkatan stabilitas dan perbaikan bug.'
  if (parts.length === 1) return `${parts[0]} dalam rilis ini.`
  const last = parts.pop()
  return `${parts.join(', ')} dan ${last}.`
}

// ============================================================
// Version management
// ============================================================

function nextAlphaVersion(current) {
  const parsed = semver.parse(current)
  if (!parsed) throw new Error(`Cannot parse version: ${current}`)

  if (!parsed.prerelease.length || !parsed.prerelease[0].toString().startsWith('alpha')) {
    throw new Error(`Version ${current} is not in alpha channel. Promotion must be done manually.`)
  }

  const alphaNum = (parsed.prerelease[1] || 0) + 1
  return `${parsed.major}.${parsed.minor}.${parsed.patch}-alpha.${alphaNum}`
}

// ============================================================
// Stage A: Prepare
// ============================================================

export function prepareRelease() {
  console.log('[release-helper] Stage A: Prepare release')

  // === Read releases.json for idempotency (durable state) ===
  let existingReleases = []
  if (fs.existsSync(RELEASES_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(RELEASES_PATH, 'utf8'))
      existingReleases = raw.releases || []
    } catch {
      existingReleases = []
    }
  }

  // === Calculate candidate version (pure, no git state mutation) ===
  const lastTagVersion = getLastReleaseTag()
  const commits = getCommitsSince(lastTagVersion)

  const releasable = commits.filter(isReleasable)
  const includable = commits.filter(shouldIncludeInNotes)

  if (releasable.length === 0) {
    console.log('[release-helper] No releasable commits since last tag. No release needed.')
    return null
  }

  const currentVersion = lastTagVersion || '1.0.0-alpha.1'
  const newVersion = nextAlphaVersion(currentVersion)

  // === Idempotency: does releases.json already have this version? ===
  // This is the PRIMARY guard — if the version entry exists, this run
  // was already prepared (even if PR is still open / tag not created).
  if (existingReleases.some(r => r.version === newVersion)) {
    // Also check if PR exists — if so, update it with fresh commits but keep same version
    const existingPR = findReleasePR(newVersion)
    if (existingPR) {
      console.log(`[release-helper] Version ${newVersion} already in releases.json. Updating PR #${existingPR} with latest commits (same version).`)
      // Branch selection happens BEFORE any file mutation
      run(`git checkout ${existingPR_branch(newVersion)}`)
      syncWithLinux()
      const changes = buildChanges(includable)
      writeAllFiles(newVersion, changes)
      commitAndPushIfChanged(newVersion, 'chore(release): update release data')
      updatePRMetadata(newVersion, changes)
      return { version: newVersion, prNumber: existingPR, updated: true, idempotent: true }
    }
    console.log(`[release-helper] Version ${newVersion} already prepared (in releases.json). No re-release.`)
    return { version: newVersion, prNumber: null, alreadyReleased: true, idempotent: true }
  }

  // === Check if a Release PR already exists ===
  const existingPR = findReleasePR(newVersion)
  const changes = buildChanges(includable)

  if (existingPR) {
    // Existing Release PR: checkout branch FIRST, then sync + regenerate
    console.log(`[release-helper] Updating existing Release PR #${existingPR} for v${newVersion}`)
    // Branch selection before file mutation — prevents checkout failure
    run(`git checkout release/v${newVersion}`)
    syncWithLinux()
    // Regenerate files on the release branch
    writeAllFiles(newVersion, changes)
    run('bun run sync-version')
    commitAndPushIfChanged(newVersion, 'chore(release): update release data')
    updatePRMetadata(newVersion, changes)
    return { version: newVersion, prNumber: existingPR, updated: true, idempotent: false }
  } else {
    // New Release PR: create branch from linux HEAD, generate, commit, push
    console.log(`[release-helper] Creating Release PR for v${newVersion}`)
    createReleasePR(newVersion, changes)
    return { version: newVersion, prNumber: null, updated: false }
  }
}

// ── Helpers refactored for testability ───────────────────────────────────────

function existingPR_branch(version) {
  return `release/v${version}`
}

function syncWithLinux() {
  // Fetch latest linux and merge into current release branch.
  // Strategy: -X theirs lets linux win non-generated conflicts;
  // generated files are overwritten in writeAllFiles anyway.
  // No force push. Errors propagate (no `|| true` or `||` swallowing).
  run(`git fetch origin linux`)
  run(`git merge origin/linux -m "Merge linux into release branch" -X theirs`)
  run(`git pull origin HEAD`)
}

function buildChanges(includable) {
  const changes = { features: [], fixes: [], security: [], docs: [] }
  for (const c of includable) {
    const section = classifyChange(c)
    changes[section].push({
      msg: humanify(c.scope || c.msg),
      type: c.type
    })
  }
  return changes
}

function writeAllFiles(version, changes) {
  writeReleasesFile(version, changes)
  writeWhatsNewFile(version, changes)
  writeConf(version)
  run('bun run sync-version')
}

function commitAndPushIfChanged(version, msg) {
  run('git add src/data/releases.json src/data/whats-new.json src-tauri/tauri.conf.json package.json src-tauri/Cargo.toml')
  try {
    run('git diff --cached --quiet')
    // No changes — nothing to commit
  } catch {
    run(`git commit -m "${msg}"`)
  }
  run(`git push origin release/v${version}`)
}

function buildPRBody(changes) {
  const sections = ['features', 'fixes', 'security', 'docs']
  const icons = { features: '✨', fixes: '🛠️', security: '🔐', docs: '📚' }
  const labels = { features: 'New', fixes: 'Fixes', security: 'Security', docs: 'Documentation' }
  let changelogBody = ''
  for (const section of sections) {
    const items = changes[section] || []
    if (items.length === 0) continue
    changelogBody += `\n### ${icons[section]} ${labels[section]}\n`
    for (const item of items) changelogBody += `- ${item.msg}\n`
  }
  return `## Changelog\n${changelogBody}\n---\n*This release was prepared automatically by release automation.*`
}

function updatePRMetadata(version, changes) {
  const prNumber = findReleasePR(version)
  if (prNumber) {
    const prBody = buildPRBody(changes)
    run(`gh pr edit ${prNumber} --title "Release v${version}" --body "${prBody}"`)
  }
}

// ============================================================
// Stage B: Finalize
// ============================================================

export function finalizeRelease() {
  console.log('[release-helper] Stage B: Finalize release')

  const conf = readConf()
  const version = conf.version
  if (!semver.valid(version)) throw new Error(`Invalid version in tauri.conf.json: ${version}`)
  const tag = `v${version}`

  // Guard 1: version synchronization
  console.log('[release-helper] Checking version synchronization...')
  try {
    run('bun run sync-version --check')
  } catch (e) {
    throw new Error(`Version drift detected: ${e.message}`)
  }

  // Guard 2: tag must not already exist
  const existingTags = run(`git tag -l "${tag}"`).split('\n').filter(Boolean)
  if (existingTags.includes(tag)) {
    throw new Error(`Tag ${tag} already exists. Refusing to overwrite.`)
  }

  // Create and push tag
  console.log(`[release-helper] Creating tag ${tag}...`)
  run(`git tag ${tag}`)
  run(`git push origin ${tag}`)

  console.log(`[release-helper] Tag ${tag} pushed. Release workflow will build and publish.`)
  return { version, tag }
}

// ============================================================
// CLI
// ============================================================

const command = process.argv[2]

if (command === 'prepare') {
  const result = prepareRelease()
  process.exit(result ? 0 : 0)
} else if (command === 'finalize') {
  const result = finalizeRelease()
  process.exit(result ? 0 : 0)
} else {
  console.error('Usage: node release-helper.mjs <prepare|finalize>')
  process.exit(1)
}
