import { describe, it, expect } from 'vitest'
import path from 'path'
import { resolveDataHome, brandDir, isDev } from '../sidecar/main/utils/dataHome.mjs'
import { harnessRoot, parseArgs } from '../scripts/harness-common.mjs'

describe('dataHome.mjs contracts', () => {
  it('resolveDataHome prioritizes ABELINK_DATA_HOME', () => {
    const env = {
      ABELINK_DATA_HOME: '/custom/abelink-data',
      XDG_DATA_HOME: '/custom/xdg',
      HOME: '/home/tester'
    }
    expect(resolveDataHome(env)).toBe('/custom/abelink-data')
  })

  it('resolveDataHome falls back to XDG_DATA_HOME when ABELINK_DATA_HOME is missing or empty', () => {
    const env = {
      ABELINK_DATA_HOME: '   ',
      XDG_DATA_HOME: '/custom/xdg',
      HOME: '/home/tester'
    }
    expect(resolveDataHome(env)).toBe('/custom/xdg')
  })

  it('resolveDataHome falls back to ~/.local/share when XDG_DATA_HOME is missing', () => {
    const env = {
      HOME: '/home/tester'
    }
    expect(resolveDataHome(env)).toBe('/home/tester/.local/share')
  })

  it('brandDir appends abelink once', () => {
    const env = {
      ABELINK_DATA_HOME: '/custom/data-home'
    }
    expect(brandDir(env)).toBe(path.join('/custom/data-home', 'abelink'))
  })

  it('isDev correctly identifies dev vs prod environments', () => {
    // NODE_ENV=development
    expect(isDev({ NODE_ENV: 'development' })).toBe(true)

    // ABELINK_DEV flags
    expect(isDev({ ABELINK_DEV: '1' })).toBe(true)
    expect(isDev({ ABELINK_DEV: 'true' })).toBe(true)
    expect(isDev({ ABELINK_DEV: '0' })).toBe(false)

    // ABELINK_DATA_HOME dev namespace
    expect(isDev({ ABELINK_DATA_HOME: '/home/tester/.local/share/abelink-dev' })).toBe(true)
    expect(isDev({ ABELINK_DATA_HOME: '/tmp/custom-dev' })).toBe(true)

    // Production default
    expect(isDev({})).toBe(false)
    expect(isDev({ NODE_ENV: 'production', ABELINK_DATA_HOME: '/opt/custom-storage' })).toBe(false)
  })
})

describe('harness-common.mjs contracts', () => {
  it('parseArgs correctly parses flags and values', () => {
    const args = ['--session', 'ses_123', '--verbose', '--date', '2026-09-14']
    const parsed = parseArgs(args)
    expect(parsed.session).toBe('ses_123')
    expect(parsed.verbose).toBe(true)
    expect(parsed.date).toBe('2026-09-14')
  })

  it('harnessRoot resolves matching Rust data_home().join("abelink").join("harness")', () => {
    const root = harnessRoot('/override/path')
    expect(root).toBe('/override/path')

    const defaultRoot = harnessRoot()
    expect(defaultRoot).toContain(path.join('abelink', 'harness'))
  })
})

import { sanitizeSkillRelPath } from '../sidecar/engine/channels/skills.mjs'

describe('skills.mjs sanitizeSkillRelPath (fail-closed)', () => {
  it('rejects path traversal with null', () => {
    expect(sanitizeSkillRelPath('../outside.md')).toBeNull()
    expect(sanitizeSkillRelPath('sub/../../outside.md')).toBeNull()
    expect(sanitizeSkillRelPath('/etc/passwd')).toBeNull()
    expect(sanitizeSkillRelPath('~/secret')).toBeNull()
    expect(sanitizeSkillRelPath('')).toBeNull()
    expect(sanitizeSkillRelPath(null)).toBeNull()
  })

  it('preserves and normalizes safe relative paths', () => {
    expect(sanitizeSkillRelPath('SKILL.md')).toBe('SKILL.md')
    expect(sanitizeSkillRelPath('sub/nested/file.txt')).toBe(path.join('sub', 'nested', 'file.txt'))
    expect(sanitizeSkillRelPath('./foo/./bar.md')).toBe(path.join('foo', 'bar.md'))
  })
})
