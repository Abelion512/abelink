// Abelink Architecture Benchmark — before/after comparator.
//
// Compares two architecture benchmark reports and returns structured diffs,
// regressions, improvements, and behavior-flag changes.

import { compareReports, makeDiffEntry } from './contract.ts'

export { compareReports, makeDiffEntry } from './contract.ts'

/** Convenience summary of a comparison. */
export function summarizeComparison(cmp: any, opts: any = {}) {
  const { minPassDelta = -5, maxPassDelta = 5 } = opts

  const regressions: any[] = cmp.regressions
  const improvements: any[] = cmp.improvements
  const changed: any[] = cmp.changed
  const neutral = cmp.diffs.filter((d: any) => !regressions.includes(d) && !improvements.includes(d))

  const summary: any = {
    totalCompared: cmp.diffs.length,
    regressions: regressions.length,
    improvements: improvements.length,
    behaviorChanged: changed.length,
    neutral: neutral.length,
  }
  // NB: JS aslinya menimpa properti counts dengan array detail (same-name keys).
  summary.regressions = regressions.map((r: any) => ({
    taskId: r.taskId,
    category: r.category,
    before: r.beforePassRate,
    after: r.afterPassRate,
    deltaPct: r.deltaPct,
    flagsChanged: r.flagsChanged,
    rubricChanged: r.rubricChanged,
  }))
  summary.improvements = improvements.map((r: any) => ({
    taskId: r.taskId,
    category: r.category,
    before: r.beforePassRate,
    after: r.afterPassRate,
    deltaPct: r.deltaPct,
    flagsChanged: r.flagsChanged,
    rubricChanged: r.rubricChanged,
  }))
  summary.behaviorChanged = changed.map((r: any) => ({
    taskId: r.taskId,
    category: r.category,
    flagsChanged: r.flagsChanged,
    rubricChanged: r.rubricChanged,
    deltaPct: r.deltaPct,
  }))
  return summary
}
