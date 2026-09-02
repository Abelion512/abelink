// Minimal Terminal-Bench-style runner for MarkBench.
//
// Deterministic verifiers live in the task definitions as plain JS predicates
// (NOT fabricated formulas, NOT unexecuted shell strings). The predicate
// receives the agent's full response and returns true/false.

import { runMarkAgent } from './mark-adapter.mjs'

// Terminal-Bench-style tasks (adapted, not copied wholesale).
const TASKS = {
  'tb-echo-01': {
    prompt: 'Please respond with exactly: MarkBench is active',
    verifier: (output) => output.trim() === 'MarkBench is active',
    expected: 'MarkBench is active',
  },
}

export function listTasks() {
  return Object.entries(TASKS).map(([id, t]) => ({ taskId: id, description: t.prompt }))
}

export async function runTask(taskId, model, provider) {
  const task = TASKS[taskId]
  if (!task) throw new Error(`Unknown task: ${taskId}`)

  // --- Real Mark execution ---
  const result = await runMarkAgent({ taskId, prompt: task.prompt }, model, provider)

  // --- Deterministic verifier (explicit predicate, actually executed) ---
  const passed = task.verifier(result.response)

  return {
    taskId,
    prompt: task.prompt,
    output: result.response,
    passed,
    verifier: 'deterministic-predicate',
    trajectory: result.trajectory,
    durationMs: result.trajectory.durationMs,
    tokenUsage: result.tokenUsage,
  }
}

export function runAll(model, provider) {
  return Promise.all(Object.keys(TASKS).map((id) => runTask(id, model, provider)))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAll().then((results) => {
    results.forEach((r) => {
      console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.taskId}: ${r.output.slice(0, 80)}`)
    })
    const passed = results.filter((r) => r.passed).length
    console.log(`\n${passed}/${results.length} tasks passed`)
  })
}
