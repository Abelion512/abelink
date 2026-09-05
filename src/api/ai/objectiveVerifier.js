// objectiveVerifier.js — Objective Completion & Verification Layer for MARK.
//
// agentDecision.js classifies the MODEL CLAIM (done / blocked / needs_user /
// in_progress). That claim alone is NOT proof that the real-world objective is
// complete: a model emitting {"is_done":true} is a claim, not a verification.
//
// This module owns the SYSTEM VERIFICATION half of the state machine:
//
//   MODEL_CLAIM (agentDecision.js)   VERIFICATION (this module)
//     done                             verified | partially_verified |
//                                      failed | unavailable | not_run
//
// Final completion requires: model claims done AND verification says verified,
// UNLESS the objective is conversational (no external world state to verify).
//
// Design rules (spec §4):
//   - Task-aware: criteria are derived per objective kind (file / code /
//     browser / os / research / communication / general / conversational).
//     No fake criteria for worlds the harness cannot observe — unobservable
//     criteria are marked 'na' and never block completion by themselves.
//   - Deterministic & pure: no window/db/network imports; evidence comes from
//     tool observations already collected by the executors.
//   - Verification failure triggers a BOUNDED replan (MAX_VERIFY_REPLANS)
//     telling the model exactly which criteria lack world-state proof.

export const VERIFICATION_STATE = {
  VERIFIED: 'verified',
  PARTIALLY: 'partially_verified',
  FAILED: 'failed',
  UNAVAILABLE: 'unavailable',
  NOT_RUN: 'not_run'
}

export const OBJECTIVE_KINDS = [
  'conversational',
  'file',
  'code',
  'browser',
  'os',
  'research',
  'communication',
  'general'
]

// Bounded replan budget when a completion claim lacks world-state evidence.
// Prevents an unverified-claim ping-pong against paid APIs.
export const MAX_VERIFY_REPLANS = 2

// ---------------------------------------------------------------------------
// Evidence text classifiers (tool-level failure markers only; observation
// bodies such as web DOM may legitimately contain words like "timeout", so
// generic vocabulary is NOT used here — failures always carry a bracket tag).
// ---------------------------------------------------------------------------
const FAIL_RE = /(\[ERROR\]|\[DITOLAK\]|\[[^\]\n]{0,40}\sERROR\])/i

const WRITE_TOOLS_RE = /(write-file|replace-content|replace-lines|gdrive-upload|gdrive-create)/i
const READ_TOOLS_RE = /(read-file|read-document|list-dir|find-files|grep-search|file-outline)/i
const VERIFY_TOOLS_RE =
  /(read-file|read-document|list-dir|find-files|grep-search|file-outline|run-shell|run-task|browser-read|browser-extract|os-read|os-list-windows|os-focus-window|analyze-screen)/i
const SEARCH_TOOLS_RE =
  /(browser-search|browser-navigate|read-document|memory-search|gdrive-search|connector-run)/i
// OS ACTION tools only — os-read/os-list-windows are VERIFICATION ops, not
// actions, so a proof read after the last action can satisfy the criterion.
const OS_ACTION_RE =
  /(os-click|os-double-click|os-type|os-key|os-scroll|os-search|os-open|os-delay)/i
const BROWSER_ACTION_RE =
  /(browser-navigate|browser-click|browser-type|browser-scroll|browser-script|browser-download)/i

const TEST_REQUEST_RE = /(test|uji|unittest|vitest|jest|pytest|lint)/i
const TEST_PASS_RE = /(passing|passed|\btests?\s+(lulus|pass)\b|berhasil lulus|all tests)/i
const TEST_FAIL_RE = /(\d+\s+(failed|failing)|tests?\s+(gagal|failed))/i

const BROWSER_CONFIRM_RE =
  /(berhasil|sukses|success|terkirim|terkonfirmasi|konfirmasi|terima kasih|thank you|submitted|submission|pembayaran (diterima|berhasil)|order (diterima|created|received)|akun (dibuat|created)|data tersimpan)/i
const SEND_CONFIRM_RE =
  /(terkirim|sent|message_id|delivered|berhasil mengirim|berhasil dikirim|berhasil mengunggah)/i

const FILE_REQUEST_RE = /(file|berkas|laporan|report|dokumen|\.md\b|\.txt\b|\.csv\b|\.docx\b)/i

// ---------------------------------------------------------------------------
// 1. Objective kind classification (task-awareness for verification)
// ---------------------------------------------------------------------------

/**
 * Classify what kind of world state the objective touches, so verification
 * stays honest: a chat answer needs no shell test, a file artifact needs a
 * read-back, a browser form needs a confirmation page.
 *
 * hints = { conversational: bool, disableTools: bool }
 */
export function classifyObjectiveKind(prompt = '', hints = {}) {
  if (hints.conversational || hints.disableTools) return 'conversational'
  const p = String(prompt || '').toLowerCase()
  if (!p.trim()) return 'conversational'
  // Plan/explain requests deliver text in-chat: no external state to verify.
  // Guard: an artifact request that merely CONTAINS "ringkasan" (mis. "buat
  // laporan.md berisi ringkasan") is a file task, not a chat summary.
  const wantsArtifact = FILE_REQUEST_RE.test(p)
  if (
    !wantsArtifact &&
    /(rencana|plan|jelaskan|explain|\bide\b|brainstorm|langkah-langkah|strategi|tips|rekomendasi|rangkum|ringkas|summarize)/i.test(
      p
    )
  ) {
    return 'conversational'
  }
  // Diagnosis/analysis questions deliver text in-chat: no external state.
  if (
    /\?\s*$/.test(p) ||
    /^(apa|apakah|mengapa|kenapa|gimana|bagaimana|kapan|dimana|di mana|siapa|what|why|how|when|where|who)\b/i.test(
      p.trim()
    )
  ) {
    return 'conversational'
  }
  if (/(telegram|gmail|\bemail\b|kirim (pesan|email)|broadcast)/i.test(p)) return 'communication'
  if (
    /(perbaiki|fix|refaktor|refactor|\bbug\b|error|kompilasi|compile|implementasikan|tambahkan fitur|unit ?test|lint|\bkode\b|\bcode\b|script|fungsi)/i.test(
      p
    )
  ) {
    return 'code'
  }
  if (
    /(\bform\b|login|daftar|checkout|bayar|submit|kirim form|halaman web|website|browser|scraping|scrape|crawl|navigasi ke|buka url)/i.test(
      p
    )
  ) {
    return 'browser'
  }
  if (
    /(\bos-|aplikasi|desktop|window|layar|\bklik\b|install|uninstall|pengaturan sistem|screenshot layar|keyboard|mouse)/i.test(
      p
    )
  ) {
    return 'os'
  }
  if (
    /(riset|research|teliti|carikan informasi|cari informasi|referensi|sumber|bandingkan|analisis tren|rangkum berita)/i.test(
      p
    )
  ) {
    return 'research'
  }
  if (
    /(file|berkas|laporan|report|dokumen|\.md\b|\.txt\b|\.pdf\b|\.docx\b|tulis|buatkan|simpan|spreadsheet|\.csv)/i.test(
      p
    )
  ) {
    return 'file'
  }
  return 'general'
}

// ---------------------------------------------------------------------------
// 2. Success criteria derivation (per kind, per spec examples)
// ---------------------------------------------------------------------------

/**
 * Derive explicit success criteria for an objective. Returns
 * [{ id, label }] — labels are shown back to the model on replan.
 */
export function deriveSuccessCriteria(kind = 'general', objectiveText = '') {
  const text = String(objectiveText || '')
  switch (kind) {
    case 'file':
      return [
        {
          id: 'artifact-exists',
          label: 'Artifact tersimpan dan bisa dibaca kembali (read-back sukses)'
        },
        { id: 'content-satisfies', label: 'Isi artifact sesuai permintaan user' }
      ]
    case 'code':
      return [
        { id: 'artifact-exists', label: 'File terkait berubah (write/replace sukses)' },
        { id: 'syntax-valid', label: 'Sintaks valid setelah edit' },
        ...(TEST_REQUEST_RE.test(text)
          ? [{ id: 'tests-pass', label: 'Test/lint relevan lulus (output dibuktikan)' }]
          : [])
      ]
    case 'browser':
      return [
        {
          id: 'action-confirmed',
          label: 'Halaman/state mengonfirmasi aksi berhasil (bukan sekadar klik tereksekusi)'
        }
      ]
    case 'os':
      return [
        {
          id: 'app-state-confirmed',
          label: 'State aplikasi/OS mencerminkan aksi yang diminta (os-read/list/screenshot)'
        }
      ]
    case 'research':
      return [
        { id: 'sources-found', label: 'Sumber ditemukan dan dibaca' },
        { id: 'facts-present', label: 'Fakta yang diminta tersedia di jawaban' },
        ...(FILE_REQUEST_RE.test(text)
          ? [{ id: 'artifact-exists', label: 'Output laporan tersimpan sebagai artifact' }]
          : [])
      ]
    case 'communication':
      return [{ id: 'send-confirmed', label: 'Pesan terkirim dan terkonfirmasi' }]
    case 'conversational':
      return []
    case 'general':
    default:
      return [{ id: 'last-execution-success', label: 'Eksekusi tool terakhir sukses tanpa error' }]
  }
}

// ---------------------------------------------------------------------------
// 3. Evidence evaluation (world-state proof from tool observations)
// ---------------------------------------------------------------------------

const normalizeOps = (tools = [], observations = []) => {
  const ops = []
  for (const t of tools || []) {
    if (!t?.tool) continue
    const text = String(t.fullResult || t.resultSummary || '')
    if (!text) continue
    ops.push({ tool: t.tool, text })
  }
  for (const o of observations || []) {
    let text = String(o || '')
    if (!text) continue
    // Observation strings carry their tool marker inline, either directly
    // "[browser-search] ..." or with the harness prefix "[TOOL write-file] ...".
    // Extract it so per-op classification works for sub-agent evidence too.
    const marker = text.match(/^\[(?:TOOL\s+)?([a-z0-9_-]+)\]/i)
    ops.push({ tool: marker ? marker[1] : null, text })
  }
  return ops
}

const opFailed = (op) => FAIL_RE.test(op.text)

/**
 * Evaluate world-state evidence for an objective.
 *
 * Input:
 *   kind          — objective kind (classifyObjectiveKind)
 *   objectiveText — original prompt / durable objective
 *   answer        — the model's final claimed answer (may be empty)
 *   tools         — main-loop executedToolsList entries { tool, fullResult }
 *   observations  — raw observation strings (sub-agent style)
 *
 * Returns { state, kind, criteria, evidence } where criteria is
 * [{ id, label, state }] with state in pass | fail | unresolved | na.
 */
export function evaluateEvidence({
  kind,
  objectiveText = '',
  answer = '',
  tools = [],
  observations = []
} = {}) {
  const resolvedKind = kind || classifyObjectiveKind(objectiveText)
  const ops = normalizeOps(tools, observations)

  if (resolvedKind === 'conversational') {
    return {
      state: VERIFICATION_STATE.VERIFIED,
      kind: resolvedKind,
      criteria: [],
      evidence: { ops: 0, failures: 0 }
    }
  }

  if (ops.length === 0) {
    return {
      state: VERIFICATION_STATE.NOT_RUN,
      kind: resolvedKind,
      criteria: deriveSuccessCriteria(resolvedKind, objectiveText).map((c) => ({
        ...c,
        state: 'unresolved'
      })),
      evidence: { ops: 0, failures: 0, lastTool: null }
    }
  }

  const failures = ops.filter(opFailed).length
  const lastOp = ops[ops.length - 1]
  const criteria = deriveSuccessCriteria(resolvedKind, objectiveText).map((c) => ({
    ...c,
    state: 'na'
  }))
  const setState = (id, state) => {
    const target = criteria.find((c) => c.id === id)
    if (target) target.state = state
  }

  const artifactReadBack = () => {
    const lastWriteIdx = findLastIdx(ops, (op) => WRITE_TOOLS_RE.test(op.tool || ''))
    const lastWrite = lastWriteIdx >= 0 ? ops[lastWriteIdx] : null
    const writeOk = lastWrite ? !opFailed(lastWrite) : false
    // A successful read-back proves existence even without a recorded write
    // (the agent may create artifacts via run-shell); a failed write alone
    // fails the criterion.
    const readBackOk = ops.some((op) => READ_TOOLS_RE.test(op.tool || '') && !opFailed(op))
    return { lastWrite, writeOk, readBackOk }
  }

  switch (resolvedKind) {
    case 'file':
    case 'code': {
      const { lastWrite, writeOk, readBackOk } = artifactReadBack()
      setState(
        'artifact-exists',
        writeOk || readBackOk ? 'pass' : lastWrite ? 'fail' : 'unresolved'
      )
      if (resolvedKind === 'code') {
        setState('syntax-valid', lastWrite ? (opFailed(lastWrite) ? 'fail' : 'pass') : 'unresolved')
        if (TEST_REQUEST_RE.test(String(objectiveText))) {
          const testOps = ops.filter((op) => /(run-shell|run-task)/i.test(op.tool || ''))
          const testPass = testOps.some((op) => TEST_PASS_RE.test(op.text) && !opFailed(op))
          const testFail = testOps.some((op) => TEST_FAIL_RE.test(op.text) || opFailed(op))
          setState('tests-pass', testPass ? 'pass' : testFail ? 'fail' : 'unresolved')
        }
      } else {
        // Content conformance is not deterministically observable without an
        // LLM judge — honest 'na': it neither blocks nor fakes verification.
        setState('content-satisfies', 'na')
      }
      break
    }
    case 'browser': {
      const lastActionIdx = findLastIdx(ops, (op) => BROWSER_ACTION_RE.test(op.tool || ''))
      if (opFailed(lastOp)) {
        setState('action-confirmed', 'fail')
      } else if (lastActionIdx >= 0 && ops.length - 1 > lastActionIdx) {
        // A post-action observation (DOM/read) exists: look for confirmation.
        setState('action-confirmed', BROWSER_CONFIRM_RE.test(lastOp.text) ? 'pass' : 'unresolved')
      } else {
        setState('action-confirmed', 'unresolved')
      }
      break
    }
    case 'os': {
      const lastActionIdx = findLastIdx(ops, (op) => OS_ACTION_RE.test(op.tool || ''))
      const verifyOk = ops.some(
        (op, idx) =>
          VERIFY_TOOLS_RE.test(op.tool || '') &&
          !opFailed(op) &&
          (lastActionIdx < 0 || idx > lastActionIdx)
      )
      setState('app-state-confirmed', opFailed(lastOp) ? 'fail' : verifyOk ? 'pass' : 'unresolved')
      break
    }
    case 'research': {
      const sourcesOk = ops.some((op) => SEARCH_TOOLS_RE.test(op.tool || '') && !opFailed(op))
      const factsOk = String(answer || '').trim().length >= 50
      setState('sources-found', sourcesOk ? 'pass' : 'unresolved')
      setState('facts-present', factsOk ? 'pass' : 'unresolved')
      if (FILE_REQUEST_RE.test(String(objectiveText))) {
        const { lastWrite, writeOk, readBackOk } = artifactReadBack()
        setState(
          'artifact-exists',
          writeOk || readBackOk ? 'pass' : lastWrite ? 'fail' : 'unresolved'
        )
      }
      break
    }
    case 'communication': {
      setState(
        'send-confirmed',
        opFailed(lastOp) ? 'fail' : SEND_CONFIRM_RE.test(lastOp.text) ? 'pass' : 'unresolved'
      )
      break
    }
    case 'general':
    default: {
      setState('last-execution-success', opFailed(lastOp) ? 'fail' : 'pass')
      break
    }
  }

  return {
    state: aggregateCriteria(criteria, { opsCount: ops.length, kind: resolvedKind }),
    kind: resolvedKind,
    criteria,
    evidence: { ops: ops.length, failures, lastTool: lastOp.tool }
  }
}

function findLastIdx(arr, predicate) {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return i
  }
  return -1
}

function aggregateCriteria(criteria, { opsCount }) {
  const meaningful = criteria.map((c) => c.state).filter((s) => s !== 'na')
  if (meaningful.length === 0) return VERIFICATION_STATE.NOT_RUN
  if (meaningful.includes('fail')) return VERIFICATION_STATE.FAILED
  if (meaningful.every((s) => s === 'pass')) return VERIFICATION_STATE.VERIFIED
  if (meaningful.every((s) => s === 'unresolved')) {
    return opsCount > 0 ? VERIFICATION_STATE.UNAVAILABLE : VERIFICATION_STATE.NOT_RUN
  }
  return VERIFICATION_STATE.PARTIALLY
}

// ---------------------------------------------------------------------------
// 4. Completion gate: MODEL_CLAIM x VERIFICATION -> objective complete?
// ---------------------------------------------------------------------------

/**
 * Gate a completion claim against system verification.
 *
 * Returns { complete, replan, reason }:
 *   complete + !replan — accept termination (record verification state)
 *   !complete + replan — inject a bounded replan demanding world-state proof
 *   !complete + !replan — budget exhausted; terminate as failed
 */
export function gateCompletion({
  modelClaimDone = false,
  verification = '',
  kind = 'general'
} = {}) {
  if (!modelClaimDone) return { complete: false, replan: false, reason: 'model-claim-not-done' }
  if (kind === 'conversational') {
    return { complete: true, replan: false, reason: 'conversational-no-external-verification' }
  }
  if (verification === VERIFICATION_STATE.VERIFIED) {
    return { complete: true, replan: false, reason: 'world-state-verified' }
  }
  // General tasks with zero observable world state: no fake criteria — accept
  // the claim rather than inventing a shell test that means nothing.
  if (kind === 'general' && verification === VERIFICATION_STATE.NOT_RUN) {
    return { complete: true, replan: false, reason: 'no-observable-criteria' }
  }
  return { complete: false, replan: true, reason: `verification-${verification}` }
}

// ---------------------------------------------------------------------------
// 5. Replan observation builder (tells the model exactly what is unproven)
// ---------------------------------------------------------------------------

const KIND_VERIFY_HINT = {
  file: 'Buktikan artifact tersimpan: jalankan read-file atau list-dir pada path-nya dan lampirkan hasilnya.',
  code: 'Buktikan perubahan: read-file hasil edit, dan bila test diminta jalankan test/lint via run-shell lalu lampirkan output lulusnya.',
  browser:
    'Jangan berhenti di "klik tereksekusi". Baca ulang halaman (browser-read/browser-extract) dan buktikan konfirmasi sukses (submission/pembayaran/pesan konfirmasi).',
  os: 'Buktikan state aplikasi via os-read, os-list-windows, atau screenshot setelah aksi terakhir.',
  research:
    'Lampirkan sumber yang sudah dibaca (browser-search/read-document) dan pastikan fakta yang diminta ada di jawaban.',
  communication:
    'Buktikan pesan benar-benar terkirim (konfirmasi pengiriman dari tool Telegram/Email).',
  general: 'Jalankan aksi verifikasi yang membuktikan objective tercapai, lalu laporkan selesai.',
  conversational: ''
}

/**
 * Build the [VERIFICATION GATE] observation injected when a completion claim
 * lacks world-state proof. Lists unproven criteria + kind-specific instruction.
 */
export function buildReplanObservation(evidence = {}) {
  const state = evidence.state || VERIFICATION_STATE.NOT_RUN
  const kind = evidence.kind || 'general'
  const unproven = (evidence.criteria || [])
    .filter((c) => c.state === 'unresolved' || c.state === 'fail')
    .map((c) => `- ${c.label} [${c.state}]`)
    .join('\n')
  const hint = KIND_VERIFY_HINT[kind] || KIND_VERIFY_HINT.general
  return [
    '[VERIFICATION GATE] Klaim "selesai"-mu DITOLAK oleh verifier objektif.',
    `Model claim = done, tapi verification state dunia = ${state}. Jawabanmu saja bukan bukti objective tercapai.`,
    unproven
      ? `Kriteria yang belum terbukti:\n${unproven}`
      : 'Kriteria verifikasi belum terbukti oleh observasi tool apapun.',
    hint,
    'Kerjakan aksi verifikasi tersebut sekarang. Jika memang mustahil diverifikasi, laporkan status blocked yang spesifik.'
  ].join('\n')
}

export default {
  VERIFICATION_STATE,
  OBJECTIVE_KINDS,
  MAX_VERIFY_REPLANS,
  classifyObjectiveKind,
  deriveSuccessCriteria,
  evaluateEvidence,
  gateCompletion,
  buildReplanObservation
}
