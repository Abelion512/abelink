// cli/core/harness-writer.mjs — penulis JSONL harness untuk host headless
// (PLAN-T1, M2c). CLI/TUI tidak punya Rust harness_append, jadi writer ini
// menulis fs langsung ke root SAMA dengan GUI:
//   $ABELINK_DATA_HOME|$XDG_DATA_HOME|~/.local/share + /abelink/harness/<date>/<kind>.jsonl
// Tiap baris = {"ts","kind","line"} dengan `line` = JSON string envelope —
// format persis output Rust cmd_harness.rs, sehingga harness:diagnose/export
// membaca event GUI + headless tanpa cabang khusus.
//
// Flag observability: ABELINK_TRAJECTORY_HEADLESS=1 (plan §4.4 — default =
// perilaku lama sampai flag lulus). ABELINK_HARNESS_DISABLE=1 mematikan
// semua tulis (darurat tanpa edit kode).
//
// Fail-closed jujur: TANPA rotasi generasi (beda dengan Rust 50MB×3) — file
// aktif >50MB dilewati dengan counter skipped, bukan ditimpa. fs/path di-inject
// untuk test hermetik (pola usageStats.mjs summarizeDir).
import path from 'node:path'

const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50MB — batas jujur, sejajar Rust
const MAX_LINE_CHARS = 256 * 1024 // sejajar MAX_LINE_CHARS Rust

export function trajectoryHeadlessEnabled(env = process.env) {
  return env?.ABELINK_TRAJECTORY_HEADLESS === '1'
}

export function harnessDisabled(env = process.env) {
  return env?.ABELINK_HARNESS_DISABLE === '1'
}

export function resolveHarnessRoot(env = process.env, pathMod = path) {
  const base =
    env?.ABELINK_DATA_HOME ||
    env?.XDG_DATA_HOME ||
    pathMod.join(env?.HOME || '', '.local', 'share')
  return pathMod.join(base, 'abelink', 'harness')
}

function todayLabel(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

function rfc3339Localish(now = new Date()) {
  // RFC3339 UTC — sama dengan renderer (new Date().toISOString()).
  return now.toISOString()
}

// Validasi kind: mirror ketat Rust (anti path escape, [A-Za-z0-9_-], 1..=64).
function validKind(kind) {
  return typeof kind === 'string' && kind.length >= 1 && kind.length <= 64 &&
    /^[A-Za-z0-9_-]+$/.test(kind)
}

/**
 * Buat writer harness headless. Murni di tepi: semua fs lewat objek `fsMod`.
 * @param {{ fsMod?: object, env?: object, root?: string, now?: () => Date }} [opts]
 * @returns {{ append: (kind: string, envelope: object) => boolean, stats: () => {written: number, skippedSize: number, disabled: boolean} }}
 */
export function createHarnessWriter({ fsMod = null, env = process.env, root = null, now = null } = {}) {
  const fs = fsMod
  const clock = now || (() => new Date())
  const stats = { written: 0, skippedSize: 0, disabled: harnessDisabled(env) || !trajectoryHeadlessEnabled(env) }

  const append = (kind, envelope) => {
    if (stats.disabled) return false
    if (!fs || typeof fs.appendFileSync !== 'function') return false
    if (!validKind(kind)) return false
    let line = null
    try {
      line = JSON.stringify({ ...(envelope || {}), ts: rfc3339Localish(clock()) })
    } catch {
      return false // envelope tak serializable — jangan bunuh turn
    }
    if (line.length > MAX_LINE_CHARS) return false
    try {
      const dir = path.join(root || resolveHarnessRoot(env), todayLabel(clock()))
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(dir, `${kind}.jsonl`)
      try {
        const st = fs.statSync(file)
        if (st && st.size > MAX_FILE_BYTES) {
          stats.skippedSize += 1
          return false // fail-closed tanpa rotasi (beda jujur dengan Rust)
        }
      } catch { /* file belum ada -> lanjut */ }
      const row = JSON.stringify({ ts: rfc3339Localish(clock()), kind, line })
      fs.appendFileSync(file, row + '\n')
      stats.written += 1
      return true
    } catch {
      return false // disk penuh/permission — logging tak pernah fatal
    }
  }

  return { append, stats: () => ({ ...stats }) }
}

// Logger harness tingkat turn/tool untuk host headless (CLI/TUI).
// Merangkai harnessCore (bentuk event) + writer (I/O). sessionId dipakai
// persis seperti yang disimpan sesi CLI/TUI (`session-...`) agar
// harness:diagnose --session <id> dan /sessions menemukan yang sama.
export function createHeadlessHarnessLogger({ writer, sessionId = null } = {}) {
  const sid = sessionId
  return {
    logTurnStart: ({ turn, prompt = null, provider = null, model = null, effort = null } = {}) =>
      writer?.append('turn-start', {
        kind: 'turn-start',
        turn: turn ?? null,
        sessionId: sid,
        prompt: typeof prompt === 'string' ? prompt.slice(0, 2000) : prompt,
        provider,
        model,
        effort
      }),
    logToolCall: ({ tool, query, ok, rejected = false, resultSummary, turn = null, durationMs = null } = {}) =>
      writer?.append('tool-calls', {
        kind: 'tool-call',
        tool: String(tool || '?'),
        query: typeof query === 'string' ? query.slice(0, 200) : query,
        ok: ok !== false,
        // success = kontrak skema (reader usageStats/diagnose membaca ini);
        // ok = paritas payload GUI. Keduanya ditulis — kegagalan tidak lagi
        // terhitung sukses oleh reader (gap GUI lama, diubah di harnessCore).
        success: ok !== false,
        rejected: rejected === true,
        resultSummary: typeof resultSummary === 'string' ? resultSummary.slice(0, 2000) : resultSummary,
        sessionId: sid,
        turn,
        durationMs
      }),
    logTurnEnd: ({ turn = null, outcome = null, reason = null } = {}) =>
      writer?.append('turn-end', { kind: 'turn-end', turn, sessionId: sid, outcome, reason }),
    stats: () => writer?.stats?.() || { written: 0, skippedSize: 0, disabled: true }
  }
}
