#!/usr/bin/env node
/**
 * RSI EVALUATE — analisis feed audit `~/.mark/audit/model-calls.jsonl`.
 * Output JSON report ke stdout: per-model fail rate, p95 latency, top error,
 * cache hit rate, plus snapshot baseline untuk VERIFY siklus berikutnya.
 * Nondestructive: baca-only. Tanpa LLM — deterministik, cocok cron no_agent.
 */
import os from 'os'
import path from 'path'
import { readFileSync, existsSync } from 'fs'

const AUDIT = path.join(os.homedir(), '.mark', 'audit', 'model-calls.jsonl')
const WINDOW_DAYS = Number(process.env.RSI_WINDOW_DAYS || 7)
const now = Date.now()
const cutoff = now - WINDOW_DAYS * 86400000

function readRecent() {
  if (!existsSync(AUDIT)) return []
  const lines = readFileSync(AUDIT, 'utf8').split('\n').filter(Boolean)
  const rows = []
  for (const l of lines) {
    try {
      const r = JSON.parse(l)
      if (r.provider === 'test' || (r.model && r.model.startsWith('TEST/'))) continue
      const ts = Date.parse(r.timestamp || r.time)
      if (!r.timestamp || isNaN(ts)) continue
      if (ts < cutoff) continue
      rows.push(r)
    } catch { /* skip corrupt line */ }
  }
  return rows
}

function pctl(sorted, p) {
  if (!sorted.length) return null
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p / 100 * sorted.length)))
  return sorted[idx]
}

function analyze(rows) {
  const byModel = {}
  const errors = {}
  let total = 0, totalOk = 0
  const allLat = []

  for (const r of rows) {
    const model = r.model || 'unknown'
    const m = (byModel[model] ||= { calls: 0, ok: 0, fail: 0, lat: [], truncated: 0, cacheHits: 0, cacheMiss: 0 })
    m.calls++
    total++
    if (r.ok) { m.ok++; totalOk++ } else { m.fail++; if (r.err) errors[r.err] = (errors[r.err] || 0) + 1 }
    if (typeof r.latencyMs === 'number') { m.lat.push(r.latencyMs); allLat.push(r.latencyMs) }
    if (r.finishReason === 'length') m.truncated++
    if (typeof r.cacheHit === 'number') m.cacheHits += r.cacheHit
    if (typeof r.cacheMiss === 'number') m.cacheMiss += r.cacheMiss
  }

  const models = Object.entries(byModel).map(([model, m]) => {
    const sorted = [...m.lat].sort((a, b) => a - b)
    const hit = m.cacheHits + m.cacheMiss
    return {
      model,
      calls: m.calls,
      ok: m.ok,
      fail: m.fail,
      failRate: +(m.fail / m.calls).toFixed(3),
      p50LatencyMs: pctl(sorted, 50),
      p95LatencyMs: pctl(sorted, 95),
      truncated: m.truncated,
      cacheHitRate: hit ? +(m.cacheHits / hit).toFixed(3) : null,
    }
  }).sort((a, b) => b.failRate - a.failRate)

  const lat = [...allLat].sort((a, b) => a - b)
  return {
    windowDays: WINDOW_DAYS,
    generatedAt: new Date(now).toISOString(),
    totalCalls: total,
    okRate: total ? +((totalOk / total).toFixed(3)) : null,
    overall: { p50LatencyMs: pctl(lat, 50), p95LatencyMs: pctl(lat, 95) },
    // Snapshot score buat VERIFY: failRate naik vs baseline = sinyal regress
    snapshotScore: total ? +(totalOk / total).toFixed(3) : null,
    models,
    topErrors: Object.entries(errors).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([err, count]) => ({ err, count })),
  }
}

const rows = readRecent()
console.log(JSON.stringify(analyze(rows), null, 2))