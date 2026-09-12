#!/usr/bin/env node
/**
 * harness-diagnose.mjs — digest hemat-token dari log harness Rust untuk diagnosis
 * agent. Pengganti copas log manual. Lihat docs/HARNESS-LOG-SCHEMA.md.
 *
 * Usage:
 *   node scripts/harness-diagnose.mjs [--session <id>|--latest] [--date YYYY-MM-DD]
 *     [--dir <harness-root>] [--out file] [--budget N]
 *
 * Tanpa --session: pilih sesi dengan event terbanyak hari itu ("sesi terakhir"
 * dalam arti tersibuk — sebutkan eksplisit bila salah sasaran).
 * Output default ≤8000 char: ringkasan turn + error utuh + red-flag scan.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import path from 'path'
import { readSessionEvents } from './harness-export.mjs'

const parseArgs = (argv) => {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      out[key] = next && !next.startsWith('--') ? argv[++i] : true
    }
  }
  return out
}

const harnessRoot = (overrideDir) => {
  if (overrideDir) return overrideDir
  const xdg = process.env.XDG_DATA_HOME || path.join(homedir(), '.local', 'share')
  return path.join(xdg, 'abelink', 'harness')
}

const short = (s, n = 120) => {
  if (typeof s !== 'string') return ''
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n) + '…' : one
}

// Kumpulkan semua sessionId hari itu -> pilih tersibuk.
const pickBusiestSession = (dir) => {
  const counts = {}
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.jsonl')) continue
    for (const raw of readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (!raw.trim()) continue
      try {
        const row = JSON.parse(raw)
        const env = typeof row.line === 'string' ? JSON.parse(row.line) : row.line
        const sid = env?.sessionId ?? null
        if (sid !== null && sid !== undefined) counts[String(sid)] = (counts[String(sid)] || 0) + 1
      } catch { /* lewati */ }
    }
  }
  let best = null
  for (const [sid, n] of Object.entries(counts)) {
    if (!best || n > best[1]) best = [sid, n]
  }
  return best ? best[0] : null
}

const PATTERNS = [
  { name: 'STOP OVERLAY (user menekan Stop)', re: /STOP OVERLAY/i },
  { name: 'needs_user terminal', re: /"outcome"\s*:\s*"needs_user"|needs_user/i },
  { name: 'VERIFICATION GATE (klaim done ditolak)', re: /VERIFICATION GATE/i },
  { name: 'ask-choice dibatalkan', re: /DIBATALKAN/i },
  { name: 'taint gate block', re: /TAINT GATE BLOCKED/i },
  { name: 'circuit breaker open', re: /CIRCUIT BREAKER OPEN/i }
]

const main = () => {
  const args = parseArgs(process.argv.slice(2))
  const budget = Math.max(1000, Number(args.budget) || 8000)
  const date = args.date || new Date().toISOString().slice(0, 10)
  const dir = path.join(harnessRoot(args.dir), date)
  if (!existsSync(dir)) {
    console.error(`Tidak ada folder harness: ${dir}`)
    process.exit(1)
  }
  let session = args.session ? String(args.session) : pickBusiestSession(dir)
  if (!session) {
    console.error('Tidak ada sesi ber-event. Jalankan agent dulu.')
    process.exit(1)
  }
  const events = readSessionEvents({ session, date, dir })
  const byKind = {}
  for (const e of events) byKind[e.kind] = (byKind[e.kind] || 0) + 1

  // Kelompokkan per turn (fallback '?' bila tanpa turn).
  const turns = new Map()
  for (const e of events) {
    const t = e.turn ?? '?'
    if (!turns.has(t)) turns.set(t, [])
    turns.get(t).push(e)
  }
  const turnKeys = [...turns.keys()].sort((a, b) => (Number(a) || 0) - (Number(b) || 0))

  const L = []
  L.push(`DIAGNOSA SESI ${session} (${date}) — ${events.length} events, ${turnKeys.length} turn`)
  L.push(`kinds: ${Object.entries(byKind).map(([k, n]) => `${k}=${n}`).join(' ')}`)
  const tokensEst = events.reduce((s, e) => s + (Number(e.tokensEst) || 0), 0)
  if (tokensEst) L.push(`tokensEst total: ${tokensEst}`)
  if (events.length) L.push(`rentang: ${events[0].ts} .. ${events[events.length - 1].ts}`)
  L.push('')

  const turnLine = (t) => {
    const es = turns.get(t)
    const bits = []
    for (const e of es) {
      if (e.kind === 'reasoning') bits.push(`think:${short(e.thought || e.prompt)}`)
      else if (e.kind === 'tool-call') bits.push(`${e.success === false ? 'FAIL ' : ''}${e.tool || '?'}`)
      else if (e.kind === 'observation') bits.push(`obs(${(e.observation || '').length}c)`)
      else if (e.kind === 'answer') bits.push(`ans[${e.outcome || '?'}]:${short(e.answer)}`)
      else if (e.kind === 'turn-start') bits.push('▶start')
      else if (e.kind === 'turn-end') bits.push(`■end[${e.outcome || '?'}${e.reason ? ':' + e.reason : ''}]`)
    }
    return `T${t}: ${bits.join(' > ') || '(sunyi)'}`
  }

  // Token hemat: turn tengah diringkas, 3 pertama + 5 terakhir utuh.
  const showIdx = new Set([...turnKeys.slice(0, 3), ...turnKeys.slice(-5)])
  let hidden = 0
  L.push('--- TURNS ---')
  for (const t of turnKeys) {
    if (showIdx.has(t)) L.push(turnLine(t))
    else hidden++
  }
  if (hidden) L.push(`(... ${hidden} turn tengah disembunyikan hemat token ...)`)

  // Error utuh (yang gagal saja).
  const fails = events.filter((e) => e.kind === 'tool-call' && e.success === false)
  if (fails.length) {
    L.push('', '--- ERRORS ---')
    for (const e of fails.slice(0, 10)) {
      L.push(`[${e.ts}] ${e.tool}: ${short(typeof e.result === 'string' ? e.result : JSON.stringify(e.result), 500)}`)
    }
    if (fails.length > 10) L.push(`(+${fails.length - 10} error lain)`)
  }

  // Red-flag scan seluruh teks event.
  const hay = events.map((e) => JSON.stringify(e)).join('\n')
  const flags = []
  for (const p of PATTERNS) {
    const m = hay.match(new RegExp(p.re.source, 'gi'))
    if (m) flags.push(`${p.name} ×${m.length}`)
  }
  // Start-tanpa-end = interupsi/stuck (jawaban atas keluhan "stuck di jam X").
  const starts = new Set(events.filter((e) => e.kind === 'turn-start').map((e) => String(e.turn)))
  const ends = new Set(events.filter((e) => e.kind === 'turn-end').map((e) => String(e.turn)))
  for (const t of starts) {
    if (!ends.has(t)) flags.push(`turn ${t} START tanpa END (interupsi/stuck)`)
  }
  // Observasi kosong.
  const emptyObs = events.filter((e) => e.kind === 'observation' && !(e.observation || '').trim()).length
  if (emptyObs) flags.push(`observasi kosong ×${emptyObs}`)
  L.push('', '--- RED FLAGS ---')
  L.push(flags.length ? flags.join('\n') : '(bersih)')

  let out = L.join('\n') + '\n'
  if (out.length > budget) {
    out = out.slice(0, budget) + `\n…[dipotong ke budget ${budget} chars; pakai harness:export untuk penuh]…\n`
  }
  if (args.out) writeFileSync(args.out, out)
  else process.stdout.write(out)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
