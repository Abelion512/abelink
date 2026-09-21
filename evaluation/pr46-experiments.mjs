// evaluation/pr46-experiments.mjs - PR46 experiment support (pure, no I/O).
//
// Three paired experiments are required before PR45 runtime adaptations can be
// judged:
//   A. baseline main vs PR45 runtime  -> only the runtime architecture may differ.
//   B. browser representation ablation -> only the observation representation differs.
//   C. model compatibility             -> exact provider/model_id/model_version,
//                                          never the string "latest".
//
// This module only builds and validates experiment descriptions. It never runs
// models and never invents a comparison; a comparison is reported valid only
// when every fixed variable matches and exactly the intended variable differs.

import { OBSERVATION_REPRESENTATIONS } from '../extension/browser-observation.mjs'

export const EXPERIMENT_KINDS = Object.freeze({
  BASELINE_VS_CANDIDATE: 'baseline-vs-candidate',
  REPRESENTATION_ABLATION: 'representation-ablation',
  MODEL_COMPATIBILITY: 'model-compatibility',
})

// The architecture axis the runtime can actually execute (src/api/ai/benchArch.js
// ARCH_VALUES = vanilla|basic). `vanilla` is the model-only baseline (pre-PR45
// behavior); `basic` is the PR45 general agentic runtime. A label such as `pr45`
// is NOT a runnable arch, so using it as an arm produced a comparison that could
// never be executed.
export const ARCHITECTURE_ARMS = Object.freeze({
  BASELINE: 'vanilla',
  CANDIDATE: 'basic',
})

export const ARM_BEHAVIOR = Object.freeze({
  // Disclaimer matters: `vanilla` is the SAME runtime with the architectural
  // controls switched off, not a byte-for-byte checkout of the pre-PR45 commit.
  [ARCHITECTURE_ARMS.BASELINE]:
    'model-only baseline: architectural controls (trajectory supervisor, verification gate) disabled on the same runtime - NOT a historical pre-PR45 snapshot',
  [ARCHITECTURE_ARMS.CANDIDATE]:
    'PR45 general agentic runtime: the same runtime with those controls enabled',
})

// The report kind an arm must carry to count as measured.
export const MEASUREMENT_REPORT_KIND = 'abelinkbench-measurement-report'

// Every fixed dimension of experiment A (docs: § Required paired experiments A),
// mapped to the identity key the measurement report actually records. Only
// `architecture` may differ between arms.
//
// A dimension that is not recorded on an arm is NOT treated as "held fixed":
// compareArmReports reports it as unverifiable instead of silently ignoring it,
// because "we did not check it" is not "it matched".
export const ARM_COMPARISON_DIMENSIONS = Object.freeze([
  Object.freeze({ contract: 'provider', key: 'provider' }),
  Object.freeze({ contract: 'modelId', key: 'modelId' }),
  Object.freeze({ contract: 'modelVersion', key: 'modelVersion' }),
  Object.freeze({ contract: 'systemPrompt', key: 'promptTemplate' }),
  Object.freeze({ contract: 'protocol', key: 'protocol' }),
  Object.freeze({ contract: 'tools', key: 'toolConfig' }),
  Object.freeze({ contract: 'permissions', key: 'permissions' }),
  Object.freeze({ contract: 'fixture', key: 'fixtureSet' }),
  Object.freeze({ contract: 'effort', key: 'effort' }),
  Object.freeze({ contract: 'budget', key: 'budget' }),
  Object.freeze({ contract: 'environment', key: 'environment' }),
  Object.freeze({ contract: 'verifier', key: 'verifier' }),
])

// Derived key list, kept for callers that only need the report field names.
export const ARM_IDENTITY_FIELDS = Object.freeze(ARM_COMPARISON_DIMENSIONS.map((d) => d.key))

// Identity strings that must never appear in a benchmark identity. Model
// aliases drift, so the resolved identifier is the only acceptable value.
export const MODEL_IDENTITY_FORBIDDEN = Object.freeze(['latest', 'default', 'stable', 'current', 'newest', 'auto', ''])

// Variables that MUST be held fixed for the architecture A/B (docs § Required
// paired experiments A). Only `architecture` is allowed to differ.
export const FIXED_COMPARISON_FIELDS = Object.freeze([
  'provider',
  'modelId',
  'modelVersion',
  'systemPrompt',
  'protocol',
  'tools',
  'permissions',
  'fixture',
  'effort',
  'budget',
  'environment',
  'verifier',
])

const normalize = (v) => (typeof v === 'string' ? v.trim() : v)
const stable = (v) => JSON.stringify(v ?? null)

export function makeModelIdentity({ provider, modelId, modelVersion } = {}) {
  const identity = {
    provider: normalize(provider),
    modelId: normalize(modelId),
    modelVersion: normalize(modelVersion),
  }
  for (const [field, value] of Object.entries(identity)) {
    if (typeof value !== 'string' || !value) {
      throw new Error(`model identity requires a resolved ${field} (got ${JSON.stringify(value)})`)
    }
    if (MODEL_IDENTITY_FORBIDDEN.includes(value.toLowerCase())) {
      throw new Error(`model identity ${field} may not be "${value}"; record the resolved identifier`)
    }
  }
  return Object.freeze(identity)
}

export function isNeverLatest(identity = {}) {
  const values = [identity.provider, identity.modelId, identity.modelVersion]
  return values.every(
    (v) => typeof v === 'string' && v.trim() && !MODEL_IDENTITY_FORBIDDEN.includes(v.trim().toLowerCase())
  )
}

/** Build a generic experiment specification with an explicit fixed/variable split. */
export function makeExperimentSpec({
  id,
  kind,
  variable,
  fixed = {},
  fixtures = [],
  runs = 3,
  budget = null,
  verifier = 'deterministic-world-state-predicate',
  model = null,
  note = '',
} = {}) {
  if (!id || !kind) throw new Error('makeExperimentSpec requires id and kind')
  if (!Object.values(EXPERIMENT_KINDS).includes(kind)) throw new Error(`unknown experiment kind: ${kind}`)
  if (model && !isNeverLatest(model)) throw new Error('experiment model identity must never be "latest"')
  return {
    id,
    kind,
    variable,
    fixed,
    fixtures: [...fixtures],
    runs,
    budget,
    verifier,
    model,
    note,
    comparability: validateComparability({ baseline: fixed, candidate: fixed }, { variable }),
  }
}

/**
 * Validate that two arms differ only in the intended variable. Returns
 * mismatches for every fixed field that is not identical.
 */
export function validateComparability({ baseline = {}, candidate = {} } = {}, { variable = 'architecture', fixedFields = FIXED_COMPARISON_FIELDS } = {}) {
  const mismatches = []
  for (const field of fixedFields) {
    if (field === variable) continue
    if (stable(baseline[field]) !== stable(candidate[field])) {
      mismatches.push({ field, baseline: baseline[field] ?? null, candidate: candidate[field] ?? null })
    }
  }
  const variableDiffers = stable(baseline[variable]) !== stable(candidate[variable])
  return {
    valid: mismatches.length === 0,
    variable,
    variableDiffers,
    mismatches,
  }
}

/**
 * Experiment A: baseline (vanilla / model-only) vs candidate (basic / PR45
 * runtime). Both values are runnable by the executor; the semantic meaning of
 * each arm is recorded next to the label so a report cannot imply a comparison
 * the architecture does not support.
 */
export function baselineVsCandidateSpec({
  baselineArch = ARCHITECTURE_ARMS.BASELINE,
  candidateArch = ARCHITECTURE_ARMS.CANDIDATE,
  fixed = {},
  fixtures = [],
  runs = 3,
} = {}) {
  const baseline = { ...fixed, architecture: baselineArch, behavior: ARM_BEHAVIOR[baselineArch] || null }
  const candidate = { ...fixed, architecture: candidateArch, behavior: ARM_BEHAVIOR[candidateArch] || null }
  const comparability = validateComparability({ baseline, candidate }, { variable: 'architecture' })
  return {
    id: 'baseline-vanilla-vs-pr45-basic',
    kind: EXPERIMENT_KINDS.BASELINE_VS_CANDIDATE,
    variable: 'architecture',
    fixtures: [...fixtures],
    runs,
    arms: { baseline, candidate },
    comparability,
    // Both arms are runnable values of the architecture axis, so the spec is
    // executable; actual validity is decided by compareArmReports once both
    // arms have been measured.
    runnable: [baselineArch, candidateArch].every((a) => Object.values(ARCHITECTURE_ARMS).includes(a)),
    note: 'Only the runtime architecture may differ; model/provider/version/prompt/tools/fixtures/budget/verifier stay fixed.',
  }
}

const reportExecutionCount = (arm) => {
  const n = arm?.aggregate?.runCount
  if (Number.isFinite(n)) return n
  return Array.isArray(arm?.runs) ? arm.runs.length : null
}

/**
 * Compare two MEASURED arms (measurement reports). A comparison is valid only
 * when:
 *   1. both arms are real measurement reports WITH at least one execution
 *      (identity alone proves nothing ran), and
 *   2. every fixed dimension the contract claims is recorded on both arms and
 *      identical (a dimension nobody recorded is reported as unverifiable, not
 *      as matching), and
 *   3. the architecture actually differs.
 * A single-arm run is never comparable, no matter how complete its identity is.
 */
export function compareArmReports({ baseline = null, candidate = null, dimensions = ARM_COMPARISON_DIMENSIONS } = {}) {
  const base = {
    valid: false,
    variable: 'architecture',
    variableDiffers: false,
    missing: [],
    notMeasured: [],
    mismatches: [],
    unverifiable: [],
    checked: [],
    executions: { baseline: null, candidate: null },
  }

  const missing = []
  if (!baseline) missing.push('baseline')
  if (!candidate) missing.push('candidate')
  if (missing.length) return { ...base, reason: 'arms-incomplete', missing }

  // "Both measured arms" is checked, not assumed: a file carrying an identity
  // block but zero executions is not evidence that an arm ran.
  const notMeasured = []
  const executions = { baseline: reportExecutionCount(baseline), candidate: reportExecutionCount(candidate) }
  for (const [name, arm] of [
    ['baseline', baseline],
    ['candidate', candidate],
  ]) {
    if (arm.kind !== MEASUREMENT_REPORT_KIND) notMeasured.push({ arm: name, problem: 'not-measurement-report' })
    else if (!Number.isFinite(executions[name]) || executions[name] < 1) notMeasured.push({ arm: name, problem: 'no-executions' })
  }
  if (notMeasured.length) return { ...base, reason: 'arm-not-measured', executions, notMeasured }

  // A comparison whose only variable is not executed by the harness is not an
  // experiment: both arms would produce the same behaviour under different
  // labels. Requires an explicit `true` on both arms (never inferred). The
  // dimension audit still runs, so the report keeps showing what WAS verified.
  const axisWired =
    baseline.identity?.architectureAxisWired === true && candidate.identity?.architectureAxisWired === true

  const mismatches = []
  const unverifiable = []
  const checked = []
  for (const { contract, key } of dimensions) {
    const a = baseline.identity?.[key] ?? null
    const b = candidate.identity?.[key] ?? null
    if (a === null || b === null) {
      unverifiable.push({ contract, key, baseline: a, candidate: b })
      continue
    }
    if (stable(a) !== stable(b)) mismatches.push({ contract, field: key, baseline: a, candidate: b })
    else checked.push(contract)
  }
  if (stable(baseline.repeatedRunsPerTask) !== stable(candidate.repeatedRunsPerTask)) {
    mismatches.push({
      contract: 'repeatedRunsPerTask',
      field: 'repeatedRunsPerTask',
      baseline: baseline.repeatedRunsPerTask ?? null,
      candidate: candidate.repeatedRunsPerTask ?? null,
    })
  } else if (baseline.repeatedRunsPerTask != null) {
    checked.push('repeatedRunsPerTask')
  }

  const variableDiffers = stable(baseline.identity?.architecture) !== stable(candidate.identity?.architecture)
  const valid = mismatches.length === 0 && unverifiable.length === 0 && axisWired && variableDiffers
  return {
    valid,
    // Precedence: concrete mismatches first, then unverified dimensions, then an
    // axis the harness cannot execute, then the same-architecture case.
    reason: mismatches.length
      ? 'identity-mismatch'
      : unverifiable.length
        ? 'dimension-unverifiable'
        : !axisWired
          ? 'architecture-not-executed-by-harness'
          : variableDiffers
            ? 'both-arms-present'
            : 'same-architecture',
    missing: [],
    notMeasured: [],
    variable: 'architecture',
    variableDiffers,
    axisWired,
    mismatches,
    unverifiable,
    checked,
    executions,
  }
}

/**
 * Experiment B: browser representation ablation. The pair's fixtures must be
 * identical except for the `representation` field, otherwise the comparison is
 * invalid and the caller must not report it.
 */
export function representationAblationSpec({ pairs = [], runs = 3, fixed = {} } = {}) {
  const results = pairs.map((pair) => {
    const integrity = validateAblationPair(pair.raw, pair.semanticFirst)
    return { id: pair.id, integrity }
  })
  return {
    id: 'browser-representation-ablation',
    kind: EXPERIMENT_KINDS.REPRESENTATION_ABLATION,
    variable: 'representation',
    runs,
    fixed,
    pairs: results,
    // Valid only when every pair differs by representation AND both values are
    // real execution-path representations. A label-only difference is not an
    // ablation, so it must not read as one.
    runtimeSupported: results.every((r) => r.integrity.runtimeSupported),
    valid: results.length > 0 && results.every((r) => r.integrity.valid),
    deferred: false,
    note: 'Raw vs semantic-first observation; no other variable may change.',
  }
}

export const ABLATION_FIXED_FIELDS = Object.freeze([
  'lane',
  'long',
  'variant',
  'prompt',
  'requiredTools',
  'maxTurns',
  'effort',
  'oracleKind',
  'oracleIndependent',
  'sentinel',
])

/** Validate that two fixtures differ only by observation representation. */
export function validateAblationPair(rawFixture = {}, semanticFixture = {}) {
  const mismatches = []
  for (const field of ABLATION_FIXED_FIELDS) {
    if (stable(rawFixture[field]) !== stable(semanticFixture[field])) {
      mismatches.push({ field, raw: rawFixture[field] ?? null, semantic: semanticFixture[field] ?? null })
    }
  }
  // Seeding and oracle logic must be identical too; their source text is stable.
  for (const field of ['seed', 'verify']) {
    const a = typeof rawFixture[field] === 'function' ? rawFixture[field].toString() : stable(rawFixture[field])
    const b = typeof semanticFixture[field] === 'function' ? semanticFixture[field].toString() : stable(semanticFixture[field])
    if (a !== b) mismatches.push({ field, raw: 'differs', semantic: 'differs' })
  }
  const representations = [rawFixture.representation, semanticFixture.representation]
  const representationDiffers = representations[0] !== representations[1]
  if (!representationDiffers) mismatches.push({ field: 'representation', raw: representations[0], semantic: representations[1] })
  // The declared values must exist in the execution path (the sidecar's
  // observation renderer). Otherwise the two fixtures run identically and the
  // "ablation" measures noise.
  const unsupportedRepresentations = representations.filter(
    (r) => !OBSERVATION_REPRESENTATIONS.includes(r)
  )
  if (unsupportedRepresentations.length) {
    mismatches.push({
      field: 'representationUnsupported',
      raw: representations[0] ?? null,
      semantic: representations[1] ?? null,
    })
  }
  const runtimeSupported = unsupportedRepresentations.length === 0
  return {
    valid: mismatches.length === 0 && runtimeSupported,
    variable: 'representation',
    representationDiffers,
    runtimeSupported,
    supportedRepresentations: [...OBSERVATION_REPRESENTATIONS],
    unsupportedRepresentations,
    mismatches,
  }
}

/** Experiment C: model compatibility across exact, resolved identities. */
export function modelCompatibilitySpec({ models = [], fixtures = [], runs = 3 } = {}) {
  const identities = models.map((m) => makeModelIdentity(m))
  return {
    id: 'model-compatibility',
    kind: EXPERIMENT_KINDS.MODEL_COMPATIBILITY,
    variable: 'modelId',
    models: identities,
    fixtures: [...fixtures],
    runs,
    valid: identities.length > 0 && identities.every(isNeverLatest),
    note: 'Compatibility experiment, not a leaderboard; each result records the exact resolved identity.',
  }
}

export default {
  EXPERIMENT_KINDS,
  MODEL_IDENTITY_FORBIDDEN,
  FIXED_COMPARISON_FIELDS,
  ABLATION_FIXED_FIELDS,
  ARM_IDENTITY_FIELDS,
  ARM_COMPARISON_DIMENSIONS,
  MEASUREMENT_REPORT_KIND,
  ARCHITECTURE_ARMS,
  ARM_BEHAVIOR,
  makeModelIdentity,
  isNeverLatest,
  makeExperimentSpec,
  validateComparability,
  compareArmReports,
  baselineVsCandidateSpec,
  representationAblationSpec,
  validateAblationPair,
  modelCompatibilitySpec,
}
