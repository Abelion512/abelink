// release-version.mjs — logika penomoran rilis BERSAMA (single source).
//
// Dipakai: scripts/release-helper.mjs (pipeline), scripts/bump-version.mjs
// (manual), tests/release-scenarios.test.mjs (verifikasi).
// Skema SemVer 2.0.0 (https://semver.org): MAJOR naik saat incompatible,
// MINOR naik saat fitur kompatibel, PATCH naik saat bugfix kompatibel.
// Kanal alpha: basis ikut jenis commit, counter alpha GLOBAL MONOTON
// (tidak reset) — pola semantic-release/changesets prerelease:
// feat di 1.0.0-alpha.4 -> 1.1.0-alpha.5; fix berikut -> 1.0.1-alpha.6.
import { parse as semverParse, valid as semverValid } from './semver-lite.mjs'

export const RELEASE_CHANNEL_ALPHA = 'alpha'

export function parseChannel(version) {
  const parsed = semverParse(version)
  if (!parsed || !parsed.prerelease.length) return 'stable'
  return String(parsed.prerelease[0])
}

// Klasifikasi bump dari SATU commit conventional.
// Urutan prioritas diputuskan pemanggil (tertinggi menang): major > minor > patch.
export function bumpRank(commit) {
  const msg = String(commit?.msg || commit || '')
  const type = String(commit?.type || '').toLowerCase()
  // Conventional Commits: setiap type dengan ! sebelum : -> breaking change.
  // Contoh: feat!:, fix!:, refactor!:, feat(scope)!:
  // Footer 'BREAKING CHANGE:' atau 'BREAKING-CHANGE:' juga major.
  if (/^[a-z]+(\([^)]*\))?!:/.test(msg) || /breaking[ -]change/i.test(msg) || type === 'breaking') return 'major'
  if (/^feat(\(|:)/i.test(msg) || type === 'feat') return 'minor'
  if (/^(fix|security|perf|patch)(\(|:)/i.test(msg) || ['fix', 'security'].includes(type)) return 'patch'
  return null
}

// Bump tertinggi dari sekumpulan commit (mayoritas konvensi proyek).
export function detectBumpType(commits) {
  const rank = { major: 3, minor: 2, patch: 1 }
  let best = null
  for (const c of commits || []) {
    const r = bumpRank(c)
    if (r && (!best || rank[r] > rank[best])) best = r
  }
  return best || 'patch'
}

// Versi berikut di kanal alpha: basis bump per jenis, counter +1 monoton.
// Stabil (tanpa suffix alpha) DITOLAK — promosi stabil manual, bukan otomatis.
export function nextVersion(current, bumpType) {
  const parsed = semverParse(current)
  if (!parsed) throw new Error(`Cannot parse version: ${current}`)
  if (parsed.prerelease.length === 0 || String(parsed.prerelease[0]) !== RELEASE_CHANNEL_ALPHA) {
    throw new Error(`Version ${current} is not in alpha channel. Promotion must be done manually.`)
  }
  if (!['major', 'minor', 'patch'].includes(bumpType)) {
    throw new Error(`Unknown bump type: ${bumpType}`)
  }
  let { major, minor, patch } = parsed
  if (bumpType === 'major') {
    major += 1
    minor = 0
    patch = 0
  } else if (bumpType === 'minor') {
    minor += 1
    patch = 0
  } else {
    patch += 1
  }
  const alphaNum = Number(parsed.prerelease[1] || 0) + 1
  return `${major}.${minor}.${patch}-alpha.${alphaNum}`
}

// Kompat mundur: pipeline lama hanya naikkan counter.
export function nextAlphaVersion(current) {
  return nextVersion(current, 'patch')
}

export function isValidReleaseVersion(v) {
  return Boolean(semverValid(v))
}
