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

// Generate date in Indonesian format (matching existing whats-new.json)
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
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', ...opts }).trim()
  } catch (e) {
    const msg = e.stderr || e.message
    throw new Error(`Command failed: ${cmd}\n${msg}`)
  }
}

function getLastTag() {
  try {
    return run('git describe --tags --abbrev=0')
  } catch {
    return null
  }
}

function getCommitsSince(tag) {
  // If no tag yet, use all history; otherwise commits after the tag
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

function getLatestTagVersion() {
  const tag = getLastTag()
  if (!tag) return null
  return tag.replace(/^v/, '')
}

function isReleasable(commit) {
  return ['feat', 'fix', 'security'].includes(commit.type)
}

function shouldIncludeInNotes(commit) {
  // All conventional commits except ci-only internal ones
  return commit.type !== null && !commit.type.startsWith('ci:')
}

function classifyChange(commit) {
  if (commit.type === 'feat') return 'features'
  if (commit.type === 'fix') return 'fixes'
  if (commit.type === 'security') return 'security'
  if (['docs', 'test'].includes(commit.type)) return 'docs'
  if (commit.type === 'chore') return 'docs' // cleanup/docs
  return 'docs'
}

function humanify(scope) {
  // Strip internal references, code identifiers, keep meaning
  let s = scope
    .replace(/\([^)]*\)/g, '') // remove parenthetical refs
    .replace(/^\[.*?\]\s*/, '') // remove leading [brackets]
    .replace(/\b[A-Z][a-z]+[A-Z]\w+/g, '') // remove camelCase types like htmlparser2
    .replace(/\b(?:fix|feat|chore|docs|test|ci|security|refactor|build)\b/gi, '')
    .replace(/\b(?:linux|tauri|rust|electron|window|git|webview|api)\b/gi, '')
    .replace(/\s+/g, ' ').trim()

  if (!s) s = scope // fallback
  s = s.charAt(0).toUpperCase() + s.slice(1)
  return s
}

function findExistingReleasePR() {
  try {
    const out = run('gh pr list --base linux --label release --json number,title,headRefName,state --jq ".[] | select(.state == \\"OPEN\\")"')
    if (!out) return null
    const prs = JSON.parse(out)
    return prs[0] || null
  } catch {
    return null
  }
}

function createOrUpdateReleasePR(version, changes, allEntries) {
  const branch = `release/v${version}`

  // Check if release PR already exists
  const existing = findExistingReleasePR()
  const prTitle = `Release v${version}`

  // Build changelog for PR body
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

  if (existing) {
    // Update existing PR
    run(`gh pr edit ${existing.number} --title "${prTitle}" --body "${prBody}"`)
    run(`git push origin ${branch} -f || true`)
    return existing.number
  }

  // Create new branch if needed
  try {
    run(`git rev-parse --verify ${branch}`)
  } catch {
    run(`git checkout -b ${branch}`)
    run('git push -u origin', { input: `${branch}\n` })
  }

  // Commit release files
  run('git add src/data/releases.json src/data/whats-new.json src-tauri/tauri.conf.json package.json src-tauri/Cargo.toml')
  const commitMsg = `chore(release): v${version}`
  try {
    run(`git commit -m "${commitMsg}"`)
  } catch {
    // Already committed, continue
  }
  run(`git push origin ${branch}`)

  // Create PR
  const result = run(`gh pr create --base linux --head ${branch} --title "${prTitle}" --body "${prBody}" --label release`)
  return result
}

function writeReleasesFile(version, changes, allEntries) {
  const now = formatDate()
  let releases = []

  if (fs.existsSync(RELEASES_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(RELEASES_PATH, 'utf8'))
      releases = raw.releases || []
    } catch {
      releases = []
    }
  }

  // Insert new release at front
  const sections = {
    features: (changes.features || []).map(e => ({ msg: e.msg })),
    fixes: (changes.fixes || []).map(e => ({ msg: e.msg })),
    security: (changes.security || []).map(e => ({ msg: e.msg })),
    docs: (changes.docs || []).map(e => ({ msg: e.msg })),
  }

  releases.unshift({
    version,
    date: now,
    summary: generateSummary(sections),
    sections
  })

  // Keep max 50 releases
  releases = releases.slice(0, 50)

  const output = {
    generatedAt: new Date().toISOString(),
    releases
  }

  fs.writeFileSync(RELEASES_PATH, JSON.stringify(output, null, 2) + '\n')
}

function writeWhatsNewFile(version, changes) {
  const now = formatDate()
  const flatChanges = [
    ...(changes.features || []).map(e => ({ type: 'AUTO', msg: e.msg })),
    ...(changes.fixes || []).map(e => ({ type: 'ATM', msg: e.msg })),
    ...(changes.security || []).map(e => ({ type: 'SECURITY', msg: e.msg })),
    ...(changes.docs || []).map(e => ({ type: 'DOCS', msg: e.msg })),
  ]

  const data = {
    version,
    date: now,
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

function syncVersion(version) {
  const conf = JSON.parse(fs.readFileSync(CONF_PATH, 'utf8'))
  conf.version = version
  fs.writeFileSync(CONF_PATH, JSON.stringify(conf, null, 2) + '\n')
  run('bun run sync-version')
}

function nextAlphaVersion(current) {
  const parsed = semver.parse(current)
  if (!parsed) throw new Error(`Cannot parse version: ${current}`)

  // Only increment alpha while in alpha channel
  if (!parsed.prerelease || !parsed.prerelease[0].startsWith('alpha')) {
    throw new Error(`Version ${current} is not in alpha channel. Promotion must be done manually.`)
  }

  // Increment alpha number
  const alphaNum = (parsed.prerelease[1] || 0) + 1
  return semver.format({
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch,
    prerelease: ['alpha', alphaNum]
  })
}

// ============================================================
// STAGE A: PREPARE
// ============================================================
export function prepareRelease() {
  console.log('[release-helper] Stage A: Prepare release')

  const lastTagVersion = getLatestTagVersion()
  const commits = getCommitsSince(`v${lastTagVersion}`)

  // Separate releasable (triggers release) from includable (goes into notes)
  const releasable = commits.filter(isReleasable)
  const includable = commits.filter(shouldIncludeInNotes)

  if (releasable.length === 0) {
    console.log('[release-helper] No releasable commits. No release needed.')
    return null
  }

  // Check: if only docs/test commits and no feat/fix/security, skip
  const hasRealChanges = releasable.some(c => ['feat', 'fix', 'security'].includes(c.type))
  if (!hasRealChanges) {
    console.log('[release-helper] Only docs/test/ci commits. No release.')
    return null
  }

  // Calculate next version
  const currentVersion = lastTagVersion || '1.0.0-alpha.1'
  const newVersion = nextAlphaVersion(currentVersion)

  console.log(`[release-helper] Current: ${currentVersion}, Next: ${newVersion}`)

  // Build changes by category
  const changes = { features: [], fixes: [], security: [], docs: [] }
  for (const c of includable) {
    const section = classifyChange(c)
    changes[section].push({
      msg: humanify(c.scope || c.msg),
      type: c.type
    })
  }

  // Write generated files
  writeReleasesFile(newVersion, changes, includable)
  writeWhatsNewFile(newVersion, changes)
  syncVersion(newVersion)

  // Create/update Release PR
  const prNumber = createOrUpdateReleasePR(newVersion, changes, includable)

  console.log(`[release-helper] Release PR #${prNumber} created/updated for v${newVersion}`)
  return { version: newVersion, prNumber }
}

// ============================================================
// STAGE B: FINALIZE
// ============================================================
export function finalizeRelease() {
  console.log('[release-helper] Stage B: Finalize release')

  // Guard 0: version from config (hoisted at top)
  const conf = JSON.parse(fs.readFileSync(CONF_PATH, 'utf8'))
  const version = conf.version
  if (!semver.valid(version)) throw new Error(`Invalid version in tauri.conf.json: ${version}`)
  const tag = `v${version}`

  // Guard 1: sync-version check
  console.log('[release-helper] Checking version synchronization...')
  try {
    run('bun run sync-version --check')
  } catch (e) {
    throw new Error(`Version drift detected: ${e.message}`)
  }

  // Guard 2: tag must not already exist
  // git tag -l returns list; if tag exists in list, skip
  const existingTags = run(`git tag -l "${tag}"`)
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
