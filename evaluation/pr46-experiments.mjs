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

export const EXPERIMENT_KINDS = Object.freeze({
  BASELINE_VS_CANDIDATE: 'baseline-vs-candidate',
  REPRESENTATION_ABLATION: 'representation-ablation',
  MODEL_COMPATIBILITY: 'model-compatibility',
})

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

/** Experiment A: baseline main vs the PR45 (candidate) runtime architecture. */
export function baselineVsCandidateSpec({ baselineArch = 'basic', candidateArch = 'pr45', fixed = {}, fixtures = [], runs = 3 } = {}) {
  const baseline = { ...fixed, architecture: baselineArch }
  const candidate = { ...fixed, architecture: candidateArch }
  const comparability = validateComparability({ baseline, candidate }, { variable: 'architecture' })
  return {
    id: 'main-vs-pr45-runtime',
    kind: EXPERIMENT_KINDS.BASELINE_VS_CANDIDATE,
    variable: 'architecture',
    fixtures: [...fixtures],
    runs,
    arms: { baseline, candidate },
    comparability,
    note: 'Only the runtime architecture may differ; model/provider/version/prompt/tools/fixtures/budget/verifier stay fixed.',
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
    valid: results.every((r) => r.integrity.valid),
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
  return {
    valid: mismatches.length === 0,
    variable: 'representation',
    representationDiffers,
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
  makeModelIdentity,
  isNeverLatest,
  makeExperimentSpec,
  validateComparability,
  baselineVsCandidateSpec,
  representationAblationSpec,
  validateAblationPair,
  modelCompatibilitySpec,
}
