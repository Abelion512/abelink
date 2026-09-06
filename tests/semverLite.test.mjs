// Regression tests: scripts/semver-lite.mjs
//
// Kontrak yang dipatok di sini: gerbang rilis (release-finalize.yml) TIDAK
// boleh lagi bergantung pada paket `semver` yang tidak terdaftar di
// package.json. Perbandingan versi harus benar termasuk urutan prerelease,
// karena jalur rilis MARK memakai versi seperti 1.0.0-alpha.2 -> alpha.3.

import { describe, it, expect } from 'vitest'
import { parse, valid, compare, gt, lt, eq } from '../scripts/semver-lite.mjs'

describe('valid / parse', () => {
  it('menerima rilis biasa dan prerelease', () => {
    expect(valid('1.0.0')).toBe('1.0.0')
    expect(valid('1.0.0-alpha.2')).toBe('1.0.0-alpha.2')
    expect(valid(' 1.2.3 ')).toBe('1.2.3')
  })

  it('menolak versi tidak valid (termasuk prefix v)', () => {
    expect(valid('v1.0.0')).toBeNull()
    expect(valid('1.0')).toBeNull()
    expect(valid('01.0.0')).toBeNull()
    expect(valid('')).toBeNull()
    expect(valid(undefined)).toBeNull()
  })

  it('memecah komponen prerelease', () => {
    expect(parse('1.0.0-alpha.2')).toMatchObject({
      major: 1,
      minor: 0,
      patch: 0,
      prerelease: ['alpha', '2']
    })
  })
})

describe('compare — urutan versi', () => {
  it('membandingkan major/minor/patch', () => {
    expect(compare('1.0.1', '1.0.0')).toBe(1)
    expect(compare('1.1.0', '1.0.9')).toBe(1)
    expect(compare('2.0.0', '1.9.9')).toBe(1)
    expect(compare('1.0.0', '1.0.0')).toBe(0)
  })

  it('rilis final lebih tinggi dari prerelease-nya', () => {
    expect(gt('1.0.0', '1.0.0-alpha.1')).toBe(true)
    expect(lt('1.0.0-alpha.1', '1.0.0')).toBe(true)
  })

  it('urutan prerelease numerik benar (alpha.2 < alpha.3 < alpha.10)', () => {
    expect(gt('1.0.0-alpha.3', '1.0.0-alpha.2')).toBe(true)
    expect(gt('1.0.0-alpha.10', '1.0.0-alpha.9')).toBe(true)
    expect(gt('1.0.0-beta.1', '1.0.0-alpha.9')).toBe(true)
  })

  it('identifier numerik lebih rendah dari alfanumerik (SemVer 11.4.3)', () => {
    expect(lt('1.0.0-1', '1.0.0-alpha')).toBe(true)
  })

  it('set prerelease lebih pendek lebih rendah (SemVer 11.4.4)', () => {
    expect(lt('1.0.0-alpha', '1.0.0-alpha.1')).toBe(true)
  })

  it('build metadata diabaikan (SemVer 10)', () => {
    expect(eq('1.0.0+build.1', '1.0.0+build.999')).toBe(true)
  })

  it('melempar error jelas untuk input tidak valid', () => {
    expect(() => compare('v1.0.0', '1.0.0')).toThrow(/SemVer tidak valid/)
  })
})

describe('kasus nyata jalur rilis MARK', () => {
  it('alpha.3 dianggap lebih baru dari alpha.2 (gerbang release-finalize)', () => {
    expect(gt('1.0.0-alpha.3', '1.0.0-alpha.2')).toBe(true)
    expect(gt('1.0.0-alpha.2', '1.0.0-alpha.3')).toBe(false)
  })
})
