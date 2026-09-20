#!/usr/bin/env node
/**
 * harness-export.mjs — gabungkan JSONL harness Rust menjadi satu artefak
 * portabel per sesi (bisa dibaca agent). Lihat docs/HARNESS-LOG-SCHEMA.md.
 *
 * Usage:
 *   node scripts/harness-export.mjs --session <id> [--date YYYY-MM-DD]
 *     [--kinds reasoning,tool-call] [--out file.jsonl] [--dir <harness-root>]
 *
 * Sumber: $XDG_DATA_HOME/abelink/harness/<date>/*.jsonl (fallback ~/.local/share).
 * Tiap baris Rust = {"ts","kind","line"} dengan `line` = JSON string envelope.
 * Filter: envelope.sessionId == --session (string coercion). Output terurut ts.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'
import { parseArgs, harnessRoot } from './harness-common.mjs'

// Dibaca scripts/harness-diagnose.mjs — kembalikan event satu sesi terurut-ts.
export const readSessionEvents = ({ session, date, kinds = null, dir }) => {
  const want = String(session)
  const events = []
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.jsonl')) continue
    const rawKind = f.slice(0, -'.jsonl'.length)
    if (kinds && !kinds.includes(rawKind)) continue
    const normalizedKind =
      rawKind === 'tool-calls'
        ? 'tool-call'
        : rawKind === 'observations'
          ? 'observation'
          : rawKind === 'answers'
            ? 'answer'
            : rawKind
    for (const raw of readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (!raw.trim()) continue
      try {
        const row = JSON.parse(raw)
        const env = typeof row.line === 'string' ? JSON.parse(row.line) : row.line
        if (env && String(env.sessionId ?? '') === want) {
          events.push({
            kind: env.kind || (row.kind === 'tool-calls' ? 'tool-call' : (row.kind === 'observations' ? 'observation' : (row.kind === 'answers' ? 'answer' : row.kind))) || normalizedKind,
            ...env
          })
        }
      } catch {
        /* baris korup dilewati jujur */
      }
    }
  }
  // Urut numerik bila ts epoch, leksikal bila ISO-8601 (keduanya monoton).
  const tsNum = (v) => {
    const n = typeof v === 'number' ? v : Date.parse(v)
    return Number.isFinite(n) ? n : 0
  }
  events.sort((a, b) => tsNum(a.ts) - tsNum(b.ts) || String(a.ts).localeCompare(String(b.ts)))
  return events
}

const main = () => {
  const args = parseArgs(process.argv.slice(2))
  if (!args.session) {
    console.error('Usage: harness-export.mjs --session <id> [--date YYYY-MM-DD] [--kinds a,b] [--out file] [--dir root]')
    process.exit(2)
  }
  const date = args.date || new Date().toISOString().slice(0, 10)
  const kinds = args.kinds ? String(args.kinds).split(',').map((s) => s.trim()) : null
  const dir = path.join(harnessRoot(args.dir), date)
  if (!existsSync(dir)) {
    console.error(`Tidak ada folder harness: ${dir}`)
    process.exit(1)
  }
  const want = String(args.session)
  const events = readSessionEvents({ session: want, date, kinds, dir })
  const header = {
    v: 1,
    type: 'header',
    schema: 'harness-log/v1',
    session: want,
    date,
    count: events.length,
    exportedAt: new Date().toISOString()
  }
  const out = JSON.stringify(header) + '\n' + events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : '')
  if (args.out) writeFileSync(args.out, out)
  else process.stdout.write(out)
  console.error(`export: ${events.length} events sesi ${want} (${date})`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
