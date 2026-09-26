// tests/cli-tui-v2.live.test.mjs — GATE LIVE (manual), bukan bagian `bun run test`.
//
// Konteks (M0/B-8): test ini DULU tinggal di tests/cli-tui-v2.test.mjs dan
// menuntut string 'Katalog' dari 9Router yang hidup. Akibatnya hijau di laptop
// pengembang, merah di CI (lihat run 36214333977), dan menahan gate ~28 detik.
// Sekarang dipisah: kontrak hermetik ("jujur saat discovery mati") tetap di
// cli-tui-v2.test.mjs; kontrak jaringan ada di sini.
//
// Jalankan: `bun run test:live` (9Router harus hidup di :20128).
// Bila 9Router tidak hidup, test ini SKIP dengan alasan tercetak — bukan lulus
// palsu. "Dilewati" dan "hijau" adalah dua hal berbeda dan harus terlihat.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const ROUTER = 'http://127.0.0.1:20128/v1'

// Ambang panjang DISENGAJA: diukur 2026-09-26, GET /v1/models di 9Router lokal
// butuh ~40 detik (naik dari ~26 detik sehari sebelumnya). Probe pendek bikin
// test ini salah lapor "router mati" padahal cuma lambat.
const PROBE_TIMEOUT_MS = 70000

const probeRouter = async () => {
  try {
    const res = await fetch(`${ROUTER}/models`, {
      headers: { connection: 'close' },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
    })
    return res.ok
  } catch {
    return false
  }
}

const runTui = (input) =>
  new Promise((resolve) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-live-'))
    const c = spawn('bun', ['bin/abelink-tui-v2.tsx'], {
      timeout: 180000,
      env: { ...process.env, ABELINK_HOME: home }
    })
    let stdout = ''
    let stderr = ''
    c.stdout.on('data', (d) => { stdout += String(d ?? '') })
    c.stderr.on('data', (d) => { stderr += String(d ?? '') })
    c.on('error', (err) => resolve({ code: 1, stdout, stderr: stderr + String(err?.message || err) }))
    c.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }))
    c.stdin.write(input)
    c.stdin.end()
  })

describe('TUI v2 vs 9Router hidup', () => {
  it('pipe /models kimi -> seksi Katalog terisi dari router', async (ctx) => {
    if (!(await probeRouter())) {
      ctx.skip(`9Router tidak hidup di ${ROUTER} — test live DILEWATI, bukan lulus.`)
      return
    }
    const r = await runTui('/models kimi\n')
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('Katalog')
    expect(r.stdout.toLowerCase()).toContain('kimi')
  }, 200000)
})
