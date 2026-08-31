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

// Get the latest release tag REACHABLE from the linux branch HEAD.
// This prevents old tags from other branches (e.g. v1.0.0-alpha.1 on master)
// from becoming accidental baselines.
function getLastReleaseTag() {
  // Get all tags reachable from linux HEAD, sorted by version descending
  const reachable = run('git tag -l "v*" --sort=-v:refname').split('\n').filter(Boolean)
  if (reachable.length === 0) return null

  // Find first alpha/beta/stable tag (skip non-release tags)
  for (const tag of reachable) {
    const v = tag.replace(/^v/, '')
    if (semver.valid(v) && (v.includes('-alpha.') || v.includes('-beta.') || !v.includes('-'))) {
      return v
    }
  }
  return null
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

function createReleasePR(version, changes) {
  const branch = `release/v${version}`
  const sections = ['features', 'fixes', 'security', 'docs']
  const icons = { features: '✨', fixes: '🛠️', security: '🔐', docs: '📚' }
  const labels = { features: 'New', fixes: 'Fixes', security: 'Security', docs: 'Documentation' }

  let changelogBody = ''
  for (const section of sections) {
    const items = changes[section] || []
    if (items.length === 0) continue
    changelogBody += `\n### ${icons[section]} ${labels[section]}\n`
    for (const item of items) {
      changelogBody += `- ${item.msg}\n`
    }
  }

  const prBody = `## Changelog\n${changelogBody}\n---\n*This release was prepared automatically by release automation.*`

  // Create branch from current linux HEAD
  run(`git checkout -b ${branch}`)

  // Stage and commit generated files
  run('git add src/data/releases.json src/data/whats-new.json src-tauri/tauri.conf.json package.json src-tauri/Cargo.toml')
  const commitMsg = `chore(release): v${version}`
  try {
    run(`git commit -m "${commitMsg}"`)
  } catch {
    // Nothing to commit (files unchanged)
    // Continue to push existing commit
  }

  // Push branch (no force)
  run(`git push -u origin ${branch}`)

  // Create PR
  run(`gh pr create --base linux --head ${branch} --title "Release v${version}" --body "${prBody}" --label release`)
}

function updateReleasePR(version, changes) {
  const branch = `release/v${version}`
  const sections = ['features', 'fixes', 'security', 'docs']
  const icons = { features: '✨', fixes: '🛠️', security: '🔐', docs: '📚' }
  const labels = { features: 'New', fixes: 'Fixes', security: 'Security', docs: 'Documentation' }

  let changelogBody = ''
  for (const section of sections) {
    const items = changes[section] || []
    if (items.length === 0) continue
    changelogBody += `\n### ${icons[section]} ${labels[section]}\n`
    for (const item of items) {
      changelogBody += `- ${item.msg}\n`
    }
  }

  const prBody = `## Changelog\n${changelogBody}\n---\n*This release was prepared automatically by release automation.*`

  // Checkout the release branch
  run(`git checkout ${branch}`)

  // Pull latest (in case of concurrent updates)
  run(`git pull origin ${branch}`)

  // Regenerate and commit
  run('git add src/data/releases.json src/data/whats-new.json src-tauri/tauri.conf.json package.json src-tauri/Cargo.toml')
  try {
    run('git diff --cached --quiet')
    // No changes to commit
  } catch {
    run('git commit -m "chore(release): update release data"')
  }

  // Push normally (no force)
  run(`git push origin ${branch}`)

  // Update PR metadata
  const prNumber = findReleasePR(version)
  if (prNumber) {
    run(`gh pr edit ${prNumber} --title "Release v${version}" --body "${prBody}"`)
  }
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

  if (!parsed.prerelease || !parsed.prerelease[0].startsWith('alpha')) {
    throw new Error(`Version ${current} is not in alpha channel. Promotion must be done manually.`)
  }

  const alphaNum = (parsed.prerelease[1] || 0) + 1
  return semver.format({
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch,
    prerelease: ['alpha', alphaNum]
  })
}

// ============================================================
// Stage A: Prepare
// ============================================================

export function prepareRelease() {
  console.log('[release-helper] Stage A: Prepare release')

  // === Idempotency check ===
  // First, read releases.json — this is the durable source of truth.
  // If a version entry already exists, this release was already prepared,
  // even if the tag hasn't been created yet (finalize runs post-merge).
  let existingReleases = []
  if (fs.existsSync(RELEASES_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(RELEASES_PATH, 'utf8'))
      existingReleases = raw.releases || []
    } catch {
      existingReleases = []
    }
  }

  // Check if the candidate version already has an entry in releases.json
  const lastTagVersion = getLastReleaseTag()
  const commits = getCommitsSince(lastTagVersion)

  // Separate releasable (triggers release) from includable (goes into notes)
  const releasable = commits.filter(isReleasable)
  const includable = commits.filter(shouldIncludeInNotes)

  if (releasable.length === 0) {
    console.log('[release-helper] No releasable commits since last tag. No release needed.')
    return null
  }

  // Calculate next version from last tag
  const currentVersion = lastTagVersion || '1.0.0-alpha.1'
  const newVersion = nextAlphaVersion(currentVersion)

  // Idempotency: if releases.json already has this version entry, skip
  const alreadyReleased = existingReleases.findIndex(r => r.version === newVersion)
  if (alreadyReleased >= 0) {
    console.log(`[release-helper] Version ${newVersion} already prepared (in releases.json). No re-release.`)
    return { version: newVersion, prNumber: null, alreadyReleased: true, idempotent: true }
  }

  // Check if a Release PR already exists for this version (by branch matching)
  const existingPR = findReleasePR(newVersion)

  // Build changes by category
  const changes = { features: [], fixes: [], security: [], docs: [] }
  for (const c of includable) {
    const section = classifyChange(c)
    changes[section].push({
      msg: humanify(c.scope || c.msg),
      type: c.type
    })
  }

  // Write generated files (always regenerate to reflect latest state)
  writeReleasesFile(newVersion, changes)
  writeWhatsNewFile(newVersion, changes)

  // Update version in tauri.conf.json and sync
  writeConf(newVersion)
  run('bun run sync-version')

  if (existingPR) {
    // Update existing Release PR
    console.log(`[release-helper] Updating existing Release PR #${existingPR} for v${newVersion}`)
    updateReleasePR(newVersion, changes)
    return { version: newVersion, prNumber: existingPR, updated: true }
  } else {
    // Create new Release PR
    console.log(`[release-helper] Creating Release PR for v${newVersion}`)
    createReleasePR(newVersion, changes)
    return { version: newVersion, prNumber: null, updated: false }
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
