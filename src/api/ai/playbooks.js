// Low-effort deterministic replay (playbook): exact-match cache of previous
// successful completions. Consulted BEFORE fetchAI only when effort resolves
// to 'low' — an exact repeat of prompt + config returns the cached answer
// with zero LLM calls. Miss → normal (medium+) LLM path.
//
// Exact match by design: no fuzzy matching, no similarity threshold to tune.
// ponytail: FIFO eviction at 50 entries; LRU only if hit-rate data says so.

export const PLAYBOOK_MAX_ENTRIES = 50
const STORAGE_KEY = 'abelink_playbooks_v1'

const store = new Map()
let hydrated = false

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch (_) {
    return null
  }
}

function hydrate() {
  if (hydrated) return
  hydrated = true
  try {
    const raw = storage()?.getItem(STORAGE_KEY)
    if (!raw) return
    const entries = JSON.parse(raw)
    if (!Array.isArray(entries)) return
    for (const [k, v] of entries.slice(-PLAYBOOK_MAX_ENTRIES)) {
      if (typeof k === 'string' && v && typeof v.answer === 'string') store.set(k, v)
    }
  } catch (_) {}
}

function persist() {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify([...store.entries()]))
  } catch (_) {}
}

// Stable identity for "same config": provider + model + endpoint only.
// Temperature/top-p and co. are deliberately excluded — replay cares about
// which model answered, not sampling knobs.
export function configKeyFor(conf = {}) {
  return [conf.aiProvider, conf.model, conf.customModel, conf.customEndpoint]
    .map((v) => String(v ?? ''))
    .join('|')
}

function keyFor(prompt, configKey) {
  return `${String(configKey ?? '')}::${String(prompt ?? '')}`
}

export function playbookLookup({ prompt, configKey }) {
  if (!prompt || typeof prompt !== 'string') return null
  hydrate()
  return store.get(keyFor(prompt, configKey)) ?? null
}

export function playbookRecord({ prompt, configKey, answer, taskStatus }) {
  if (!prompt || typeof prompt !== 'string') return false
  if (!answer || typeof answer !== 'string') return false
  hydrate()
  const k = keyFor(prompt, configKey)
  if (store.has(k)) store.delete(k) // refresh recency on re-record
  store.set(k, { answer, taskStatus: taskStatus ?? 'done' })
  while (store.size > PLAYBOOK_MAX_ENTRIES) {
    store.delete(store.keys().next().value) // FIFO: evict oldest
  }
  persist()
  return true
}

export function playbookClear() {
  store.clear()
  try {
    storage()?.removeItem(STORAGE_KEY)
  } catch (_) {}
}
