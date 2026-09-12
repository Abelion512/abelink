// Harness Logging — JSONL lokal, SELALU AKTIF (100% local, tanpa cloud).
// File: ~/.local/share/abelink/harness/<YYYY-MM-DD>/<kind>.jsonl (rotasi 50MB via Rust)
// Toggle lama localStorage 'devHarnessLogging' dipertahankan sebagai no-op
// kompatibilitas (Configuration → Developer); tidak lagi menggerbang tulis.
import { invoke } from '@tauri-apps/api/core'

async function append(kind, obj) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...obj })
  try {
    await invoke('harness_append', { kind, line })
  } catch (e) {
    console.warn('[harness]', kind, e.message)
  }
}

export const logReasoning = (data) => append('reasoning', data)
export const logToolCall = (data) => append('tool-calls', data)

// Isi observasi & jawaban (cap jujur — sink Rust menolak >256K/baris).
export const logObservation = (data) => append('observations', data)
export const logAnswer = (data) => append('answers', data)

// ---- AbelinkBench instrumentation (Phase 2A) ----
// Benchmark events share the same JSONL pipeline (selalu aktif, lokal).
// All benchmark fields are optional — production callers pass only what applies.
export const logBenchmarkRun = (data) => append('bench-run', data)
export const logBenchmarkStep = (data) => append('bench-step', data)
export const logBenchmarkTokens = (data) => append('bench-tokens', data)
export const logBenchmarkResource = (data) => append('bench-resource', data)
export const logBenchmarkResult = (data) => append('bench-result', data)

// Kompatibilitas: logging selalu aktif (lokal). Toggle UI lama no-op.
export const harnessEnabled = () => true
