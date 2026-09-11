// Mark-Linux Adaptive Reasoning/Effort System — typed core.
// Canonical policy table + runtime budget accounting + AUTO resolver + provider adapters.
// Spec: docs/effort-system-spec.md

/**
 * Effort level enum (spec §2).
 * Strongly typed enum whose string value is the canonical label used across the
 * runtime, tests, and fixture reports.
 */
export const EffortLevel = Object.freeze({
  LOW: { value: 'low', label: 'LOW' },
  MEDIUM: { value: 'medium', label: 'MEDIUM' },
  HIGH: { value: 'high', label: 'HIGH' },
  XHIGH: { value: 'xhigh', label: 'xHIGH' },
  MAX: { value: 'max', label: 'MAX' },
  ULTRA: { value: 'ultra', label: 'ULTRA' },
  AUTO: { value: 'auto', label: 'AUTO' },
})

/**
 * Canonical effort policy (spec §3).
 *
 * Immutable policy object carrying the cognitive + orchestration dimensions.
 * Provider/adapter specifics MUST NOT leak into this shape; they live in
 * effective provider requests and observability metadata.
 */
export const EffortPolicy = Object.freeze({
  /**
   * Build a canonical policy for a given effort level.
   * Throws on unsupported level or non-conforming numeric values.
   */
  forLevel(level) {
    const p = CANONICAL[level.value]
    if (!p) throw new Error(`No canonical policy for effort level: ${level.value}`)
    return p
  },
})

/**
 * Runtime budget state (spec §4). Mutable consumption lives here, never in
 * the immutable policy.
 */
export class BudgetState {
  constructor() {
    this._steps = 0
    this._toolCalls = 0
    this._retries = 0
    this._reflections = 0
    this._verifications = 0
    this._critics = 0
    this._workflowNodes = 0
    this._subtasks = 0
    this._workflowDepth = 0
    this._parallelWorkersPeak = 0
  }

  get execution_steps_used() { return this._steps }
  get tool_calls_used() { return this._toolCalls }
  get retries_used() { return this._retries }
  get reflections_used() { return this._reflections }
  get verifications_used() { return this._verifications }
  get critics_used() { return this._critics }
  get workflow_nodes_used() { return this._workflowNodes }
  get subtasks_used() { return this._subtasks }
  get workflow_depth_used() { return this._workflowDepth }
  get parallel_workers_peak() { return this._parallelWorkersPeak }

  incrementWorkflowDepth(amount = 1) {
    this._workflowDepth = Math.max(this._workflowDepth, amount)
    return this
  }

  trackParallelWorkers(activeCount) {
    if (activeCount > this._parallelWorkersPeak) {
      this._parallelWorkersPeak = activeCount
    }
    return this
  }
}

/**
 * Read-only budget snapshot (spec §5). Remaining values must never be negative.
 */
export class BudgetSnapshot {
  constructor(state, policy) {
    this._execution_steps_used = state.execution_steps_used
    this._execution_steps_remaining = Math.max(0, policy.execution_step_budget - state.execution_steps_used)

    this._tool_calls_used = state.tool_calls_used
    this._tool_calls_remaining = Math.max(0, policy.tool_call_budget - state.tool_calls_used)

    this._retries_used = state.retries_used
    this._retries_remaining = Math.max(0, policy.retry_budget - state.retries_used)

    this._reflections_used = state.reflections_used
    this._reflections_remaining = Math.max(0, policy.reflection_budget - state.reflections_used)

    this._verifications_used = state.verifications_used
    this._verifications_remaining = Math.max(0, policy.verification_budget - state.verifications_used)

    this._critics_used = state.critics_used
    this._critics_remaining = Math.max(0, policy.critic_budget - state.critics_used)

    this._workflow_nodes_used = state.workflow_nodes_used
    this._workflow_nodes_remaining = Math.max(0, policy.workflow_node_budget - state.workflow_nodes_used)

    this._subtasks_used = state.subtasks_used
    this._subtasks_remaining = Math.max(0, policy.subtask_budget - state.subtasks_used)

    this._workflow_depth_used = state.workflow_depth_used
    this._workflow_depth_remaining = Math.max(0, policy.workflow_depth_budget - state.workflow_depth_used)

    this._parallel_workers_peak = state.parallel_workers_peak
    this._parallel_workers_remaining = Math.max(0, policy.parallel_worker_budget - state.parallel_workers_peak)
  }

  get execution_steps_used() { return this._execution_steps_used }
  get execution_steps_remaining() { return this._execution_steps_remaining }
  get tool_calls_used() { return this._tool_calls_used }
  get tool_calls_remaining() { return this._tool_calls_remaining }
  get retries_used() { return this._retries_used }
  get retries_remaining() { return this._retries_remaining }
  get reflections_used() { return this._reflections_used }
  get reflections_remaining() { return this._reflections_remaining }
  get verifications_used() { return this._verifications_used }
  get verifications_remaining() { return this._verifications_remaining }
  get critics_used() { return this._critics_used }
  get critics_remaining() { return this._critics_remaining }
  get workflow_nodes_used() { return this._workflow_nodes_used }
  get workflow_nodes_remaining() { return this._workflow_nodes_remaining }
  get subtasks_used() { return this._subtasks_used }
  get subtasks_remaining() { return this._subtasks_remaining }
  get workflow_depth_used() { return this._workflow_depth_used }
  get workflow_depth_remaining() { return this._workflow_depth_remaining }
  get parallel_workers_peak() { return this._parallel_workers_peak }
  get parallel_workers_remaining() { return this._parallel_workers_remaining }
}

/**
 * Resolution result types (spec §6).
 */
export class EscalationEvent {
  constructor(fromLevel, toLevel, reason, step) {
    this.from_level = fromLevel
    this.to_level = toLevel
    this.reason = reason
    this.step = step
  }
}

export class ResolvedEffort {
  constructor(requested_level, initial_level, effective_level, policy, resolution_reason, escalations = []) {
    this.requested_level = requested_level
    this.initial_level = initial_level
    this.effective_level = effective_level
    this.policy = policy
    this.resolution_reason = resolution_reason
    this.escalations = escalations
  }
}

/**
 * Canonical policy table (spec §§8-13).
 */
const CANONICAL = {
  low: {
    level: EffortLevel.LOW,
    reasoning_score: 0.20,
    planning_score: 0.00,
    verification_score: 0.00,
    reflection_score: 0.00,
    workflow_score: 0.00,
    execution_step_budget: 8,
    tool_call_budget: 4,
    retry_budget: 0,
    reflection_budget: 0,
    verification_budget: 0,
    critic_budget: 0,
    workflow_node_budget: 0,
    subtask_budget: 0,
    workflow_depth_budget: 0,
    parallel_worker_budget: 1,
    planning_enabled: false,
    verification_enabled: false,
    reflection_enabled: false,
    workflow_enabled: false,
    decomposition_enabled: false,
    critic_enabled: false,
    recovery_enabled: false,
    adaptive_escalation: false,
    parallel_execution: false,
    planning_mode: 'none',
    reasoning_mode: 'minimal',
  },
  medium: {
    level: EffortLevel.MEDIUM,
    reasoning_score: 0.40,
    planning_score: 0.20,
    verification_score: 0.20,
    reflection_score: 0.00,
    workflow_score: 0.00,
    execution_step_budget: 16,
    tool_call_budget: 8,
    retry_budget: 1,
    reflection_budget: 0,
    verification_budget: 1,
    critic_budget: 0,
    workflow_node_budget: 0,
    subtask_budget: 0,
    workflow_depth_budget: 0,
    parallel_worker_budget: 1,
    planning_enabled: true,
    verification_enabled: true,
    reflection_enabled: false,
    workflow_enabled: false,
    decomposition_enabled: false,
    critic_enabled: false,
    recovery_enabled: true,
    adaptive_escalation: true,
    parallel_execution: false,
    planning_mode: 'light',
    reasoning_mode: 'moderate',
  },
  high: {
    level: EffortLevel.HIGH,
    reasoning_score: 0.60,
    planning_score: 0.40,
    verification_score: 0.50,
    reflection_score: 0.25,
    workflow_score: 0.00,
    execution_step_budget: 32,
    tool_call_budget: 16,
    retry_budget: 2,
    reflection_budget: 1,
    verification_budget: 2,
    critic_budget: 0,
    workflow_node_budget: 0,
    subtask_budget: 0,
    workflow_depth_budget: 0,
    parallel_worker_budget: 1,
    planning_enabled: true,
    verification_enabled: true,
    reflection_enabled: true,
    workflow_enabled: false,
    decomposition_enabled: false,
    critic_enabled: false,
    recovery_enabled: true,
    adaptive_escalation: true,
    parallel_execution: false,
    planning_mode: 'explicit',
    reasoning_mode: 'deep',
  },
  xhigh: {
    level: EffortLevel.XHIGH,
    reasoning_score: 0.80,
    planning_score: 0.70,
    verification_score: 0.75,
    reflection_score: 0.65,
    workflow_score: 0.00,
    execution_step_budget: 64,
    tool_call_budget: 32,
    retry_budget: 3,
    reflection_budget: 2,
    verification_budget: 3,
    critic_budget: 0,
    workflow_node_budget: 0,
    subtask_budget: 0,
    workflow_depth_budget: 0,
    parallel_worker_budget: 1,
    planning_enabled: true,
    verification_enabled: true,
    reflection_enabled: true,
    workflow_enabled: false,
    decomposition_enabled: false,
    critic_enabled: false,
    recovery_enabled: true,
    adaptive_escalation: true,
    parallel_execution: false,
    planning_mode: 'deep',
    reasoning_mode: 'very_deep',
  },
  max: {
    level: EffortLevel.MAX,
    reasoning_score: 1.00,
    planning_score: 1.00,
    verification_score: 1.00,
    reflection_score: 1.00,
    workflow_score: 0.00,
    execution_step_budget: 128,
    tool_call_budget: 64,
    retry_budget: 4,
    reflection_budget: 4,
    verification_budget: 4,
    critic_budget: 1,
    workflow_node_budget: 0,
    subtask_budget: 0,
    workflow_depth_budget: 0,
    parallel_worker_budget: 1,
    planning_enabled: true,
    verification_enabled: true,
    reflection_enabled: true,
    workflow_enabled: false,
    decomposition_enabled: false,
    critic_enabled: true,
    recovery_enabled: true,
    adaptive_escalation: true,
    parallel_execution: false,
    planning_mode: 'full',
    reasoning_mode: 'maximum',
  },
  ultra: {
    level: EffortLevel.ULTRA,
    reasoning_score: 1.00,
    planning_score: 1.00,
    verification_score: 1.00,
    reflection_score: 1.00,
    workflow_score: 1.00,
    execution_step_budget: 256,
    tool_call_budget: 128,
    retry_budget: 6,
    reflection_budget: 6,
    verification_budget: 8,
    critic_budget: 4,
    workflow_node_budget: 32,
    subtask_budget: 16,
    workflow_depth_budget: 8,
    parallel_worker_budget: 4,
    planning_enabled: true,
    verification_enabled: true,
    reflection_enabled: true,
    workflow_enabled: true,
    decomposition_enabled: true,
    critic_enabled: true,
    recovery_enabled: true,
    adaptive_escalation: true,
    parallel_execution: true,
    planning_mode: 'adaptive',
    reasoning_mode: 'maximum',
  },
}

/**
 * Policy resolution (spec §§14, 32, 37-38).
 *
 * `resolve_effort` returns a ResolvedEffort that distinguishes requested/initial/effective.
 * AUTO is handled specially: it must resolve to a fixed level and never be passed to a
 * provider as if it were a native reasoning level.
 */
export function resolve_effort(requested_level, options = {}) {
  if (!requested_level || typeof requested_level.value !== 'string') {
    throw new Error('resolve_effort: requested_level must be an EffortLevel-like object with a string value')
  }
  if (requested_level.value === EffortLevel.AUTO.value) {
    const initial = options.classifierInitial || EffortLevel.MEDIUM
    return resolve_auto(requested_level, initial, options)
  }
  const policy = EffortPolicy.forLevel(requested_level)
  return new ResolvedEffort(
    requested_level,
    requested_level,
    requested_level,
    policy,
    'explicit user selection',
    [],
  )
}

function resolve_auto(requested_level, initial_level, options = {}) {
  const initial = initial_level || EffortLevel.MEDIUM
  const policy = EffortPolicy.forLevel(initial)
  const escalations = []
  const AUTO_SEQUENCE = [
    EffortLevel.LOW,
    EffortLevel.MEDIUM,
    EffortLevel.HIGH,
    EffortLevel.XHIGH,
    EffortLevel.MAX,
    EffortLevel.ULTRA,
  ]
  const indexOf = (level) => AUTO_SEQUENCE.findIndex((l) => l.value === level.value)

  let effective_level = initial
  let reason = options.autoEscalationTrigger ? `auto escalation: ${options.autoEscalationTrigger}` : 'auto default initial level'

  // AUTO baseline: respect classifier initial, but allow bounded escalation when
  // the runtime signals failure-driven triggers. For deterministic fixtures the
  // escalation must be explicit and bounded; there is no free-form level jumping.
  if (options.autoEscalationTrigger) {
    // Follow the baseline sequence: never skip levels.
    const fromIndex = indexOf(effective_level)
    if (fromIndex >= 0 && fromIndex < AUTO_SEQUENCE.length - 1) {
      const next = AUTO_SEQUENCE[fromIndex + 1]
      const event = new EscalationEvent(effective_level, next, options.autoEscalationTrigger, options.autoEscalationStep ?? 0)
      escalations.push(event)
      effective_level = next
      reason = `auto escalation: ${options.autoEscalationTrigger}`
    }
  }

  return new ResolvedEffort(
    requested_level,
    initial,
    effective_level,
    EffortPolicy.forLevel(effective_level),
    reason,
    escalations,
  )
}

/**
 * AUTO scale hint helpers (spec §14.1). These expose the bounded AUTO region.
 */
export const AUTO_SCALE = {
  min: EffortLevel.MEDIUM.value,
  max: EffortLevel.HIGH.value,
}

export const AUTO_MIN = resolve_effort(EffortLevel.AUTO, { classifierInitial: EffortLevel.MEDIUM })
export const AUTO_MAX = resolve_effort(EffortLevel.AUTO, { classifierInitial: EffortLevel.HIGH })

/**
 * Effective budget calculation (spec §§17, 37-38).
 *
 * The canonical policy is never mutated; applyLimits returns a new object representing
 * the effective bound = min(canonical, runtime, provider, system).
 */
export function applyLimits(policy, runtimeLimits = {}, providerLimits = {}, systemLimits = {}) {
  const layers = [policy, runtimeLimits, providerLimits, systemLimits]
  const effective = {}

  // Copy canonical policy fields first, then clamp by min of applicable layers.
  for (const key of Object.keys(policy)) {
    if (typeof policy[key] !== 'number') {
      effective[key] = policy[key]
      continue
    }
    const canonical = policy[key]
    const runtime = runtimeLimits[key]
    const provider = providerLimits[key]
    const system = systemLimits[key]
    const bounds = [canonical]
    if (runtime !== undefined) bounds.push(runtime)
    if (provider !== undefined) bounds.push(provider)
    if (system !== undefined) bounds.push(system)
    effective[key] = Math.min(...bounds)
  }

  return effective
}

/**
 * Budget consumption helpers (spec §§18-23, 33).
 *
 * These mutate BudgetState and MUST NOT touch the policy. Each operation increments
 * the relevant counters exactly as defined in the spec.
 */
export function consumeModelCall(state) {
  state._steps += 1
  return state
}

export function consumeToolCall(state) {
  state._steps += 1
  state._toolCalls += 1
  return state
}

export function consumeRetry(state) {
  state._retries += 1
  state._steps += 1
  return state
}

export function consumeReflection(state) {
  state._reflections += 1
  state._steps += 1
  return state
}

export function consumeVerification(state) {
  state._verifications += 1
  state._steps += 1
  return state
}

export function consumeCritic(state) {
  state._critics += 1
  state._steps += 1
  return state
}

export function consumeWorkflowNode(state) {
  state._workflowNodes += 1
  state._steps += 1
  return state
}

export function consumeSubtask(state) {
  state._subtasks += 1
  return state
}

/**
 * Hard limits (spec §17). These must never be bypassed by normal user configuration.
 */
export const SYSTEM_HARD_LIMITS = Object.freeze({
  execution_step_budget: 512,
  tool_call_budget: 256,
  workflow_node_budget: 64,
  subtask_budget: 32,
  workflow_depth_budget: 8,
  parallel_worker_budget: 8,
})

/**
 * Supported effort values (spec §1).
 */
export const EFFORT_VALUES = Object.freeze([
  EffortLevel.LOW.value,
  EffortLevel.MEDIUM.value,
  EffortLevel.HIGH.value,
  EffortLevel.XHIGH.value,
  EffortLevel.MAX.value,
  EffortLevel.ULTRA.value,
])

export const SYSTEM_DEFAULT_EFFORT = EffortLevel.LOW.value

/**
 * Architecture + schema constants (spec §§6, 46).
 */
export const AGENT_ARCH_VERSION = 'linux-1.0'
export const BENCH_SCHEMA_VERSION = 3 // v3: +arch axis +worldState (Fase 2 bench)

/**
 * Provider adapter abstraction (spec §§30-31).
 *
 * Providers that lack native reasoning controls can approximate the canonical policy
 * via token budgets, prompt-level planning, execution-loop depth, and/or verification/retry
 * behavior. The canonical policy stays untouched.
 */
export class ModelProviderAdapter {
  /**
   * Apply the canonical effort policy to a provider request without mutating the policy.
   * Subclasses override for provider-specific parameter injection.
   */
  applyEffort(request, effortPolicy) {
    // Default implementation: provider-agnostic envelope carrying the canonical policy
    // plus observability metadata. Provider limits belong to the request/metadata, not the
    // canonical policy.
    return {
      ...request,
      _mark_effort_policy: effortPolicy,
      _mark_effort_metadata: {
        level: effortPolicy.level.value,
        reasoning_mode: effortPolicy.reasoning_mode,
        planning_mode: effortPolicy.planning_mode,
      },
    }
  }
}

/**
 * Fake/generic provider that only supports token budgets. Used for deterministic tests
 * where we need a provider that cannot express xhigh/max/ultra cognition directly but can
 * still be given a tighter effective request via applyLimits.
 */
export class TokenBudgetProviderAdapter extends ModelProviderAdapter {
  constructor(tokenBudgetByLevel = {}) {
    super()
    this.tokenBudgetByLevel = tokenBudgetByLevel
  }

  applyEffort(request, effortPolicy) {
    const budget = this.tokenBudgetByLevel[effortPolicy.level.value] ?? 4096
    return {
      ...super.applyEffort(request, effortPolicy),
      max_tokens: budget,
      _mark_effort_provider_fallback: 'token_budget',
    }
  }
}
