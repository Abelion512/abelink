// Abelink Architecture Benchmark — before/after comparator.
//
// Compares two architecture benchmark reports and returns structured diffs,
// regressions, improvements, and behavior-flag changes.

import { compareReports, makeDiffEntry } from './contract.mjs'

export { compareReports, makeDiffEntry } from './contract.mjs'

/** Convenience summary of a comparison. */
export function summarizeComparison(cmp, opts = {}) {
  const {
    minPassDelta = -5,
    maxPassDelta = 5,
  } = opts

  const regressions = cmp.regressions
  const improvements = cmp.improvements
  const changed = cmp.changed
  const neutral = cmp.diffs.filter((d) => !regressions.includes(d) && !improvements.includes(d))

  return {
    totalCompared: cmp.diffs.length,
    regressions: regressions.length,
    improvements: improvements.length,
    behaviorChanged: changed.length,
    neutral: neutral.length,
    regressions: regressions.map((r) => ({
      taskId: r.taskId,
      category: r.category,
      before: r.beforePassRate,
      after: r.afterPassRate,
      deltaPct: r.deltaPct,
      flagsChanged: r.flagsChanged,
      rubricChanged: r.rubricChanged,
    })),
    improvements: improvements.map((r) => ({
      taskId: r.taskId,
      category: r.category,
      before: r.beforePassRate,
      after: r.afterPassRate,
      deltaPct: r.deltaPct,
      flagsChanged: r.flagsChanged,
      rubricChanged: r.rubricChanged,
    })),
    behaviorChanged: changed.map((r) => ({
      taskId: r.taskId,
      category: r.category,
      flagsChanged: r.flagsChanged,
      rubricChanged: r.rubricChanged,
      deltaPct: r.deltaPct,
    })),
  }
}
