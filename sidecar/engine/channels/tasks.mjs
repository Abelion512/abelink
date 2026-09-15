// Channel: engine-owned durable task runtime boundary (tasks:*).
//
// Thin mapping: every handler forwards to src/api/engine/taskRuntime.js,
// which delegates to the existing taskStore.js implementation. No lifecycle
// logic, no persistence, and no verification logic lives here.
//
// KNOWN LIMITATION (honest fail-fast): the default store is Dexie/IndexedDB,
// which does not exist in the Bun sidecar process. Until a headless store
// lands (see migration note), every handler below throws an explicit error
// instead of faking success. Inject a store via configureTaskRuntime() to
// enable this channel (tests do exactly that).
import { on, emit } from '../registry.mjs'
import {
  configureTaskRuntime,
  createTask,
  getTask,
  getTaskWithSteps,
  listTasks,
  startTask,
  startTaskStep,
  checkpointStep,
  transitionTask,
  pauseTask,
  resumeTask,
  cancelTask,
  getResult
} from '../../../src/api/engine/taskRuntime.js'

// Engine event fan-out: task.created/updated/progress/completed/failed/
// cancelled flow through the existing sidecar event frame
// ({"event","payload"} -> Tauri event system). Renderer default stays
// silent (GUI surfaces state via chat bubbles as today).
configureTaskRuntime({ emit: (name, payload) => emit(name, payload) })

on('tasks:create', (input) => createTask(input ?? {}))
on('tasks:get', (taskId) => getTask(taskId))
on('tasks:get-with-steps', (taskId) => getTaskWithSteps(taskId))
on('tasks:list', (options) => listTasks(options ?? {}))
on('tasks:start', (taskId) => startTask(taskId))
on('tasks:start-step', (taskId, stepId) => startTaskStep(taskId, stepId))
on('tasks:checkpoint', (taskId, stepId, checkpoint) => checkpointStep(taskId, stepId, checkpoint ?? {}))
on('tasks:transition', (taskId, status, error) => transitionTask(taskId, status, error ?? null))
on('tasks:pause', (taskId, reason) => pauseTask(taskId, reason ?? null))
on('tasks:resume', (taskId) => resumeTask(taskId))
on('tasks:cancel', (taskId) => cancelTask(taskId))
on('tasks:result', (taskId) => getResult(taskId))
