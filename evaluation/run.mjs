#!/usr/bin/env node
// MarkBench orchestrator — multi-run runner.
//
// Metodologi mengikuti praktik frontier (Terminal-Bench 2.1 / DeepSWE /
// tech blog Kimi K3): tiap task dijalankan beberapa kali (default 3x) dan
// dilaporkan mean + pass-rate, bukan one-shot. Untuk task bertipe sentinel,
// setiap run menyuntikkan token acak ke prompt — respons yang cocok dengan
// `expected` TANPA sentinel dicurigai hafalan (anti-cheat).
//
// Effort (owner requirement — task-level A/B, bukan process-global):
//   - task registry BOLEH mendeklarasikan effort per task (task override).
//   - run.mjs menerima benchmark default: `--effort low|medium|high`.
//   - `--efforts low,medium,high` menjalankan SWEEP: setiap task (tanpa
//     task-level effort) dijalankan pada tiap effort sehingga kurva
//     effort-scaling bisa diamati pada task/lingkungan yang SAMA.
//   - Lingkungan: env MARK_BENCH_EFFORT tetap didukung (default level).
//   - Precedence: task.effort > benchmark override > env > sistem 'low'
//     (resolveTaskEffort di mark-adapter.mjs).
//
// Effort direkam di SETIAP task result & per-run detail, bukan hanya di config
// laporan. Laporan JSON memakai schemaVersion 2.

import fs from 'node:fs'
import { TASKS, runTask } from './terminal-bench.mjs'
import {
  resolveTaskEffort,
  normalizeEffort,
  SYSTEM_DEFAULT_EFFORT,
  EFFORT_VALUES,
  AGENT_ARCH_VERSION,
  BENCH_SCHEMA_VERSION,
} from './mark-adapter.mjs'

const DEFAULT_RUNS = 3
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

const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null)

// ---- Agregasi (pure, diuji smoke CI tanpa LLM) ----
// rawRuns: [{ taskId, effort, passed, durationMs, steps, toolCalls,
//             cheatSuspected, output, sentinel }]
// Kebijakan key: effort SAMA untuk semua run task = key taskId (backward
// compatible). Effort BERCAMPUR (sweep) = key `${taskId}@${effort}` agar
// perbandingan low/medium/high pada task yang sama tetap terbaca per-effort.
export function aggregateRuns(rawRuns, config = {}) {
  const byTask = new Map()
  for (const run of rawRuns) {
    const effort = normalizeEffort(run.effort, SYSTEM_DEFAULT_EFFORT)
    const key = `${run.taskId}`
    if (!byTask.has(key)) byTask.set(key, [])
    byTask.get(key).push({ ...run, effort })
  }

  // Pisahkan key saat satu taskId memiliki effort campur (sweep / A/B).
  const keys = [...byTask.keys()]
  for (const key of keys) {
    const runs = byTask.get(key)
    const efforts = new Set(runs.map((r) => r.effort))
    if (efforts.size > 1) {
      byTask.delete(key)
      for (const effort of efforts) {
        byTask.set(`${key}@${effort}`, runs.filter((r) => r.effort === effort))
      }
    }
  }

  const tasks = {}
  let totalRuns = 0
  let totalPassed = 0
  let cheatTotal = 0
  const durationAll = []
  const stepsAll = []
  const toolCallsAll = []
  const byEffort = {}
  for (const effort of EFFORT_VALUES) byEffort[effort] = { runs: 0, passed: 0 }

  for (const [taskKey, runs] of byTask) {
    const passed = runs.filter((r) => r.passed).length
    const cheats = runs.filter((r) => r.cheatSuspected).length
    const durations = runs.map((r) => r.durationMs || 0)
    const effort = runs[0].effort
    totalRuns += runs.length
    totalPassed += passed
    cheatTotal += cheats
    durationAll.push(...durations)
    stepsAll.push(...runs.map((r) => (Number.isInteger(r.steps) ? r.steps : NaN)))
    toolCallsAll.push(...runs.map((r) => (Number.isInteger(r.toolCalls) ? r.toolCalls : NaN)))
    if (byEffort[effort]) {
      byEffort[effort].runs += runs.length
      byEffort[effort].passed += passed
    }

    tasks[taskKey] = {
      taskId: runs[0].taskId,
      effort, // effort yang dipakai task ini (selalu direkam per task result)
      runs: runs.length,
      passed,
      passRate: +(passed / runs.length).toFixed(3),
      durationMsAvg: avg(durations),
      stepsAvg: avg(runs.filter((r) => Number.isInteger(r.steps)).map((r) => r.steps)),
      toolCallsAvg: avg(
        runs.filter((r) => Number.isInteger(r.toolCalls)).map((r) => r.toolCalls)
      ),
      cheatSuspected: cheats,
      details: runs.map((r, i) => ({
        run: i + 1,
        effort: r.effort, // per-run effort — syarat analisis per-effort
        passed: r.passed,
        durationMs: r.durationMs,
        steps: Number.isInteger(r.steps) ? r.steps : null,
        toolCalls: Number.isInteger(r.toolCalls) ? r.toolCalls : null,
        cheatSuspected: r.cheatSuspected,
        outputPreview: (r.output || '').slice(0, 120),
        sentinel: r.sentinel || null,
      })),
    }
  }

  const stepVals = stepsAll.filter((v) => !Number.isNaN(v))
  const toolVals = toolCallsAll.filter((v) => !Number.isNaN(v))

  const effortsRun = EFFORT_VALUES.filter((e) => byEffort[e].runs > 0)
  const summary = {
    totalTasks: byTask.size,
    totalRuns,
    overallPassRate: totalRuns ? +(totalPassed / totalRuns).toFixed(3) : 0,
    avgDurationMs: durationAll.length ? Math.round(durationAll.reduce((a, b) => a + b, 0) / durationAll.length) : 0,
    avgSteps: stepVals.length ? +(stepVals.reduce((a, b) => a + b, 0) / stepVals.length).toFixed(1) : null,
    avgToolCalls: toolVals.length ? +(toolVals.reduce((a, b) => a + b, 0) / toolVals.length).toFixed(1) : null,
    cheatTotal,
    byEffort: Object.fromEntries(
      effortsRun.map((e) => [
        e,
        {
          runs: byEffort[e].runs,
          passed: byEffort[e].passed,
          passRate: byEffort[e].runs
            ? +(byEffort[e].passed / byEffort[e].runs).toFixed(3)
            : 0,
        },
      ])
    ),
  }

  // Effort-scaling summary: dipakai mengamati kurva low/medium/high EMPIRIS
  // (tanpa asumsi monoton) pada run yang sama. Rata-rata seluruh task per effort.
  const effortScaling = effortsRun.map((e) => {
    const matching = Object.values(tasks).filter((t) => t.effort === e)
    const durs = matching.flatMap((t) => t.details.map((d) => d.durationMs || 0))
    const stps = matching.flatMap((t) => t.details.map((d) => d.steps)).filter((v) => v !== null)
    const tls = matching.flatMap((t) => t.details.map((d) => d.toolCalls)).filter((v) => v !== null)
    return {
      effort: e,
      runs: byEffort[e].runs,
      passed: byEffort[e].passed,
      passRate: byEffort[e].runs ? +(byEffort[e].passed / byEffort[e].runs).toFixed(3) : 0,
      avgDurationMs: durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null,
      avgSteps: stps.length ? +(stps.reduce((a, b) => a + b, 0) / stps.length).toFixed(1) : null,
      avgToolCalls: tls.length ? +(tls.reduce((a, b) => a + b, 0) / tls.length).toFixed(1) : null,
    }
  })

  return {
    schemaVersion: BENCH_SCHEMA_VERSION,
    kind: 'markbench-report',
    generatedAt: new Date().toISOString(),
    config: {
      runs: config.runs,
      model: config.model,
      provider: config.provider,
      effort: config.effort ?? null, // benchmark default
      efforts: config.efforts ?? null, // sweep list bila dipakai
    },
    meta: {
      model: config.model || null,
      provider: config.provider || null,
      architectureVersion: AGENT_ARCH_VERSION,
      benchmarkVersion: BENCH_SCHEMA_VERSION === 2 ? '1.0' : '0.9',
      toolConfig: config.toolConfig || 'core+groups',
      runId: config.runId ?? null,
    },
    tasks,
    summary,
    effortScaling,
  }
}

// ---- Perbandingan antar-commit (regression gate) ----
// prevReport: hasil aggregateRuns sebelumnya (file JSON).
// Mengembalikan daftar task yang pass-rate-nya turun melebihi threshold.
//
// Keys bisa dua bentuk: plain 'taskId' (satu effort seragam) atau
// 'taskId@effort' (sweep/A/B). Baselines biasanya plain; perbandingan WAJIB
// menyeberang kedua bentuk, kalau tidak regresi pada task yang di-sweep
// dilewati diam-diam (gate melaporkan "tidak ada regresi" padahal ada).
const TASK_KEY_EFFORT_RE = /@(low|medium|high)$/
export function compareReports(current, prev, thresholdPct = REGRESSION_THRESHOLD) {
  const prevTasks = prev.tasks || {}
  const regressions = []
  for (const [key, cur] of Object.entries(current.tasks || {})) {
    const m = key.match(TASK_KEY_EFFORT_RE)
    const baseId = m ? key.slice(0, -m[0].length) : key
    const effort = m ? m[1] : cur.effort || null
    // Preferensi lookup: exact key -> key taskId@effort yang disimpulkan ->
    // taskId polos (baseline non-sweep). Urutan ini menjaga dua arah kompatibel.
    const old =
      prevTasks[key] || (effort ? prevTasks[`${baseId}@${effort}`] : null) || prevTasks[baseId]
    if (!old || old.runs === 0) continue
    const delta = (cur.passRate - old.passRate) * 100
    if (delta < -thresholdPct) {
      regressions.push({
        taskId: baseId,
        effort: cur.effort || null,
        before: old.passRate,
        after: cur.passRate,
        deltaPct: +delta.toFixed(1)
      })
    }
  }
  return regressions
}

// ---- CLI ----
function parseArgs(argv) {
  const args = {
    runs: DEFAULT_RUNS,
    tasks: null,
    out: null,
    compare: null,
    threshold: REGRESSION_THRESHOLD,
    model: null,
    provider: null,
    effort: null, // benchmark default (task.effort tetap menang)
    efforts: null, // sweep: [effort...]
    runId: null,
    toolConfig: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--runs') args.runs = parseInt(argv[++i], 10) || DEFAULT_RUNS
    else if (a === '--tasks') args.tasks = argv[++i].split(',')
    else if (a === '--out') args.out = argv[++i]
    else if (a === '--compare') args.compare = argv[++i]
    else if (a === '--regression-threshold') args.threshold = parseFloat(argv[++i])
    else if (a === '--model') args.model = argv[++i]
    else if (a === '--provider') args.provider = argv[++i]
    else if (a === '--effort') args.effort = argv[++i]
    else if (a === '--efforts') {
      args.efforts = (argv[++i] || '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e)
    } else if (a === '--run-id') args.runId = argv[++i]
    else if (a === '--tool-config') args.toolConfig = argv[++i]
  }
  return args
}

function printTable(report) {
  const effortLabel = report.config.efforts?.length
    ? `sweep(${report.config.efforts.join(',')})`
    : report.config.effort || 'default'
  console.log(
    `MarkBench — ${report.config.runs}x run per task (model=${report.meta.model || 'default'}, effort=${effortLabel})`
  )
  console.log('─'.repeat(72))
  for (const t of Object.values(report.tasks)) {
    const cheats = t.cheatSuspected ? `  CHEAT x${t.cheatSuspected}` : ''
    console.log(
      `[${t.passRate === 1 ? 'PASS' : t.passRate > 0 ? 'PARTIAL' : 'FAIL'}] ${t.taskId.padEnd(18)} @${t.effort.padEnd(6)} ${t.passed}/${t.runs}  avg ${t.durationMsAvg}ms  steps ${t.stepsAvg ?? '-'}  tools ${t.toolCallsAvg ?? '-'}${cheats}`
    )
  }
  console.log('─'.repeat(72))
  console.log(
    `Overall pass-rate: ${report.summary.overallPassRate} — ${report.summary.totalRuns} runs, avg ${report.summary.avgDurationMs}ms, cheat=${report.summary.cheatTotal}`
  )
  if (report.effortScaling?.length > 1) {
    console.log('Effort scaling (empiris, tanpa asumsi monoton):')
    for (const e of report.effortScaling) {
      console.log(
        `  effort=${e.effort.padEnd(6)} pass=${e.passRate}  runs=${e.runs}  avg ${e.avgDurationMs}ms  steps ${e.avgSteps ?? '-'}  tools ${e.avgToolCalls ?? '-'}`
      )
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const tasks = args.tasks && args.tasks.length ? args.tasks : Object.keys(TASKS)

  // Benchmark default effort: --effort / --efforts > env MARK_BENCH_EFFORT > 'low'
  const envEffort = normalizeEffort(process.env.MARK_BENCH_EFFORT, null)
  const benchmarkEffort = normalizeEffort(args.effort, envEffort || SYSTEM_DEFAULT_EFFORT)
  let sweepEfforts = null
  if (args.efforts?.length) {
    sweepEfforts = args.efforts
      .map((e) => normalizeEffort(e, null))
      .filter((e) => e !== null)
    if (!sweepEfforts.length) {
      console.error(`--efforts tidak berisi effort valid (low/medium/high): ${args.efforts}`)
      process.exit(1)
    }
  }

  // Jalankan setiap task sebanyak `runs` kali. Sentinel acak dibuat per run
  // (di dalam runTask) untuk task bertipe sentinel — anti-hafalan.
  const rawRuns = []
  for (const taskId of tasks) {
    const taskEffort = TASKS[taskId]?.effort // task-level override
    const perTaskEfforts = sweepEfforts
      ? sweepEfforts
      : // resolveTaskEffort akan memakai taskEffort bila ada; kirim benchmark
        // default agar task tanpa effort memakainya (env sudah masuk di sini).
        [resolveTaskEffort({ taskEffort, benchmarkEffort, envEffort: null })]
    for (const eff of perTaskEfforts) {
      for (let i = 0; i < args.runs; i++) {
        const r = await runTask(taskId, args.model, args.provider, {
          effort: eff,
          // Sweep = eksperimen eksplisit: effort per run menang atas pin task
          // agar task yang SAMA bisa dibandingkan low vs medium vs high.
          overrideTaskEffort: Boolean(sweepEfforts),
        })
        rawRuns.push({
          taskId: r.taskId,
          effort: r.effort,
          passed: r.passed,
          durationMs: r.durationMs,
          steps: r.steps,
          toolCalls: r.toolCalls,
          output: r.output,
          sentinel: r.sentinel || null,
          cheatSuspected: detectCheat(TASKS[taskId], r, r.sentinel),
        })
      }
    }
  }

  const report = aggregateRuns(rawRuns, {
    runs: args.runs,
    model: args.model,
    provider: args.provider,
    effort: sweepEfforts ? null : benchmarkEffort,
    efforts: sweepEfforts,
    runId: args.runId,
    toolConfig: args.toolConfig,
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
