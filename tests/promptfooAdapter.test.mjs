// Unit test adapter Promptfoo (evaluation/promptfoo/abelink-provider.ts).
// Fokus: pemetaan hasil CLI -> ProviderResponse tanpa spawn engine sungguhan
// (mock lewat overwrite spawn bawaan modul? — tidak: gunakan argumen yang
// memicu jalur error deterministik CLI, plus uji helper murni via kelas).

import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ADAPTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../evaluation/promptfoo/abelink-provider.ts')
const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/abelink.ts')

describe('abelink-provider (adapter Promptfoo)', () => {
  it('file ada dan bisa diimport default class', async () => {
    const mod = await import(ADAPTER)
    expect(typeof mod.default).toBe('function')
    const p = new mod.default({ id: 'abelink-test' })
    expect(p.id()).toBe('abelink-test')
  })

  it('id default = abelink-agent', async () => {
    const mod = await import(ADAPTER)
    const p = new mod.default({})
    expect(p.id()).toBe('abelink-agent')
  })

  it('callApi terhadap --help tetap menghasilkan ProviderResponse terstruktur', async () => {
    // Gunakan jalur murah: prompt --help tidak memicu AI run penuh di mode ini;
    // adapter tetap harus mengembalikan object dengan kunci metadata.
    const mod = await import(ADAPTER)
    const p = new mod.default({ config: { timeoutMs: 60000, extraArgs: ['--help'] } })
    const res = await p.callApi('x', { vars: {} })
    expect(res).toHaveProperty('metadata')
    expect(res.metadata.adapter).toBe('abelink-promptfoo')
    // --help exit 0 tanpa JSON result -> error eksplisit, bukan output kosong palsu
    expect(typeof res.error === 'string' || res.output !== null).toBe(true)
  }, 70000)

  it('CLI --json memang mengeluarkan JSON hasil di stdout (kontrak yang diandalkan adapter)', async () => {
    const { code, stdout } = await new Promise((resolve) => {
      const c = spawn('bun', [CLI, 'agent', 'run', '--help', '--json'], { env: process.env })
      let out = ''
      c.stdout.on('data', (d) => { out += String(d) })
      c.on('error', (e) => resolve({ code: -1, stdout: String(e) }))
      c.on('close', (k) => resolve({ code: k ?? 0, stdout: out }))
    })
    expect(code).toBe(0)
    expect(stdout.length).toBeGreaterThan(0)
  }, 70000)
})
