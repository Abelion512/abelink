#!/usr/bin/env node
// Deterministic effort-system fixtures (§47-§58).
// Fake backend, isolated tmp dirs, bounded budgets, no infinite loops.
// Spec: docs/effort-system-spec.md
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  EffortLevel,
  EffortPolicy,
  BudgetState,
  BudgetSnapshot,
  EscalationEvent,
  ResolvedEffort,
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
  SYSTEM_HARD_LIMITS,
} from '../src/api/ai/effortSystem.js'

export class BudgetExhausted extends Error {
  constructor(resource) {
    super(`BudgetExhausted: ${resource}`)
    this.resource = resource
  }
}

const LEVEL_BY_VALUE = {
  low: EffortLevel.LOW,
  medium: EffortLevel.MEDIUM,
  high: EffortLevel.HIGH,
  xhigh: EffortLevel.XHIGH,
  max: EffortLevel.MAX,
  ultra: EffortLevel.ULTRA,
  auto: EffortLevel.AUTO,
}

export function parseLevel(v) {
  const l = LEVEL_BY_VALUE[String(v || '').toLowerCase()]
  if (!l) throw new Error(`Invalid effort level: ${v}`)
  return l
}

// ---- fixture dirs (§47-§48) ----
export async function withFixtureDir(name, fn) {
  const base = path.join(os.tmpdir(), 'abelink-effort-fixtures')
  fs.mkdirSync(base, { recursive: true })
  const root = fs.mkdtempSync(path.join(base, `${name}-`))
  try {
    return await fn(root)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
    if (fs.existsSync(root)) throw new Error(`cleanup failed: ${root} still exists`)
  }
}

function check(state, policy, kind) {
  const snap = new BudgetSnapshot(state, policy)
  const map = {
    step: snap.execution_steps_remaining,
    tool: snap.tool_calls_remaining,
    retry: snap.retries_remaining,
    reflection: snap.reflections_remaining,
    verification: snap.verifications_remaining,
    critic: snap.critics_remaining,
   wnode: snap.workflow_nodes_remaining,
    subtask: snap.subtasks_remaining,
  }
  if ((map[kind] ?? 1) <= 0) throw new BudgetExhausted(kind)
}

function baseResult(resolved, state, policy, effective) {
  return {
    status: 'success',
    requested_effort: resolved.requested_level.value,
    initial_effort: resolved.initial_level.value,
    effective_effort: resolved.effective_level.value,
    policy,
    effective_policy: effective,
    resolution_reason: resolved.resolution_reason,
    escalations: [...resolved.escalations],
    escalation_path: [resolved.initial_level.value, ...resolved.escalations.map((e) => e.to_level.value)],
    workflow_node_count: state.workflow_nodes_used,
    subtask_count: state.subtasks_used,
    decomposition_count: state.subtasks_used > 0 ? 1 : 0,
    critic_count: state.critics_used,
    revision_count: 0,
    reflection_count: state.reflections_used,
    retry_count: state.retries_used,
    verification_count: state.verifications_used,
    tool_calls: state.tool_calls_used,
    execution_steps: state.execution_steps_used,
    terminated: true,
    final_answer: '',
    final_answer_contains: (s) => String(this?.final_answer ?? '').includes(s),
  }
}

function finish(resolved, state, policy, effective, extra = {}) {
  const r = baseResult(resolved, state, policy, effective)
  Object.assign(r, extra)
  r.workflow_node_count = state.workflow_nodes_used
  r.subtask_count = state.subtasks_used
  r.decomposition_count = extra.decomposition_count ?? (state.subtasks_used > 0 ? 1 : 0)
  r.critic_count = state.critics_used
  r.reflection_count = state.reflections_used
  r.retry_count = state.retries_used
  r.verification_count = state.verifications_used
  r.tool_calls = state.tool_calls_used
  r.execution_steps = state.execution_steps_used
  r.final_answer_contains = (s) => String(r.final_answer ?? '').includes(s)
  return r
}

// Minimal workflow engine (§41-§42): dependency tracking + bounded parallel + checkpoint.
export class WorkflowNode {
  constructor(id, deps = [], run = null) {
    this.id = id
    this.deps = deps
    this.run = run
    this.status = 'blocked'
    this.result = null
  }
}

export class Workflow {
  constructor(policy, state) {
    this.policy = policy
    this.state = state
    this.nodes = new Map()
    this.checkpoints = []
  }
  add(node) {
    this.nodes.set(node.id, node)
    return this
  }
  refresh() {
    for (const n of this.nodes.values()) {
      if (n.status === 'completed' || n.status === 'running') continue
      const ready = n.deps.every((d) => this.nodes.get(d)?.status === 'completed')
      n.status = ready ? 'ready' : 'blocked'
    }
  }
  async runAll({ parallel = false } = {}) {
    this.refresh()
    // ponytail: sequential topological loop, parallel honored only as bounded batch size; true Promise.all fan-out if eval nodes gain real async I/O
    const order = []
    const pending = new Set(this.nodes.keys())
    let guard = 0
    while (pending.size > 0) {
      if (++guard > 512) throw new Error('workflow loop guard tripped')
      this.refresh()
      const ready = [...pending].filter((id) => this.nodes.get(id).status === 'ready')
      if (ready.length === 0) throw new Error('workflow deadlock: no ready node')
      const batch = parallel ? ready.slice(0, Math.max(1, this.policy.parallel_worker_budget)) : ready.slice(0, 1)
      this.state.trackParallelWorkers(batch.length)
      for (const id of batch) {
        const n = this.nodes.get(id)
        check(this.state, this.policy, 'wnode')
        n.status = 'running'
        this.state.incrementWorkflowDepth(n.deps.length + 1)
        const out = await n.run?.(n)
        n.result = out ?? null
        n.status = 'completed'
        consumeWorkflowNode(this.state)
        this.checkpoints.push({ node: id, at: Date.now() })
        pending.delete(id)
        order.push(id)
      }
    }
    return order
  }
  node(id) {
    return this.nodes.get(id)
  }
}

// ---- deterministic run_task ----
export async function runTask(kind, effort = 'low', opts = {}) {
  const requested = parseLevel(effort)
  const resolved0 = resolve_effort(requested, {
    classifierInitial: opts.classifierInitial,
    autoEscalationTrigger: opts.autoEscalationTrigger,
    autoEscalationStep: opts.autoEscalationStep,
  })
  const canonical = EffortPolicy.forLevel(resolved0.effective_level)
  const effective = applyLimits(canonical, opts.runtimeLimits ?? {}, opts.providerLimits ?? {}, SYSTEM_HARD_LIMITS)
  // effective policy object for budget checks (keep canonical untouched)
  const policy = Object.freeze({ ...canonical, ...Object.fromEntries(
    ['execution_step_budget','tool_call_budget','retry_budget','reflection_budget','verification_budget','critic_budget','workflow_node_budget','subtask_budget','workflow_depth_budget','parallel_worker_budget']
      .filter((k) => effective[k] !== undefined).map((k) => [k, effective[k]]),
  )})
  const state = new BudgetState()
  const step = () => { check(state, policy, 'step'); consumeModelCall(state) }

  switch (kind) {
    case 'trivial': {
      step()
      return finish(resolved0, state, canonical, effective, { final_answer: '4' })
    }
    case 'rename': {
      const root = opts.root
      check(state, policy, 'tool'); consumeToolCall(state)
      fs.renameSync(path.join(root, 'hello.txt'), path.join(root, 'renamed.txt'))
      step()
      return finish(resolved0, state, canonical, effective, { final_answer: 'renamed' })
    }
    case 'repair': {
      const root = opts.root
      check(state, policy, 'tool'); consumeToolCall(state)
      const app = path.join(root, 'app.py')
      fs.writeFileSync(app, 'def add(a, b):\n    return a + b\n')
      check(state, policy, 'verification'); consumeVerification(state)
      if (resolved0.effective_level.value === 'xhigh' || policy.reflection_budget >= 2) {
        check(state, policy, 'reflection'); consumeReflection(state)
      } else if (policy.reflection_budget >= 1 && (opts.withReflection || resolved0.effective_level.value === 'high')) {
        check(state, policy, 'reflection'); consumeReflection(state)
      }
      step()
      return finish(resolved0, state, canonical, effective, { final_answer: 'fixed a + b' })
    }
    case 'flaky': {
      const root = opts.root
      const f = path.join(root, 'attempts.json')
      const maxAttempts = policy.retry_budget + 1
      let attempts = 0
      for (let i = 0; i < maxAttempts; i++) {
        attempts = JSON.parse(fs.readFileSync(f, 'utf8')).attempts + 1
        fs.writeFileSync(f, JSON.stringify({ attempts }))
        check(state, policy, 'tool'); consumeToolCall(state)
        if (attempts >= 2) {
          step()
          return finish(resolved0, state, canonical, effective, { final_answer: 'flaky ok' })
        }
        check(state, policy, 'retry'); consumeRetry(state)
      }
      return finish(resolved0, state, canonical, effective, { status: 'budget_exhausted', final_answer: 'flaky failed' })
    }
    case 'always-fail': {
      const maxAttempts = policy.retry_budget + 1
      for (let i = 0; i < maxAttempts; i++) {
        check(state, policy, 'tool'); consumeToolCall(state)
        if (i < maxAttempts - 1) { check(state, policy, 'retry'); consumeRetry(state) }
      }
      return finish(resolved0, state, canonical, effective, { status: 'budget_exhausted', final_answer: 'failed' })
    }
    case 'independent': {
      const root = opts.root
      const vals = ['module_a.py', 'module_b.py', 'module_c.py'].map((f) => {
        check(state, policy, 'tool'); consumeToolCall(state)
        const txt = fs.readFileSync(path.join(root, f), 'utf8')
        return Number(/return\s+(\d+)/.exec(txt)?.[1] ?? 0)
      })
      const total = vals.reduce((a, b) => a + b, 0)
      if (resolved0.effective_level.value === 'ultra') {
        const wf = new Workflow(policy, state)
        const mk = (id, v) => new WorkflowNode(id, [], async () => v)
        wf.add(mk('inspect-a', vals[0])); wf.add(mk('inspect-b', vals[1])); wf.add(mk('inspect-c', vals[2]))
        wf.add(new WorkflowNode('synthesis', ['inspect-a', 'inspect-b', 'inspect-c'], async () => total))
        for (const id of ['inspect-a', 'inspect-b', 'inspect-c']) { consumeSubtask(state) }
        await wf.runAll({ parallel: true })
        step()
        return finish(resolved0, state, canonical, effective, { final_answer: `total ${total}` })
      }
      step()
      return finish(resolved0, state, canonical, effective, { final_answer: `total ${total}`, decomposition_count: 0 })
    }
    case 'dependency': {
      const wf = new Workflow(policy, state)
      const events = []
      const input = fs.readFileSync(path.join(opts.root, 'input.txt'), 'utf8').trim()
      wf.add(new WorkflowNode('A', [], async () => input))
      wf.add(new WorkflowNode('B', ['A'], async () => input.toLowerCase()))
      wf.add(new WorkflowNode('C', ['B'], async () => {
        check(state, policy, 'verification'); consumeVerification(state)
        return input.toLowerCase() === 'abelink_test' ? 'abelink_test' : 'mismatch'
      }))
      return { wf, events, state, policy, canonical, effective, resolved: resolved0 }
    }
    case 'critic': {
      const proposals = ['41', '42']
      let revision = 0
      let final = ''
      for (let i = 0; i < proposals.length; i++) {
        step()
        check(state, policy, 'critic'); consumeCritic(state)
        const verdict = i === 0 ? 'REVISE' : 'PASS'
        if (verdict === 'REVISE') { revision++; continue }
        final = proposals[i]
        break
      }
      return finish(resolved0, state, canonical, effective, { final_answer: final, revision_count: revision })
    }
    case 'auto-escalation': {
      // mock: LOW fail, MEDIUM fail, HIGH succeed (§57)
      const seq = [EffortLevel.LOW, EffortLevel.MEDIUM, EffortLevel.HIGH, EffortLevel.XHIGH, EffortLevel.MAX, EffortLevel.ULTRA]
      let initial = opts.classifierInitial ?? EffortLevel.MEDIUM
      let idx = seq.findIndex((l) => l.value === initial.value)
      const escalations = []
      let cur = initial
      let s = 7
      for (;;) {
        const ok = cur.value === 'high' || cur.value === 'xhigh' || cur.value === 'max' || cur.value === 'ultra'
        if (ok) break
        const next = seq[idx + 1]
        if (!next) break
        escalations.push(new EscalationEvent(cur, next, 'verification_failure', s++))
        cur = next
        idx++
        if (escalations.length > 5) break // loop guard
      }
      const resolved = new ResolvedEffort(EffortLevel.AUTO, initial, cur, EffortPolicy.forLevel(cur), 'verification_failure', escalations)
      const st = new BudgetState()
      consumeVerification(st)
      return finish(resolved, st, EffortPolicy.forLevel(cur), applyLimits(EffortPolicy.forLevel(cur), {}, {}, SYSTEM_HARD_LIMITS), { final_answer: 'auto ok' })
    }
    case 'max-ultra': {
      // start MAX, workflow_complexity forces ULTRA (§58)
      const initial = EffortLevel.MAX
      const esc = [new EscalationEvent(initial, EffortLevel.ULTRA, 'workflow_complexity', 3)]
      const resolved = new ResolvedEffort(opts.requested ?? initial, initial, EffortLevel.ULTRA, EffortPolicy.forLevel(EffortLevel.ULTRA), 'workflow_complexity', esc)
      const upol = EffortPolicy.forLevel(EffortLevel.ULTRA)
      const ueff = applyLimits(upol, {}, {}, SYSTEM_HARD_LIMITS)
      const st = new BudgetState()
      const wf = new Workflow(upol, st)
      for (const id of ['analysis-1', 'analysis-2', 'analysis-3']) {
        wf.add(new WorkflowNode(id, [], async () => id))
        consumeSubtask(st)
      }
      wf.add(new WorkflowNode('synthesis', ['analysis-1', 'analysis-2', 'analysis-3'], async () => 'synth'))
      wf.add(new WorkflowNode('critic', ['synthesis'], async () => 'PASS'))
      await wf.runAll({ parallel: true })
      check(st, upol, 'critic'); consumeCritic(st)
      step.call(null)
      function step() { consumeModelCall(st) }
      return finish(resolved, st, upol, ueff, { final_answer: 'ultra done' })
    }
    default:
      throw new Error(`unknown fixture kind: ${kind}`)
  }
}

export function readAttemptCount(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'attempts.json'), 'utf8')).attempts
}
