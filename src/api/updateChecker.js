import semver from 'semver'

const REPO = 'Abelion512/mark-agent-linux'
const CACHE_KEY = 'mark:update-cache'
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours
const CHECK_INTERVAL = 60 * 60 * 1000 // 1 hour

let currentVersion = null
let checkTimer = null

function getChannel(version) {
  if (!version) return 'stable'
  if (version.includes('-alpha.')) return 'alpha'
  if (version.includes('-beta.')) return 'beta'
  return 'stable'
}

async function fetchReleases() {
  const url = `https://api.github.com/repos/${REPO}/releases?per_page=30&sort=created`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return null
    const data = await res.json()
    return data.filter(r => !r.draft && !r.prerelease === false)
  } catch {
    clearTimeout(timeout)
    return null
  }
}

function selectChannelRelease(releases, channel) {
  // Group by channel
  const byChannel = { alpha: [], beta: [], stable: [] }
  for (const r of releases) {
    const tag = r.tag_name.replace(/^v/, '')
    const ch = getChannel(tag)
    byChannel[ch].push({ ...r, version: tag })
  }

  // Get latest in user's channel
  const candidates = byChannel[channel] || byChannel.stable
  if (candidates.length === 0) return null

  // Sort by semver descending
  candidates.sort((a, b) => semver.rcompare(a.version, b.version))
  return candidates[0]
}

function isNewer(latest, current) {
  if (!latest || !current) return false
  return semver.gt(latest.version, current.version)
}

export function initUpdateChecker(version) {
  currentVersion = version

  // Startup check
  checkForUpdate()

  // Periodic check
  checkTimer = setInterval(checkForUpdate, CHECK_INTERVAL)
}

export async function checkForUpdate() {
  if (!currentVersion) return

  const channel = getChannel(currentVersion)

  // Check cache first
  const cached = getCache()
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    maybeNotify(cached.data, channel)
    return
  }

  // Fetch releases
  const releases = await fetchReleases()
  if (!releases) return

  setCache(releases)
  maybeNotify(releases, channel)
}

function maybeNotify(releases, channel) {
  if (!releases) return

  const latest = selectChannelRelease(releases, channel)
  if (!latest) return

  if (!isNewer(latest, currentVersion)) return

  // Check if already seen
  const lastSeen = localStorage.getItem('mark:last-seen-whats-new')
  if (lastSeen === latest.version) return

  // Emit event
  const event = new CustomEvent('mark:update-available', {
    detail: {
      version: latest.version,
      url: latest.html_url,
      name: latest.name || latest.tag_name,
      isSecurity: latest.name?.toLowerCase().includes('security') || false
    }
  })
  window.dispatchEvent(event)
}

function getCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function setCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }))
  } catch {
    // localStorage full or unavailable — fail silently
  }
}

export function markAsSeen(version) {
  try {
    localStorage.setItem('mark:last-seen-whats-new', version)
  } catch {
    // ignore
  }
}

export function destroyUpdateChecker() {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
}