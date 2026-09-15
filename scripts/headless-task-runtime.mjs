// Headless proof: full taskRuntime lifecycle under Bun with NO window, React,
// localStorage, or Tauri globals — through the REAL default store
// (taskStore.js -> Dexie, backed here by the same fake-indexeddb shim the
// vitest suite uses). No injected adapter: this exercises the default path
// a future CLI would hit before a permanent headless store lands.
import assert from 'node:assert/strict'

for (const g of ['window', 'localStorage']) {
  if (g in globalThis) {
    console.error(`[headless] FAIL: globalThis.${g} must be absent`)
    process.exit(1)
  }
}

await import('fake-indexeddb/auto')

const rt = await import('../src/api/engine/taskRuntime.js')
const { db } = await import('../src/api/db.js')
await db.agentTasks.clear()
await db.agentTaskSteps.clear()

const events = []
rt.configureTaskRuntime({ emit: (n) => events.push(n) })

const created = await rt.createTask({
  id: 'headless-1',
  title: 'Headless',
  steps: [
    { id: 'a', title: 'A', objective: 'Do A', deliverable: 'A done' },
    { id: 'b', title: 'B', objective: 'Do B', deliverable: 'B done' }
  ]
})
assert.equal(created.id, 'headless-1')
assert.equal((await rt.getTask('headless-1')).status, 'pending')
assert.equal((await rt.listTasks({})).length, 1)

await rt.startTask('headless-1')
await rt.startTaskStep('headless-1', 'headless-1-a')
const stepA = 'Hasil langkah A yang cukup panjang agar lolos validasi konten minimal.'
await rt.checkpointStep('headless-1', 'headless-1-a', {
  status: 'completed',
  outputSummary: stepA
})
await rt.pauseTask('headless-1', 'test')
assert.equal((await rt.getTask('headless-1')).status, 'paused')
await rt.resumeTask('headless-1')
await rt.startTaskStep('headless-1', 'headless-1-b')
const stepB = 'Hasil langkah B yang cukup panjang agar lolos validasi konten minimal.'
await rt.checkpointStep('headless-1', 'headless-1-b', {
  status: 'completed',
  outputSummary: stepB
})

const result = await rt.getResult('headless-1')
assert.equal(result.status, 'completed')
assert.ok(result.text.includes(stepA))

await rt.createTask({ id: 'headless-2', steps: [{ id: 'x', title: 'X' }] })
await rt.cancelTask('headless-2')
assert.equal((await rt.getTask('headless-2')).status, 'cancelled')

await assert.rejects(() => rt.getResult('nope'), /Task tidak ditemukan/)
for (const e of ['task.created', 'task.progress', 'task.completed', 'task.cancelled']) {
  assert.ok(events.includes(e), `missing event ${e}`)
}

await db.agentTasks.clear()
await db.agentTaskSteps.clear()

console.log('[headless] taskRuntime lifecycle via real store: create/start/checkpoint/pause/resume/cancel/getResult OK (no window/React/Tauri)')
