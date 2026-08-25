// Harness Logging (DEV MODE) — JSONL opt-in, default OFF.
// Toggle: localStorage 'devHarnessLogging' (diatur dari Configuration → Developer).
// File: ~/.local/share/mark/harness/<YYYY-MM-DD>/<kind>.jsonl (rotasi 50MB via Rust)
import { invoke } from '@tauri-apps/api/core'

const enabled = () => {
  try {
    return localStorage.getItem('devHarnessLogging') === '1'
  } catch {
    return false
  }
}

async function append(kind, obj) {
  if (!enabled()) return
  const line = JSON.stringify({ ts: new Date().toISOString(), ...obj })
  try {
    await invoke('harness_append', { kind, line })
  } catch (e) {
    console.warn('[harness]', kind, e.message)
  }
}

export const logReasoning = (data) => append('reasoning', data)
export const logToolCall = (data) => append('tool-calls', data)
export const harnessEnabled = enabled
