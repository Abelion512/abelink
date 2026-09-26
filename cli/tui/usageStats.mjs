// cli/tui/usageStats.mjs — S3: agregat /usage dari harness JSONL lokal.
// Reuse pola baca harness-export.mjs (envelope line, sessionId coercion).
// Scope: terminal saja (pola gemini /stats + codex /usage).
// JUJUR: token = estimasi chars/2.5 (skema harness), BUKAN billing.
// Angka $ DILARANG (aturan anti-fabrikasi PR46 — data tak ada).
// Murni + testable: fs/dir di-inject.

// Satu sesi -> ringkasan.
export function summarizeSession(events = []) {
  if (!Array.isArray(events)) events = []
  const turns = new Set()
  let toolCalls = 0
  let toolOk = 0
  const tools = {}
  const outcomes = {}
  let lastOutcome = null
  let chars = 0
  for (const e of events) {
    if (e == null || typeof e !== 'object') continue
    if (e.turn != null && e.turn !== '?') turns.add(e.turn)
    const k = e.kind || e.type || ''
    if (k === 'tool-call' || k === 'tool-calls') {
      toolCalls++
      if (e.success !== false) toolOk++
      const t = e.tool || '?'
      tools[t] = (tools[t] || 0) + 1
    }
    if (k === 'turn-end' || k === 'answer' || k === 'answers') {
      const o = e.outcome || null
      if (o) {
        outcomes[o] = (outcomes[o] || 0) + 1
        lastOutcome = o
      }
    }
    for (const f of ['thought', 'observation', 'answer', 'result']) {
      if (typeof e[f] === 'string') chars += e[f].length
    }
  }
  return {
    turns: turns.size,
    toolCalls,
    toolOk,
    toolFail: toolCalls - toolOk,
    tools,
    outcomes,
    lastOutcome,
    tokensEst: Math.round(chars / 2.5),
  }
}

// Baris JSONL harness -> envelope (cermin readSessionEvents).
export function parseHarnessRow(raw = '') {
  try {
    const row = JSON.parse(raw)
    const env = typeof row.line === 'string' ? JSON.parse(row.line) : (row.line || row)
    return env && typeof env === 'object' ? env : null
  } catch {
    return null
  }
}

// Semua sesi dalam dir tanggal -> { sessionId: summary }.
export function summarizeDir({ fsMod = null, dir = '', kinds = null } = {}) {
  const fs = fsMod || defaultFs()
  const out = {}
  let files = []
  try {
    files = fs.readdirSync(dir)
  } catch {
    return out
  }
  for (const f of files) {
    if (!f.endsWith('.jsonl')) continue
    const kind = f.slice(0, -'.jsonl'.length)
    if (kinds && !kinds.includes(kind)) continue
    let raw = ''
    try {
      raw = fs.readFileSync(`${dir}/${f}`, 'utf8')
    } catch { continue }
    for (const line of String(raw).split('\n')) {
      if (!line.trim()) continue
      const env = parseHarnessRow(line)
      if (!env) continue
      const sid = String(env.sessionId ?? '?')
      if (!out[sid]) out[sid] = []
      out[sid].push(env)
    }
  }
  const sums = {}
  for (const [sid, events] of Object.entries(out)) sums[sid] = summarizeSession(events)
  return sums
}

// Render teks terminal: sesi (+ harian bila multi-hari digabung caller).
export function renderUsage({ perSession = {}, label = '' } = {}) {
  const ids = Object.keys(perSession)
  if (!ids.length) return 'Belum ada aktivitas tercatat di harness.'
  const lines = [label || 'Penggunaan Abelink (harness lokal, estimasi — bukan billing):', '']
  let tTurns = 0
  let tTools = 0
  let tTokens = 0
  for (const sid of ids) {
    const s = perSession[sid]
    tTurns += s.turns
    tTools += s.toolCalls
    tTokens += s.tokensEst
    const top = Object.entries(s.tools).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([t, n]) => `${t}×${n}`).join(', ') || '-'
    const outs = Object.entries(s.outcomes).map(([o, n]) => `${o}×${n}`).join(', ') || '-'
    lines.push(`sesi ${sid}: ${s.turns} turn, ${s.toolCalls} tool (ok ${s.toolOk}/gagal ${s.toolFail}), ~${s.tokensEst} token`)
    lines.push(`  tools: ${top}`)
    lines.push(`  outcome: ${outs}`)
  }
  lines.push('')
  lines.push(`total: ${ids.length} sesi, ${tTurns} turn, ${tTools} tool, ~${tTokens} token (estimasi chars/2.5)`)
  return lines.join('\n')
}

function defaultFs() {
  return { readdirSync: () => { throw new Error('no fs') }, readFileSync: () => { throw new Error('no fs') } }
}
