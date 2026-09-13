/**
 * Unit test: prepare baseline anti-deadlock.
 * Repo baru tanpa tag remote tidak boleh mundur ke alpha.1 lalu terjebak
 * guard idempoten. Baseline diambil dari max(releases.json, last tag).
 */
import { describe, it, expect } from 'vitest'
import { parse, valid, lt, rcompare } from '../scripts/semver-lite.mjs'

function pickBaseline(lastTagVersion, existingReleases) {
  const releasesMax = (existingReleases || [])
    .map(r => r.version)
    .filter(v => valid(v))
    .sort((a, b) => rcompare(a, b))[0] || null
  return lastTagVersion && releasesMax
    ? (lt(lastTagVersion, releasesMax) ? releasesMax : lastTagVersion)
    : (lastTagVersion || releasesMax)
}

describe('release baseline anti-deadlock', () => {
  it('repo baru tanpa tag: baseline dari releases.json (alpha.3)', () => {
    const base = pickBaseline(null, [
      { version: '1.0.0-alpha.3' },
      { version: '1.0.0-alpha.2' },
    ])
    expect(base).toBe('1.0.0-alpha.3')
  })

  it('tag tertinggal dari releases.json: baseline ikut releases.json', () => {
    const base = pickBaseline('1.0.0-alpha.2', [{ version: '1.0.0-alpha.3' }])
    expect(base).toBe('1.0.0-alpha.3')
  })

  it('tag lebih baru dari releases.json: baseline ikut tag', () => {
    const base = pickBaseline('1.0.0-alpha.4', [{ version: '1.0.0-alpha.3' }])
    expect(base).toBe('1.0.0-alpha.4')
    expect(Number(parse(base).prerelease[1])).toBe(4)
  })

  it('keduanya kosong: null (caller fallback alpha.1)', () => {
    expect(pickBaseline(null, [])).toBeNull()
  })
})
