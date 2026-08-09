#!/usr/bin/env node
/**
 * RSI IMPROVE — draft tabel keputusan dari data audit.
 * Baca `~/.mark/audit/model-calls.jsonl`, tampilkan pola gagal + zona aman vs
 * zona keras + saran perbaikan berbatas. Non-destructive: TIDAK menulis ke
 * source/core; hanya output saran ke stdout utk direview Hermes/human sebelum
 * apply (prinsip RSI: generated code wajib review). Lock zonder LLM, deterministik.
 */
import os from 'os'
import path from 'path'
import { readFileSync, existsSync } from 'fs'

const AUDIT = path.join(os.homedir(), '.mark', 'audit', 'model-calls.jsonl')
const WINDOW_DAYS = Number(process.env.RSI_WINDOW_DAYS || 7)
const now = Date.now()
const cutoff = now - WINDOW_DAYS * 86400000

// Zona BOLEH otomatis (Level 2 boundary)
const SAFE_ZONE = [
  'decision logic', 'behavior', 'skill patch', 'memory', 'hooks',
  'connector config', 'prompt templates', 'thresholds',
]
// Zona KERAS — block auto, butuh Hermes/Claude + approval user
const HARD_BOUNDARY = ['core electron source', 'credentials', 'api keys', '.env', 'renderer/main']

function rowsAll() {
  if (!existsSync(AUDIT)) return []
  return readFileSync(AUDIT, 'utf8').split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l) } catch { return null } })
    .filter(r => r && r.timestamp && Date.parse(r.timestamp) >= cutoff)
}

const r = rowsAll()
const errs = {}
for (const x of r) if (!x.ok && x.err) {
  const e = String(x.err)
  errs[e.includes('time') ? 'timeout' : e.includes('429') || e.toLowerCase().includes('rate') ? 'rate-limit' : e]
    = (errs[e.includes('time') ? 'timeout' : e.includes('429') || e.toLowerCase().includes('rate') ? 'rate-limit' : e] || 0) + 1
}
const truncated = r.filter(x => x.finishReason === 'length').length
const total = r.length
const fail = r.filter(x => !x.ok).length

const outcome = []
if (total && truncated / total > 0.1)
  outcome.push(`- [truncated=${truncated}/${total}] finishReason:length — ZONA AMAN: naikkan maxTokens / ringkas context utk model ini.`)
for (const [e, n] of Object.entries(errs).sort((a, b) => b[1] - a[1]).slice(0, 3)) {
  if (e === 'timeout') outcome.push(`- [timeout ${n}x] ZONA AMAN: tambah retry fallback ke model cadangan.`)
  else if (e === 'rate-limit') outcome.push(`- [rate-limit ${n}x] ZONA AMAN: backoff / queue pada connector.`)
  else outcome.push(`- [${e} x${n}] non-klasik — perlu review Hermes dulu (bukan auto).`)
}

const report = {
  generatedAt: new Date(now).toISOString(),
  windowDays: WINDOW_DAYS,
  totalCalls: total,
  failRate: total ? +(fail / total).toFixed(3) : null,
  truncated,
  safeZone: SAFE_ZONE,
  hardBoundary: HARD_BOUNDARY,
  triggers: outcome,
  verdict: !outcome.length
    ? 'NO_ACTION — pola sehat, tak ada trigger perbaikan.'
    : 'PROPOSE — ada trigger (list di atas). Kirim ke Hermes utk draft patch + diff-review + .bak.',
}

console.log(JSON.stringify(report, null, 2))