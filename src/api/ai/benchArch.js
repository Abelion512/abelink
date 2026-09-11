// benchArch.js - MarkBench architecture axis (pure, env-only, no I/O).
// vanilla = model-only baseline (no supervisor, no verify-gate replan).
// basic   = thin trajectory supervisor (tool governance + stagnation ladder).
// avo     = LEGACY ALIAS of basic, kept so older bench reports stay parseable.
//           The Fase 2 layer (trajLineage.js + scoring.js: scored lineage and
//           strategy ranking fed back) was removed 2026-09-12 after review:
//           the 6-taxonomy ontology plus lineage scoring had no measured gain
//           over the 4-rung ladder in strategyLib.js. Do not advertise `avo`
//           as a distinct architecture; a report labelled `avo` today is
//           behaviourally identical to `basic`.
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
