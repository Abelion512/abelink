// tests/cli-model-effort.test.mjs — V2-2/V2-3 + S1: resolve model (shim
// alias-statis; katalog dinamis di cli-model-catalog.test.mjs), effort wire
// map, auto resolve, max_tokens, cache warning, label sumber, persist
// cli.json (tmp HOME). Murni, tanpa network.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  resolveFamilyAlias,
  resolveModelInput,
  effortForWire,
  resolveAutoEffort,
  maxTokensFor,
  cacheSwitchWarning,
  persistCliField,
  modelSourceLabel,
  classifyAiError,
} from '../cli/tui/modelEffort.mjs'
import { MODEL_ALIASES, DEFAULT_CLI_MODEL } from '../src/api/ai/headlessCli.js'

describe('MODEL_ALIASES 9Router (A1: ID live, bukan OpenRouter)', () => {
  it('default = zen-free', () => {
    expect(DEFAULT_CLI_MODEL).toBe('oc/muse-spark-1.3-contributor-free')
  })
  it('alias inti -> ID terverifikasi POST (oc/combo/free)', () => {
    expect(MODEL_ALIASES.zen).toBe('oc/muse-spark-1.3-contributor-free')
    expect(MODEL_ALIASES.qwen).toBe('qwen')
    expect(MODEL_ALIASES.mimo).toBe('mimo')
    expect(MODEL_ALIASES.free).toBe('bor/mimo-v2.5:free')
    expect(MODEL_ALIASES['claude-work']).toBe(undefined)
  })
  it('tanpa ID OpenRouter mati', () => {
    const ids = Object.values(MODEL_ALIASES).join(' ')
    for (const dead of ['google/', 'moonshotai/', 'anthropic/', 'x-ai/', 'z-ai/', 'openrouter/', 'zenmux:']) {
      expect(ids).not.toContain(dead)
    }
  })
})

describe('classifyAiError (pesan per-lapis)', () => {
  it('network', () => {
    expect(classifyAiError('fetch failed ECONNREFUSED').layer).toBe('network')
  })
  it('credentials + provider terekstrak', () => {
    const c = classifyAiError('No active credentials for provider: google')
    expect(c.layer).toBe('credentials')
    expect(c.provider).toBe('google')
    expect(c.message).toContain('/models')
  })
  it('auth', () => {
    expect(classifyAiError('Missing API key').layer).toBe('auth')
    expect(classifyAiError('invalid_api_key').layer).toBe('auth')
  })
  it('unknown-model', () => {
    expect(classifyAiError('model not found: foo').layer).toBe('unknown-model')
  })
  it('other tak kosong', () => {
    expect(classifyAiError('weird').layer).toBe('other')
  })
})

describe('resolveFamilyAlias (A1: alias 9Router, keluarga claude = alias bor)', () => {
  it('alias existing -> via alias', () => {
    expect(resolveFamilyAlias('zen')).toMatchObject({ via: 'alias' })
    expect(resolveFamilyAlias('qwen')).toMatchObject({ via: 'alias' })
  })
  it('tanpa alias mati (fable/gemini/opus dihapus)', () => {
    expect(resolveFamilyAlias('fable')).toBe(null)
    expect(resolveFamilyAlias('gemini')).toBe(null)
    expect(resolveFamilyAlias('opus')).toBe(null)
    expect(resolveFamilyAlias('zen')).toMatchObject({ via: 'alias', id: 'oc/muse-spark-1.3-contributor-free' })
  })
})

describe('resolveModelInput (shim)', () => {
  it('alias -> id + label', () => {
    const r = resolveModelInput('zen')
    expect(r.ok).toBe(true)
    expect(r.id).toBe('oc/muse-spark-1.3-contributor-free')
    expect(r.label).toContain('zen')
  })
  it('non-alias -> ID langsung passthrough', () => {
    const r = resolveModelInput('acme/custom-1')
    expect(r).toMatchObject({ ok: true, id: 'acme/custom-1' })
    expect(r.label).toContain('langsung')
  })
  it('kosong -> error', () => {
    expect(resolveModelInput('').ok).toBe(false)
  })
})

describe('effortForWire (keputusan #4)', () => {
  it('low..max lolos utuh', () => {
    for (const e of ['low', 'medium', 'high', 'xhigh', 'max']) {
      expect(effortForWire(e)).toMatchObject({ wire: e, ultraLocal: false })
    }
  })
  it('ultra -> xhigh + flag lokal (BUKAN max)', () => {
    expect(effortForWire('ultra')).toMatchObject({ wire: 'xhigh', ultraLocal: true })
  })
  it('auto -> needsResolve, tak ada wire', () => {
    const m = effortForWire('auto')
    expect(m.needsResolve).toBe(true)
    expect(m.wire).toBe(null)
  })
  it('unknown -> medium aman', () => {
    expect(effortForWire('ngawur')).toMatchObject({ wire: 'medium' })
  })
})

describe('resolveAutoEffort + maxTokensFor', () => {
  it('teks berat -> high; ringan -> medium', () => {
    expect(resolveAutoEffort('tolong refactor auth')).toBe('high')
    expect(resolveAutoEffort('halo apa kabar')).toBe('medium')
  })
  it('max_tokens besar di high+', () => {
    expect(maxTokensFor('low')).toBe(4096)
    expect(maxTokensFor('high')).toBe(16384)
    expect(maxTokensFor('xhigh')).toBe(32768)
    expect(maxTokensFor('max')).toBe(65536)
    expect(maxTokensFor('ultra')).toBe(65536)
    expect(maxTokensFor('auto')).toBe(8192)
  })
})

describe('cacheSwitchWarning + modelSourceLabel', () => {
  it('history kosong -> null; non-kosong -> warning', () => {
    expect(cacheSwitchWarning([])).toBe(null)
    expect(cacheSwitchWarning([{ role: 'user', content: 'hi' }])).toContain('prompt cache')
  })
  it('label sumber: alias/langsung + provider', () => {
    expect(modelSourceLabel('zen', 'custom')).toContain('alias')
    expect(modelSourceLabel('gemini', 'custom')).toContain('langsung')
    expect(modelSourceLabel('acme/x', 'groq')).toContain('langsung')
  })
})

describe('persistCliField (tmp HOME)', () => {
  const mkHome = () => fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-cli-'))
  it('model via writeCliSetup stub', async () => {
    const home = mkHome()
    let got = null
    const r = await persistCliField('model', 'opus', {
      homeDir: home,
      writeCliSetup: async ({ argv }) => { got = argv; return { ok: true } },
    })
    expect(r.ok).toBe(true)
    expect(got).toEqual(['--model', 'opus'])
    expect(r.path).toContain('cli.json')
  })
  it('effort merge file 0600 tanpa hapus field lain', async () => {
    const home = mkHome()
    const file = path.join(home, '.config', 'abelink', 'cli.json')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ model: 'opus', apiKey: 'k' }))
    const r = await persistCliField('effort', 'xhigh', { homeDir: home })
    expect(r.ok).toBe(true)
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(saved).toMatchObject({ model: 'opus', apiKey: 'k', effort: 'xhigh' })
    expect(fs.statSync(file).mode & 0o777).toBe(0o600)
  })
  it('field tak dikenal -> error', async () => {
    expect((await persistCliField('nope', 'x')).ok).toBe(false)
  })
})
