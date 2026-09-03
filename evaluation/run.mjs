#!/usr/bin/env node
// MarkBench orchestrator — multi-run runner.
//
// Metodologi mengikuti praktik frontier (Terminal-Bench 2.1 / DeepSWE /
// tech blog Kimi K3): tiap task dijalankan beberapa kali (default 3x) dan
// dilaporkan mean + pass-rate, bukan one-shot. Untuk task bertipe sentinel,
// setiap run menyuntikkan token acak ke prompt — respons yang cocok dengan
// `expected` TANPA sentinel dicurigai hafalan (anti-cheat).
//
// Semua angka berasal dari eksekusi nyata (adapter sidecar), bukan simulasi.
// Laporan JSON memakai `schemaVersion` agar format bisa berevolusi.

import fs from 'node:fs'
import { TASKS, listTasks, runTask, mkSentinel } from './terminal-bench.mjs'

const DEFAULT_RUNS = 3
const DEFAULT_MAX_TURNS = 20
const REGRESSION_THRESHOLD = 5 // persen pass-rate; default tanpa --compare = tidak dieksekusi

// ---- Anti-cheat ----
// Task sentinel dianggap curang jika keluarannya persis `expected` (jawaban
// hafalan) padahal sentinel acak per-run tidak muncul di output.
export function detectCheat(task, result, sentinel) {
  if (!task.sentinel || !sentinel) return false
  if (result.output.includes(sentinel)) return false
  if (task.expected && result.output.trim() === task.expected.trim()) return true
  return false
}

// ---- Agregasi (pure, diuji smoke CI tanpa LLM) ----
// rawRuns: [{ taskId, passed, durationMs, cheatSuspected, output, sentinel }]
export function aggregateRuns(rawRuns, config = {}) {
  const byTask = new Map()
  for (const run of rawRuns) {
    if (!byTask.has(run.taskId)) byTask.set(run.taskId, [])
    byTask.get(run.taskId).push(run)
  }

  const tasks = {}
  let totalRuns = 0
  let totalPassed = 0
  let cheatTotal = 0
  let durationSum = 0

  for (const [taskId, runs] of byTask) {
    const passed = runs.filter((r) => r.passed).length
    const cheats = runs.filter((r) => r.cheatSuspected).length
    const durations = runs.map((r) => r.durationMs)
    totalRuns += runs.length
    totalPassed += passed
    cheatTotal += cheats
    durationSum += durations.reduce((a, b) => a + b, 0)

    tasks[taskId] = {
      taskId,
      runs: runs.length,
      passed,
      passRate: +(passed / runs.length).toFixed(3),
      durationMsAvg: Math.round(durations.reduce((a, b) => a + b, 0) / runs.length),
      cheatSuspected: cheats,
      details: runs.map((r, i) => ({
        run: i + 1,
        passed: r.passed,
        durationMs: r.durationMs,
        cheatSuspected: r.cheatSuspected,
        outputPreview: (r.output || '').slice(0, 120),
        sentinel: r.sentinel || null,
      })),
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    config: { runs: config.runs, model: config.model, provider: config.provider },
    tasks,
    summary: {
      totalTasks: byTask.size,
      totalRuns,
      overallPassRate: totalRuns ? +(totalPassed / totalRuns).toFixed(3) : 0,
      avgDurationMs: totalRuns ? Math.round(durationSum / totalRuns) : 0,
      cheatTotal,
    },
  }
}

// ---- Perbandingan antar-commit (regression gate) ----
// prevReport: hasil aggregateRuns sebelumnya (file JSON).
// Mengembalikan daftar task yang pass-rate-nya turun melebihi threshold.
export function compareReports(current, prev, thresholdPct = REGRESSION_THRESHOLD) {
  const regressions = []
  for (const [taskId, cur] of Object.entries(current.tasks || {})) {
    const old = (prev.tasks || {})[taskId]
    if (!old || old.runs === 0) continue
    const delta = (cur.passRate - old.passRate) * 100
    if (delta < -thresholdPct) {
      regressions.push({ taskId, before: old.passRate, after: cur.passRate, deltaPct: +delta.toFixed(1) })
    }
  }
  return regressions
}

// ---- CLI ----
function parseArgs(argv) {
  const args = { runs: DEFAULT_RUNS, tasks: null, out: null, compare: null, threshold: REGRESSION_THRESHOLD, model: null, provider: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--runs') args.runs = parseInt(argv[++i], 10) || DEFAULT_RUNS
    else if (a === '--tasks') args.tasks = argv[++i].split(',')
    else if (a === '--out') args.out = argv[++i]
    else if (a === '--compare') args.compare = argv[++i]
    else if (a === '--regression-threshold') args.threshold = parseFloat(argv[++i])
    else if (a === '--model') args.model = argv[++i]
    else if (a === '--provider') args.provider = argv[++i]
  }
  return args
}

function printTable(report) {
  console.log(`MarkBench — ${report.config.runs}x run per task (model=${report.config.model || 'default'})`)
  console.log('─'.repeat(64))
  for (const t of Object.values(report.tasks)) {
    const cheats = t.cheatSuspected ? `  CHEAT x${t.cheatSuspected}` : ''
    console.log(
      `[${t.passRate === 1 ? 'PASS' : t.passRate > 0 ? 'PARTIAL' : 'FAIL'}] ${t.taskId.padEnd(18)} ${t.passed}/${t.runs}  avg ${t.durationMsAvg}ms${cheats}`
    )
  }
  console.log('─'.repeat(64))
  console.log(
    `Overall pass-rate: ${report.summary.overallPassRate} — ${report.summary.totalRuns} runs, avg ${report.summary.avgDurationMs}ms, cheat=${report.summary.cheatTotal}`
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const tasks = args.tasks && args.tasks.length ? args.tasks : Object.keys(TASKS)

  // Jalankan setiap task sebanyak `runs` kali. Sentinel acak dibuat per run
  // (di dalam runTask) untuk task bertipe sentinel — anti-hafalan.
  const rawRuns = []
  for (const taskId of tasks) {
    for (let i = 0; i < args.runs; i++) {
      const r = await runTask(taskId, args.model, args.provider)
      rawRuns.push({
        taskId: r.taskId,
        passed: r.passed,
        durationMs: r.durationMs,
        output: r.output,
        sentinel: r.sentinel || null,
        cheatSuspected: detectCheat(TASKS[taskId], r, r.sentinel),
      })
    }
  }

  const report = aggregateRuns(rawRuns, {
    runs: args.runs,
    model: args.model,
    provider: args.provider,
  })

  printTable(report)

  if (args.out) {
    fs.writeFileSync(args.out, JSON.stringify(report, null, 2) + '\n')
    console.log(`\nLaporan tersimpan: ${args.out}`)
  }

  if (args.compare) {
    const prev = JSON.parse(fs.readFileSync(args.compare, 'utf8'))
    const regressions = compareReports(report, prev, args.threshold)
    if (regressions.length === 0) {
      console.log(`\nTidak ada regresi vs ${args.compare} (threshold ${args.threshold}%).`)
    } else {
      console.log(`\nREGRESI vs ${args.compare} (threshold ${args.threshold}%):`)
      for (const r of regressions) {
        console.log(`  ${r.taskId}: ${r.before} -> ${r.after} (${r.deltaPct}%)`)
      }
      process.exit(1)
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error('run.mjs gagal:', e.message)
    process.exit(1)
  })
}