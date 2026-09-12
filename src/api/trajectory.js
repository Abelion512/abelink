// Trajectory Logger — ringan, in-memory + localStorage buffer.
// Dipakai untuk mencatat reasoning, tool calls, dan execution trace
// tanpa perlu Rust backend (fallback ke harness_append jika tersedia).
// Buffer di-persist ke localStorage supaya survive reload.

const STORAGE_KEY = 'abelink:trajectory-buffer'
const MAX_ENTRIES = 500 // cap supaya localStorage tidak meledak

// Skema event harness v1 — lihat docs/HARNESS-LOG-SCHEMA.md (dipetakan dari
// AgentGuide trace-schema + hierarki ID gaya OWASP AOS; kolom OTel/ATSC = future).
export const HARNESS_SCHEMA_VERSION = 1
export const HARNESS_EVENT_KINDS = [
  'reasoning',
  'tool-call',
  'observation',
  'answer',
  'step',
  'sub-agent',
  'session',
  'turn-start',
  'turn-end'
]

// Estimator token kasar — divisor SAMA dengan core.js (chars/2.5).
// Jujur estimasi (bukan usage provider): untuk kolom tokensEst skema.
export const estimateTokens = (...parts) => {
  let chars = 0
  for (const p of parts) {
    if (typeof p !== 'string' || !p) continue
    chars += p.length
    if (chars > 200000) break
  }
  return Math.round(Math.min(chars, 200000) / 2.5)
}

// Nomor urut monotonik per buffer ( Bertahan reload via localStorage).
let _seq = 0

// Bentuk envelope standar. v/ts diisi otomatis; sessionId/turn/stepId
// diisi penulis (null bila tak tersedia — validator hanya mewajibkan v/kind/ts).
export const makeHarnessEvent = ({ sessionId = null, turn = null, stepId = null, kind, ...rest } = {}) => ({
  id: makeId(kind || 'event'),
  seq: ++_seq,
  v: HARNESS_SCHEMA_VERSION,
  ts: new Date().toISOString(),
  sessionId,
  turn,
  stepId,
  kind,
  ...rest
})

// Validasi konformansi skema (murni, untuk unit test + export script).
// Kembalikan null bila valid, atau string alasan bila tidak.
export const validateHarnessEvent = (e) => {
  if (!e || typeof e !== 'object') return 'event harus objek'
  if (e.v !== HARNESS_SCHEMA_VERSION) return `v harus ${HARNESS_SCHEMA_VERSION}`
  if (typeof e.kind !== 'string' || !HARNESS_EVENT_KINDS.includes(e.kind)) {
    return `kind harus salah satu dari ${HARNESS_EVENT_KINDS.join(',')}`
  }
  if (typeof e.ts !== 'string' || Number.isNaN(Date.parse(e.ts))) return 'ts harus RFC3339 valid'
  return null
}

// Singleton buffer
let _buffer = []
let _listeners = new Set()

// Persist di-throttle (trailing 2s): stringify ±500 entri sinkron tiap log
// memblokir main thread (UI freeze) saat loop agent padat.
let _persistTimer = null
let _persistQueued = false
const persist = () => {
  _persistQueued = true
  if (_persistTimer) return
  _persistTimer = setTimeout(() => {
    _persistTimer = null
    if (!_persistQueued) return
    _persistQueued = false
    try {
      const trimmed = _buffer.slice(-MAX_ENTRIES)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
    } catch {
      /* localStorage penuh/nonaktif — buffer in-memory tetap jalan */
    }
  }, 2000)
}

// Flush sinkron untuk titik akhir sesi (clear/unload) agar jejak tak hilang.
export const flushTrajectoryBuffer = () => {
  if (_persistTimer) {
    clearTimeout(_persistTimer)
    _persistTimer = null
  }
  _persistQueued = false
  try {
    const trimmed = _buffer.slice(-MAX_ENTRIES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    /* abaikan */
  }
}

// BUGFIX: listener dulu dipanggil tanpa argumen (`fn()`), sementara konsumen
// (Trajectory.jsx, TrajectoryLogger.jsx) memakai
// `onTrajectoryUpdate((entries) => setEntries(entries))` — akibatnya state
// di-set ke undefined dan halaman crash di `entries.map(...)` pada update
// pertama. Sekarang tiap listener menerima snapshot array; error di satu
// listener tidak lagi menghentikan listener lain.
const notify = () => {
  const snapshot = _buffer.slice()
  for (const fn of _listeners) {
    try {
      fn(snapshot)
    } catch (err) {
      console.warn('[trajectory] listener error:', err?.message || err)
    }
  }
}

// Subscribe ke perubahan buffer (dipakai Trajectory page)
export const onTrajectoryUpdate = (fn) => {
  _listeners.add(fn)
  // Cleanup React tidak boleh mengembalikan nilai; Set.delete() balikin boolean.
  return () => {
    _listeners.delete(fn)
  }
}

// Load dari localStorage saat init
export const loadTrajectoryBuffer = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    // Isi localStorage bisa rusak atau di-edit manual — pastikan selalu array,
    // kalau tidak semua konsumen yang memanggil .map()/.filter() akan crash.
    _buffer = Array.isArray(parsed) ? parsed : []
    // Lanjutkan seq dari entri terbesar agar monotonik lintas reload.
    for (const e of _buffer) {
      if (e && typeof e.seq === 'number' && e.seq > _seq) _seq = e.seq
    }
  } catch {
    _buffer = []
  }
  return _buffer
}

// Get snapshot
export const getTrajectoryBuffer = () => _buffer

// Clear
export const clearTrajectoryBuffer = () => {
  _buffer = []
  flushTrajectoryBuffer()
  notify()
}

// Satu jalur tulis untuk semua logger. Selain menghapus duplikasi
// push/persist/notify, ini memangkas buffer IN-MEMORY — sebelumnya hanya
// salinan localStorage yang dibatasi, sedangkan array di RAM tumbuh tanpa
// batas sepanjang sesi.
const pushEntry = (entry) => {
  _buffer.push(entry)
  if (_buffer.length > MAX_ENTRIES) {
    _buffer = _buffer.slice(-MAX_ENTRIES)
  }
  persist()
  notify()
}

const makeId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

// ── Logger APIs (dipanggil dari planning.js / core.js) ──

export const logReasoning = ({ prompt, model, tokens, duration, ...rest } = {}) => {
  pushEntry({
    ...makeHarnessEvent({ kind: 'reasoning', ...rest }),
    prompt: typeof prompt === 'string' ? prompt.slice(0, 2000) : undefined,
    model,
    tokens,
    duration
  })
}

export const logToolCall = ({ tool, args, result, success, duration, ...rest } = {}) => {
  pushEntry({
    ...makeHarnessEvent({ kind: 'tool-call', ...rest }),
    tool,
    args: typeof args === 'string' ? args.slice(0, 1000) : args,
    result: typeof result === 'string' ? result.slice(0, 2000) : result,
    success: success !== false,
    duration
  })
}

// Observasi = apa yang model LIHAT (teks [OBSERVATION] yang masuk loop).
// Cap 3000 = batas yang sama dipakai loop saat memotong observasi.
export const logObservation = ({ observation, tool = null, ...rest } = {}) => {
  pushEntry({
    ...makeHarnessEvent({ kind: 'observation', ...rest }),
    tool,
    observation: typeof observation === 'string' ? observation.slice(0, 3000) : observation
  })
}

// Jawaban final per giliran (teks bubble + outcome sistem).
export const logAnswer = ({ answer, outcome = null, ...rest } = {}) => {
  pushEntry({
    ...makeHarnessEvent({ kind: 'answer', ...rest }),
    answer: typeof answer === 'string' ? answer.slice(0, 4000) : answer,
    outcome
  })
}

// Framing giliran (gaya AOS turn/start|end): start tiap iterasi loop,
// end hanya di jawaban terminal. Start-tanpa-end = interupsi (jujur).
export const logTurnStart = ({ turn = null, ...rest } = {}) => {
  pushEntry({ ...makeHarnessEvent({ kind: 'turn-start', turn, ...rest }) })
}

export const logTurnEnd = ({ turn = null, outcome = null, reason = null, ...rest } = {}) => {
  pushEntry({ ...makeHarnessEvent({ kind: 'turn-end', turn, outcome, reason, ...rest }) })
}

export const logSubAgentSpawn = ({ name, parentAgentId, ...rest } = {}) => {
  pushEntry({
    ...makeHarnessEvent({ kind: 'sub-agent', ...rest }),
    name,
    parentAgentId
  })
}

export const logStep = ({ step, total, description, status, ...rest } = {}) => {
  pushEntry({
    ...makeHarnessEvent({ kind: 'step', ...rest }),
    step,
    total,
    description,
    status
  })
}

// Init on import
loadTrajectoryBuffer()

// Flush saat halaman disembunyikan/ditutup agar jejak sesi tak hilang
// (persist normal di-throttle trailing).
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pagehide', () => {
    try {
      flushTrajectoryBuffer()
    } catch {
      /* abaikan */
    }
  })
}
