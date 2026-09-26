// tests/cli-model-catalog.test.mjs — S1: katalog dinamis 9Router.
// Murni + stub (tanpa network): normalisasi, cache TTL, atomic write,
// kurasi picker, recent cap, resolve (alias/katalog/langsung/gemini-web).
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  MODELS_CACHE_TTL_MS,
  RECENT_CAP,
  normalizeCatalogEntry,
  normalizeCatalogList,
  readCatalogCache,
  writeCatalogCache,
  fetchLiveCatalog,
  curatePicker,
  pushRecent,
  resolveCatalogModel,
} from '../cli/tui/modelCatalog.mjs'
import { loadModelCatalog, saveRecentModels, modelPickerRows } from '../cli/tui/engine.mjs'

const SAMPLE = [
  { id: 'claude-work', object: 'model', capabilities: { reasoning: false, contextWindow: 128000, maxOutput: 384000, thinkingFormat: null, thinkingCanDisable: true } },
  { id: 'qwen', capabilities: { reasoning: true, contextWindow: 262144, maxOutput: 384000, thinkingFormat: 'qwen', thinkingCanDisable: true } },
  { id: 'nara/muse-spark-1.3-contributor-free', capabilities: { reasoning: true, contextWindow: 1048576, maxOutput: 131072, thinkingFormat: 'openai' } },
]

const memFs = () => {
  const files = new Map()
  return {
    files,
    readFileSync: (p, enc) => {
      if (!files.has(p)) throw new Error('ENOENT')
      return files.get(p)
    },
    writeFileSync: (p, data) => { files.set(p, String(data)) },
    mkdirSync: () => {},
    renameSync: (a, b) => { files.set(b, files.get(a)); files.delete(a) },
  }
}
const memPath = () => ({ dirname: (p) => String(p).split('/').slice(0, -1).join('/') || '.' })

describe('normalizeCatalogEntry', () => {
  it('ambil field dipakai; default aman', () => {
    const m = normalizeCatalogEntry(SAMPLE[2])
    expect(m).toMatchObject({ id: 'nara/muse-spark-1.3-contributor-free', reasoning: true, ctx: 1048576, maxOut: 131072, thinkFmt: 'openai', thinkDisable: true })
    expect(normalizeCatalogEntry({})).toMatchObject({ id: '', reasoning: false, ctx: null, thinkFmt: null })
  })
  it('list filter tanpa id', () => {
    expect(normalizeCatalogList([...SAMPLE, {}]).length).toBe(3)
    expect(normalizeCatalogList(null)).toEqual([])
  })
})

describe('cache TTL + atomic write (mem-fs)', () => {
  it('fresh -> stale false; tua -> stale true', () => {
    const f = memFs()
    const home = '/h'
    writeCatalogCache(SAMPLE, { fsMod: f, pathMod: memPath(), homeDir: home, now: 1000 })
    expect(readCatalogCache({ fsMod: f, homeDir: home, now: 1000 + MODELS_CACHE_TTL_MS - 1 }).stale).toBe(false)
    expect(readCatalogCache({ fsMod: f, homeDir: home, now: 1000 + MODELS_CACHE_TTL_MS + 1 }).stale).toBe(true)
  })
  it('hilang -> ok false; tmp ter-rename', () => {
    const f = memFs()
    expect(readCatalogCache({ fsMod: f, homeDir: '/h' }).ok).toBe(false)
    writeCatalogCache(SAMPLE, { fsMod: f, pathMod: memPath(), homeDir: '/h', now: 5 })
    expect([...f.files.keys()].some((k) => k.includes('.tmp-'))).toBe(false)
    expect(readCatalogCache({ fsMod: f, homeDir: '/h', now: 5 }).models.length).toBe(3)
  })
})

describe('fetchLiveCatalog (stub fetch)', () => {
  it('sukses -> normalisasi', async () => {
    const r = await fetchLiveCatalog({
      endpoint: 'http://x/v1',
      fetchFn: async () => ({ ok: true, json: async () => ({ data: SAMPLE }) }),
    })
    expect(r.ok).toBe(true)
    expect(r.models.length).toBe(3)
  })
  it('gagal -> ok false + error (never throw)', async () => {
    const r = await fetchLiveCatalog({ endpoint: 'http://x/v1', fetchFn: async () => { throw new Error('down') } })
    expect(r).toMatchObject({ ok: false, models: [] })
    expect(r.error).toContain('down')
  })
})

describe('curatePicker + pushRecent', () => {
  const models = normalizeCatalogList(SAMPLE)
  it('Favorites -> Recent -> providers + filter', () => {
    const p = curatePicker({ models, favorites: ['qwen'], recent: ['qwen', 'claude-work'], query: '' })
    expect(p.favorites).toEqual(['qwen'])
    expect(p.recent).toEqual(['claude-work'])
    expect(p.models).toContain('nara/muse-spark-1.3-contributor-free')
    expect(p.total).toBe(3)
  })
  it('query filter', () => {
    expect(curatePicker({ models, query: 'spark' }).models).toEqual(['nara/muse-spark-1.3-contributor-free'])
  })
  it('recent dedup + cap 10', () => {
    let r = []
    for (let i = 0; i < 12; i++) r = pushRecent(r, `m${i}`)
    expect(r.length).toBe(RECENT_CAP)
    expect(r[0]).toBe('m11')
    expect(pushRecent(r, 'm5')[0]).toBe('m5')
  })
})

describe('resolveCatalogModel', () => {
  const models = normalizeCatalogList(SAMPLE)
  const aliases = { gemini: 'google/gemini-3.8-flash' }
  it('alias menang', () => {
    expect(resolveCatalogModel('gemini', { models, aliases })).toMatchObject({ id: 'google/gemini-3.8-flash', via: 'alias' })
  })
  it('katalog exact (case-insensitive)', () => {
    expect(resolveCatalogModel('QWEN', { models, aliases })).toMatchObject({ id: 'qwen', via: 'katalog' })
  })
  it('ID langsung + warning label', () => {
    const r = resolveCatalogModel('acme/x', { models, aliases })
    expect(r.via).toBe('langsung')
    expect(r.label).toContain('tak ada di katalog')
  })
  it('gemini-web ditolak eksplisit', () => {
    const r = resolveCatalogModel('gemini-web', { models, aliases })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('GUI')
  })
  it('kosong -> error', () => {
    expect(resolveCatalogModel('', { models, aliases }).ok).toBe(false)
  })
})

describe('loadModelCatalog (engine, mem HOME + stub fetch)', () => {
  const mkDeps = (over = {}) => ({ homeDir: fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-cat-')), ...over })
  it('live sukses -> cache tertulis + fresh', async () => {
    const d = mkDeps({ fetchFn: async () => ({ ok: true, json: async () => ({ data: SAMPLE }) }) })
    const r = await loadModelCatalog({}, d)
    expect(r.stale).toBe(false)
    expect(r.models.length).toBe(3)
    expect(fs.existsSync(path.join(d.homeDir, '.config', 'abelink', 'models-cache.json'))).toBe(true)
  })
  it('live gagal + tanpa cache -> alias statis + error jujur', async () => {
    const d = mkDeps({ fetchFn: async () => { throw new Error('down') } })
    const r = await loadModelCatalog({}, d)
    expect(r.models).toEqual([])
    expect(r.error).toContain('alias statis')
  })
  it('live gagal + cache ada -> stale + error', async () => {
    const d = mkDeps()
    writeCatalogCache(SAMPLE, { fsMod: fs, pathMod: path, homeDir: d.homeDir, now: 1 })
    const r = await loadModelCatalog({}, { ...d, fetchFn: async () => { throw new Error('down') } })
    expect(r.stale).toBe(true)
    expect(r.models.length).toBe(3)
    expect(r.error).toContain('cache')
  })
  it('force refresh walau fresh', async () => {
    const d = mkDeps({ fetchFn: async () => ({ ok: true, json: async () => ({ data: SAMPLE }) }) })
    writeCatalogCache(SAMPLE, { fsMod: fs, pathMod: path, homeDir: d.homeDir, now: Date.now() })
    const r = await loadModelCatalog({}, d, true)
    expect(r.stale).toBe(false)
  })
})

describe('saveRecentModels (tmp HOME)', () => {
  it('merge + 0600', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-rec-'))
    const file = path.join(home, '.config', 'abelink', 'cli.json')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ model: 'qwen' }))
    const r = await saveRecentModels(['qwen', 'mimo'], { homeDir: home })
    expect(r.ok).toBe(true)
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toMatchObject({ model: 'qwen', recentModels: ['qwen', 'mimo'] })
    expect(fs.statSync(file).mode & 0o777).toBe(0o600)
  })
})

describe('modelPickerRows — default hanya model yang pernah dipakai', () => {
  const state = { model: 'oc/muse-spark-1.3-contributor-free', recentModels: ['qwen'] }
  const mkDeps = () => ({
    homeDir: fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-pick-')),
    aliases: { zen: 'oc/muse-spark-1.3-contributor-free' },
    cliConfig: { recentModels: ['qwen'], favModels: ['bor/mimo-v2.5:free'] },
    // fetchFn sengaja TIDAK diberi: default tidak boleh menyentuh jaringan.
  })

  it('tanpa cache + tanpa opt-in -> tanpa section Katalog + hint', async () => {
    const d = mkDeps()
    const r = await modelPickerRows(state, d, '')
    const sections = r.rows.map((x) => x.section)
    expect(sections).toContain('Aktif')
    expect(sections).toContain('Recent')
    expect(sections).toContain('Favorit')
    expect(sections).toContain('Alias')
    expect(sections).not.toContain('Katalog')
    expect(r.hint).toContain('/models --all')
  })

  it('cache disk (tanpa network) -> section Katalog boleh tampil', async () => {
    const d = mkDeps()
    writeCatalogCache(SAMPLE, { fsMod: fs, pathMod: path, homeDir: d.homeDir, now: Date.now() })
    const r = await modelPickerRows(state, d, '')
    expect(r.rows.some((x) => x.section === 'Katalog')).toBe(true)
    expect(r.hint).toBeNull()
  })

  it('filter tetap menyaring baris used/alias', async () => {
    const d = mkDeps()
    const r = await modelPickerRows(state, d, 'im')
    expect(r.rows.some((x) => x.id.includes('mimo'))).toBe(true)
  })
})
