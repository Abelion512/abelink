// benchArch.js - MarkBench architecture axis (pure, env-only, no I/O).
// vanilla = model-only baseline (no supervisor, no verify-gate replan).
// basic   = thin trajectory supervisor (tool governance + stagnation ladder).
// Default 'basic' so production (env unset) keeps the stable baseline.
//
// `avo` was REMOVED 2026-09-12. It used to select the Fase 2 layer
// (trajLineage.js + scoring.js: scored lineage and strategy ranking fed back).
// That layer was deleted after review because the 6-taxonomy ontology plus
// lineage scoring had no measured gain over the 4-rung ladder in strategyLib.js.
// The removal is fail-fast on purpose: `--arch avo` now exits 2 with the list of
// valid values (evaluation/run.mjs) instead of silently degrading to `basic`.
// Report files that still carry `"arch": "avo"` stay readable as history;
// treat them as `basic` runs when comparing against a new one.
export const ARCH_VALUES = Object.freeze(['vanilla', 'basic'])

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
