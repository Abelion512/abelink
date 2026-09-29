import { db, type AgentTaskRow, type AgentTaskStepRow } from './db'
import { buildHandoffContract } from './ai/handoffContract'

export const TASK_STATUSES = ['pending', 'running', 'paused', 'waiting_user', 'failed', 'completed', 'cancelled']
export const STEP_STATUSES = ['pending', 'running', 'needs_revision', 'completed', 'failed', 'skipped']
const now = () => Date.now()

// Hash ringan dipakai untuk mendeteksi output identik tanpa menyimpan isi besar di Dexie.
export function getAgentTaskContentHash(value: unknown = '') {
  const text = String(value)
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

// ---- Kontrak tipe (W2-8b) ----
interface TaskStepInput {
  id?: string
  [key: string]: unknown
}

export interface AgentTaskStep {
  id: string
  [key: string]: unknown
}

export interface AgentTask {
  id: string
  title?: unknown
  objective?: unknown
  mode?: unknown
  status?: unknown
  currentStepIndex?: unknown
  activeStepId?: unknown
  acceptanceCriteria?: unknown
  steps?: unknown
  [key: string]: unknown
}

function makeId(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.()
  return prefix + '-' + (uuid || (now() + '-' + Math.random().toString(36).slice(2, 10)))
}

function assertTaskStatus(status: unknown) {
  if (!(TASK_STATUSES as readonly unknown[]).includes(status)) throw new Error('Invalid task status: ' + status)
}

function assertStepStatus(status: unknown) {
  if (!(STEP_STATUSES as readonly unknown[]).includes(status)) throw new Error('Invalid step status: ' + status)
}

// Validasi lokal menjaga checkpoint tetap deterministik tanpa menambah panggilan AI.
export function validateAgentTaskStepOutput(step: Record<string, unknown> = {}, output: unknown = '') {
  const text = typeof output === 'string' ? output.trim() : ''
  const hasContent = text.length >= ((step.acceptanceCriteria as unknown[] | undefined)?.length ? 80 : 20)
  return {
    isComplete: hasContent,
    score: hasContent ? 1 : 0,
    missingRequirements: hasContent ? [] : ['Output step terlalu pendek atau kosong.'],
    notes: hasContent
      ? 'Validasi dasar konten berhasil.'
      : 'Step perlu diulang karena deliverable belum memiliki isi yang cukup.'
  }
}

export async function createAgentTask(input: Record<string, unknown> = {}): Promise<AgentTask> {
  // Create task dan semua step dalam satu transaksi supaya outline tidak setengah jadi.
  const timestamp = now()
  const taskId = (input.id as string) || makeId('task')
  const steps = ((input.steps || []) as TaskStepInput[]).map((step: TaskStepInput, index: number) => ({
    id:
      step.id && step.id.startsWith(taskId + '-')
        ? step.id
        : taskId + '-' + (step.id || 'step-' + (index + 1)),
    taskId, index,
    title: step.title || 'Step ' + (index + 1),
    objective: step.objective || '',
    deliverable: step.deliverable || '',
    acceptanceCriteria: step.acceptanceCriteria || [],
    status: step.status || 'pending',
    inputSummary: step.inputSummary || '',
    outputSummary: step.outputSummary || '',
    artifactPath: step.artifactPath || null,
    validation: step.validation || null,
    contentHash: step.contentHash || null,
    attempts: 0, startedAt: null, completedAt: null,
    updatedAt: timestamp, error: null
  }))
  const task: AgentTaskRow = {
    id: taskId,
    title: (input.title as string) || 'Abelink Task',
    objective: (input.objective as string) || '',
    mode: (input.mode as string) || 'durable',
    status: (input.status as string) || (steps.length ? 'pending' : 'failed'),
    currentStepIndex: (input.currentStepIndex as number) ?? 0,
    activeStepId: (input.activeStepId as string) || steps[0]?.id || null,
    constraints: (input.constraints as Record<string, unknown>) || {},
    contextSummary: (input.contextSummary as string) || '',
    artifactRoot: (input.artifactRoot as string) || null,
    retryCount: (input.retryCount as number) || 0,
    maxRetries: (input.maxRetries as number) ?? 2,
    createdAt: timestamp, updatedAt: timestamp,
    completedAt: null,
    error: steps.length ? null : 'Task harus memiliki minimal satu step'
  }
  await db.transaction('rw', db.agentTasks, db.agentTaskSteps, async () => {
    await db.agentTasks.add(task)
    if (steps.length) await db.agentTaskSteps.bulkAdd(steps as unknown as AgentTaskStepRow[])
  })
  return task as unknown as AgentTask
}

export async function getAgentTask(taskId: unknown): Promise<AgentTaskRow | undefined> {
  return db.agentTasks.get(taskId as Parameters<typeof db.agentTasks.get>[0])
}

export async function getAgentTaskWithSteps(taskId: unknown) {
  const [task, steps] = await Promise.all([
    db.agentTasks.get(taskId as Parameters<typeof db.agentTasks.get>[0]),
    db.agentTaskSteps.where('taskId').equals(taskId as string).sortBy('index')
  ])
  return task ? { ...task, steps } : null
}

export async function listAgentTasks({ status, limit = 50 }: { status?: unknown; limit?: number } = {}) {
  const collection = status
    ? db.agentTasks.where('status').equals(status as string).reverse()
    : db.agentTasks.orderBy('updatedAt').reverse()
  return collection.limit(limit).toArray()
}

export async function updateAgentTask(taskId: unknown, changes: Record<string, unknown> = {}) {
  if (changes.status) assertTaskStatus(changes.status)
  await db.agentTasks.update(taskId as Parameters<typeof db.agentTasks.update>[0], { ...changes, updatedAt: now() })
  return getAgentTask(taskId)
}

export async function updateAgentTaskStep(stepId: unknown, changes: Record<string, unknown> = {}) {
  if (changes.status) assertStepStatus(changes.status)
  await db.agentTaskSteps.update(stepId as Parameters<typeof db.agentTaskSteps.update>[0], { ...changes, updatedAt: now() })
  return db.agentTaskSteps.get(stepId as Parameters<typeof db.agentTaskSteps.get>[0])
}

export async function startAgentTask(taskId: unknown) {
  return updateAgentTask(taskId, { status: 'running', error: null })
}

// Resume membuka kembali task paused/pending dan memastikan step pointer konsisten.
export async function resumeAgentTask(taskId: unknown) {
  const task = await getAgentTaskWithSteps(taskId)
  if (!task) throw new Error('Task tidak ditemukan')
  if (!['paused', 'pending'].includes(task.status)) {
    throw new Error('Task tidak bisa di-resume dari status ' + task.status)
  }

  let targetStepId = (task as AgentTaskRow).activeStepId
  const allSteps = task.steps || []
  let targetStep = allSteps.find((s) => s.id === targetStepId)

  // Jika activeStepId belum ada atau sudah selesai, cari step pertama yang belum selesai
  if (!targetStep || targetStep.status === 'completed') {
    targetStep = allSteps
      .filter((item) => ['pending', 'needs_revision', 'running'].includes(item.status))
      .sort((a, b) => a.index - b.index)[0]
    targetStepId = targetStep?.id || null
  }

  if (!targetStepId) {
    await updateAgentTask(taskId, { status: 'completed', error: null, completedAt: now() })
    return getAgentTaskWithSteps(taskId)
  }

  await startAgentTaskStep(taskId, targetStepId)
  return getAgentTaskWithSteps(taskId)
}

// Retry manual mengulang step failed/needs_revision dengan batas yang sama seperti executor.
export async function retryAgentTaskStep(taskId: unknown, stepId: unknown) {
  const task = await getAgentTaskWithSteps(taskId)
  const step = task?.steps?.find((item) => item.id === stepId)
  if (!task || !step) throw new Error('Task step tidak ditemukan')
  if (!['failed', 'needs_revision'].includes(step.status)) {
    throw new Error('Step belum berada pada status retryable')
  }
  const maxRetries = Number((task as unknown as { maxRetries?: number }).maxRetries ?? 2)
  if ((step.attempts as number || 0) >= maxRetries + 1) {
    throw new Error('Batas retry step sudah tercapai')
  }
  return startAgentTaskStep(taskId, stepId)
}

export async function startAgentTaskStep(taskId: unknown, stepId: unknown) {
  // Step aktif ditandai running saat executor mulai memproses step itu.
  const timestamp = now()
  return db.transaction('rw', db.agentTasks, db.agentTaskSteps, async () => {
    const step = await db.agentTaskSteps.get(stepId as Parameters<typeof db.agentTaskSteps.get>[0])
    if (!step || step.taskId !== taskId) throw new Error('Task step tidak ditemukan')
    // Hanya naikkan attempts bila berpindah dari status non-running ke running
    const attempts = step.status === 'running' ? (step.attempts as number || 1) : ((step.attempts as number) || 0) + 1
    await db.agentTaskSteps.update(stepId as Parameters<typeof db.agentTaskSteps.update>[0], {
      status: 'running',
      attempts,
      startedAt: step.startedAt || timestamp,
      error: null,
      updatedAt: timestamp
    })
    await db.agentTasks.update(taskId as Parameters<typeof db.agentTasks.update>[0], {
      status: 'running',
      activeStepId: stepId as string,
      currentStepIndex: step.index,
      error: null,
      updatedAt: timestamp
    })
    return db.agentTaskSteps.get(stepId as Parameters<typeof db.agentTaskSteps.get>[0])
  })
}

export async function checkpointAgentTaskStep(taskId: unknown, stepId: unknown, checkpoint: Record<string, unknown> = {}) {
  // Checkpoint ini menyimpan hasil step dan memajukan pointer ke step pending berikutnya.
  const timestamp = now()
  return db.transaction('rw', db.agentTasks, db.agentTaskSteps, async () => {
    const step = await db.agentTaskSteps.get(stepId as Parameters<typeof db.agentTaskSteps.get>[0])
    const task = await db.agentTasks.get(taskId as Parameters<typeof db.agentTasks.get>[0])
    if (!step || step.taskId !== taskId || !task) throw new Error('Task checkpoint tidak ditemukan')
    if (checkpoint.status) assertStepStatus(checkpoint.status)
    await db.agentTaskSteps.update(stepId as Parameters<typeof db.agentTaskSteps.update>[0], {
      ...checkpoint,
      updatedAt: timestamp,
      ...(checkpoint.status === 'completed' ? { completedAt: (checkpoint.completedAt as number) || timestamp } : {})
    } as Parameters<typeof db.agentTaskSteps.update>[1])
    const taskChanges: Record<string, unknown> = { updatedAt: timestamp }
    const allSteps = await db.agentTaskSteps.where('taskId').equals(taskId as string).sortBy('index')
    if (checkpoint.status === 'completed') {
      const next = allSteps
        .filter((item) => item.id !== stepId && ['pending', 'needs_revision'].includes(item.status))
        .sort((a, b) => a.index - b.index)[0]
      taskChanges.activeStepId = next?.id || null
      taskChanges.currentStepIndex = next?.index ?? step.index
      if (!next) {
        taskChanges.status = 'completed'
        taskChanges.completedAt = timestamp
      }
    }
    const contract = buildHandoffContract({ ...task, ...taskChanges, steps: allSteps })
    taskChanges.handoffContract = contract
    await db.agentTasks.update(taskId as Parameters<typeof db.agentTasks.update>[0], taskChanges as Parameters<typeof db.agentTasks.update>[1])
    return getAgentTaskWithSteps(taskId)
  })
}

export async function transitionAgentTask(taskId: unknown, status: unknown, error: unknown = null) {
  assertTaskStatus(status)
  const timestamp = now()
  return db.transaction('rw', db.agentTasks, db.agentTaskSteps, async () => {
    const task = await db.agentTasks.get(taskId as Parameters<typeof db.agentTasks.get>[0])
    if (!task) throw new Error('Task tidak ditemukan')

    // Bila task diparkir (paused) atau dibatalkan/gagal, sinkronkan step yang sedang running
    if (['paused', 'cancelled', 'failed'].includes(status as string)) {
      const runningSteps = await db.agentTaskSteps
        .where('taskId')
        .equals(taskId as string)
        .and((step) => step.status === 'running')
        .toArray()

      const stepStatus = status === 'paused' ? 'pending' : status
      await Promise.all(
        runningSteps.map((s) =>
          db.agentTaskSteps.update(s.id, {
            status: stepStatus as string,
            error: (error as string) || (status as string),
            updatedAt: timestamp
          })
        )
      )
    }

    const allSteps = await db.agentTaskSteps.where('taskId').equals(taskId as string).sortBy('index')
    const contract = buildHandoffContract({
      ...task,
      status: status as string,
      error: error as string | null,
      steps: allSteps
    })

    await db.agentTasks.update(taskId as Parameters<typeof db.agentTasks.update>[0], {
      status: status as string,
      error: error as string | null,
      handoffContract: contract,
      updatedAt: timestamp,
      ...(status === 'completed' ? { completedAt: timestamp } : {})
    } as Parameters<typeof db.agentTasks.update>[1])
    return getAgentTaskWithSteps(taskId)
  })
}

export async function generateTaskHandoff(taskId: unknown, options: Record<string, unknown> = {}) {
  const task = await getAgentTaskWithSteps(taskId)
  if (!task) throw new Error('Task tidak ditemukan: ' + taskId)
  const contract = buildHandoffContract(task, options)
  await db.agentTasks.update(taskId as Parameters<typeof db.agentTasks.update>[0], { handoffContract: contract, updatedAt: now() })
  return contract
}

export async function pauseStaleAgentTasks(reason = 'app_restart') {
  // Saat app hidup lagi, task yang masih running diparkir dulu agar tidak dianggap selesai.
  const active = await db.agentTasks.where('status').anyOf(['running', 'waiting_user']).toArray()
  if (!active.length) return 0
  const timestamp = now()
  const activeIds = active.map((t) => t.id)
  await db.transaction('rw', db.agentTasks, db.agentTaskSteps, async () => {
    await Promise.all(
      active.map((task) =>
        db.agentTasks.update(task.id, {
          status: 'paused',
          error: reason,
          updatedAt: timestamp
        })
      )
    )
    // Sinkronkan juga step running agar tidak tertinggal sebagai running saat task sudah paused
    const runningSteps = await db.agentTaskSteps
      .where('taskId')
      .anyOf(activeIds)
      .and((step) => step.status === 'running')
      .toArray()
    await Promise.all(
      runningSteps.map((step) =>
        db.agentTaskSteps.update(step.id, {
          status: 'pending',
          error: reason,
          updatedAt: timestamp
        })
      )
    )
  })
  return active.length
}

export async function cancelAgentTask(taskId: unknown) {
  return transitionAgentTask(taskId, 'cancelled', 'cancelled_by_user')
}

export async function deleteAgentTask(taskId: unknown) {
  await db.transaction('rw', db.agentTasks, db.agentTaskSteps, async () => {
    await db.agentTaskSteps.where('taskId').equals(taskId as string).delete()
    await db.agentTasks.delete(taskId as Parameters<typeof db.agentTasks.delete>[0])
  })
}
