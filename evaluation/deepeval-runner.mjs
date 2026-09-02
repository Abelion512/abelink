// DeepEval integration: wraps Terminal-Bench tasks for trajectory evaluation.
// Uses DeepEval's GEval + TaskCompleteness metrics for secondary evaluation.
// Official verifier remains authoritative.
//
// NOTE: metrics require a DeepEval model/API key at runtime; without one this
// runner degrades gracefully and results still carry the official verdict.

import { runTask } from './terminal-bench.mjs'

export async function runWithDeepEval(taskId, model, provider) {
  const result = await runTask(taskId, model, provider)

  // DeepEval evaluation (secondary: trajectory quality, tool use)
  // If deepeval is not installed or misconfigured, skip gracefully.
  let deepevalResult = null
  try {
    const { evaluate, TestCase, GEval, TaskCompleteness } = await import('deepeval')
    const testCase = new TestCase(
      result.taskId,
      result.prompt,
      result.output,
      undefined,
      result.trajectory
    )
    deepevalResult = await evaluate({
      testCases: [testCase],
      metrics: [
        new GEval({
          name: 'Task Completeness',
          criteria: 'Does the agent response complete the task as specified in the prompt?',
        }),
        new TaskCompleteness(),
      ],
    })
  } catch (e) {
    // DeepEval not available or failed — still return valid result
    deepevalResult = { error: e.message }
  }

  return {
    ...result,
    deepeval: deepevalResult,
  }
}

export async function runAllWithDeepEval(model, provider) {
  const tasks = ['tb-echo-01'] // start with 1 task
  const results = []
  for (const id of tasks) {
    results.push(await runWithDeepEval(id, model, provider))
  }
  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAllWithDeepEval().then((results) => {
    results.forEach((r) => {
      console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.taskId}: ${r.output.slice(0, 80)}`)
      console.log('  DeepEval:', r.deepeval?.error || 'ok')
    })
    const passed = results.filter((r) => r.passed).length
    console.log(`\n${passed}/${results.length} tasks passed`)
  })
}
