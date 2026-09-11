// tests/durableResume.test.mjs
// Offline verification test for Durable Task: pause -> restart -> resume consistency.
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/api/db.js'
import {
  createAgentTask,
  getAgentTaskWithSteps,
  startAgentTaskStep,
  checkpointAgentTaskStep,
  transitionAgentTask,
  pauseStaleAgentTasks,
  resumeAgentTask,
  getAgentTaskContentHash
} from '../src/api/taskStore.js'
import { buildDurableStepCheckpoint } from '../src/api/taskExecutor.js'

describe('durable task store — pause -> restart -> resume audit', () => {
  beforeEach(async () => {
    await db.agentTasks.clear()
    await db.agentTaskSteps.clear()
  })

  it('maintains exact step checkpoints across pause, restart, and resume', async () => {
    // 1. Create a 3-step durable task
    const taskInput = {
      id: 'task-test-1',
      title: 'Audit Multi-Step Task',
      objective: 'Selesaikan 3 langkah verifikasi dokumen',
      steps: [
        { id: 'step-1', title: 'Langkah 1: Ekstraksi', objective: 'Ekstrak data', deliverable: 'Data mentah CSV' },
        { id: 'step-2', title: 'Langkah 2: Transformasi', objective: 'Transformasi data', deliverable: 'Data terstruktur JSON' },
        { id: 'step-3', title: 'Langkah 3: Laporan', objective: 'Buat laporan ringkas', deliverable: 'Laporan final MD' }
      ]
    }

    const created = await createAgentTask(taskInput)
    expect(created.status).toBe('pending')
    expect(created.activeStepId).toBe('task-test-1-step-1')

    // 2. Start and complete Step 1
    await startAgentTaskStep(created.id, 'task-test-1-step-1')
    const step1Output = 'Hasil ekstraksi data mentah lengkap: 100 baris CSV ditemukan dan diverifikasi valid.'
    const step1Hash = getAgentTaskContentHash(step1Output)
    const chk1 = buildDurableStepCheckpoint({ deliverable: 'Data mentah CSV' }, step1Output)

    const afterStep1 = await checkpointAgentTaskStep(created.id, 'task-test-1-step-1', chk1)
    expect(afterStep1.steps[0].status).toBe('completed')
    expect(afterStep1.steps[0].contentHash).toBe(step1Hash)
    expect(afterStep1.activeStepId).toBe('task-test-1-step-2')
    expect(afterStep1.currentStepIndex).toBe(1)

    // 3. Start Step 2 (now running)
    const step2Running = await startAgentTaskStep(created.id, 'task-test-1-step-2')
    expect(step2Running.status).toBe('running')
    expect(step2Running.attempts).toBe(1)

    // 4. Pause simulation (e.g. user abort / user pause)
    const paused = await transitionAgentTask(created.id, 'paused', 'user_abort')
    expect(paused.status).toBe('paused')
    // Verify leak fix: running step must sync to pending, not leak 'running'
    const step2AfterPause = paused.steps.find((s) => s.id === 'task-test-1-step-2')
    expect(step2AfterPause.status).toBe('pending')

    // 5. Restart simulation (app closes and reboots)
    // Manually mark task as running if it were killed mid-flight, then run pauseStaleAgentTasks
    await db.agentTasks.update(created.id, { status: 'running' })
    await db.agentTaskSteps.update('task-test-1-step-2', { status: 'running' })
    const pausedCount = await pauseStaleAgentTasks('app_restart')
    expect(pausedCount).toBe(1)

    const staleAudited = await getAgentTaskWithSteps(created.id)
    expect(staleAudited.status).toBe('paused')
    expect(staleAudited.error).toBe('app_restart')
    const step2AfterRestart = staleAudited.steps.find((s) => s.id === 'task-test-1-step-2')
    expect(step2AfterRestart.status).toBe('pending')

    // 6. Resume: resumeAgentTask picks up exact pointer
    const resumed = await resumeAgentTask(created.id)
    expect(resumed.status).toBe('running')
    expect(resumed.activeStepId).toBe('task-test-1-step-2')

    // Step 1 remains intact and strictly completed with identical hash
    expect(resumed.steps[0].status).toBe('completed')
    expect(resumed.steps[0].contentHash).toBe(step1Hash)
    expect(resumed.steps[0].outputSummary).toBe(step1Output)

    // Step 2 is now running
    const step2Resumed = resumed.steps.find((s) => s.id === 'task-test-1-step-2')
    expect(step2Resumed.status).toBe('running')

    // 7. Complete Step 2 and Step 3
    const step2Output = 'Data berhasil ditransformasikan ke format JSON terstruktur dengan validasi skema utuh.'
    const chk2 = buildDurableStepCheckpoint({ deliverable: 'Data terstruktur JSON' }, step2Output)
    const afterStep2 = await checkpointAgentTaskStep(created.id, 'task-test-1-step-2', chk2)
    expect(afterStep2.activeStepId).toBe('task-test-1-step-3')

    const step3Output = 'Laporan final berhasil disusun: analisis ringkas, metrik performa, dan kesimpulan komprehensif.'
    const chk3 = buildDurableStepCheckpoint({ deliverable: 'Laporan final MD' }, step3Output)
    const afterStep3 = await checkpointAgentTaskStep(created.id, 'task-test-1-step-3', chk3)

    // Entire task completed successfully
    expect(afterStep3.status).toBe('completed')
    expect(afterStep3.completedAt).toBeDefined()
    expect(afterStep3.steps.every((s) => s.status === 'completed')).toBe(true)
  })

  it('rejects resume on non-paused / completed tasks gracefully', async () => {
    const task = await createAgentTask({
      id: 'task-test-2',
      title: 'Completed Task',
      steps: [{ id: 's1', title: 'Single Step' }]
    })
    await checkpointAgentTaskStep(task.id, 'task-test-2-s1', { status: 'completed' })
    const finished = await getAgentTaskWithSteps(task.id)
    expect(finished.status).toBe('completed')

    await expect(resumeAgentTask(task.id)).rejects.toThrow('Task tidak bisa di-resume')
  })
})
