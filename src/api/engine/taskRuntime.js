// Engine-owned durable task runtime boundary (isomorphic: renderer + sidecar + future CLI).
//
// DELEGATE-ONLY INVARIANT (binding): every function below forwards to the
// existing src/api/taskStore.js / src/api/taskExecutor.js implementation.
// taskStore.js remains authoritative for persistence and state transitions.
// This module holds orchestration policy ONLY at the runtime-boundary level:
// adapter injection, event fan-out, and the derived getResult view. It must
// never grow its own state machine, persistence, or verification logic.
//
// Headless rule: this module has ZERO top-level imports. The default store
// (taskStore.js -> Dexie/IndexedDB) is loaded lazily on first use, so
// importing this file never requires window, React, Tauri, localStorage,
// or IndexedDB. Runtimes without IndexedDB fail fast with an explicit
// error; inject a compatible store via configureTaskRuntime() instead.
//
// Approval rule: this layer never executes tools and never approves
// anything. All destructive execution still routes through node_invoke ->
// Rust APPROVAL_ACTIONS (rfd native dialog). See docs migration note.

// Events actually emitted by the implementation below. waiting_user and
// approval_required are intentionally absent: no dispatcher wiring exists
// yet, and this module emits no fake streams.
export const TASK_RUNTIME_EVENTS = [
  'task.created',
  'task.updated',
  'task.progress',
  'task.completed',
  'task.failed',
  'task.cancelled'
]

let storeOverride = null
let emitOverride = null

// Inject a compatible store ({ createAgentTask, getAgentTask, ... } with the
// exact taskStore.js signatures) and/or an event sink (name, payload) => void.
// Pass { store: null } / { emit: null } to clear one slot; use
// resetTaskRuntimeConfig() to restore defaults.
export function configureTaskRuntime({ store = undefined, emit = undefined } = {}) {
  if (store !== undefined) {
    if (store !== null && (typeof store !== 'object' || typeof store.createAgentTask !== 'function')) {
      throw new Error('taskRuntime: injected store must expose the taskStore.js interface')
    }
    storeOverride = store
  }
  if (emit !== undefined) {
    if (emit !== null && typeof emit !== 'function') {
      throw new Error('taskRuntime: emit must be a function')
    }
    emitOverride = emit
  }
}

export function resetTaskRuntimeConfig() {
  storeOverride = null
  emitOverride = null
}

async function store() {
  if (storeOverride) return storeOverride
  if (typeof indexedDB === 'undefined') {
    throw new Error(
      'taskRuntime: no persistent task store in this runtime (IndexedDB missing). ' +
        'Inject one via configureTaskRuntime({ store }).'
    )
  }
  return import('../taskStore.js')
}

function emitEvent(name, payload) {
  if (!TASK_RUNTIME_EVENTS.includes(name)) return
  try {
    emitOverride?.(name, payload)
  } catch {
    // Event sinks are observability only; never break execution.
  }
}

export async function createTask(input = {}) {
  const task = await (await store()).createAgentTask(input)
  emitEvent('task.created', { taskId: task.id, status: task.status })
  return task
}

export async function getTask(taskId) {
  return (await store()).getAgentTask(taskId)
}

export async function getTaskWithSteps(taskId) {
  return (await store()).getAgentTaskWithSteps(taskId)
}

export async function listTasks(options = {}) {
  return (await store()).listAgentTasks(options)
}

export async function startTask(taskId) {
  const task = await (await store()).startAgentTask(taskId)
  emitEvent('task.updated', { taskId, status: task?.status })
  return task
}

export async function startTaskStep(taskId, stepId) {
  const step = await (await store()).startAgentTaskStep(taskId, stepId)
  emitEvent('task.updated', { taskId, stepId, status: 'running' })
  return step
}

export async function checkpointStep(taskId, stepId, checkpoint = {}) {
  const task = await (await store()).checkpointAgentTaskStep(taskId, stepId, checkpoint)
  emitEvent('task.progress', { taskId, stepId, status: task?.status })
  if (task?.status === 'completed') emitEvent('task.completed', { taskId })
  return task
}

export async function transitionTask(taskId, status, error = null) {
  const task = await (await store()).transitionAgentTask(taskId, status, error)
  emitEvent('task.updated', { taskId, status })
  if (status === 'completed') emitEvent('task.completed', { taskId })
  if (status === 'failed') emitEvent('task.failed', { taskId, error })
  if (status === 'cancelled') emitEvent('task.cancelled', { taskId, error })
  return task
}

export async function pauseTask(taskId, reason = null) {
  return transitionTask(taskId, 'paused', reason)
}

export async function resumeTask(taskId) {
  const task = await (await store()).resumeAgentTask(taskId)
  emitEvent('task.updated', { taskId, status: task?.status })
  return task
}

// Cooperative cancel: persists `cancelled` (+ syncs running steps) and emits
// the event. Limitation: an already-dispatched in-flight native operation is
// NOT killed (sidecar has no abort propagation; Rust bridge timeout is 300s).
// Callers must still abort their own loop/signal alongside this call.
export async function cancelTask(taskId) {
  const task = await (await store()).cancelAgentTask(taskId)
  emitEvent('task.cancelled', { taskId })
  return task
}

export async function deleteTask(taskId) {
  return (await store()).deleteAgentTask(taskId)
}

// Restart recovery: parks stale running/waiting_user tasks (and their running
// steps) as paused. Same semantics as App.jsx startup recovery.
export async function pauseStaleTasks(reason = 'app_restart') {
  return (await store()).pauseStaleAgentTasks(reason)
}

// Pure checkpoint builder (verification logic untouched in taskExecutor.js).
export async function buildStepCheckpoint(step, output, maxRetries = 2, evidenceInput = null) {
  const { buildDurableStepCheckpoint } = await import('../taskExecutor.js')
  return buildDurableStepCheckpoint(step, output, maxRetries, evidenceInput)
}

// One stable engine-level result view per task ID. Derived only: no schema
// change, no chat-history reconstruction. Throws when the task is unknown.
export async function getResult(taskId) {
  const task = await (await store()).getAgentTaskWithSteps(taskId)
  if (!task) throw new Error('Task tidak ditemukan: ' + taskId)
  const steps = (task.steps || []).map((step) => ({
    id: step.id,
    title: step.title,
    status: step.status,
    outputSummary: step.outputSummary || null,
    contentHash: step.contentHash || null,
    validation: step.validation || null,
    verification: step.verification || null,
    artifactPath: step.artifactPath || null,
    error: step.error || null
  }))
  const text = steps
    .filter((step) => step.status === 'completed' && step.outputSummary)
    .map((step) => step.outputSummary)
    .join('\n\n')
  return {
    taskId: task.id,
    title: task.title,
    objective: task.objective,
    status: task.status,
    error: task.error || null,
    completedAt: task.completedAt || null,
    handoffContract: task.handoffContract || null,
    steps,
    text
  }
}

export async function getTaskHandoffContract(taskId, options = {}) {
  const s = await store()
  if (typeof s.generateTaskHandoff === 'function') {
    return s.generateTaskHandoff(taskId, options)
  }
  const task = await s.getAgentTaskWithSteps(taskId)
  if (!task) throw new Error('Task tidak ditemukan: ' + taskId)
  const { buildHandoffContract } = await import('../ai/handoffContract.js')
  return buildHandoffContract(task, options)
}

export {
  buildHandoffContract,
  validateHandoffContract,
  formatHandoffContractPrompt,
  MANDATORY_HANDOFF_FIELDS
} from '../ai/handoffContract.js'

