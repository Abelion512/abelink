// objectiveVerifier.js — Objective Completion & Verification Layer for ABELINK.
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
// Orchestration ops are observations, never fetch proof (RI-13): explicit
// exclusion even though SEARCH_TOOLS_RE does not substring-match them today.
const SUBAGENT_ORCH_RE = /(wait_subagents|spawn_subagent)/i
// OS ACTION tools only — os-read/os-list-windows are VERIFICATION ops, not
// actions, so a proof read after the last action can satisfy the criterion.
const OS_ACTION_RE =
  /(os-click|os-double-click|os-type|os-key|os-scroll|os-search|os-open|os-delay)/i
// Browser actions split by what they prove. Interaction actions MUTATE page
// state (click/type/scroll/script/download): "executed" is not "confirmed" —
// only an explicit confirmation observation proves them. Read-class actions
// (navigate/read/extract/read-dom, dash or colon tool forms) RETURN page
// data: substantive returned content is itself the proof. Transport-only
// navigation never counts as interaction.
const BROWSER_INTERACT_RE =
  /(browser[-:]click|browser[-:]type|browser[-:]scroll|browser[-:]script|browser[-:]download)/i
const BROWSER_READ_RE =
  /(browser[-:]navigate|browser[-:]read|browser[-:]extract|read-dom)/i

// Minimum trimmed characters for a read-class observation to count as
// substantive returned data. Guards: "" and "OK" never verify; real page
// data (titles + element lists, extracts) is far longer. Aligned with the
// research 'facts-present' floor (50 chars).
const MIN_READ_PROOF_CHARS = 50
const hasReadSubstance = (text = '') =>
  String(text || '').trim().length >= MIN_READ_PROOF_CHARS

// Latest browser read-class result, raw tools first: normalizeOps() drops
// empty-text ops, so an empty extract after a good navigate would vanish and
// the navigate alone would look like proof. Reading the raw entry keeps
// "extract returned nothing" visible as no-proof. Falls back to classified
// ops for observations-only (sub-agent) evidence.
const lastBrowserReadText = (tools = [], ops = []) => {
  for (let i = (tools || []).length - 1; i >= 0; i--) {
    const t = tools[i]
    if (!BROWSER_READ_RE.test(t?.tool || '')) continue
    return String(t.fullResult || t.resultSummary || '')
  }
  for (let i = ops.length - 1; i >= 0; i--) {
    if (BROWSER_READ_RE.test(ops[i].tool || '')) return ops[i].text
  }
  return ''
}

const TEST_REQUEST_RE = /(test|uji|unittest|vitest|jest|pytest|lint)/i
const TEST_PASS_RE = /(passing|passed|\btests?\s+(lulus|pass)\b|berhasil lulus|all tests)/i
const TEST_FAIL_RE = /(\d+\s+(failed|failing)|tests?\s+(gagal|failed))/i

const BROWSER_CONFIRM_RE =
  /(berhasil|sukses|success|terkirim|terkonfirmasi|konfirmasi|terima kasih|thank you|submitted|submission|pembayaran (diterima|berhasil)|order (diterima|created|received)|akun (dibuat|created)|data tersimpan)/i
const SEND_CONFIRM_RE =
  /(terkirim|sent|message_id|delivered|berhasil mengirim|berhasil dikirim|berhasil mengunggah)/i

const FILE_REQUEST_RE = /(file|berkas|laporan|report|dokumen|\.md\b|\.txt\b|\.csv\b|\.docx\b)/i

// Intent menyimpan/menulis artifact: harus ada aksi simpan/tulis/buat/ekspor
// atau nama berkas berekstensi (mis. laporan.md, hasil.txt), bukan sekadar topik
// riset yang memuat kata 'laporan' atau 'dokumen' (mis. "riset laporan keuangan Q3").
export const ARTIFACT_INTENT_RE =
  /(?:simpan|tulis|buatkan|buat|ekspor|export|save|write|catat)\s+(?:ke|dalam|sebagai|ke dalam)?\s*.*(?:file|berkas|laporan|report|dokumen|\.(?:md|txt|csv|docx|pdf))\b|\b[a-zA-Z0-9_-]+\.(?:md|txt|csv|docx|pdf)\b/i

// Penanda permohonan maaf / kegagalan eksplisit pada jawaban: jawaban yang hanya
// meminta maaf atau menyatakan tidak menemukan info BUKAN bukti fakta hadir.
export const APOLOGY_OR_FAILURE_RE =
  /(maaf|mohon maaf|tidak (dapat|bisa) menemukan|tidak ada informasi|unable to find|cannot find|could not find|no information available|saya gagal|saya tidak berhasil)/i

// RI-13: semantic no-result markers: a "successful" search returning zero
// results is not fetch proof (tool-level FAIL_RE never fires on these).
const NO_RESULT_RE =
  /(tidak ditemukan hasil|no results? found|tidak ada hasil|hasil tidak ditemukan|0 results|did not match any documents|halaman tidak ditemukan|404 not found)/i

// Broken search transport (browser-search emits "[SEARCH-ERROR] <layer>: ..."
// on tool failure, e.g. router 401 or extension disconnect). FAIL_RE never
// fires on it and the marker text is long enough to pass hasReadSubstance,
// so without this check a broken weapon reads as fetch proof. Genuine
// [NO-RESULTS] (search executed, zero hits) is NOT an error — current
// behavior preserved for that case.
const SEARCH_ERROR_RE = /\[SEARCH-ERROR\]/i
const SEARCH_ERROR_LAYER_RE = /\[SEARCH-ERROR\]\s*([^:\]\n]+)/i

// Penanda objective multi-langkah: klaim done setelah 1 aksi = prematur.
// Murni struktur bahasa (konjungsi), nol nama produk — buta-contoh.
const MULTI_ACTION_RE = /(\bdan\b|\blalu\b|\bkemudian\b|\bsetelah itu\b|\bterus\b|\bthen\b|\band\b)/i

export const isMultiActionObjective = (text = '') => MULTI_ACTION_RE.test(String(text || ''))

// Anti-halusinasi: klaim bernama (model/produk/versi) harus dikutip dari ISI
// observasi tool, bukan dari URL/judul tab. Ekstraksi kasar: frasa kapital
// multi-kata + token kapital ber-digit ("Muse 1.3", "GPT-6 Astra"). Kata
// generik di tepi frasa dikupas; sisa satu kata tanpa digit = bukan klaim.
const CLAIM_PHRASE_RE = /[A-Z][\w-]*(?:\s+(?:[A-Z][\w.-]*|\d+\.\d[\w.-]*))+/g
const CLAIM_TOKEN_RE = /\b[A-Z][\w-]*\d[\w.-]*\b/g
const CLAIM_STOPWORDS = new Set(
  'model flash pro team search browser openai anthropic google harga laporan hasil data pasar toko bulan tahun kuartal pendapatan perusahaan layanan info informasi rp q1 q2 q3 q4'.split(
    ' '
  )
)

const stripClaimStopwords = (phrase = '') => {
  const words = String(phrase).split(/\s+/).filter(Boolean)
  while (words.length && CLAIM_STOPWORDS.has(words[0].toLowerCase())) words.shift()
  while (words.length && CLAIM_STOPWORDS.has(words[words.length - 1].toLowerCase())) words.pop()
  return words.join(' ')
}

const extractClaimEntities = (answer = '') => {
  const text = String(answer || '')
  const found = new Map()
  for (const re of [CLAIM_PHRASE_RE, CLAIM_TOKEN_RE]) {
    for (const m of text.matchAll(re)) {
      const cleaned = stripClaimStopwords(m[0])
      if (!cleaned || !/[A-Za-z]/.test(cleaned)) continue
      if (!/\s/.test(cleaned) && !/\d/.test(cleaned)) continue
      if (!found.has(cleaned.toLowerCase())) found.set(cleaned.toLowerCase(), cleaned)
    }
  }
  const all = [...found.values()]
  return all.filter((c) => !all.some((o) => o !== c && o.toLowerCase().includes(c.toLowerCase())))
}

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
    /(\bform\b|login|daftar|checkout|bayar|submit|kirim form|halaman web|website|browser|scraping|scrape|crawl|navigasi ke|buka url|(buka|open)\s+https?:\/\/|(buka|open)\s+(halaman|situs|web|url|link|tab|browser)\b)/i.test(
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
          : []),
        // R1c (anti-hack ala DGM): klaim "test hijau" WAJIB artefak output
        // mentah (exit code / ringkasan vitest), bukan teks model. Tanpa op
        // eksekusi test yang membawa artefak -> unresolved, bukan pass.
        {
          id: 'test-evidence',
          label: 'Klaim test hijau didukung artefak output mentah (bukan sekadar teks)'
        }
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
        {
          id: 'claim-quoted',
          label: 'Klaim bernama (model/produk/versi) dikutip dari isi observasi'
        },
        ...(ARTIFACT_INTENT_RE.test(text)
          ? [{ id: 'artifact-exists', label: 'Output laporan tersimpan sebagai artifact' }]
          : [])
      ]
    case 'communication':
      return [{ id: 'send-confirmed', label: 'Pesan terkirim dan terkonfirmasi' }]
    case 'conversational':
      return []
    case 'general':
    default:
      // Objective multi-langkah dengan 1 aksi sukses = progres, bukan bukti
      // selesai. Tanpa kriteria ini, satu navigate sukses langsung VERIFIED
      // dan klaim done prematur lolos (kasus "buka X dan ...").
      return isMultiActionObjective(text)
        ? [
            { id: 'last-execution-success', label: 'Eksekusi tool terakhir sukses tanpa error' },
            {
              id: 'multi-step-progress',
              label: 'Objective multi-langkah: minimal 2 aksi tool sukses tereksekusi'
            }
          ]
        : [{ id: 'last-execution-success', label: 'Eksekusi tool terakhir sukses tanpa error' }]
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

// Eskalasi kind dari bukti tool, bukan dari kosakata prompt. Jika klasifikasi
// teks menghasilkan 'general' tetapi eksekusi nyata mengandung aksi browser,
// verifikasi memakai lensa 'browser' (tuntut konfirmasi, bukan sekadar
// "klik tereksekusi"). Berlaku untuk situs apapun — dikenal maupun yang baru
// muncul — karena yang dibaca adalah perilaku. 'conversational' tidak pernah
// dieskalasi. Murni & unit-testable.
export function escalateKindFromEvidence(kind = 'general', ops = []) {
  if (kind !== 'general') return kind
  // Only genuine page-state interaction escalates: bare navigation is
  // transport, and a read-class pass alone is proof of retrieval, not a
  // demand for interaction confirmation.
  const acted = (ops || []).some((op) => BROWSER_INTERACT_RE.test(op?.tool || ''))
  return acted ? 'browser' : kind
}

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
    const criteria = deriveSuccessCriteria(resolvedKind, objectiveText).map((c) => ({
      ...c,
      state: 'unresolved'
    }))
    // Objective multi-langkah tanpa tool sama sekali = belum ada bukti, bukan
    // "tidak ada kriteria" — JANGAN lolos lewat pengecualian general+NOT_RUN.
    // Selain kasus itu, perilaku lama dipertahankan (NOT_RUN).
    const multiGeneral =
      resolvedKind === 'general' && criteria.some((c) => c.id === 'multi-step-progress')
    return {
      state: multiGeneral ? VERIFICATION_STATE.UNAVAILABLE : VERIFICATION_STATE.NOT_RUN,
      kind: resolvedKind,
      criteria,
      evidence: { ops: 0, failures: 0, lastTool: null }
    }
  }

  const failures = ops.filter(opFailed).length
  const lastOp = ops[ops.length - 1]
  // Kind final mengikuti bukti: general + aksi browser tereksekusi = lensa browser.
  const effectiveKind = escalateKindFromEvidence(resolvedKind, ops)
  const criteria = deriveSuccessCriteria(effectiveKind, objectiveText).map((c) => ({
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

  switch (effectiveKind) {
    case 'file':
    case 'code': {
      const { lastWrite, writeOk, readBackOk } = artifactReadBack()
      setState(
        'artifact-exists',
        writeOk || readBackOk ? 'pass' : lastWrite ? 'fail' : 'unresolved'
      )
      if (effectiveKind === 'code') {
        setState('syntax-valid', lastWrite ? (opFailed(lastWrite) ? 'fail' : 'pass') : 'unresolved')
        if (TEST_REQUEST_RE.test(String(objectiveText))) {
          const testOps = ops.filter((op) => /(run-shell|run-task)/i.test(op.tool || ''))
          const testPass = testOps.some((op) => TEST_PASS_RE.test(op.text) && !opFailed(op))
          const testFail = testOps.some((op) => TEST_FAIL_RE.test(op.text) || opFailed(op))
          setState('tests-pass', testPass ? 'pass' : testFail ? 'fail' : 'unresolved')
        }
        // R1c: test-evidence — klaim "test hijau/lulus" di jawaban HANYA pass
        // bila ada op eksekusi test dengan artefak (ringkasan angka mentah).
        // Tanpa artefak -> unresolved (tolak klaim teks ala DGM reward-hack).
        const claimsTestsGreen = /(test.*(hijau|lulus|pass)|semua.*(test|uji).*hijau|vitest.*(hijau|pass)|tests?\s+passed)/i.test(
          String(answer || '')
        )
        if (!claimsTestsGreen) {
          setState('test-evidence', 'na')
        } else {
          const artifactOps = ops.filter(
            (op) =>
              /(run-shell|run-task)/i.test(op.tool || '') &&
              !opFailed(op) &&
              /(\d+\s+passed|Test Files|Tests\s+\d+|passed\s*\(\d+\))/i.test(op.text || '')
          )
          setState('test-evidence', artifactOps.length > 0 ? 'pass' : 'unresolved')
          if (artifactOps.length === 0) {
            criteria.find((c) => c.id === 'test-evidence').label +=
              ' — klaim test hijau tanpa artefak output mentah: lampirkan ringkasan vitest (exit code + angka), jangan mengarang'
          }
        }
      } else {
        // Content conformance is not deterministically observable without an
        // LLM judge — honest 'na': it neither blocks nor fakes verification.
        setState('content-satisfies', 'na')
      }
      break
    }
    case 'browser': {
      const lastInteractIdx = findLastIdx(ops, (op) => BROWSER_INTERACT_RE.test(op.tool || ''))
      if (opFailed(lastOp)) {
        setState('action-confirmed', 'fail')
      } else if (lastInteractIdx >= 0) {
        // Genuine interaction ran: confirmation vocabulary in the post-action
        // observation slice (not just the final op — a later file write must
        // not be tested for page-confirmation words).
        const slice = ops.slice(lastInteractIdx + 1)
        const sliceText = slice.map((op) => op.text).join('\n')
        setState('action-confirmed', BROWSER_CONFIRM_RE.test(sliceText) ? 'pass' : 'unresolved')
      } else {
        // Read-class only (navigate/read/extract): substantive returned
        // content IS the proof. Empty/trivial output is no-proof (unresolved),
        // never a free pass.
        const readText = lastBrowserReadText(tools, ops)
        setState('action-confirmed', hasReadSubstance(readText) ? 'pass' : 'unresolved')
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
      // RI-13: semantic success required: a search returning "no results"
      // with substantive-looking surrounding text is not fetch proof.
      // Broken transport poisons the batch: ANY [SEARCH-ERROR] op forces
      // sources-found unresolved regardless of other ops — a broken weapon
      // is not "info does not exist".
      const searchErrorOp = ops.find((op) => SEARCH_ERROR_RE.test(op.text || ''))
      const isLocalResearch = /(repo|codebase|arsitektur|kode|workspace|lokal)/i.test(
        String(objectiveText || '')
      )
      const isSubagentReport = (op) =>
        op.tool === 'send_message' &&
        /(\[BALASAN|evaluasi|hasil|temuan|analisis|audit|ringkasan)/i.test(op.text) &&
        hasReadSubstance(op.text)

      const isLocalCodebaseProof = (op) =>
        isLocalResearch &&
        READ_TOOLS_RE.test(op.tool || '') &&
        hasReadSubstance(op.text)

      const isDirectSearchProof = (op) =>
        SEARCH_TOOLS_RE.test(op.tool || '') &&
        !SUBAGENT_ORCH_RE.test(op.tool || '') &&
        !NO_RESULT_RE.test(op.text || '') &&
        hasReadSubstance(op.text)

      const sourcesOk =
        !searchErrorOp &&
        ops.some(
          (op) =>
            !opFailed(op) &&
            (isDirectSearchProof(op) || isSubagentReport(op) || isLocalCodebaseProof(op))
        )
      const factsOk =
        String(answer || '').trim().length >= 50 &&
        !APOLOGY_OR_FAILURE_RE.test(String(answer || ''))
      setState('sources-found', sourcesOk ? 'pass' : 'unresolved')
      if (searchErrorOp) {
        const layer =
          String(searchErrorOp.text || '').match(SEARCH_ERROR_LAYER_RE)?.[1]?.trim() ||
          'unknown'
        criteria.find((c) => c.id === 'sources-found').label +=
          ` — senjata riset rusak (${layer}) — perbaiki akses search, JANGAN simpulkan info tidak ada`
      }
      setState('facts-present', factsOk ? 'pass' : 'unresolved')
      const claims = extractClaimEntities(answer)
      if (claims.length === 0) {
        setState('claim-quoted', 'na')
      } else {
        const quoted = claims.filter((c) =>
          ops.some((op) => String(op.text || '').toLowerCase().includes(c.toLowerCase()))
        )
        setState('claim-quoted', quoted.length === claims.length ? 'pass' : 'unresolved')
        const pending = claims.filter((c) => !quoted.includes(c))
        if (pending.length) {
          criteria
            .find((c) => c.id === 'claim-quoted')
            .label += ` — klaim ${pending.map((c) => `<${c}>`).join(', ')} tanpa kutipan isi: extract dulu, klaim kemudian`
        }
      }
      if (ARTIFACT_INTENT_RE.test(String(objectiveText))) {
        const { lastWrite, readBackOk } = artifactReadBack()
        // File requested => write-only is unresolved, read-back required.
        setState(
          'artifact-exists',
          readBackOk ? 'pass' : lastWrite ? (opFailed(lastWrite) ? 'fail' : 'unresolved') : 'unresolved'
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
      if (criteria.some((c) => c.id === 'multi-step-progress')) {
        const successes = ops.filter((op) => !opFailed(op)).length
        setState(
          'multi-step-progress',
          opFailed(lastOp) ? 'fail' : successes >= 2 ? 'pass' : 'unresolved'
        )
      }
      break
    }
  }

  return {
    state: aggregateCriteria(criteria, { opsCount: ops.length, kind: effectiveKind }),
    kind: effectiveKind,
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
    'Jangan berhenti di "klik tereksekusi". Baca ulang halaman (browser-read/browser-extract) dan buktikan konfirmasi sukses (submission/pembayaran/pesan konfirmasi). Jika butuh pilihan user (mis. pilih history chat), panggil tool ask-choice dengan opsi konkret — JANGAN mengakhiri dengan pertanyaan teks.',
  os: 'Buktikan state aplikasi via os-read, os-list-windows, atau screenshot setelah aksi terakhir.',
  research:
    'Lampirkan sumber yang sudah dibaca (browser-search/read-document) dan pastikan fakta yang diminta ada di jawaban.',
  communication:
    'Buktikan pesan benar-benar terkirim (konfirmasi pengiriman dari tool Telegram/Email).',
  general:
    'Satu aksi sukses bukan bukti objective multi-langkah selesai — lanjutkan aksi berikutnya. Jika butuh pilihan user, panggil tool ask-choice dengan opsi konkret, bukan pertanyaan teks.',
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
  buildReplanObservation,
  isMultiActionObjective,
  escalateKindFromEvidence
}
