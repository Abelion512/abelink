// PR46 experiment support: identity, comparability, ablation integrity.
import { describe, it, expect } from 'vitest'
import {
  EXPERIMENT_KINDS,
  MODEL_IDENTITY_FORBIDDEN,
  FIXED_COMPARISON_FIELDS,
  makeModelIdentity,
  isNeverLatest,
  makeExperimentSpec,
  validateComparability,
  baselineVsCandidateSpec,
  representationAblationSpec,
  validateAblationPair,
  modelCompatibilitySpec,
} from '../evaluation/pr46-experiments.mjs'

const exactIdentity = { provider: 'anthropic', modelId: 'claude-fable-5.1', modelVersion: '2026-09-01' }

describe('exact model identity', () => {
  it('accepts fully resolved identities', () => {
    const id = makeModelIdentity(exactIdentity)
    expect(id.modelVersion).toBe('2026-09-01')
    expect(isNeverLatest(id)).toBe(true)
  })

  it('refuses missing components', () => {
    expect(() => makeModelIdentity({ provider: 'p', modelId: 'm' })).toThrow(/modelVersion/)
    expect(() => makeModelIdentity({})).toThrow()
  })

  it('refuses "latest"-style aliases as benchmark identity', () => {
    expect(() => makeModelIdentity({ ...exactIdentity, modelVersion: 'latest' })).toThrow(/may not be/)
    for (const bad of MODEL_IDENTITY_FORBIDDEN) {
      expect(() => makeModelIdentity({ ...exactIdentity, modelVersion: bad })).toThrow()
    }
  })
})

describe('comparison integrity (baseline vs candidate)', () => {
  const fixed = {
    provider: 'anthropic',
    modelId: 'claude-fable-5.1',
    modelVersion: '2026-09-01',
    systemPrompt: 'PROTOCOL v1',
    protocol: '1.0',
    tools: ['read-file', 'write-file'],
    permissions: 'core',
    fixture: 'pr46-matrix',
    effort: 'high',
    budget: 48,
    environment: 'local',
    verifier: 'world-state',
  }

  it('valid when only the runtime architecture differs', () => {
    const spec = baselineVsCandidateSpec({ baselineArch: 'basic', candidateArch: 'pr45', fixed, runs: 3 })
    expect(spec.kind).toBe(EXPERIMENT_KINDS.BASELINE_VS_CANDIDATE)
    expect(spec.comparability.valid).toBe(true)
    expect(spec.comparability.mismatches).toEqual([])
    expect(spec.comparability.variable).toBe('architecture')
  })

  it('invalid when any fixed variable drifts', () => {
    const candidate = { ...fixed, architecture: 'pr45', modelVersion: '2026-09-02' }
    const result = validateComparability(
      { baseline: { ...fixed, architecture: 'basic' }, candidate },
      { variable: 'architecture', fixedFields: FIXED_COMPARISON_FIELDS }
    )
    expect(result.valid).toBe(false)
    expect(result.mismatches[0].field).toBe('modelVersion')
  })

  it('invalid when the model provider changes between arms', () => {
    const result = validateComparability(
      { baseline: { ...fixed, provider: 'openai', architecture: 'basic' }, candidate: { ...fixed, architecture: 'pr45' } },
      { variable: 'architecture' }
    )
    expect(result.valid).toBe(false)
    expect(result.mismatches.some((m) => m.field === 'provider')).toBe(true)
  })
})

describe('browser representation ablation', () => {
  const fixture = (over = {}) => ({
    taskId: 'x',
    lane: 'browser',
    long: true,
    variant: 'representation-ablation',
    prompt: 'same prompt',
    requiredTools: ['browser-read'],
    maxTurns: 12,
    effort: 'high',
    oracleKind: 'world-state',
    oracleIndependent: true,
    sentinel: true,
    representation: 'raw',
    seed: () => {},
    verify: () => true,
    ...over,
  })

  it('accepts a pair that differs only by representation', () => {
    const raw = fixture({ representation: 'raw' })
    const semantic = fixture({ representation: 'semantic-first' })
    const result = validateAblationPair(raw, semantic)
    expect(result.valid).toBe(true)
    expect(result.representationDiffers).toBe(true)
  })

  it('rejects a pair that also changes an unrelated variable', () => {
    const raw = fixture({ representation: 'raw' })
    const semantic = fixture({ representation: 'semantic-first', maxTurns: 40 })
    const result = validateAblationPair(raw, semantic)
    expect(result.valid).toBe(false)
    expect(result.mismatches.some((m) => m.field === 'maxTurns')).toBe(true)
  })

  it('rejects a pair with an identical representation (not an ablation)', () => {
    const raw = fixture({ representation: 'semantic-first' })
    const semantic = fixture({ representation: 'semantic-first' })
    expect(validateAblationPair(raw, semantic).valid).toBe(false)
  })

  it('spec is valid only when every pair is intact', () => {
    const spec = representationAblationSpec({
      pairs: [{ id: 'p', raw: fixture({ representation: 'raw' }), semanticFirst: fixture({ representation: 'semantic-first' }) }],
    })
    expect(spec.kind).toBe(EXPERIMENT_KINDS.REPRESENTATION_ABLATION)
    expect(spec.valid).toBe(true)
  })
})

describe('model compatibility experiment', () => {
  it('records exact identities and never uses "latest"', () => {
    const spec = modelCompatibilitySpec({
      models: [exactIdentity, { provider: 'openai', modelId: 'gpt-6-astra', modelVersion: '2026-09-01' }],
    })
    expect(spec.kind).toBe(EXPERIMENT_KINDS.MODEL_COMPATIBILITY)
    expect(spec.models.length).toBe(2)
    expect(spec.valid).toBe(true)
    expect(spec.models.every(isNeverLatest)).toBe(true)
  })

  it('refuses to build a leaderboard-style spec with an unresolved identity', () => {
    expect(() => modelCompatibilitySpec({ models: [{ provider: 'openai', modelId: 'latest', modelVersion: 'latest' }] })).toThrow()
  })
})

describe('makeExperimentSpec', () => {
  it('rejects unknown kinds and unresolved model identity', () => {
    expect(() => makeExperimentSpec({ id: 'a', kind: 'nope' })).toThrow(/unknown experiment kind/)
    expect(() => makeExperimentSpec({ id: 'a', kind: EXPERIMENT_KINDS.MODEL_COMPATIBILITY, model: { modelId: 'latest' } })).toThrow(/never be "latest"/)
  })
})
