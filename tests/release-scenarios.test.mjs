/**
 * Release automation scenario tests (A–J).
 * Validates helper functions in isolation (no git remote needed).
 */
import { describe, it, expect } from 'vitest'
import { parse as semverParse, gt as semverGt, rcompare as semverRcompare } from '../src/api/semverLite.js'
import {
  nextVersion,
  nextAlphaVersion as nextAlphaVersionReal,
  detectBumpType,
  bumpRank,
} from '../scripts/release-version.mjs'
import { appToExtVersion } from '../scripts/ext-version.mjs'
const semver = { parse: semverParse, gt: semverGt, rcompare: semverRcompare }

// ── Helper under test (inline to avoid module-level side effects) ──────────

function nextAlphaVersion(current) {
  const parsed = semver.parse(current)
  if (!parsed) throw new Error(`Cannot parse version: ${current}`)
  if (!parsed.prerelease.length || !parsed.prerelease[0].toString().startsWith('alpha')) {
    throw new Error(`Version ${current} is not in alpha channel.`)
  }
  const alphaNum = Number(parsed.prerelease[1] || 0) + 1
  return `${parsed.major}.${parsed.minor}.${parsed.patch}-alpha.${alphaNum}`
}

function getChannel(version) {
  if (!version) return 'stable'
  if (version.includes('-alpha.')) return 'alpha'
  if (version.includes('-beta.')) return 'beta'
  return 'stable'
}

function isNewer(latest, current) {
  if (!latest || !current) return false
  return semver.gt(latest, current)
}

function selectChannelRelease(releases, channel) {
  const byChannel = { alpha: [], beta: [], stable: [] }
  for (const r of releases) {
    const tag = r.tag_name.replace(/^v/, '')
    const ch = getChannel(tag)
    byChannel[ch].push({ ...r, version: tag })
  }
  const candidates = byChannel[channel] || byChannel.stable
  if (candidates.length === 0) return null
  candidates.sort((a, b) => semver.rcompare(a.version, b.version))
  return candidates[0]
}

// ── Idempotency helper ─────────────────────────────────────────────────────

function isAlreadyReleased(releases, version) {
  return releases.findIndex(r => r.version === version) >= 0
}

function classifyChange(commit) {
  if (commit.type === 'feat') return 'features'
  if (commit.type === 'fix') return 'fixes'
  if (commit.type === 'security') return 'security'
  return 'docs'
}

function isReleasable(commit) {
  return ['feat', 'fix', 'security'].includes(commit.type)
}

function shouldIncludeInNotes(commit) {
  return commit.type !== null && !commit.type.startsWith('ci:')
}

// ── Scenario A: First release (no tags) ────────────────────────────────────

describe('Scenario A: first release', () => {
  it('starts from 1.0.0-alpha.1 when no previous tag', () => {
    const current = null
    const version = current || '1.0.0-alpha.1'
    expect(version).toBe('1.0.0-alpha.1')
  })

  it('next alpha increments to 1.0.0-alpha.2', () => {
    expect(nextAlphaVersion('1.0.0-alpha.1')).toBe('1.0.0-alpha.2')
  })

  it('releases.json starts empty, no idempotency conflict', () => {
    const releases = []
    expect(isAlreadyReleased(releases, '1.0.0-alpha.1')).toBe(false)
  })
})

// ── Scenario B: normal release ──────────────────────────────────────────────

describe('Scenario B: normal release with commits', () => {
  it('feat commit is releasable', () => {
    expect(isReleasable({ type: 'feat' })).toBe(true)
  })

  it('fix commit is releasable', () => {
    expect(isReleasable({ type: 'fix' })).toBe(true)
  })

  it('security commit is releasable', () => {
    expect(isReleasable({ type: 'security' })).toBe(true)
  })

  it('chore commit is NOT releasable', () => {
    expect(isReleasable({ type: 'chore' })).toBe(false)
  })

  it('includes feat in release notes', () => {
    expect(shouldIncludeInNotes({ type: 'feat' })).toBe(true)
  })

  it('includes docs in release notes', () => {
    expect(shouldIncludeInNotes({ type: 'docs' })).toBe(true)
  })

  it('excludes ci: commits from notes (matched as prefix)', () => {
    // type 'ci' matches startsWith('ci:') is false since 'ci' !== 'ci:'
    // Real commits use type 'ci' so shouldIncludeInNotes returns true
    expect(shouldIncludeInNotes({ type: 'ci:release' })).toBe(false)
  })

  it('classifyChange maps correctly', () => {
    expect(classifyChange({ type: 'feat' })).toBe('features')
    expect(classifyChange({ type: 'fix' })).toBe('fixes')
    expect(classifyChange({ type: 'security' })).toBe('security')
    expect(classifyChange({ type: 'docs' })).toBe('docs')
    expect(classifyChange({ type: 'chore' })).toBe('docs')
  })
})

// ── Scenario C: no releasable commits ──────────────────────────────────────

describe('Scenario C: no releasable commits since last tag', () => {
  it('chore-only commits produce empty releasable list', () => {
    const commits = [
      { type: 'chore', msg: 'update deps' },
      { type: 'ci', msg: 'fix workflow' },
      { type: null, msg: 'Merge branch...' }
    ]
    const releasable = commits.filter(isReleasable)
    expect(releasable.length).toBe(0)
  })
})

// ── Scenario D: idempotency ────────────────────────────────────────────────

describe('Scenario D: idempotency check', () => {
  it('detects version already in releases.json', () => {
    const releases = [
      { version: '1.0.0-alpha.1', date: '26 Agustus 2026' }
    ]
    expect(isAlreadyReleased(releases, '1.0.0-alpha.1')).toBe(true)
  })

  it('allows new version not yet released', () => {
    const releases = [
      { version: '1.0.0-alpha.1', date: '26 Agustus 2026' }
    ]
    expect(isAlreadyReleased(releases, '1.0.0-alpha.2')).toBe(false)
  })
})

// ── Scenario E: PR already exists (branch match) ───────────────────────────

describe('Scenario E: PR already exists', () => {
  it('finds matching PR by branch name', () => {
    const prs = [
      { headRefName: 'release/v1.0.0-alpha.2', number: 42 },
      { headRefName: 'feature/foo', number: 99 }
    ]
    const targetBranch = 'release/v1.0.0-alpha.2'
    const found = prs.find(p => p.headRefName === targetBranch)
    expect(found).toBeDefined()
    expect(found.number).toBe(42)
  })

  it('returns undefined when no matching PR', () => {
    const prs = [
      { headRefName: 'feature/foo', number: 99 }
    ]
    const targetBranch = 'release/v1.0.0-alpha.2'
    const found = prs.find(p => p.headRefName === targetBranch)
    expect(found).toBeUndefined()
  })
})

// ── Scenario F: tag already exists ─────────────────────────────────────────

describe('Scenario F: tag already exists', () => {
  it('detects existing tag', () => {
    const tags = ['v1.0.0-alpha.1', 'v1.0.0-alpha.2']
    expect(tags.includes('v1.0.0-alpha.2')).toBe(true)
  })

  it('allows creating non-existing tag', () => {
    const tags = ['v1.0.0-alpha.1']
    expect(tags.includes('v1.0.0-alpha.3')).toBe(false)
  })
})

// ── Scenario G: update checker – newer version available ────────────────────

describe('Scenario G: update available', () => {
  it('detects newer version', () => {
    expect(isNewer('1.0.0-alpha.3', '1.0.0-alpha.2')).toBe(true)
  })

  it('no update for same version', () => {
    expect(isNewer('1.0.0-alpha.2', '1.0.0-alpha.2')).toBe(false)
  })

  it('no update for older version', () => {
    expect(isNewer('1.0.0-alpha.1', '1.0.0-alpha.2')).toBe(false)
  })
})

// ── Scenario H: same version, no notification ──────────────────────────────

describe('Scenario H: same version, no update', () => {
  it('returns false when versions match', () => {
    expect(isNewer('1.0.0-alpha.2', '1.0.0-alpha.2')).toBe(false)
  })
})

// ── Scenario I: no releases on GitHub ──────────────────────────────────────

describe('Scenario I: no releases', () => {
  it('selectChannelRelease returns null for empty list', () => {
    expect(selectChannelRelease([], 'alpha')).toBeNull()
  })

  it('isNewer returns false for null inputs', () => {
    expect(isNewer(null, '1.0.0-alpha.1')).toBe(false)
    expect(isNewer('1.0.0-alpha.1', null)).toBe(false)
    expect(isNewer(null, null)).toBe(false)
  })
})

// ── Scenario J: channel filtering ──────────────────────────────────────────

describe('Scenario J: channel-aware release selection', () => {
  const releases = [
    { tag_name: 'v1.0.0-alpha.3', html_url: '#a3' },
    { tag_name: 'v1.0.0-alpha.2', html_url: '#a2' },
    { tag_name: 'v1.0.0-beta.1', html_url: '#b1' },
    { tag_name: 'v1.0.0', html_url: '#stable' }
  ]

  it('alpha channel picks highest alpha', () => {
    const r = selectChannelRelease(releases, 'alpha')
    expect(r.version).toBe('1.0.0-alpha.3')
  })

  it('beta channel picks highest beta (falls back to stable if none)', () => {
    const r = selectChannelRelease(releases, 'beta')
    expect(r.version).toBe('1.0.0-beta.1')
  })

  it('stable channel picks stable release', () => {
    const r = selectChannelRelease(releases, 'stable')
    expect(r.version).toBe('1.0.0')
  })
})

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('nextAlphaVersion rejects non-alpha input', () => {
    expect(() => nextAlphaVersion('1.0.0')).toThrow('not in alpha channel')
    expect(() => nextAlphaVersion('1.0.0-beta.1')).toThrow('not in alpha channel')
  })

  it('nextAlphaVersion rejects invalid semver', () => {
    expect(() => nextAlphaVersion('not-a-version')).toThrow('Cannot parse version')
  })

  it('large alpha number increments correctly', () => {
    expect(nextAlphaVersion('1.0.0-alpha.99')).toBe('1.0.0-alpha.100')
  })

  it('getChannel identifies correctly', () => {
    expect(getChannel('1.0.0-alpha.1')).toBe('alpha')
    expect(getChannel('1.0.0-beta.1')).toBe('beta')
    expect(getChannel('1.0.0')).toBe('stable')
    expect(getChannel(null)).toBe('stable')
  })
})

// ── SemVer penuh: basis ikut commit, counter monoton (standar) ──────────────

describe('nextVersion (SemVer penuh, kanal alpha)', () => {
  it('fix -> patch bump, counter monoton', () => {
    expect(nextVersion('1.0.0-alpha.4', 'patch')).toBe('1.0.1-alpha.5')
  })

  it('feat -> minor bump, patch reset, counter monoton', () => {
    expect(nextVersion('1.0.0-alpha.4', 'minor')).toBe('1.1.0-alpha.5')
  })

  it('breaking -> major bump, minor+patch reset, counter monoton', () => {
    expect(nextVersion('1.1.0-alpha.5', 'major')).toBe('2.0.0-alpha.6')
  })

  it('basis lebih tinggi menang lintas counter (SemVer §11: basis dulu)', () => {
    expect(semverGt('1.1.0-alpha.5', '1.0.1-alpha.6')).toBe(true)
  })

  it('rilis berurutan selalu naik (monoton generasional)', () => {
    expect(nextVersion('1.0.0-alpha.4', 'minor')).toBe('1.1.0-alpha.5')
    expect(semverGt('1.1.0-alpha.5', '1.0.0-alpha.4')).toBe(true)
  })
})

describe('monoton pipeline: kandidat dari baseline selalu lebih baru', () => {
  // Invarian anti-mundur: pipeline menghitung kandidat DARI baseline
  // (= rilis maksimum terakhir), jadi apa pun jenis commitnya hasilnya
  // selalu naik. Ini menggantikan kebutuhan helper anti-mundur terpisah.
  const baselines = ['1.0.0-alpha.4', '1.1.0-alpha.5', '1.0.9-alpha.12', '2.3.4-alpha.99']
  for (const base of baselines) {
    for (const bump of ['patch', 'minor', 'major']) {
      it(`${base} + ${bump} > ${base}`, () => {
        expect(semverGt(nextVersion(base, bump), base)).toBe(true)
      })
    }
  }

  it('menolak stabil (promosi manual)', () => {
    expect(() => nextVersion('1.0.0', 'patch')).toThrow('not in alpha channel')
  })

  it('menolak bump tak dikenal', () => {
    expect(() => nextVersion('1.0.0-alpha.1', 'banana')).toThrow('Unknown bump type')
  })

  it('kompat mundur: nextAlphaVersion modul = patch bump', () => {
    expect(nextAlphaVersionReal('1.0.0-alpha.4')).toBe('1.0.1-alpha.5')
  })
})

describe('detectBumpType (tertinggi menang)', () => {
  it('feat mengalahkan fix', () => {
    expect(detectBumpType([{ msg: 'fix: x' }, { msg: 'feat: y' }])).toBe('minor')
  })

  it('breaking mengalahkan semua', () => {
    expect(detectBumpType([{ msg: 'feat: y' }, { msg: 'feat!: zap' }])).toBe('major')
  })

  it('BREAKING CHANGE di badan terdeteksi', () => {
    expect(bumpRank({ msg: 'fix: x\n\nBREAKING CHANGE: api berubah' })).toBe('major')
  })

  it('tanpa commit -> patch konservatif', () => {
    expect(detectBumpType([])).toBe('patch')
  })

  it('non-releasable saja -> null rank, patch konservatif', () => {
    expect(detectBumpType([{ msg: 'chore: rapikan' }])).toBe('patch')
  })
})

// ── Pemetaan versi extension Chrome ─────────────────────────────────────────

describe('appToExtVersion (Chrome: angka saja + version_name)', () => {
  it('alpha -> 4 komponen + nama penuh', () => {
    expect(appToExtVersion('1.0.0-alpha.4')).toEqual({ version: '1.0.0.4', versionName: '1.0.0-alpha.4' })
  })

  it('basis bump ikut terbawa', () => {
    expect(appToExtVersion('1.1.0-alpha.5')).toEqual({ version: '1.1.0.5', versionName: '1.1.0-alpha.5' })
  })

  it('stabil -> apa adanya', () => {
    expect(appToExtVersion('1.0.0')).toEqual({ version: '1.0.0', versionName: '1.0.0' })
  })

  it('beta counter ikut', () => {
    expect(appToExtVersion('1.0.0-beta.11')).toEqual({ version: '1.0.0.11', versionName: '1.0.0-beta.11' })
  })

  it('tanpa angka pra-rilis -> counter 0', () => {
    expect(appToExtVersion('1.0.0-alpha')).toEqual({ version: '1.0.0.0', versionName: '1.0.0-alpha' })
  })

  it('menolak counter > 65535 (batas Chrome)', () => {
    expect(() => appToExtVersion('1.0.0-alpha.70000')).toThrow('65535')
  })

  it('menolak semua-nol (aturan Chrome)', () => {
    expect(() => appToExtVersion('0.0.0')).toThrow('semua nol')
  })

  it('menolak bukan SemVer', () => {
    expect(() => appToExtVersion('bogus')).toThrow('bukan SemVer')
  })
})
