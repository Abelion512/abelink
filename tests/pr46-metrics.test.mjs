// PR46 per-run metrics + aggregate report. Offline, deterministic.
import { describe, it, expect } from 'vitest'
import {
  MEASUREMENT_SCHEMA_VERSION,
  TOKEN_COST_UNAVAILABLE,
  normalizeTokenCost,
  classifyFailure,
  computeRunMetrics,
  aggregateMetrics,
  buildMeasurementReport,
} from '../evaluation/metrics.mjs'
import { evidenceFromRun, EVIDENCE_STATUS } from '../evaluation/evidence.mjs'

const evidence = (stepLog) => evidenceFromRun({ taskId: 't', stepLog })
const okEvidence = evidence([{ step: 1, type: 'tool', tool: 'write-file', result: 'ok', success: true }])

const run = (over = {}) => ({
  runId: 'r1',
  taskId: 't',
  arch: 'basic',
  effort: 'low',
  model: { provider: 'prov', modelId: 'model-x', modelVersion: '2026-09-01' },
  steps: 4,
  toolCalls: 3,
  durationMs: 1200,
  tokenUsage: { promptTokens: null, completionTokens: null, totalTokens: null, estimated: false },
  ...over,
})

describe('token + failure semantics', () => {
  it('missing token usage is explicit, never estimated', () => {
    expect(normalizeTokenCost(undefined)).toEqual(TOKEN_COST_UNAVAILABLE)
    expect(normalizeTokenCost({ totalTokens: null }).available).toBe(false)
  })

  it('reports real token usage when the provider exposes it', () => {
    const cost = normalizeTokenCost({ promptTokens: 10, completionTokens: 5, totalTokens: 15 })
    expect(cost.available).toBe(true)
    expect(cost.totalTokens).toBe(15)
  })

  it('classifies failure reasons from data, not guesses', () => {
    expect(classifyFailure({ passed: true })).toBeNull()
    expect(classifyFailure({ passed: false, steps: 10, maxTurns: 10 })).toBe('budget-exhausted')
    expect(classifyFailure({ passed: false, failures: 2, recoveryEvents: 0 })).toBe('unrecovered-tool-failure')
    expect(classifyFailure({ passed: false, failures: 0, steps: 0 })).toBe('no-progress')
    expect(classifyFailure({ passed: false, failures: 0, steps: 5 })).toBe('incorrect-artifact-or-answer')
  })
})

describe('computeRunMetrics', () => {
  it('separates task success from independently verified success', () => {
    const pass = computeRunMetrics({
      run: run(),
      task: { taskId: 't', lane: 'research', maxTurns: 10 },
      evidence: okEvidence,
      oracle: { passed: true, independent: true, kind: 'world-state' },
    })
    expect(pass.taskSuccess).toBe(true)
    expect(pass.independentlyVerifiedSuccess).toBe(true)

    const dependent = computeRunMetrics({
      run: run(),
      task: { taskId: 't', lane: 'research', maxTurns: 10 },
      evidence: okEvidence,
      oracle: { passed: true, independent: false, kind: 'answer-text' },
    })
    expect(dependent.taskSuccess).toBe(true)
    expect(dependent.independentlyVerifiedSuccess).toBe(false)
  })

  it('the model final answer is a claim and never drives success', () => {
    // Oracle failed, model output claims success: taskSuccess must stay false.
    const metrics = computeRunMetrics({
      run: run({ status: 'completed' }),
      task: { taskId: 't', lane: 'os', maxTurns: 10 },
      evidence: okEvidence,
      oracle: { passed: false, independent: true, kind: 'world-state' },
    })
    expect(metrics.taskSuccess).toBe(false)
    expect(metrics.independentlyVerifiedSuccess).toBe(false)
    expect(metrics.finalAnswerIsClaim).toBe(true)
    expect(metrics.oracle.result).toBe('fail')
    expect(metrics.failureReason).not.toBeNull()
  })

  it('uses explicit unavailable semantics where the runtime does not expose data', () => {
    const metrics = computeRunMetrics({
      run: run({ steps: null, toolCalls: null, tokenUsage: undefined }),
      task: { taskId: 't', lane: 'os', maxTurns: 10 },
      evidence: okEvidence,
      oracle: { passed: true, independent: true, kind: 'world-state' },
    })
    expect(metrics.turns).toBeNull()
    expect(metrics.tokenCost.available).toBe(false)
    expect(metrics.humanInterventions).toBeNull()
    expect(metrics.toolCalls).toBe(1) // falls back to observed evidence count
  })

  it('records recovery/stagnation/retry counters from evidence', () => {
    const ev = evidence([
      { step: 1, type: 'tool', tool: 'read-file', result: 'ERROR: nope', success: false },
      { step: 2, type: 'tool', tool: 'read-file', result: 'ERROR: nope', success: false },
      { step: 3, type: 'tool', tool: 'write-file', result: 'ok', success: true },
    ])
    const metrics = computeRunMetrics({
      run: run(),
      task: { taskId: 't', lane: 'recovery', maxTurns: 12 },
      evidence: ev,
      oracle: { passed: true, independent: true, kind: 'world-state' },
    })
    expect(metrics.evidence.failures).toBe(2)
    expect(metrics.recoveryEvents).toBe(1)
    expect(metrics.retries).toBe(1)
  })
})

describe('aggregateMetrics', () => {
  const metric = (over) =>
    computeRunMetrics({
      run: run(over.run),
      task: { taskId: over.taskId || 't', lane: over.lane || 'research', maxTurns: 12 },
      evidence: over.evidence || okEvidence,
      oracle: { passed: over.passed, independent: over.independent !== false, kind: 'world-state' },
    })

  it('reports median/mean turns and tool calls', () => {
    const runs = [
      metric({ run: { steps: 2, toolCalls: 1 }, passed: true }),
      metric({ run: { steps: 4, toolCalls: 3 }, passed: true }),
      metric({ run: { steps: 6, toolCalls: 5 }, passed: false }),
    ]
    const agg = aggregateMetrics(runs)
    expect(agg.runCount).toBe(3)
    expect(agg.medianTurns).toBe(4)
    expect(agg.meanTurns).toBe(4)
    expect(agg.medianToolCalls).toBe(3)
    expect(+agg.passRate).toBeCloseTo(0.667, 3)
  })

  it('recovery/unnecessary rates are null when nothing was observed', () => {
    const agg = aggregateMetrics([metric({ run: { steps: 1, toolCalls: 0 }, passed: true })])
    expect(agg.recoverySuccessRate).toBeNull()
    expect(agg.unnecessaryActionRate).toBeNull()
    expect(agg.humanInterventionRate).toBeNull()
  })

  it('verification discipline counts verified passes', () => {
    const agg = aggregateMetrics([
      metric({ passed: true, independent: true }),
      metric({ passed: true, independent: false, taskId: 't2' }),
    ])
    expect(agg.verificationDiscipline).toBe(0.5)
  })

  it('breaks results down by lane', () => {
    const agg = aggregateMetrics([
      metric({ passed: true, lane: 'research' }),
      metric({ passed: false, lane: 'browser', taskId: 'b' }),
    ])
    expect(agg.byLane.research.passRate).toBe(1)
    expect(agg.byLane.browser.passRate).toBe(0)
  })
})

describe('buildMeasurementReport', () => {
  it('is machine-readable and keeps the repeated-run count explicit', () => {
    const runs = [
      computeRunMetrics({
        run: run(),
        task: { taskId: 't', lane: 'research', maxTurns: 12 },
        evidence: okEvidence,
        oracle: { passed: true, independent: true, kind: 'world-state' },
      }),
    ]
    const report = buildMeasurementReport({
      runs,
      config: {
        suite: 'pr46',
        arch: 'basic',
        runs: 3,
        provider: 'prov',
        modelId: 'model-x',
        modelVersion: '2026-09-01',
        comparison: { valid: true, baseline: 'main', candidate: 'pr45' },
      },
    })
    expect(report.kind).toBe('abelinkbench-measurement-report')
    expect(report.schemaVersion).toBe(MEASUREMENT_SCHEMA_VERSION)
    expect(report.repeatedRunsPerTask).toBe(3)
    expect(report.identity.modelVersion).toBe('2026-09-01')
    expect(report.comparison.valid).toBe(true)
    expect(report.aggregate.runCount).toBe(1)
    // Must survive JSON round-trip: reports are consumed by tooling.
    expect(JSON.parse(JSON.stringify(report)).aggregate.passRate).toBe(1)
  })

  it('records comparison invalidity instead of hiding it', () => {
    const report = buildMeasurementReport({
      runs: [],
      config: { suite: 'pr46', runs: 1, comparison: { valid: false } },
    })
    expect(report.comparison.valid).toBe(false)
  })
})

describe('evidence status vocabulary stays generic', () => {
  it('covers success/failure/negative without browser-specific fields', () => {
    expect(EVIDENCE_STATUS.SUCCESS).toBe('success')
    expect(Object.values(EVIDENCE_STATUS)).toContain(EVIDENCE_STATUS.NEGATIVE)
  })
})
