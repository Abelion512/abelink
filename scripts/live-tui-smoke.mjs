#!/usr/bin/env bun
// scripts/live-tui-smoke.mjs — Live E2E TUI TANPA GUI, TANPA mock, TANPA manipulasi.
// Prasyarat eksplisit (gagal-jujur bila tak terpenuhi):
//   1. 9Router hidup di 127.0.0.1:20128 (/v1/models menjawab).
//   2. 9Router key lokal ada (loadNineRouterKey) untuk turn LLM.
//   3. HOME isolasi via ABELINK_HOME (wajib — tak cemari HOME asli).
// Gate:
//   - /models kimi -> seksi Katalog muncul.
//   - /model zen -> persist + ID zen-free.
//   - prompt "1+1=?" -> reply non-kosong, outcome completed.
//   - pesan error (bila ada) harus per-lapis (network/credentials/auth/
//     unknown-model), bukan "Gagal memuat AI" generik.
// Keluar 0 bila semua gate lolos; 2 bila prasyarat tak terpenuhi (skip jujur,
// bukan gagal); 1 bila gate gagal.
// Usage: ABELINK_HOME=/tmp/x bun scripts/live-tui-smoke.mjs [--prompt "..."]

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const home = process.env.ABELINK_HOME || ''
if (!home || home === os.homedir()) {
  console.error('[LIVE] ABELINK_HOME wajib menunjuk dir isolasi (bukan HOME asli).')
  process.exit(2)
}

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const prompt = (process.argv.find((a) => a === '--prompt') && process.argv[process.argv.indexOf('--prompt') + 1]) || 'jawab singkat: 1+1=?'

// Prasyarat 1: 9Router hidup.
let modelsOk = false
try {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30000)
  try {
    const r = await fetch('http://127.0.0.1:20128/v1/models', { signal: ctrl.signal, headers: { Connection: 'close' } })
    modelsOk = r?.ok === true
  } finally {
    clearTimeout(timer)
  }
} catch {}
if (!modelsOk) {
  console.error('[LIVE] SKIP: 9Router tak menjawab di 127.0.0.1:20128 (nyalakan dulu).')
  process.exit(2)
}

// Prasyarat 2: key lokal.
const headless = await import('../src/api/ai/headlessCli.js').catch(() => ({}))
const key = typeof headless.loadNineRouterKey === 'function' ? await headless.loadNineRouterKey() : null
if (!key) {
  console.error('[LIVE] SKIP: 9Router key lokal tak ditemukan (butuh untuk turn LLM).')
  process.exit(2)
}

const run = (input) =>
  new Promise((resolve) => {
    const c = spawn('bun', ['bin/abelink-tui-v2.tsx'], {
      cwd: ROOT,
      timeout: 180000,
      env: { ...process.env, ABELINK_HOME: home },
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

const checks = []
const need = (name, cond, detail = '') => {
  checks.push({ name, ok: !!cond, detail })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const r = await run(`/models kimi\n/model zen\n${prompt}\n`)
need('exit 0', r.code === 0, `code=${r.code}`)
need('/models -> Katalog live', r.stdout.includes('Katalog'), 'seksi Katalog muncul')
need('/model zen -> ID zen-free', r.stdout.includes('oc/muse-spark-1.3-contributor-free'), 'persist + resolve')
need('reply non-kosong', /assistant|2\b/.test(r.stdout) && r.stdout.trim().length > 50, 'ada keluaran model')
need('tanpa error generik', !r.stdout.includes('Gagal memuat AI') && !r.stderr.includes('Gagal memuat AI'), 'pesan per-lapis bila gagal')

// Bukti persist: cli.json isolasi berisi model zen.
let persisted = ''
try {
  persisted = fs.readFileSync(path.join(home, '.config', 'abelink', 'cli.json'), 'utf8')
} catch {}
need('cli.json isolasi -> zen', persisted.includes('oc/muse-spark-1.3-contributor-free'), 'tanpa sentuh HOME asli')

const failed = checks.filter((c) => !c.ok)
console.log(failed.length ? `\n[LIVE] ${failed.length} gate GAGAL.` : '\n[LIVE] Semua gate lolos.')
process.exit(failed.length ? 1 : 0)
