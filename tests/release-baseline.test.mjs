/**
 * Unit test: prepare baseline.
 * A reachable tag is authoritative once release history exists.
 * releases.json is only the bootstrap fallback when no tag exists.
 */
import { describe, it, expect } from 'vitest'
import { selectReleaseBaseline } from '../scripts/release-version.mjs'

describe('release baseline', () => {
  it('repo baru tanpa tag: baseline dari releases.json (bootstrap alpha.3)', () => {
    const base = selectReleaseBaseline(null, [
      { version: '1.0.0-alpha.3' },
      { version: '1.0.0-alpha.2' },
    ])
    expect(base).toBe('1.0.0-alpha.3')
  })

  it('tag tetap authoritative meski releases.json punya pending minor lebih tinggi', () => {
    const base = selectReleaseBaseline('1.7.0-alpha.11', [
      { version: '1.8.0-alpha.12' },
      { version: '1.7.0-alpha.11' },
    ])
    expect(base).toBe('1.7.0-alpha.11')
  })

  it('tag lebih baru dari releases.json: baseline ikut tag', () => {
    const base = selectReleaseBaseline('1.0.0-alpha.4', [{ version: '1.0.0-alpha.3' }])
    expect(base).toBe('1.0.0-alpha.4')
  })

  it('keduanya kosong: null (caller fallback alpha.1)', () => {
    expect(selectReleaseBaseline(null, [])).toBeNull()
  })
})
