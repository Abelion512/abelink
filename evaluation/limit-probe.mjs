#!/usr/bin/env node
// limit-probe.mjs - cari batas maksimal panjang task yang masih selesai.
//
// Dua mode:
//   --plan (default)  offline, tanpa LLM. Mencetak tangga rung, budget langkah
//                     kanonis per effort (dari effortSystem), dan rung mana yang
//                     muat budget itu. Aman dijalankan di CI.
//   --run            benar-benar menjalankan bench (butuh provider AI nyata,
//                     memakai token). Rung dijalankan MENAIK dan berhenti pada
//                     kegagalan pertama, jadi biaya terkendali.
//
// Contoh:
//   bun evaluation/limit-probe.mjs --plan
//   bun evaluation/limit-probe.mjs --plan --effort high
//   bun evaluation/limit-probe.mjs --run --effort xhigh --runs 1
//   bun evaluation/limit-probe.mjs --run --effort max --runs 1 --max 96
//
// Verdict yang dilaporkan (lihat buildLimitVerdict di limit-ladder.mjs):
//   sustainedArtifacts : batas KEMAMPUAN (rung terbesar yang lolos)
//   maxWithinBudget    : batas PRODUKSI (rung terbesar yang lolos DAN muat
//                        budget langkah effort yang dipakai)

import fs from 'node:fs'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  LADDER,
  buildLimitVerdict,
  effortBudgets,
  failureNote,
  fitsBudget,
  largestFeasibleRung,
  maxSustainedArtifacts,
  recommendedEffortFor,
  recommendedStepsForArtifacts,
  rungId,
  minStepsForArtifacts,
} from './limit-ladder.mjs'
import { EFFORT_VALUES } from './abelink-adapter.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const RUNNER = join(HERE, 'run.mjs')

/** Timeout per rung: skala dengan jumlah run, dengan langit-langit 1 jam. */
export function defaultRungTimeoutMs(runs = 1, perRunMs = 600000) {
  return Math.min(runs * perRunMs + 120000, 3600000)
}

export function parseProbeArgs(argv) {
  const args = {
    run: false,
    effort: 'xhigh',
    runs: 1,
    start: LADDER[0],
    max: LADDER[LADDER.length - 1],
    arch: null,
    model: null,
    provider: null,
    out: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--run') args.run = true
    else if (a === '--plan') args.run = false
    else if (a === '--effort') args.effort = String(argv[++i] || '').trim().toLowerCase()
    else if (a === '--runs') args.runs = Math.max(1, parseInt(argv[++i], 10) || 1)
    else if (a === '--start') args.start = parseInt(argv[++i], 10) || args.start
    else if (a === '--max') args.max = parseInt(argv[++i], 10) || args.max
    else if (a === '--arch') args.arch = argv[++i]
    else if (a === '--model') args.model = argv[++i]
    else if (a === '--provider') args.provider = argv[++i]
    else if (a === '--out') args.out = argv[++i]
    else if (a === '--timeout-ms') args.timeoutMs = parseInt(argv[++i], 10) || 0
  }
  if (!EFFORT_VALUES.includes(args.effort)) {
    throw new Error(`--effort tidak dikenal: ${args.effort} (pilihan: ${EFFORT_VALUES.join('|')})`)
  }
  return args
}

/** Rung yang akan dijalankan, menaik, dibatasi --start/--max. */
export function selectedRungs({ start, max }, ladder = LADDER) {
  return ladder.filter((n) => n >= start && n <= max).sort((a, b) => a - b)
}

/** Baris tabel rencana (offline): tiap rung + prasyarat + rekomendasi effort. */
export function planRows(budgets = effortBudgets(), { start, max } = {}, ladder = LADDER) {
  return selectedRungs({ start, max }, ladder).map((n) => ({
    artifacts: n,
    taskId: rungId(n),
    minSteps: minStepsForArtifacts(n),
    recommendedSteps: recommendedStepsForArtifacts(n),
    recommendedEffort: recommendedEffortFor(n, budgets),
    fits: Object.fromEntries(
      EFFORT_VALUES.map((e) => [e, fitsBudget(n, e, budgets)])
    ),
  }))
}

function printHeaders() {
  console.log('AbelinkBench limit probe - tangga panjang task (artefak berurutan)')
  console.log('='.repeat(78))
}

function printPlan(args, budgets) {
  printHeaders()
  console.log(`Mode: PLAN (offline, tanpa LLM). Target effort: ${args.effort}`)
  const budget = budgets[args.effort]
  console.log(
    `Budget langkah effort ${args.effort}: ${budget ?? 'unknown'} (effortSystem.execution_step_budget)`
  )
  console.log('-'.repeat(78))
  console.log('effort      budget   rung terbesar yang masih mungkin (prasyarat fisik)')
  for (const e of EFFORT_VALUES) {
    const b = budgets[e]
    const largest = largestFeasibleRung(e, budgets)
    console.log(`${e.padEnd(11)} ${String(b ?? '-').padEnd(8)} ${largest ?? '-'}`)
  }
  console.log('-'.repeat(78))
  console.log('rung  task                 min  rec  effort rekomendasi')
  for (const r of planRows(budgets, args)) {
    console.log(
      `${String(r.artifacts).padEnd(5)} ${r.taskId.padEnd(20)} ${String(r.minSteps).padEnd(4)} ${String(r.recommendedSteps).padEnd(4)} ${r.recommendedEffort ?? '(di atas ultra)'}`
    )
  }
  console.log('-'.repeat(78))
  const runnable = planRows(budgets, args).filter((r) => r.fits[args.effort])
  console.log(
    `Pada effort ${args.effort}, rung yang masuk akal dijalankan: ${runnable.map((r) => r.artifacts).join(', ') || 'tidak ada'}`
  )
  console.log('Jalankan dengan --run untuk mengukur sungguhan (butuh provider AI dan token).')
}

function buildRunnerArgs(args, artifacts, outPath) {
  const argv = [
    RUNNER,
    '--tasks',
    rungId(artifacts),
    '--runs',
    String(args.runs),
    '--effort',
    args.effort,
    '--out',
    outPath,
    '--run-id',
    `limit-${artifacts}-${Date.now().toString(36)}`,
  ]
  if (args.arch) argv.push('--arch', args.arch)
  if (args.model) argv.push('--model', args.model)
  if (args.provider) argv.push('--provider', args.provider)
  return argv
}

/** Ambil ringkasan satu rung dari laporan run.mjs (pure; dipakai tes). */
export function summarizeRung(report, artifacts, { timedOut = false, runs = 1 } = {}) {
  const entry =
    report?.tasks?.[rungId(artifacts)] ||
    // Sweep/A-B memberi key taskId@effort; ambil yang pertama bila itu yang ada.
    Object.entries(report?.tasks || {}).find(([k]) => k.startsWith(rungId(artifacts)))?.[1] ||
    null
  if (!entry) {
    return {
      artifacts,
      passed: false,
      runs: 0,
      executedRuns: 0,
      passRate: 0,
      stepsAvg: null,
      durationMsAvg: null,
      timedOut,
    }
  }
  const executedRuns = Number.isFinite(entry.runs) ? entry.runs : runs
  return {
    artifacts,
    passed: entry.passRate === 1,
    runs: executedRuns,
    executedRuns,
    passRate: entry.passRate,
    stepsAvg: Number.isFinite(entry.stepsAvg) ? entry.stepsAvg : null,
    durationMsAvg: Number.isFinite(entry.durationMsAvg) ? entry.durationMsAvg : null,
    timedOut,
  }
}

function runRung(args, artifacts, rungTimeoutMs) {
  const tmpReport = join(ROOT, 'reports', `_limit-tmp-${artifacts}.json`)
  mkdirSync(dirname(tmpReport), { recursive: true })
  try {
    fs.rmSync(tmpReport, { force: true })
  } catch {
    /* biarkan: laporan lama akan ditimpa */
  }
  const res = spawnSync(process.execPath, buildRunnerArgs(args, artifacts, tmpReport), {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: rungTimeoutMs,
  })
  const timedOut = res.error?.code === 'ETIMEDOUT' || res.signal === 'SIGTERM'
  let report = null
  try {
    if (fs.existsSync(tmpReport)) report = JSON.parse(fs.readFileSync(tmpReport, 'utf8'))
  } catch {
    report = null
  }
  if (report) {
    try {
      fs.rmSync(tmpReport, { force: true })
    } catch {
      /* tmp file bukan artefak; gagal hapus tidak menggagalkan probe */
    }
  }
  if (!report) {
    console.error(
      `    runner tidak menghasilkan laporan${timedOut ? ' (timeout rung)' : ''}: ${(res.stderr || res.stdout || '').trim().split('\n').slice(-1)[0] || 'tanpa output'}`
    )
  }
  return summarizeRung(report, artifacts, { timedOut, runs: args.runs })
}

function printVerdict(verdict) {
  console.log('-'.repeat(78))
  console.log('rung  artefak  hasil     passRate  steps  durasi(ms)')
  for (const r of verdict.results) {
    const label = r.passed ? 'PASS' : r.runs === 0 ? 'NORUN' : 'FAIL'
    console.log(
      `${String(r.artifacts).padEnd(5)} ${String(r.artifacts).padEnd(8)} ${label.padEnd(9)} ${String(r.passRate ?? '-').padEnd(9)} ${String(r.stepsAvg ?? '-').padEnd(6)} ${r.durationMsAvg ?? '-'}`
    )
  }
  console.log('-'.repeat(78))
  console.log(`Effort: ${verdict.effort} (budget langkah ${verdict.stepBudget ?? 'unknown'})`)
  console.log(`Batas kemampuan (rung terbesar yang lolos): ${verdict.sustainedArtifacts ?? 'tidak ada'}`)
  console.log(`Batas produksi (lolos DAN muat budget):     ${verdict.maxWithinBudget ?? 'tidak ada'}`)
  if (verdict.firstFailureAt != null) {
    console.log(`Pecah pertama di rung ${verdict.firstFailureAt}: ${verdict.failureMode}`)
    console.log(`  ${verdict.failureNote}`)
  }
}

async function main() {
  let args
  try {
    args = parseProbeArgs(process.argv.slice(2))
  } catch (e) {
    console.error(e.message)
    process.exit(2)
  }
  const budgets = effortBudgets()

  if (!args.run) {
    printPlan(args, budgets)
    return
  }

  printHeaders()
  const rungTimeoutMs = args.timeoutMs || defaultRungTimeoutMs(args.runs)
  const rungs = selectedRungs(args)
  console.log(
    `Mode: RUN (${args.runs}x per rung, effort=${args.effort}, timeout/rung=${Math.round(rungTimeoutMs / 1000)}s)`
  )
  console.log(`Rung: ${rungs.join(', ')}`)
  console.log('-'.repeat(78))

  const results = []
  for (const artifacts of rungs) {
    process.stdout.write(`rung ${String(artifacts).padEnd(4)} ... `)
    const r = runRung(args, artifacts, rungTimeoutMs)
    results.push(r)
    console.log(
      `${r.passed ? 'PASS' : 'FAIL'} (passRate=${r.passRate ?? '-'}, steps=${r.stepsAvg ?? '-'}, ${r.durationMsAvg ?? '-'}ms)`
    )
    // Berhenti pada kegagalan pertama: rung di atasnya tidak lagi bermakna,
    // dan biaya token tetap terkendali.
    if (!r.passed) break
  }

  const verdict = buildLimitVerdict({
    arch: args.arch || 'basic',
    effort: args.effort,
    runs: args.runs,
    results,
    budgets,
  })
  printVerdict(verdict)

  const out = args.out || join(ROOT, 'reports', `limit-${Date.now().toString(36)}.json`)
  mkdirSync(dirname(out), { recursive: true })
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        ...verdict,
        generatedAt: new Date().toISOString(),
        note:
          'sustainedArtifacts = batas kemampuan (rung terbesar yang lolos); maxWithinBudget = batas produksi pada effort ini',
      },
      null,
      2
    ) + '\n'
  )
  console.log(`\nLaporan tersimpan: ${out}`)

  // Gate lunak: kalau rung terkecil pun tidak selesai, ada yang benar-benar rusak.
  if (maxSustainedArtifacts(results) === null) {
    console.error(`\nTidak ada rung yang lolos. ${failureNote(verdict.failureMode)}`)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error('limit-probe gagal:', e.message)
    process.exit(1)
  })
}
