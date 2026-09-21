// PR46 experiment support: identity, comparability, ablation integrity.
import { describe, it, expect } from 'vitest'
import {
  EXPERIMENT_KINDS,
  MODEL_IDENTITY_FORBIDDEN,
  FIXED_COMPARISON_FIELDS,
  ARM_COMPARISON_DIMENSIONS,
  MEASUREMENT_REPORT_KIND,
  ARCHITECTURE_ARMS,
  makeModelIdentity,
  isNeverLatest,
  makeExperimentSpec,
  validateComparability,
  compareArmReports,
  baselineVsCandidateSpec,
  representationAblationSpec,
  validateAblationPair,
  modelCompatibilitySpec,
} from '../evaluation/pr46-experiments.mjs'
import { ARCH_VALUES } from '../src/api/ai/benchArch.js'

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
    const spec = baselineVsCandidateSpec({ fixed, runs: 3 })
    expect(spec.kind).toBe(EXPERIMENT_KINDS.BASELINE_VS_CANDIDATE)
    expect(spec.comparability.valid).toBe(true)
    expect(spec.comparability.mismatches).toEqual([])
    expect(spec.comparability.variable).toBe('architecture')
  })

  it('defaults to runnable arms: vanilla baseline vs basic candidate', () => {
    const spec = baselineVsCandidateSpec({ fixed, runs: 3 })
    expect(spec.arms.baseline.architecture).toBe('vanilla')
    expect(spec.arms.candidate.architecture).toBe('basic')
    expect(spec.runnable).toBe(true)
    // Both arms must be values the executor actually accepts.
    for (const arm of [spec.arms.baseline, spec.arms.candidate]) {
      expect(ARCH_VALUES).toContain(arm.architecture)
      expect(typeof arm.behavior).toBe('string')
    }
  })

  it('invalid when any fixed variable drifts', () => {
    const candidate = { ...fixed, architecture: 'basic', modelVersion: '2026-09-02' }
    const result = validateComparability(
      { baseline: { ...fixed, architecture: 'basic' }, candidate },
      { variable: 'architecture', fixedFields: FIXED_COMPARISON_FIELDS }
    )
    expect(result.valid).toBe(false)
    expect(result.mismatches[0].field).toBe('modelVersion')
  })

  it('invalid when the model provider changes between arms', () => {
    const result = validateComparability(
      { baseline: { ...fixed, provider: 'openai', architecture: 'vanilla' }, candidate: { ...fixed, architecture: 'basic' } },
      { variable: 'architecture' }
    )
    expect(result.valid).toBe(false)
    expect(result.mismatches.some((m) => m.field === 'provider')).toBe(true)
  })
})

describe('compareArmReports (measured arms only)', () => {
  const arm = (over = {}) => {
    const { identity: identityOver = {}, ...rest } = over
    return {
      kind: MEASUREMENT_REPORT_KIND,
      repeatedRunsPerTask: 3,
      aggregate: { runCount: 3 },
      ...rest,
      identity: {
        provider: 'openai',
        modelId: 'gpt-6-astra',
        modelVersion: '2026-09-01',
        promptTemplate: 'bench-tool-preamble-v1',
        protocol: 'linux-1.0',
        toolConfig: 'core+groups',
        permissions: 'bench-default',
        fixtureSet: 'pr46-matrix',
        effort: 'high',
        budget: { source: 'fixture-maxTurns', effort: 'high', efforts: null, runsPerTask: 3 },
        verifier: 'deterministic-world-state-predicate',
        environment: 'local',
        architecture: 'vanilla',
        ...identityOver,
      },
    }
  }

  it('invalid when only one arm was measured', () => {
    const result = compareArmReports({ baseline: null, candidate: arm() })
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('arms-incomplete')
    expect(result.missing).toEqual(['baseline'])
    expect(compareArmReports({}).valid).toBe(false)
  })

  it('valid only when both arms share every identity field and differ in architecture', () => {
    const result = compareArmReports({
      baseline: arm(),
      candidate: arm({ identity: { architecture: 'basic' } }),
    })
    expect(result.valid).toBe(true)
    expect(result.reason).toBe('both-arms-present')
    expect(result.variableDiffers).toBe(true)
  })

  it('invalid when a fixed identity field drifts between arms', () => {
    const result = compareArmReports({
      baseline: arm(),
      candidate: arm({ identity: { architecture: 'basic', modelVersion: '2026-09-02' } }),
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('identity-mismatch')
    expect(result.mismatches.some((m) => m.field === 'modelVersion')).toBe(true)
  })

  it('invalid when repeated-run counts differ, and when both arms are the same arch', () => {
    expect(
      compareArmReports({
        baseline: arm(),
        candidate: arm({ identity: { architecture: 'basic' }, repeatedRunsPerTask: 1 }),
      }).valid
    ).toBe(false)
    const same = compareArmReports({ baseline: arm(), candidate: arm() })
    expect(same.valid).toBe(false)
    expect(same.reason).toBe('same-architecture')
  })

  it('every contract dimension is actually compared, not just the model identity', () => {
    expect(ARM_COMPARISON_DIMENSIONS.map((d) => d.contract)).toEqual([
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
    const result = compareArmReports({ baseline: arm(), candidate: arm({ identity: { architecture: 'basic' } }) })
    for (const dimension of ARM_COMPARISON_DIMENSIONS) expect(result.checked).toContain(dimension.contract)
    expect(result.executions).toEqual({ baseline: 3, candidate: 3 })
  })

  it('invalid when a non-model dimension drifts (prompt, protocol, permissions, budget)', () => {
    const drifts = [
      ['promptTemplate', 'bench-tool-preamble-v2'],
      ['protocol', 'linux-2.0'],
      ['permissions', 'bench-write-all'],
      ['budget', { source: 'fixture-maxTurns', effort: 'high', efforts: null, runsPerTask: 9 }],
    ]
    for (const [field, value] of drifts) {
      const result = compareArmReports({
        baseline: arm(),
        candidate: arm({ identity: { architecture: 'basic', [field]: value } }),
      })
      expect(result.valid, `${field} drift must invalidate the comparison`).toBe(false)
      expect(result.reason).toBe('identity-mismatch')
      expect(result.mismatches.some((m) => m.field === field)).toBe(true)
    }
  })

  it('invalid when a claimed dimension was never recorded (unverifiable != matching)', () => {
    const result = compareArmReports({
      baseline: arm({ identity: { permissions: null } }),
      candidate: arm({ identity: { architecture: 'basic' } }),
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('dimension-unverifiable')
    expect(result.unverifiable).toEqual([
      { contract: 'permissions', key: 'permissions', baseline: null, candidate: 'bench-default' },
    ])
  })

  it('invalid when an arm carries an identity but no executions', () => {
    const hollow = {
      kind: MEASUREMENT_REPORT_KIND,
      repeatedRunsPerTask: 3,
      identity: arm().identity,
      aggregate: { runCount: 0 },
    }
    const result = compareArmReports({ baseline: hollow, candidate: arm({ identity: { architecture: 'basic' } }) })
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('arm-not-measured')
    expect(result.notMeasured).toEqual([{ arm: 'baseline', problem: 'no-executions' }])
  })

  it('invalid when an arm is not a measurement report at all', () => {
    const result = compareArmReports({
      baseline: { identity: arm().identity },
      candidate: arm({ identity: { architecture: 'basic' } }),
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('arm-not-measured')
    expect(result.notMeasured[0]).toEqual({ arm: 'baseline', problem: 'not-measurement-report' })
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
    expect(spec.runtimeSupported).toBe(true)
    expect(spec.deferred).toBe(false)
  })

  it('rejects a representation the execution path cannot render (label-only difference)', () => {
    const result = validateAblationPair(
      fixture({ representation: 'rawish' }),
      fixture({ representation: 'semantic-first' })
    )
    expect(result.runtimeSupported).toBe(false)
    expect(result.valid).toBe(false)
    expect(result.mismatches.some((m) => m.field === 'representationUnsupported')).toBe(true)
    const spec = representationAblationSpec({
      pairs: [
        {
          id: 'p',
          raw: fixture({ representation: 'rawish' }),
          semanticFirst: fixture({ representation: 'semantic-first' }),
        },
      ],
    })
    expect(spec.valid).toBe(false)
    expect(spec.runtimeSupported).toBe(false)
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
