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

const notify = () => _listeners.forEach((fn) => fn())

// Subscribe ke perubahan buffer (dipakai Trajectory page)
export const onTrajectoryUpdate = (fn) => {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}

// Load dari localStorage saat init
export const loadTrajectoryBuffer = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    _buffer = raw ? JSON.parse(raw) : []
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

// ── Logger APIs (dipanggil dari planning.js / core.js) ──

export const logReasoning = ({ prompt, model, tokens, duration, ...rest } = {}) => {
  const entry = {
    id: `reason-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind: 'reasoning',
    ts: new Date().toISOString(),
    prompt: typeof prompt === 'string' ? prompt.slice(0, 2000) : undefined,
    model,
    tokens,
    duration,
    ...rest
  }
  _buffer.push(entry)
  persist()
  notify()
}

export const logToolCall = ({ tool, args, result, success, duration, ...rest } = {}) => {
  const entry = {
    id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind: 'tool-call',
    ts: new Date().toISOString(),
    tool,
    args: typeof args === 'string' ? args.slice(0, 1000) : args,
    result: typeof result === 'string' ? result.slice(0, 2000) : result,
    success: success !== false,
    duration,
    ...rest
  }
  _buffer.push(entry)
  persist()
  notify()
}

export const logSubAgentSpawn = ({ name, parentAgentId, ...rest } = {}) => {
  const entry = {
    id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind: 'sub-agent',
    ts: new Date().toISOString(),
    name,
    parentAgentId,
    ...rest
  }
  _buffer.push(entry)
  persist()
  notify()
}

export const logStep = ({ step, total, description, status, ...rest } = {}) => {
  const entry = {
    id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind: 'step',
    ts: new Date().toISOString(),
    step,
    total,
    description,
    status,
    ...rest
  }
  _buffer.push(entry)
  persist()
  notify()
}

// Init on import
loadTrajectoryBuffer()
