// evaluation/metrics.mjs - PR46 per-run metrics + machine-readable report.
//
// Extends the existing benchmark measurement path additively: it consumes the
// run result + normalized evidence + the task oracle verdict and produces the
// per-run metric record and aggregate the PR46 contract requires.
//
// Honesty rules (anti-fabrication):
//   - Task success and independently verified success are separate fields.
//   - The oracle verdict is authoritative; the model final answer is only a claim.
//   - Metrics the runtime does not expose are `null` (or `available:false`),
//     never estimated with a formula.
//   - Repeated-run count is explicit; one aggregate is never a release claim.

import { isIndependentlyVerified, VERIFICATION_STATE } from '../src/api/ai/objectiveVerifier.js'
import { summarizeEvidence, EVIDENCE_STATUS } from './evidence.mjs'

export const MEASUREMENT_SCHEMA_VERSION = 1

// Why `unnecessaryActionRate` is unavailable rather than derived: the runtime
// exposes repeats, not intent. A repeated poll can be legitimate and a
// non-repeated call can be redundant, so repeats/toolCalls is reported as
// `repeatActionRate` and the unnecessary-action metric stays explicitly null.
export const UNNECESSARY_ACTION_UNAVAILABLE_REASON =
  'no instrumentation distinguishes an unnecessary action from a legitimate repeated action (see repeatActionRate)'

// Explicit "unavailable" token cost. The adapter reports null token usage; we
// never substitute a steps*N estimate.
export const TOKEN_COST_UNAVAILABLE = Object.freeze({
  available: false,
  promptTokens: null,
  completionTokens: null,
  totalTokens: null,
  estimated: false,
})

const median = (values) => {
  const list = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (!list.length) return null
  const mid = Math.floor(list.length / 2)
  return list.length % 2 ? list[mid] : +((list[mid - 1] + list[mid]) / 2).toFixed(3)
}

const mean = (values) => {
  const list = values.filter((v) => Number.isFinite(v))
  if (!list.length) return null
  return +(list.reduce((a, b) => a + b, 0) / list.length).toFixed(3)
}

const rate = (num, den) => (den > 0 ? +(num / den).toFixed(3) : null)

/** Normalize adapter token usage into an explicit available/unavailable shape. */
export function normalizeTokenCost(tokenUsage) {
  if (!tokenUsage || typeof tokenUsage !== 'object') return { ...TOKEN_COST_UNAVAILABLE }
  const total = tokenUsage.totalTokens
  const prompt = tokenUsage.promptTokens
  const completion = tokenUsage.completionTokens
  const hasAny = [total, prompt, completion].some((v) => Number.isFinite(v))
  if (!hasAny) return { ...TOKEN_COST_UNAVAILABLE }
  return {
    available: true,
    promptTokens: Number.isFinite(prompt) ? prompt : null,
    completionTokens: Number.isFinite(completion) ? completion : null,
    totalTokens: Number.isFinite(total) ? total : null,
    estimated: tokenUsage.estimated === true,
  }
}

/**
 * Classify why a run failed, from data that actually exists. Never guesses.
 * Returns null when the oracle passed.
 */
export function classifyFailure({ passed, status, failures = 0, recoveryEvents = 0, stagnationEvents = 0, steps, maxTurns }) {
  if (passed) return null
  if (status === 'aborted') return 'aborted'
  if (Number.isInteger(steps) && Number.isInteger(maxTurns) && maxTurns > 0 && steps >= maxTurns) return 'budget-exhausted'
  if (failures > 0 && recoveryEvents === 0) return 'unrecovered-tool-failure'
  if (stagnationEvents > 0) return 'stagnation'
  if (failures === 0 && (!Number.isInteger(steps) || steps === 0)) return 'no-progress'
  return 'incorrect-artifact-or-answer'
}

/**
 * Compute per-run metrics from a run result. `run` is the object produced by
 * terminal-bench.runTask (response, passed, steps, toolCalls, durationMs,
 * tokenUsage) plus the normalized evidence records.
 *
 * `oracle.independent` must be true only when the verdict came from world state
 * the harness observed directly (never from the model's final answer).
 */
export function computeRunMetrics({
  run = {},
  task = {},
  evidence = [],
  oracle = {},
  runtimeVerification = VERIFICATION_STATE.NOT_RUN,
  objectiveKind = 'general',
  humanInterventions = null,
} = {}) {
  const stats = summarizeEvidence(evidence)
  const steps = Number.isInteger(run.steps) ? run.steps : null
  const toolCalls = Number.isInteger(run.toolCalls) ? run.toolCalls : stats.toolCalls || null
  const elapsedMs = Number.isFinite(run.durationMs) ? run.durationMs : null
  const passed = oracle.passed === true
  const independent = oracle.independent === true

  return {
    // Execution identity: benchmarkRunId = session, executionId = one concrete
    // execution (session + taskId + iteration). `runId` stays as an alias.
    benchmarkRunId: run.benchmarkRunId ?? null,
    executionId: run.runId ?? null,
    runId: run.runId ?? null,
    iteration: Number.isInteger(run.iteration) ? run.iteration : null,
    taskId: run.taskId ?? task.taskId ?? null,
    lane: task.lane ?? run.lane ?? null,
    arch: run.arch ?? 'basic',
    effort: run.effort ?? null,
    // Observation representation used at the execution path (null = runtime default).
    representation: run.representation ?? null,
    model: run.model ?? null,
    // Oracle is authoritative; the final answer is a claim only.
    taskSuccess: passed,
    independentlyVerifiedSuccess: passed && independent,
    runtimeVerified: isIndependentlyVerified({ verification: runtimeVerification, kind: objectiveKind }),
    // null means "the runtime did not expose this", not zero.
    turns: steps,
    toolCalls,
    retries: stats.retries,
    repeatedActions: stats.repeatedActions,
    stagnationEvents: stats.stagnationEvents,
    recoveryEvents: stats.recoveryEvents,
    elapsedMs,
    tokenCost: normalizeTokenCost(run.tokenUsage),
    // The adapter exposes no human-intervention channel; keep it explicit.
    humanInterventions: Number.isInteger(humanInterventions) ? humanInterventions : null,
    oracle: {
      result: passed ? 'pass' : 'fail',
      kind: oracle.kind || 'world-state',
      independent,
      source: oracle.source || 'deterministic-world-state-predicate',
    },
    evidence: {
      count: stats.count,
      failures: stats.failures,
      negatives: stats.negatives,
      sources: stats.sources,
    },
    runtimeVerificationState: runtimeVerification,
    objectiveKind,
    finalAnswerIsClaim: true,
    failureReason: classifyFailure({
      passed,
      status: run.status,
      failures: stats.failures,
      recoveryEvents: stats.recoveryEvents,
      stagnationEvents: stats.stagnationEvents,
      steps,
      maxTurns: task.maxTurns,
    }),
  }
}

/** Aggregate per-run metrics into the PR46 aggregate block. */
export function aggregateMetrics(runs = []) {
  const list = Array.isArray(runs) ? runs : []
  const total = list.length
  const passed = list.filter((r) => r.taskSuccess).length
  const verified = list.filter((r) => r.independentlyVerifiedSuccess).length
  const oracleFailures = list.filter((r) => r.oracle?.result === 'fail').length
  const failures = list.reduce((a, r) => a + (r.evidence?.failures || 0), 0)
  const recoveryEvents = list.reduce((a, r) => a + (r.recoveryEvents || 0), 0)
  const repeated = list.reduce((a, r) => a + (r.repeatedActions || 0), 0)
  const toolCalls = list.reduce((a, r) => a + (r.toolCalls || 0), 0)
  const tokenRuns = list.filter((r) => r.tokenCost?.available)
  // Distinct executions actually collected (guards against a session-level id
  // being reused across tasks/iterations).
  const executions = new Set(list.map((r) => r.executionId ?? r.runId).filter(Boolean))

  const byLane = {}
  for (const run of list) {
    const lane = run.lane || 'unlabeled'
    if (!byLane[lane]) byLane[lane] = { runs: 0, passed: 0, verified: 0 }
    byLane[lane].runs += 1
    if (run.taskSuccess) byLane[lane].passed += 1
    if (run.independentlyVerifiedSuccess) byLane[lane].verified += 1
  }
  for (const lane of Object.keys(byLane)) {
    byLane[lane].passRate = rate(byLane[lane].passed, byLane[lane].runs)
    byLane[lane].verifiedSuccessRate = rate(byLane[lane].verified, byLane[lane].runs)
  }

  return {
    runCount: total,
    executionCount: executions.size,
    passRate: rate(passed, total),
    verifiedSuccessRate: rate(verified, total),
    medianTurns: median(list.map((r) => r.turns)),
    meanTurns: mean(list.map((r) => r.turns)),
    medianToolCalls: median(list.map((r) => r.toolCalls)),
    meanToolCalls: mean(list.map((r) => r.toolCalls)),
    // Recovery rate needs observed failures; null when nothing failed.
    recoverySuccessRate: failures > 0 ? rate(recoveryEvents, failures) : null,
    // Repeats over tool calls. Deliberately NOT called an unnecessary-action
    // rate: repeats are observable, unnecessary-intent is not instrumented.
    repeatActionRate: toolCalls > 0 ? rate(repeated, toolCalls) : null,
    unnecessaryActionRate: null,
    unnecessaryActionRateReason: UNNECESSARY_ACTION_UNAVAILABLE_REASON,
    // Verification discipline: how often an oracle pass was independently supported.
    verificationDiscipline: passed > 0 ? rate(verified, passed) : null,
    evidenceFailureCount: failures,
    oracleFailureCount: oracleFailures,
    latency: {
      medianMs: median(list.map((r) => r.elapsedMs)),
      meanMs: mean(list.map((r) => r.elapsedMs)),
    },
    tokenCost: tokenRuns.length
      ? {
          available: true,
          runsWithUsage: tokenRuns.length,
          totalTokens: tokenRuns.reduce((a, r) => a + (r.tokenCost.totalTokens || 0), 0),
          estimated: tokenRuns.some((r) => r.tokenCost.estimated),
        }
      : { ...TOKEN_COST_UNAVAILABLE },
    // The adapter has no human-intervention channel: report unavailable, not 0.
    humanInterventionRate: list.every((r) => r.humanInterventions === null)
      ? null
      : rate(list.reduce((a, r) => a + (r.humanInterventions || 0), 0), total),
    byLane,
  }
}

/**
 * Machine-readable PR46 measurement report. Wraps (does not replace) the
 * existing aggregateRuns report; callers keep both.
 */
export function buildMeasurementReport({ runs = [], config = {} } = {}) {
  const aggregate = aggregateMetrics(runs)
  // Only an explicit `valid: true` (set by a caller that actually has both
  // arms) counts. A missing comparison block must never read as comparable.
  const comparable = config.comparison?.valid === true
  return {
    schemaVersion: MEASUREMENT_SCHEMA_VERSION,
    kind: 'abelinkbench-measurement-report',
    generatedAt: new Date().toISOString(),
    suite: config.suite || 'abelinkbench',
    repeatedRunsPerTask: Number.isInteger(config.runs) ? config.runs : null,
    // Every report must be able to answer "which exact model/arch ran".
    identity: {
      architecture: config.arch || 'basic',
      // Which revision of the runtime was measured (reproducibility).
      architectureCommit: config.commit?.sha ?? config.commit ?? null,
      architectureCommitShort: config.commit?.short ?? null,
      architectureCommitDirty: config.commit?.dirty ?? null,
      provider: config.provider || null,
      modelId: config.modelId || null,
      modelVersion: config.modelVersion || null,
      effort: config.effort ?? null,
      // Declared fixed dimensions of the architecture A/B. Recorded at run time
      // (never inferred) so compareArmReports() can actually check the whole
      // claimed fixed set instead of only the model identity.
      promptTemplate: config.promptTemplate || null,
      protocol: config.protocol || null,
      toolConfig: config.toolConfig || 'core+groups',
      permissions: config.permissions || null,
      fixtureSet: config.fixtureSet || null,
      budget: config.budget ?? null,
      // Whether the harness actually executes the architecture axis it compares.
      // null = unknown (not claimed); compareArmReports() requires explicit true.
      architectureAxisWired: config.architectureAxisWired ?? null,
      verifier: config.verifier || 'deterministic-world-state-predicate',
      environment: config.environment || 'local',
    },
    comparison: {
      ...(config.comparison || {}),
      valid: comparable,
      // Explicit: a run is one arm. Comparability requires both arms.
      reason: comparable ? config.comparison.reason || 'both arms present' : config.comparison?.reason || 'baseline-arm-missing',
    },
    // Repeated runs are mandatory for stochastic models; count is explicit.
    note:
      'Aggregate numbers require repeated runs and a valid comparison. A single aggregate is not a release claim.',
    runs,
    aggregate,
  }
}

export default {
  MEASUREMENT_SCHEMA_VERSION,
  UNNECESSARY_ACTION_UNAVAILABLE_REASON,
  TOKEN_COST_UNAVAILABLE,
  normalizeTokenCost,
  classifyFailure,
  computeRunMetrics,
  aggregateMetrics,
  buildMeasurementReport,
}
