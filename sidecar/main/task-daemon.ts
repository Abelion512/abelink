import { spawn, type ChildProcess } from 'child_process'

interface TaskState {
  id: string
  command: string
  pid: number | undefined
  outputBuffer: string[]
  status: string
  startedAt: number
  process: ChildProcess
  exitCode?: number | null
  error?: string
}

const activeTasks = new Map<string, TaskState>()

// Retensi: simpan maksimal 20 entri task yang sudah selesai supaya Map tidak tumbuh tanpa batas.
const MAX_FINISHED_TASKS = 20
// Status terminal; task berstatus lain (mis. running) tidak pernah dibersihkan.
const FINISHED_STATUSES = ['completed', 'failed', 'killed', 'error']
let reapTimer: ReturnType<typeof setTimeout> | null = null

const isFinishedStatus = (status: string) => FINISHED_STATUSES.includes(status)

// Map mempertahankan urutan insertion, jadi iterasi pertama = entri selesai tertua.
function reapOldestFinishedTasks() {
  const finishedIds: string[] = []
  for (const [id, task] of activeTasks.entries()) {
    if (isFinishedStatus(task.status)) finishedIds.push(id)
  }
  const excessCount = finishedIds.length - MAX_FINISHED_TASKS
  for (let i = 0; i < excessCount; i++) {
    activeTasks.delete(finishedIds[i])
  }
  if (excessCount > 0) {
    console.log(`[TaskDaemon] Membersihkan ${excessCount} entri task selesai tertua.`)
  }
}

// Jadwalkan sapuan setelah transisi ke status selesai; ditunda sekali untuk mem-batch beberapa close event.
function scheduleFinishedTaskReap() {
  if (reapTimer) return
  reapTimer = setTimeout(() => {
    reapTimer = null
    reapOldestFinishedTasks()
  }, 500)
}

/**
 * Menjalankan background terminal task secara non-blocking
 */
export function spawnBackgroundTask(taskId: string, command: string, cwd?: string) {
  if (!taskId || !command) {
    return { success: false, message: 'TaskId dan command wajib diisi.' }
  }

  if (activeTasks.has(taskId)) {
    killBackgroundTask(taskId)
  }

  const child = spawn('/bin/bash', ['-c', command], {
    cwd: cwd || process.cwd()
  })

  const taskState: TaskState = {
    id: taskId,
    command,
    pid: child.pid,
    outputBuffer: [],
    status: 'running',
    startedAt: Date.now(),
    process: child
  }

  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n')
    taskState.outputBuffer.push(...lines)
    if (taskState.outputBuffer.length > 300) {
      taskState.outputBuffer.splice(0, taskState.outputBuffer.length - 300)
    }
  })

  child.stderr.on('data', (data) => {
    taskState.outputBuffer.push(`[STDERR] ${data.toString()}`)
    if (taskState.outputBuffer.length > 300) {
      taskState.outputBuffer.splice(0, taskState.outputBuffer.length - 300)
    }
  })

  child.on('close', (code: number | null) => {
    taskState.status = code === 0 ? 'completed' : 'failed'
    taskState.exitCode = code
    scheduleFinishedTaskReap()
  })

  child.on('error', (err) => {
    taskState.status = 'error'
    taskState.error = err.message
    scheduleFinishedTaskReap()
  })

  activeTasks.set(taskId, taskState)
  return {
    success: true,
    taskId,
    pid: child.pid,
    message: `Background task '${taskId}' berhasil dijalankan (PID: ${child.pid}). Gunakan 'read-task-output' untuk melihat log atau 'kill-task' untuk menghentikan.`
  }
}

/**
 * Membaca output log terbaru dari background task
 */
export function readBackgroundTaskOutput(taskId: string, lineCount = 40) {
  const task = activeTasks.get(taskId)
  if (!task) return { success: false, message: `Task '${taskId}' tidak ditemukan.` }

  const lines = task.outputBuffer.slice(-1 * lineCount)
  return {
    success: true,
    taskId,
    status: task.status,
    pid: task.pid,
    output: lines.join('\n').trim() || '(Belum ada output teks dari proses ini)'
  }
}

/**
 * Menghentikan background task
 */
export function killBackgroundTask(taskId: string) {
  const task = activeTasks.get(taskId)
  if (!task) return { success: false, message: `Task '${taskId}' tidak ditemukan.` }

  try {
    task.process.kill('SIGTERM')
  } catch {
    try {
      task.process.kill()
    } catch (_) {}
  }

  activeTasks.delete(taskId)
  return { success: true, message: `Task '${taskId}' (PID: ${task.pid}) berhasil dihentikan.` }
}

/**
 * Mendapatkan daftar seluruh background tasks yang aktif
 */
export function listBackgroundTasks() {
  const list: Array<{ taskId: string; command: string; pid: number | undefined; status: string; startedAt: number }> = []
  for (const [id, t] of activeTasks.entries()) {
    list.push({
      taskId: id,
      command: t.command,
      pid: t.pid,
      status: t.status,
      startedAt: t.startedAt
    })
  }
  return { success: true, count: list.length, tasks: list }
}
