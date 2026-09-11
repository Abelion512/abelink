// benchArch.js — MarkBench architecture axis (pure, env-only, no I/O).
// vanilla = model-only baseline (no supervisor, no verify-gate replan).
// basic   = Fase 1 supervisor (tool governance, no Fase 2 scoring/lineage).
// avo     = full Fase 2 (scored lineage + strategy ranking fed back).
// Default 'basic' so production (env unset) keeps the stable baseline.
export const ARCH_VALUES = Object.freeze(['vanilla', 'basic', 'avo'])

export function resolveBenchArch(value) {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return ARCH_VALUES.includes(v) ? v : 'basic'
}

// Reads MARK_BENCH_ARCH from an explicit env object, else globalThis.process.
// Never throws, never touches window/db/network.
export function currentBenchArch(env) {
  const table =
    env ||
    (typeof globalThis !== 'undefined' &&
    globalThis.process &&
    globalThis.process.env
      ? globalThis.process.env
      : {})
  return resolveBenchArch(table.MARK_BENCH_ARCH)
}

export default { ARCH_VALUES, resolveBenchArch, currentBenchArch }
