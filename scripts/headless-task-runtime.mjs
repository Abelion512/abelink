// Proof 1 of 2 — PURE IMPORT (post-merge audit PR #26).
// taskRuntime.js loads in stock Bun with no browser globals and no IndexedDB
// shim installed. Lifecycle needs storage (see proof 2:
// scripts/headless-task-runtime-lifecycle.mjs).
import assert from 'node:assert/strict'

for (const g of ['window', 'localStorage', 'indexedDB']) {
  if (g in globalThis) {
    console.error(`[headless-import] FAIL: globalThis.${g} must be absent`)
    process.exit(1)
  }
}

const rt = await import('../src/api/engine/taskRuntime.js')
for (const fn of [
  'createTask', 'getTask', 'getTaskWithSteps', 'listTasks', 'startTask',
  'startTaskStep', 'checkpointStep', 'transitionTask', 'pauseTask',
  'resumeTask', 'cancelTask', 'getResult'
]) {
  assert.equal(typeof rt[fn], 'function', `${fn} exported`)
}

// No store available here by design: without IndexedDB and without an
// injected adapter, the default path must fail fast — never fake success.
await assert.rejects(() => rt.createTask({ title: 'x' }), /IndexedDB missing/)

console.log('[headless-import] taskRuntime loads with zero browser globals; default store fails fast without IndexedDB')
