import { describe, it, expect } from 'vitest'
import {
  estimateEffort,
  resolveEffortLevel,
  EFFORT_VALUES,
  SYSTEM_DEFAULT_EFFORT
} from '../src/api/ai/effortEstimator'
import {
  EffortLevel,
  EffortPolicy,
  resolve_effort,
  BudgetState,
  BudgetSnapshot,
  consumeModelCall,
  consumeToolCall,
  consumeRetry,
  applyLimits,
  AUTO_SCALE,
  AUTO_MIN,
  AUTO_MAX
} from '../src/api/ai/effortSystem'

// Estimator effort = kontrak transparansi: keputusan auto harus punya skor +
// alasan (bisa di-eval), dan pilihan eksplisit user TIDAK boleh ditimpa.

describe('estimateEffort', () => {
  it('sapaan sederhana = low tanpa sinyal', () => {
    const r = estimateEffort('halo bro apa kabar')
    expect(r.effort).toBe('low')
    expect(r.score).toBe(0)
  })

  it('spawn_subagent menaikkan skor ke high', () => {
    const r = estimateEffort(
      'spawn_subagent untuk riset kompetitor, lalu buatkan laporan analisis data'
    )
    expect(r.effort).toBe('high')
    expect(r.reasons.length).toBeGreaterThan(0)
  })

  it('tugas menengah = medium', () => {
    const r = estimateEffort('buatkan game kecil di file html')
    expect(r.effort).toBe('medium')
  })

  it('prompt panjang menambah skor (maks +2)', () => {
    const long = 'tolong analisis data penjualan ini ' + 'x'.repeat(2400)
    const r = estimateEffort(long)
    expect(r.score).toBeGreaterThanOrEqual(2)
  })

  it('transparan selalu ada', () => {
    const r = estimateEffort('cari terbaru di internet soal harga market')
    expect(r.transparent).toContain('effort=')
  })
})

describe('resolveEffortLevel', () => {
  it('pilihan eksplisit user TIDAK ditimpa', () => {
    const r = resolveEffortLevel({ effortLevel: 'high' }, 'halo saja')
    expect(r.auto).toBe(false)
    expect(r.effort).toBe('high')
  })

  it('default tanpa config = medium (auto floor)', () => {
    const r = resolveEffortLevel({}, 'halo')
    expect(r.effort).toBe('medium')
  })

  it('auto menaikkan hanya untuk tugas kompleks', () => {
    const simple = resolveEffortLevel({ effortLevel: 'auto' }, 'halo bro')
    expect(simple.effort).toBe('medium')
    expect(simple.auto).toBe(true)

    const complex = resolveEffortLevel(
      { effortLevel: 'auto' },
      'spawn_subagent untuk audit arsitektur dan migrasi kode menyeluruh'
    )
    expect(complex.effort).toBe('high')
    expect(complex.transparent).toContain('[auto]')
  })
})

describe('effortSystem — typed core from spec', () => {
  it('canonical level enum values', () => {
    expect(EffortLevel.LOW.value).toBe('low')
    expect(EffortLevel.MEDIUM.value).toBe('medium')
    expect(EffortLevel.HIGH.value).toBe('high')
    expect(EffortLevel.XHIGH.value).toBe('xhigh')
    expect(EffortLevel.MAX.value).toBe('max')
    expect(EffortLevel.ULTRA.value).toBe('ultra')
    expect(EffortLevel.AUTO.value).toBe('auto')
  })

  it('canonical policy numeric values', () => {
    expect(resolve_effort(EffortLevel.LOW).policy.execution_step_budget).toBe(8)
    expect(resolve_effort(EffortLevel.MEDIUM).policy.tool_call_budget).toBe(8)
    expect(resolve_effort(EffortLevel.HIGH).policy.verification_budget).toBe(2)
    expect(resolve_effort(EffortLevel.XHIGH).policy.reflection_budget).toBe(2)
    expect(resolve_effort(EffortLevel.MAX).policy.retry_budget).toBe(4)
    expect(resolve_effort(EffortLevel.ULTRA).policy.critic_budget).toBe(4)
    expect(resolve_effort(EffortLevel.ULTRA).policy.workflow_node_budget).toBe(32)
    expect(resolve_effort(EffortLevel.ULTRA).policy.subtask_budget).toBe(16)
    expect(resolve_effort(EffortLevel.ULTRA).policy.workflow_depth_budget).toBe(8)
    expect(resolve_effort(EffortLevel.ULTRA).policy.parallel_worker_budget).toBe(4)
  })

  it('workflow enabled only for ULTRA', () => {
    expect(resolve_effort(EffortLevel.LOW).policy.workflow_enabled).toBe(false)
    expect(resolve_effort(EffortLevel.MEDIUM).policy.workflow_enabled).toBe(false)
    expect(resolve_effort(EffortLevel.HIGH).policy.workflow_enabled).toBe(false)
    expect(resolve_effort(EffortLevel.XHIGH).policy.workflow_enabled).toBe(false)
    expect(resolve_effort(EffortLevel.MAX).policy.workflow_enabled).toBe(false)
    expect(resolve_effort(EffortLevel.ULTRA).policy.workflow_enabled).toBe(true)
  })

  it('ULURA inherits MAX cognitive scores', () => {
    const max = resolve_effort(EffortLevel.MAX).policy
    const ultra = resolve_effort(EffortLevel.ULTRA).policy
    expect(ultra.reasoning_score).toBe(max.reasoning_score)
    expect(ultra.planning_score).toBe(max.planning_score)
    expect(ultra.verification_score).toBe(max.verification_score)
    expect(ultra.reflection_score).toBe(max.reflection_score)
    expect(ultra.workflow_score).toBeGreaterThan(max.workflow_score)
  })

  it('policy monotonicity and ULTRA > MAX', () => {
    const levels = [
      EffortLevel.LOW,
      EffortLevel.MEDIUM,
      EffortLevel.HIGH,
      EffortLevel.XHIGH,
      EffortLevel.MAX,
      EffortLevel.ULTRA
    ]
    for (let i = 1; i < levels.length; i++) {
      const prev = resolve_effort(levels[i - 1]).policy
      const next = resolve_effort(levels[i]).policy
      expect(next.reasoning_score).toBeGreaterThanOrEqual(prev.reasoning_score)
      expect(next.tool_call_budget).toBeGreaterThanOrEqual(prev.tool_call_budget)
      expect(next.retry_budget).toBeGreaterThanOrEqual(prev.retry_budget)
      expect(next.execution_step_budget).toBeGreaterThanOrEqual(prev.execution_step_budget)
    }
    expect(resolve_effort(EffortLevel.ULTRA).policy.tool_call_budget).toBeGreaterThan(
      resolve_effort(EffortLevel.MAX).policy.tool_call_budget
    )
    expect(resolve_effort(EffortLevel.ULTRA).policy.retry_budget).toBeGreaterThanOrEqual(
      resolve_effort(EffortLevel.MAX).policy.retry_budget
    )
  })

  it('budget snapshot remaining never negative', () => {
    const state = new BudgetState()
    consumeToolCall(state)
    const snap = new BudgetSnapshot(state, resolve_effort(EffortLevel.LOW).policy)
    expect(snap.tool_calls_remaining).toBeGreaterThanOrEqual(0)
    expect(snap.execution_steps_remaining).toBeGreaterThanOrEqual(0)
  })

  it('budget accounting increments', () => {
    const state = new BudgetState()
    consumeModelCall(state)
    expect(state.execution_steps_used).toBe(1)
    expect(state.tool_calls_used).toBe(0)
    consumeToolCall(state)
    expect(state.execution_steps_used).toBe(2)
    expect(state.tool_calls_used).toBe(1)
    consumeRetry(state)
    expect(state.retries_used).toBe(1)
    expect(state.execution_steps_used).toBe(3)
  })

  it('effective budget clamping respects precedence', () => {
    const policy = resolve_effort(EffortLevel.ULTRA).policy
    const effective = applyLimits(policy, {
      tool_call_budget: 10
    }, {
      tool_call_budget: 6
    }, {
      tool_call_budget: 4
    })
    expect(effective.tool_call_budget).toBe(4)
  })

  it('canonical policy not mutated by applyLimits', () => {
    const policy = resolve_effort(EffortLevel.ULTRA).policy
    const originalToolCalls = policy.tool_call_budget
    applyLimits(policy, { tool_call_budget: 1 }, {}, {})
    expect(policy.tool_call_budget).toBe(originalToolCalls)
  })

  it('AUTO_SCALE bound maps auto to medium/high-like region', () => {
    expect(AUTO_MIN.effective_level.value).toBe('medium')
    expect(AUTO_MAX.effective_level.value).toBe('high')
    expect(AUTO_SCALE.min).toBe('medium')
    expect(AUTO_SCALE.max).toBe('high')
  })

  it('EffortPolicy.planning_mode and reasoning_mode literals', () => {
    const ultra = resolve_effort(EffortLevel.ULTRA).policy
    expect(['none', 'light', 'explicit', 'deep', 'full', 'adaptive']).toContain(
      ultra.planning_mode
    )
    expect(['minimal', 'moderate', 'deep', 'very_deep', 'maximum']).toContain(
      ultra.reasoning_mode
    )
  })

  it('resolved effort metadata distinguishes requested/initial/effective', () => {
    const resolved = resolve_effort(EffortLevel.AUTO, { classifierInitial: EffortLevel.HIGH })
    expect(resolved.requested_level.value).toBe('auto')
    expect(resolved.initial_level.value).toBe('high')
    expect(resolved.effective_level.value).toBe('high')
    expect(resolved.resolution_reason).toContain('auto default initial level')
  })
})
