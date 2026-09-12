import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  runTask,
  withFixtureDir,
  readAttemptCount,
  BudgetExhausted,
  Workflow,
  WorkflowNode,
} from '../evaluation/effort-fixtures.mjs'
import {
  EffortLevel,
  EffortPolicy,
  BudgetState,
  BudgetSnapshot,
  resolve_effort,
  applyLimits,
  consumeModelCall,
  consumeToolCall,
  consumeRetry,
  consumeReflection,
  consumeVerification,
  consumeCritic,
  consumeWorkflowNode,
  consumeSubtask,
  ModelProviderAdapter,
  TokenBudgetProviderAdapter,
  SYSTEM_HARD_LIMITS,
} from '../src/api/ai/effortSystem.js'

describe('fixture 01 trivial', () => {
  it('low success, no workflow/critic/reflection/retry', async () => {
    const r = await runTask('trivial', 'low')
    expect(r.status).toBe('success')
    expect(r.effective_effort).toBe('low')
    expect(r.workflow_node_count).toBe(0)
    expect(r.subtask_count).toBe(0)
    expect(r.critic_count).toBe(0)
    expect(r.reflection_count).toBe(0)
    expect(r.retry_count).toBe(0)
    expect(r.final_answer).toContain('4')
  })
})

describe('fixture 02 rename', () => {
  it('renames file, cleans up', async () => {
    let seenRoot = ''
    await withFixtureDir('fixture-02-rename', async (root) => {
      seenRoot = root
      fs.writeFileSync(path.join(root, 'hello.txt'), 'hello')
      const r = await runTask('rename', 'medium', { root })
      expect(r.status).toBe('success')
      expect(fs.existsSync(path.join(root, 'hello.txt'))).toBe(false)
      expect(fs.existsSync(path.join(root, 'renamed.txt'))).toBe(true)
      expect(fs.readFileSync(path.join(root, 'renamed.txt'), 'utf8')).toBe('hello')
      expect(r.workflow_node_count).toBe(0)
    })
    expect(fs.existsSync(seenRoot)).toBe(false)
  })
})

describe('fixture 03 repair', () => {
  it('fixes app.py, verifies; xhigh reflects, no workflow', async () => {
    await withFixtureDir('fixture-03-repair', async (root) => {
      fs.writeFileSync(path.join(root, 'app.py'), 'def add(a, b):\n    return a - b\n')
      fs.writeFileSync(path.join(root, 'test_app.py'), 'from app import add\ndef test_add():\n    assert add(2, 3) == 5\n')
      const r = await runTask('repair', 'xhigh', { root })
      expect(r.status).toBe('success')
      expect(fs.readFileSync(path.join(root, 'app.py'), 'utf8')).toContain('a + b')
      expect(r.verification_count).toBeGreaterThanOrEqual(1)
      expect(r.reflection_count).toBeGreaterThanOrEqual(1)
      expect(r.workflow_node_count).toBe(0)
    })
  })
})

describe('fixture 04 flaky retry', () => {
  it('retries once then succeeds', async () => {
    await withFixtureDir('fixture-04-flaky', async (root) => {
      fs.writeFileSync(path.join(root, 'attempts.json'), JSON.stringify({ attempts: 0 }))
      const r = await runTask('flaky', 'medium', { root })
      expect(r.status).toBe('success')
      expect(r.retry_count).toBe(1)
      expect(readAttemptCount(root)).toBe(2)
      expect(r.retry_count).toBeLessThanOrEqual(r.policy.retry_budget)
    })
  })
})

describe('fixture 05 permanent failure', () => {
  it('terminates within budget', async () => {
    const r = await runTask('always-fail', 'medium')
    expect(['failed', 'aborted', 'budget_exhausted']).toContain(r.status)
    expect(r.retry_count).toBeLessThanOrEqual(r.policy.retry_budget)
    expect(r.execution_steps).toBeLessThanOrEqual(r.policy.execution_step_budget)
    expect(r.terminated).toBe(true)
    expect(r.execution_steps).toBeLessThan(512)
  })
})

describe('fixture 06 independent (MAX vs ULTRA)', () => {
  const setup = (root) => {
    fs.writeFileSync(path.join(root, 'module_a.py'), 'def value():\n    return 10\n')
    fs.writeFileSync(path.join(root, 'module_b.py'), 'def value():\n    return 20\n')
    fs.writeFileSync(path.join(root, 'module_c.py'), 'def value():\n    return 30\n')
  }
  it('MAX: success 60, no workflow', async () => {
    await withFixtureDir('fixture-06-independent', async (root) => {
      setup(root)
      const r = await runTask('independent', 'max', { root })
      expect(r.status).toBe('success')
      expect(r.final_answer_contains('60')).toBe(true)
      expect(r.workflow_node_count).toBe(0)
      expect(r.subtask_count).toBe(0)
    })
  })
  it('ULTRA: success 60, workflow>=4 subtask>=3', async () => {
    await withFixtureDir('fixture-06-independent', async (root) => {
      setup(root)
      const r = await runTask('independent', 'ultra', { root })
      expect(r.status).toBe('success')
      expect(r.final_answer_contains('60')).toBe(true)
      expect(r.workflow_node_count).toBeGreaterThanOrEqual(4)
      expect(r.subtask_count).toBeGreaterThanOrEqual(3)
      expect(r.decomposition_count).toBeGreaterThanOrEqual(1)
    })
  })
})

describe('fixture 07 dependency chain', () => {
  it('A->B->C gating', async () => {
    await withFixtureDir('fixture-07-dependency', async (root) => {
      fs.writeFileSync(path.join(root, 'input.txt'), 'ABELINK_TEST')
      const ctx = await runTask('dependency', 'ultra', { root })
      const { wf } = ctx
      wf.refresh()
      expect(wf.node('B').status).toBe('blocked')
      expect(wf.node('C').status).toBe('blocked')
      // run A
      wf.node('A').status = 'ready'
      const a = wf.node('A')
      a.status = 'running'; a.result = 'ABELINK_TEST'; a.status = 'completed'
      wf.refresh()
      expect(wf.node('A').status).toBe('completed')
      expect(['ready', 'running']).toContain(wf.node('B').status)
      expect(wf.node('C').status).toBe('blocked')
      // run B
      const b = wf.node('B')
      b.status = 'running'; b.result = 'abelink_test'; b.status = 'completed'
      wf.refresh()
      expect(wf.node('B').status).toBe('completed')
      expect(['ready', 'running']).toContain(wf.node('C').status)
      // run C
      const c = wf.node('C')
      c.status = 'running'; c.result = 'abelink_test'; c.status = 'completed'
      expect(wf.node('C').status).toBe('completed')
    })
  })
})

describe('fixture 08 critic', () => {
  it('REVISE 41 then PASS 42', async () => {
    const r = await runTask('critic', 'ultra')
    expect(r.status).toBe('success')
    expect(r.final_answer_contains('42')).toBe(true)
    expect(r.critic_count).toBeGreaterThanOrEqual(2)
    expect(r.revision_count).toBeGreaterThanOrEqual(1)
    expect(r.final_answer_contains('41')).toBe(false)
  })
})

describe('fixture 09 auto escalation', () => {
  it('medium->high on verification failure', async () => {
    const r = await runTask('auto-escalation', 'auto')
    expect(r.requested_effort).toBe('auto')
    expect(r.initial_effort).toBe('medium')
    expect(r.effective_effort).toBe('high')
  })
  it('forced LOW path low->medium->high with reasons', async () => {
    const r = await runTask('auto-escalation', 'auto', { classifierInitial: EffortLevel.LOW })
    expect(r.escalation_path).toEqual(['low', 'medium', 'high'])
    for (const e of r.escalations) expect(e.reason).toBeTruthy()
  })
})

describe('fixture 10 max->ultra', () => {
  it('escalates on workflow_complexity', async () => {
    const r = await runTask('max-ultra', 'max')
    expect(r.initial_effort).toBe('max')
    expect(r.effective_effort).toBe('ultra')
    expect(r.escalations.length).toBeGreaterThanOrEqual(1)
    expect(r.escalations[r.escalations.length - 1].reason).toBe('workflow_complexity')
    expect(r.workflow_node_count).toBeGreaterThanOrEqual(5)
    expect(r.subtask_count).toBeGreaterThanOrEqual(3)
    expect(r.critic_count).toBeGreaterThanOrEqual(1)
    expect(r.status).toBe('success')
  })
})

describe('policy invariants + ultra inheritance + monotonicity', () => {
  it('workflow flags/budgets', () => {
    for (const lv of ['low', 'medium', 'high', 'xhigh', 'max']) {
      const p = EffortPolicy.forLevel(EffortLevel[lv.toUpperCase()])
      expect(p.workflow_enabled).toBe(false)
      expect(p.workflow_node_budget).toBe(0)
    }
    const u = EffortPolicy.forLevel(EffortLevel.ULTRA)
    expect(u.workflow_enabled).toBe(true)
    expect(u.workflow_node_budget).toBe(32)
  })
  it('ultra inherits max cognition', () => {
    const m = EffortPolicy.forLevel(EffortLevel.MAX)
    const u = EffortPolicy.forLevel(EffortLevel.ULTRA)
    expect(u.reasoning_score).toBe(m.reasoning_score)
    expect(u.planning_score).toBe(m.planning_score)
    expect(u.verification_score).toBe(m.verification_score)
    expect(u.reflection_score).toBe(m.reflection_score)
    expect(u.workflow_score).toBeGreaterThan(m.workflow_score)
    expect(u.subtask_budget).toBeGreaterThan(0)
  })
  it('monotonic budgets', () => {
    const order = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'].map((v) => EffortPolicy.forLevel(EffortLevel[v.toUpperCase()]))
    for (let i = 1; i < order.length; i++) {
      expect(order[i].tool_call_budget).toBeGreaterThan(order[i - 1].tool_call_budget)
      expect(order[i].retry_budget).toBeGreaterThanOrEqual(order[i - 1].retry_budget)
    }
    expect(order[4].reasoning_score).toBe(order[5].reasoning_score)
  })
})

describe('budget accounting + precedence + provider', () => {
  it('consume helpers exact counts', () => {
    const s = new BudgetState()
    consumeModelCall(s)
    expect(s.execution_steps_used).toBe(1)
    expect(s.tool_calls_used).toBe(0)
    consumeToolCall(s)
    expect(s.execution_steps_used).toBe(2)
    expect(s.tool_calls_used).toBe(1)
    consumeRetry(s)
    expect(s.retries_used).toBe(1)
    expect(s.execution_steps_used).toBe(3)
    const snap = new BudgetSnapshot(s, EffortPolicy.forLevel(EffortLevel.MEDIUM))
    for (const k of ['execution_steps_remaining','tool_calls_remaining','retries_remaining','reflections_remaining','verifications_remaining','critics_remaining','workflow_nodes_remaining','subtasks_remaining','workflow_depth_remaining','parallel_workers_remaining']) {
      expect(snap[k]).toBeGreaterThanOrEqual(0)
    }
  })
  it('applyLimits min + canonical untouched', () => {
    const ultra = EffortPolicy.forLevel(EffortLevel.ULTRA)
    const eff = applyLimits(ultra, { tool_call_budget: 10 }, { tool_call_budget: 6 }, {})
    expect(eff.tool_call_budget).toBe(6)
    expect(ultra.tool_call_budget).toBe(128)
    const eff2 = applyLimits(ultra, { tool_call_budget: 100 }, {}, { tool_call_budget: 4 })
    expect(eff2.tool_call_budget).toBe(4)
  })
  it('provider adapter does not mutate policy', () => {
    const policy = EffortPolicy.forLevel(EffortLevel.MAX)
    const snap = JSON.stringify(policy)
    const a = new ModelProviderAdapter()
    a.applyEffort({ model: 'x' }, policy)
    expect(JSON.stringify(policy)).toBe(snap)
    const t = new TokenBudgetProviderAdapter({ max: 123 })
    const req = t.applyEffort({}, policy)
    expect(req.max_tokens).toBe(123)
    expect(JSON.stringify(policy)).toBe(snap)
  })
  it('AUTO never returns auto; explicit bypasses', () => {
    const r = resolve_effort(EffortLevel.AUTO)
    expect(r.initial_level.value).not.toBe('auto')
    expect(r.effective_level.value).not.toBe('auto')
    const m = resolve_effort(EffortLevel.MAX)
    expect(m.initial_level.value).toBe('max')
  })
  it('resource exhaustion terminates gracefully', async () => {
    const r = await runTask('always-fail', 'low')
    expect(['failed', 'aborted', 'budget_exhausted']).toContain(r.status)
    expect(r.terminated).toBe(true)
  })
})
