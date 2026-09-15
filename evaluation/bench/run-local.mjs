// One-command local benchmark over the live ABELINK boundary.
// Usage:
//   bun evaluation/bench/run-local.mjs            (live, needs provider)
//   bun evaluation/bench/run-local.mjs --stub      (offline stub smoke)
//   bun evaluation/bench/run-local.mjs --stub --task=io-01-read-modify-write
// Prints summary JSON. Stub mode gates on stub-baseline.json overallPassRate
// (exit 1 on drop >= 5). Live runs NEVER compare against stub-baseline; they
// save to live-baseline.json via --save. Effort via ABELINK_BENCH_EFFORT env.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runBenchmark, runStubBenchmark } from './runner-stub.mjs'
import { createAbelinkBoundary } from './boundary-abelink.mjs'
import { makeImprovementRecord } from './contract.mjs'
import { resolveTaskEffortSync } from '../abelink-adapter.mjs'
import { ARCH_TASKS, findTask } from './tasks.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STUB_BASELINE = path.join(__dirname, 'stub-baseline.json')
const LIVE_BASELINE = path.join(__dirname, 'live-baseline.json')

const args = process.argv.slice(2)
const stub = args.includes('--stub')
const saveLive = args.includes('--save')
const taskArg = args.find((a) => a.startsWith('--task='))
if (taskArg && !findTask(taskArg.slice('--task='.length))) {
  throw new Error(`unknown task ${taskArg}`)
}
const tasks = taskArg ? [findTask(taskArg.slice('--task='.length))] : ARCH_TASKS

const effortResolver = (task) => resolveTaskEffortSync({
  taskEffort: task.effortHint,
  envEffort: process.env.ABELINK_BENCH_EFFORT,
})
const meta = { runId: `local-${Date.now().toString(36)}`, provider: stub ? 'stub' : (process.env.ABELINK_BENCH_PROVIDER || 'live') }

const report = stub
  ? await runStubBenchmark({ tasks, meta, effortResolver })
  : await runBenchmark({ tasks, boundary: createAbelinkBoundary(), meta, effortResolver })

console.log(JSON.stringify(report.summary, null, 2))

if (stub && !taskArg && existsSync(STUB_BASELINE)) {
  const base = JSON.parse(readFileSync(STUB_BASELINE, 'utf8'))
  const delta = report.summary.overallPassRate - (base.overallPassRate ?? 0)
  console.log(`baseline=${base.overallPassRate} current=${report.summary.overallPassRate} delta=${delta.toFixed(3)}`)
  if (delta <= -5) {
    console.error('REGRESSION: stub passRate dropped >= 5 points')
    process.exitCode = 1
  }
}

if (!stub && saveLive) {
  writeFileSync(LIVE_BASELINE, JSON.stringify(report, null, 2))
  console.log(`saved ${LIVE_BASELINE}`)
}

if (!stub) {
  // One improvement record per failing task, for the diagnosis pass.
  for (const [taskId, agg] of Object.entries(report.tasks)) {
    if ((agg.passRate ?? 100) < 100) {
      console.log(JSON.stringify(makeImprovementRecord({
        trialId: meta.runId, taskId, result: { status: 'failed', passed: false },
        evidence: [`passRate=${agg.passRate}`],
      })))
    }
  }
}
