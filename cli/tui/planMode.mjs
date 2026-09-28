// cli/tui/planMode.mjs — mode plan/build + label status working TUI-v2.
// Stream D: SATU modul untuk seluruh logika mode + working; engine/entry
// hanya panggil. Murni + testable (tanpa I/O, never throws).
//
// Referensi opencode (baca langsung, bukan hafalan):
// - plan mode = agent switch build<->plan via tab (`agent_cycle: keybind("tab")`,
//   packages/tui/src/config/keybind.ts:131, app.tsx:697-705 `agent.cycle` ->
//   local.agent.move(1)); agen plan = "Plan mode. Disallows all edit tools"
//   (packages/opencode/src/agent/agent.ts:156-181, permission deny edit *).
// - permission mode auto/normal = konsep TERPISAH (context/permission.tsx:
//   toggle tanpa keybind, via palette `permission.mode` app.tsx:948-957).
//   Kita TIDAK adopsi permission toggle (meta row tetap 'auto', tunda).
// - working = spinner braille (component/spinner.tsx) + InlineTool per tool
//   (pending "Reading file…" vs complete, routes/session/index.tsx:2150+) +
//   status spinner di bawah prompt. Kita adopsi step count + nama tool
//   berjalan (data yang engine expose via onStep); animasi spinner ditunda
//   (status bar teks, tanpa timer).
//
// Kejujuran (DIVERIFIKASI dari kode, 2026-09-28): agentRunner.js:273-279
// memaksa decision.action = null saat options.disableTools, TAPI
// classifyMainDecision TIDAK menerima flag itu (ctx tanpa disableTools ->
// baris 145 tak pernah menyala) sehingga turn plan via flag jatuh ke jalur
// answer-without-completion -> 8 turn stagnasi -> `failed`. Dan batasan tugas:
// JANGAN sentuh src/. Jadi plan mode = prompt rencana SAJA (prefix di bawah)
// + info jujur ke user bahwa eksekusi tool TIDAK ditahan engine.
//
// Bila kelak src/ boleh diubah, perbaikannya satu baris: teruskan
// disableTools ke ctx classifyMainDecision di agentRunner (+ test plan-hold).

export const PLAN_MODES = Object.freeze(['build', 'plan'])
export const DEFAULT_MODE = 'build'

// Normalisasi defensif: selain 'plan' -> 'build' (fail-execute, bukan
// fail-closed — mode default adalah eksekusi normal seperti semula).
export function normalizeMode(value) {
  return String(value ?? '').trim().toLowerCase() === 'plan' ? 'plan' : 'build'
}

export function toggleMode(current) {
  return normalizeMode(current) === 'plan' ? 'build' : 'plan'
}

// Label slot agen di meta row (pola opencode prompt/index.tsx:1450:
// Titlecase nama agen aktif).
export function modeAgentLabel(mode) {
  return normalizeMode(mode) === 'plan' ? 'Plan' : 'Build'
}

// Prefiks prompt plan: minta model susun rencana TANPA tool. Bukan penahanan
// engine — pesan jujur disampaikan via modeStatusText.
export const PLAN_PROMPT_PREFIX =
  '[MODE PLAN] Susun rencana kerja terstruktur (langkah + tool yang AKAN ' +
  'dipakai + risiko). Usahakan JANGAN panggil tool — ini sesi perancangan. ' +
  'Akhiri dengan ringkasan siap-eksekusi.'

// Prompt efektif satu turn (murni): plan = prefix + prompt user; build = utuh.
export function buildTurnPrompt(mode, prompt) {
  const text = String(prompt ?? '')
  if (normalizeMode(mode) !== 'plan') return text
  return `${PLAN_PROMPT_PREFIX}\n\n${text}`
}

// Teks status info saat mode ganti (satu sumber: engine runSlash + entry
// keybind memakai kalimat yang sama). Kalimat plan JUJUR: tool tidak ditahan
// engine (lihat catatan di atas), user yang menahan eksekusi lanjutan.
export function modeStatusText(mode) {
  return normalizeMode(mode) === 'plan'
    ? 'Mode PLAN: model diminta susun rencana tanpa tool. Catatan jujur: engine belum menahan eksekusi tool (butuh ubah src/), jadi jangan jalankan saran tool sebelum /build. Balik via /build atau ctrl+o.'
    : 'Mode BUILD: eksekusi tool normal.'
}

// Status working per turn: engine tulis via noteWorking() di onStep,
// entry baca via workingLabel(). Bentuk: { steps, tool }.
export function initWorking() {
  return { steps: 0, tool: null }
}

export function noteWorking(working, stepRecord = {}) {
  if (!working || typeof working !== 'object') return working
  const n = Number(stepRecord?.step)
  if (Number.isFinite(n) && n > 0) {
    working.steps = Math.max(Number(working.steps) || 0, Math.floor(n))
  } else {
    working.steps = (Number(working.steps) || 0) + 1
  }
  if (stepRecord?.kind === 'tool' && stepRecord?.tool) {
    working.tool = String(stepRecord.tool)
  }
  return working
}

// Label kanan prompt saat busy (pola opencode: spinner + step/tool).
// Tanpa working -> fallback lama 'working…' (kontrak App existing).
export function workingLabel(working) {
  const steps = Number(working?.steps) || 0
  const tool = working?.tool ? String(working.tool) : ''
  if (!steps && !tool) return 'working…'
  return `working… step ${steps}${tool ? ` · ${tool}` : ''}`
}
