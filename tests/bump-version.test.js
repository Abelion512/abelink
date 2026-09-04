/**
 * Unit tests for the REAL semverBump from scripts/bump-version.mjs.
 * Safe to import: the script only runs main() when executed directly.
 */
import { describe, it, expect } from 'vitest'
import { semverBump } from '../scripts/bump-version.mjs'

describe('semverBump', () => {
  it('patch: 5.0.0 -> 5.0.1', () => {
    expect(semverBump('5.0.0', 'patch')).toBe('5.0.1')
  })

  it('minor: 5.0.0 -> 5.1.0 (patch direset)', () => {
    expect(semverBump('5.0.7', 'minor')).toBe('5.1.0')
  })

  it('major: 5.9.9 -> 6.0.0 (minor & patch direset)', () => {
    expect(semverBump('5.9.9', 'major')).toBe('6.0.0')
  })

  it('mempertahankan suffix prerelease (alpha channel)', () => {
    expect(semverBump('1.0.0-alpha.1', 'patch')).toBe('1.0.1-alpha.1')
    expect(semverBump('1.0.0-alpha.1', 'minor')).toBe('1.1.0-alpha.1')
    expect(semverBump('1.0.0-alpha.1', 'major')).toBe('2.0.0-alpha.1')
  })

  it('menolak versi tidak valid', () => {
    expect(() => semverBump('bukan-versi', 'patch')).toThrow('Invalid version')
    expect(() => semverBump('1.2', 'patch')).toThrow('Invalid version')
  })

  it('menolak tipe bump tidak dikenal', () => {
    expect(() => semverBump('1.0.0', 'hotfix')).toThrow()
  })
})
