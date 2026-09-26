// harnessCore.js — kontrak harness SATU SKEMA, dua penulis (PLAN-T1).
// Penulis GUI: src/api/harness.js -> Rust harness_append (rotasi 50MB×3).
// Penulis headless: cli/core/harness-writer.mjs -> fs langsung, root SAMA,
// envelope + bentuk event SAMA agar scripts/harness-{diagnose,export}.mjs
// membaca keduanya tanpa cabang khusus headless.
//
// JUJUR: CLI/TUI tidak punya rotasi generasi otomatis — writer menolak tulis
// bila file aktif >50MB (fail-closed, tanpa rotasi ala Rust). Beda ini dicatat
// di session log M2c; paritas penuh rotasi menyusul bila dibutuhkan.
//
// Murni: zero I/O, zero import berat — aman diimpor dari renderer maupun CLI/TUI
// (aturan "no Node APIs in src/" tetap hidup karena tidak ada Node API di sini).
// Detail node:fs/node:path hidup di cli/core/harness-writer.mjs.

export const HARNESS_CORE_VERSION = 1

// Kinds file harness headless. Nama FILE mengikuti kebiasaan GUI:
// logToolCall -> 'tool-calls', logTurnStart/logTurnEnd -> 'turn-start'/'turn-end'
// (lihat src/api/harness.js). harness:diagnose menampilkan kind sesuai nama file.
export const HARNESS_FILE_KINDS = {
  toolCall: 'tool-calls',
  turnStart: 'turn-start',
  turnEnd: 'turn-end'
}

// Bentuk event headless — field dipetakan dari docs/HARNESS-LOG-SCHEMA.md
// + paritas payload GUI (useAbelinkPlan.js logToolCall): {tool, query≤200,
// ok, rejected, resultSummary≤2000, sessionId, turn}. Caps = batas jujur skema.
export function makeHarnessToolCall({ tool, query, ok, rejected = false, resultSummary, sessionId = null, turn = null, ...rest } = {}) {
  const okVal = ok !== false
  return {
    ...rest,
    kind: 'tool-call',
    tool: String(tool || '?'),
    query: typeof query === 'string' ? query.slice(0, 200) : query,
    ok: okVal,
    // success = kontrak skema (docs/HARNESS-LOG-SCHEMA.md + reader
    // usageStats/diagnose); ok = paritas payload GUI. Keduanya ditulis
    // supaya kegagalan TIDAK terhitung sukses oleh reader mana pun.
    success: okVal,
    rejected: rejected === true,
    resultSummary: typeof resultSummary === 'string' ? resultSummary.slice(0, 2000) : resultSummary,
    sessionId,
    turn
  }
}

export function makeHarnessTurnStart({ turn = null, sessionId = null, ...rest } = {}) {
  return { ...rest, kind: 'turn-start', turn, sessionId }
}

export function makeHarnessTurnEnd({ turn = null, sessionId = null, outcome = null, reason = null, ...rest } = {}) {
  return { ...rest, kind: 'turn-end', turn, sessionId, outcome, reason }
}

// Session id aman untuk filter diagnose/export: harness:diagnose memakai
// String(env.sessionId). Renderer memakai integer (Dexie), headless memakai
// string `session-...` — keduanya cocok lewat koersi String.
export function normalizeHarnessSessionId(sessionId) {
  if (sessionId === null || sessionId === undefined) return null
  const s = String(sessionId).trim()
  return s || null
}
