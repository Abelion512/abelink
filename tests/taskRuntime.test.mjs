// tests/taskRuntime.test.mjs
// Boundary tests for src/api/engine/taskRuntime.js (delegate-only facade).
// Lifecycle semantics live in taskStore.js; here we prove delegation,
// events, getResult, unknown-task errors, restart recovery, and that the
// facade imports without browser globals.
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '../src/api/db.js'
import * as taskStore from '../src/api/taskStore.js'
import {
  TASK_RUNTIME_EVENTS,
  configureTaskRuntime,
  resetTaskRuntimeConfig,
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
  deleteTask,
  pauseStaleTasks,
  getResult
} from '../src/api/engine/taskRuntime.js'

const twoSteps = (id) => ({
  id,
  title: 'Runtime Task ' + id,
  objective: 'Prove the engine boundary',
  steps: [
    { id: 's1', title: 'Step 1', objective: 'Do one', deliverable: 'One done' },
    { id: 's2', title: 'Step 2', objective: 'Do two', deliverable: 'Two done' }
  ]
})

beforeEach(async () => {
  resetTaskRuntimeConfig()
  await db.agentTasks.clear()
  await db.agentTaskSteps.clear()
})

afterEach(() => {
  resetTaskRuntimeConfig()
})

describe('taskRuntime — headless import', () => {
  it('loads without React/browser globals', async () => {
    expect(typeof window).toBe('undefined')
    expect(typeof localStorage).toBe('undefined')
    const mod = await import('../src/api/engine/taskRuntime.js')
    expect(typeof mod.createTask).toBe('function')
    expect(typeof mod.getResult).toBe('function')
  })

  it('fails fast without IndexedDB when no store is injected', async () => {
    const saved = globalThis.indexedDB
    delete globalThis.indexedDB
    try {
      await expect(createTask({ title: 'x' })).rejects.toThrow('IndexedDB missing')
    } finally {
      globalThis.indexedDB = saved
    }
  })

  it('rejects invalid injected config', () => {
    expect(() => configureTaskRuntime({ store: {} })).toThrow('taskStore.js interface')
    expect(() => configureTaskRuntime({ emit: 'nope' })).toThrow('must be a function')
  })

  it('exposes only supported events', () => {
    expect(TASK_RUNTIME_EVENTS).toContain('task.created')
    expect(TASK_RUNTIME_EVENTS).toContain('task.completed')
    expect(TASK_RUNTIME_EVENTS).not.toContain('task.waiting_user')
    expect(TASK_RUNTIME_EVENTS).not.toContain('task.approval_required')
  })
})

describe('taskRuntime — lifecycle via default store', () => {
  it('create/read/list/start/checkpoint/pause/resume/cancel', async () => {
    const created = await createTask(twoSteps('rt-1'))
    expect(created.status).toBe('pending')

    expect((await getTask('rt-1')).id).toBe('rt-1')
    const withSteps = await getTaskWithSteps('rt-1')
    expect(withSteps.steps).toHaveLength(2)
    expect((await listTasks({}))).toHaveLength(1)
    expect((await listTasks({ status: 'pending' }))).toHaveLength(1)

    await startTask('rt-1')
    expect((await getTask('rt-1')).status).toBe('running')

    await startTaskStep('rt-1', 'rt-1-s1')
    const afterCp = await checkpointStep('rt-1', 'rt-1-s1', { status: 'completed', outputSummary: 'one' })
    expect(afterCp.steps.find((s) => s.id === 'rt-1-s1').status).toBe('completed')
    expect(afterCp.activeStepId).toBe('rt-1-s2')

    await pauseTask('rt-1', 'test')
    expect((await getTask('rt-1')).status).toBe('paused')

    const resumed = await resumeTask('rt-1')
    expect(resumed.status).toBe('running')
    expect(resumed.activeStepId).toBe('rt-1-s2')

    await cancelTask('rt-1')
    expect((await getTask('rt-1')).status).toBe('cancelled')

    await deleteTask('rt-1')
    expect(await getTask('rt-1')).toBeUndefined()
  })

  it('completed result is a stable derived view by task ID', async () => {
    await createTask(twoSteps('rt-result'))
    await startTaskStep('rt-result', 'rt-result-s1')
    await checkpointStep('rt-result', 'rt-result-s1', { status: 'completed', outputSummary: 'hasil satu' })
    await startTaskStep('rt-result', 'rt-result-s2')
    await checkpointStep('rt-result', 'rt-result-s2', { status: 'completed', outputSummary: 'hasil dua' })

    const result = await getResult('rt-result')
    expect(result.taskId).toBe('rt-result')
    expect(result.status).toBe('completed')
    expect(result.completedAt).toBeDefined()
    expect(result.steps).toHaveLength(2)
    expect(result.steps[0].outputSummary).toBe('hasil satu')
    expect(result.text).toContain('hasil satu')
    expect(result.text).toContain('hasil dua')
  })

  it('failed task keeps its error in the result', async () => {
    await createTask(twoSteps('rt-fail'))
    await transitionTask('rt-fail', 'failed', 'boom')
    const result = await getResult('rt-fail')
    expect(result.status).toBe('failed')
    expect(result.error).toBe('boom')
  })

  it('unknown task throws on getResult/resume', async () => {
    await expect(getResult('rt-missing')).rejects.toThrow('Task tidak ditemukan')
    await expect(resumeTask('rt-missing')).rejects.toThrow('Task tidak ditemukan')
    expect(await getTask('rt-missing')).toBeUndefined()
    expect(await getTaskWithSteps('rt-missing')).toBeNull()
  })

  it('restart recovery parks stale running tasks', async () => {
    await createTask(twoSteps('rt-stale'))
    await db.agentTasks.update('rt-stale', { status: 'running' })
    expect(await pauseStaleTasks('app_restart')).toBe(1)
    expect((await getTask('rt-stale')).status).toBe('paused')
    const resumed = await resumeTask('rt-stale')
    expect(resumed.status).toBe('running')
  })
})

describe('taskRuntime — injected store + events', () => {
  it('delegates to the injected store and fans out supported events', async () => {
    const seen = []
    configureTaskRuntime({ store: taskStore, emit: (name, payload) => seen.push([name, payload]) })

    await createTask(twoSteps('rt-ev'))
    await startTaskStep('rt-ev', 'rt-ev-s1')
    await checkpointStep('rt-ev', 'rt-ev-s1', { status: 'completed', outputSummary: 'one' })
    await startTaskStep('rt-ev', 'rt-ev-s2')
    await checkpointStep('rt-ev', 'rt-ev-s2', { status: 'completed', outputSummary: 'two' })
    await cancelTask('rt-ev').catch(() => {})

    const names = seen.map(([n]) => n)
    expect(names).toContain('task.created')
    expect(names).toContain('task.progress')
    expect(names).toContain('task.completed')
    expect(names).toContain('task.cancelled')
    // Honest passthrough: the underlying store permits the completed ->
    // cancelled transition, and the facade does not invent its own guard
    // (taskStore.js stays authoritative for transition semantics).
    expect((await getTask('rt-ev')).status).toBe('cancelled')
  })

  it('emits failed/cancelled for terminal transitions', async () => {
    const seen = []
    configureTaskRuntime({ store: taskStore, emit: (name, payload) => seen.push([name, payload]) })

    await createTask(twoSteps('rt-ev2'))
    await transitionTask('rt-ev2', 'failed', 'x')
    await createTask(twoSteps('rt-ev3'))
    await cancelTask('rt-ev3')

    const names = seen.map(([n]) => n)
    expect(names).toContain('task.failed')
    expect(names).toContain('task.cancelled')
  })
})

describe('tasks:* sidecar channel', () => {
  it('registers every runtime op without lifecycle logic', async () => {
    const { handlers } = await import('../sidecar/engine/registry.mjs')
    await import('../sidecar/engine/channels/tasks.mjs')
    for (const action of [
      'tasks:create',
      'tasks:get',
      'tasks:get-with-steps',
      'tasks:list',
      'tasks:start',
      'tasks:start-step',
      'tasks:checkpoint',
      'tasks:transition',
      'tasks:pause',
      'tasks:resume',
      'tasks:cancel',
      'tasks:result'
    ]) {
      expect(typeof handlers[action]).toBe('function')
    }
  })

  it('create -> result round-trips through the channel', async () => {
    resetTaskRuntimeConfig()
    const { handlers } = await import('../sidecar/engine/registry.mjs')
    await import('../sidecar/engine/channels/tasks.mjs')

    const created = await handlers['tasks:create']([twoSteps('rt-ch')])
    expect(created.success).toBe(true)
    await handlers['tasks:start-step'](['rt-ch', 'rt-ch-s1'])
    await handlers['tasks:checkpoint'](['rt-ch', 'rt-ch-s1', { status: 'completed', outputSummary: 'satu' }])
    await handlers['tasks:start-step'](['rt-ch', 'rt-ch-s2'])
    await handlers['tasks:checkpoint'](['rt-ch', 'rt-ch-s2', { status: 'completed', outputSummary: 'dua' }])
    const result = await handlers['tasks:result'](['rt-ch'])
    expect(result.success).toBe(true)
    expect(result.data.status).toBe('completed')
    expect(result.data.text).toContain('satu')
  })
})
