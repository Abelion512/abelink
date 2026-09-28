// Harness Logging — JSONL lokal, SELALU AKTIF (100% local, tanpa cloud).
// File: ~/.local/share/abelink/harness/<YYYY-MM-DD>/<kind>.jsonl (rotasi 50MB via Rust)
// Toggle lama localStorage 'devHarnessLogging' dipertahankan sebagai no-op
// kompatibilitas (Configuration → Developer); tidak lagi menggerbang tulis.
import { invoke } from '@tauri-apps/api/core'

// ---- Kontrak tipe (W2-8a) ----
type HarnessKind =
  | 'reasoning' | 'tool-calls' | 'observations' | 'answers'
  | 'turn-start' | 'turn-end'
  | 'bench-run' | 'bench-step' | 'bench-tokens' | 'bench-resource' | 'bench-result'
type HarnessData = Record<string, unknown>

async function append(kind: HarnessKind, obj: HarnessData): Promise<void> {
  const normalizedKind =
    kind === 'tool-calls'
      ? 'tool-call'
      : kind === 'observations'
        ? 'observation'
        : kind === 'answers'
          ? 'answer'
          : kind
  const line = JSON.stringify({ ts: new Date().toISOString(), kind: obj?.kind || normalizedKind, ...obj })
  try {
    await invoke('harness_append', { kind, line })
  } catch (e) {
    console.warn('[harness]', kind, (e as Error).message)
  }
}

export const logReasoning = (data: HarnessData) => append('reasoning', data)
export const logToolCall = (data: HarnessData) => append('tool-calls', data)

// Isi observasi & jawaban (cap jujur — sink Rust menolak >256K/baris).
export const logObservation = (data: HarnessData) => append('observations', data)
export const logAnswer = (data: HarnessData) => append('answers', data)
export const logTurnStart = (data: HarnessData) => append('turn-start', data)
export const logTurnEnd = (data: HarnessData) => append('turn-end', data)

// ---- AbelinkBench instrumentation (Phase 2A) ----
// Benchmark events share the same JSONL pipeline (selalu aktif, lokal).
// All benchmark fields are optional — production callers pass only what applies.
export const logBenchmarkRun = (data: HarnessData) => append('bench-run', data)
export const logBenchmarkStep = (data: HarnessData) => append('bench-step', data)
export const logBenchmarkTokens = (data: HarnessData) => append('bench-tokens', data)
export const logBenchmarkResource = (data: HarnessData) => append('bench-resource', data)
export const logBenchmarkResult = (data: HarnessData) => append('bench-result', data)

// Kompatibilitas: logging selalu aktif (lokal). Toggle UI lama no-op.
export const harnessEnabled = () => true
