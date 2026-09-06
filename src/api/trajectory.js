// Trajectory Logger — ringan, in-memory + localStorage buffer.
// Dipakai untuk mencatat reasoning, tool calls, dan execution trace
// tanpa perlu Rust backend (fallback ke harness_append jika tersedia).
// Buffer di-persist ke localStorage supaya survive reload.

const STORAGE_KEY = 'mark:trajectory-buffer'
const MAX_ENTRIES = 500 // cap supaya localStorage tidak meledak

// Singleton buffer
let _buffer = []
let _listeners = new Set()

const persist = () => {
  try {
    const trimmed = _buffer.slice(-MAX_ENTRIES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch (_) {}
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
  persist()
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
    id: makeId('reason'),
    kind: 'reasoning',
    ts: new Date().toISOString(),
    prompt: typeof prompt === 'string' ? prompt.slice(0, 2000) : undefined,
    model,
    tokens,
    duration,
    ...rest
  })
}

export const logToolCall = ({ tool, args, result, success, duration, ...rest } = {}) => {
  pushEntry({
    id: makeId('tool'),
    kind: 'tool-call',
    ts: new Date().toISOString(),
    tool,
    args: typeof args === 'string' ? args.slice(0, 1000) : args,
    result: typeof result === 'string' ? result.slice(0, 2000) : result,
    success: success !== false,
    duration,
    ...rest
  })
}

export const logSubAgentSpawn = ({ name, parentAgentId, ...rest } = {}) => {
  pushEntry({
    id: makeId('sub'),
    kind: 'sub-agent',
    ts: new Date().toISOString(),
    name,
    parentAgentId,
    ...rest
  })
}

export const logStep = ({ step, total, description, status, ...rest } = {}) => {
  pushEntry({
    id: makeId('step'),
    kind: 'step',
    ts: new Date().toISOString(),
    step,
    total,
    description,
    status,
    ...rest
  })
}

// Init on import
loadTrajectoryBuffer()
