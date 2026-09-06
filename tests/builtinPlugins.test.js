// Built-in plugins (ponytail/caveman) — konten prompt + logika toggle.
// Pure module test: tanpa Dexie, tanpa jaringan.
import { describe, it, expect } from 'vitest'
import {
  BUILTIN_PLUGIN_DEFAULTS,
  resolvePluginToggles,
  getBuiltinPluginsPrompt,
  getCavemanReportRules
} from '../src/api/ai/builtinPlugins'

describe('resolvePluginToggles', () => {
  it('config tanpa key builtinPlugins -> default semua ON', () => {
    expect(resolvePluginToggles({})).toEqual({ ponytail: true, caveman: true })
    expect(resolvePluginToggles(null)).toEqual(BUILTIN_PLUGIN_DEFAULTS)
    expect(resolvePluginToggles(undefined)).toEqual(BUILTIN_PLUGIN_DEFAULTS)
  })

  it('config lama dengan builtinPlugins object parsial -> key hilang tetap ON (fail-open)', () => {
    expect(resolvePluginToggles({ builtinPlugins: { ponytail: false } })).toEqual({
      ponytail: false,
      caveman: true
    })
  })

  it('explicit false mematikan, explicit true menyalakan', () => {
    expect(resolvePluginToggles({ builtinPlugins: { ponytail: false, caveman: false } })).toEqual({
      ponytail: false,
      caveman: false
    })
    expect(resolvePluginToggles({ builtinPlugins: { ponytail: true, caveman: true } })).toEqual({
      ponytail: true,
      caveman: true
    })
  })

  it('builtinPlugins bukan object (rusak) -> default ON', () => {
    expect(resolvePluginToggles({ builtinPlugins: 'ya' })).toEqual(BUILTIN_PLUGIN_DEFAULTS)
    expect(resolvePluginToggles({ builtinPlugins: 123 })).toEqual(BUILTIN_PLUGIN_DEFAULTS)
  })
})

describe('getBuiltinPluginsPrompt', () => {
  it('default: berisi ladder ponytail + rules caveman', () => {
    const prompt = getBuiltinPluginsPrompt({})
    expect(prompt).toContain('PONYTAIL')
    expect(prompt).toContain('YAGNI')
    expect(prompt).toContain('CAVEMAN')
  })

  it('overrides bisa mematikan satu plugin tanpa mengubah config', () => {
    const prompt = getBuiltinPluginsPrompt({}, { caveman: false })
    expect(prompt).toContain('PONYTAIL')
    expect(prompt).not.toContain('CAVEMAN')
  })

  it('config false mematikan; semua off -> string kosong (tanpa blok palsu)', () => {
    const conf = { builtinPlugins: { ponytail: false, caveman: false } }
    expect(getBuiltinPluginsPrompt(conf)).toBe('')
  })

  it('overrides menang atas config', () => {
    const conf = { builtinPlugins: { ponytail: true, caveman: true } }
    expect(getBuiltinPluginsPrompt(conf, { ponytail: false, caveman: false })).toBe('')
  })

  it('aturan keamanan ponytail selalu disertakan (lazy not negligent)', () => {
    const prompt = getBuiltinPluginsPrompt({})
    expect(prompt).toMatch(/TIDAK PERNAH dipotong/)
  })

  it('aturan caveman melindungi kode/path/error dari pemangkasan', () => {
    const rules = getCavemanReportRules()
    expect(rules).toMatch(/JANGAN pernah meringkas/)
    expect(rules).toMatch(/pesan error/)
  })
})
