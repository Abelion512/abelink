#!/usr/bin/env bun
// AbelinkBench 1.0 — per-commit gate (keinginan owner #1):
// "verifikasi setiap perubahan kode, sekecil apapun, apakah menstabilkan &
// meningkatkan performa system atau menurunkannya."
//
// Prinsip (tesis owner): model bisa bagus apapun, tapi kalau architecture/
// infra tidak mendukung, hasil tetap jelek. Jadi yang diukur di sini adalah
// KUALITAS ARSITEKTUR — bukan IQ model:
//   1. ABELINK-Eval 6 dimensi (planning, tool orchestration, recovery, memory,
//      safety, efficiency) via verifier deterministik offline.
//   2. Verifier latency (stabilitas pipeline evaluasi itu sendiri).
//   3. Anti-cheat + aggregation contracts ( smoke gate evaluation/smoke.mjs
//      di CI menguji ini lebih jauh; di sini dipakai sebagai guard cepat).
//
// Full-run (dengan LLM nyata via sidecar): `bun run benchmark:run -- --compare ...`
// Gate ini sengaja OFFLINE dan deterministik: bisa jalan di CI tanpa network,
// cocok untuk dipasang di scripts/verify.sh (setiap commit).
//
// Regresi = dimensi gagal, overall < 1.0, ATAU latency naik > LAT_THRESHOLD%
// dengan delta absolut > LAT_ABS_MS (anti-noise, pola perf-gate).

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { runSmoke } from './abelink-eval.mjs'
import { aggregateRuns, compareReports, detectCheat } from './run.mjs'

const BASELINE_PATH = new URL('./bench-baseline.json', import.meta.url).pathname
const LAT_THRESHOLD = 0.25 // 25% lebih lambat = dicurigai regresi
const LAT_ABS_MS = 5 // ...dan minimal +5ms (di bawah itu = noise scheduler)

const saveMode = process.argv.includes('--save')
const compareArgIdx = process.argv.indexOf('--compare')
const comparePath = compareArgIdx > -1 ? process.argv[compareArgIdx + 1] : null

// ---- 1. ABELINK-Eval offline (6 dimensi) ------------------------------------
// Latensi diambil dari MEDIAN 3 run: single-sample wall-clock flake di mesin
// berbeban (observasi 2026-09-11: 5-12ms acak di main murni, nol perubahan
// kode). Dimensi deterministik — pakai run median untuk keduanya.
const latRuns = []
for (let i = 0; i < 3; i++) {
  const t = performance.now()
  const r = runSmoke()
  latRuns.push({ r, ms: performance.now() - t })
}
latRuns.sort((a, b) => a.ms - b.ms)
const smoke = latRuns[1].r
const elapsedMs = latRuns[1].ms

const dims = smoke.report.dimensions
const tested = Object.entries(dims).filter(([, v]) => v !== null)
const failedDims = tested.filter(([, v]) => v < 1).map(([k]) => k)

console.log('[bench-gate] AbelinkBench 1.0 — offline architecture gate')
console.log('─'.repeat(60))
for (const [k, v] of tested) {
  console.log(`  ${k.padEnd(20)} ${v === 1 ? 'PASS' : `FAIL (${v})`}`)
}
console.log('─'.repeat(60))
console.log(
  `  overall=${smoke.report.overall}  dims=${tested.length - failedDims.length}/${tested.length}  verifier=${elapsedMs.toFixed(1)}ms`
)

// ---- 2. Kontrak anti-cheat & agregasi (guard cepat) ----------------------
// Skenario: output hafalan tanpa sentinel harus terdeteksi curang.
const cheatTask = { sentinel: true, expected: 'AbelinkBench is active' }
const cheatDetected = detectCheat(
  cheatTask,
  { output: 'AbelinkBench is active' },
  'S3N-random123'
)
const agg = aggregateRuns([
  { taskId: 'a', passed: true, durationMs: 10, cheatSuspected: false, output: 'ok' },
  { taskId: 'a', passed: false, durationMs: 20, cheatSuspected: false, output: 'no' },
])
const contractsOk = cheatDetected === true && agg.summary.totalRuns === 2
if (!contractsOk) {
  console.log('  [X] Kontrak anti-cheat/agregasi RUSAK — regulator evaluasi tidak bisa dipercaya.')
}

// ---- 3. Regresi latency verifier (dgn noise floor) ------------------------
let latencyRegression = false
const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  : null
if (baseline?.verifierMs) {
  const delta = elapsedMs - baseline.verifierMs
  const rel = delta / baseline.verifierMs
  if (rel > LAT_THRESHOLD && delta > LAT_ABS_MS) {
    latencyRegression = true
    console.log(
      `  [X] verifier latency REGRESI ${baseline.verifierMs.toFixed(1)} -> ${elapsedMs.toFixed(1)}ms (+${(rel * 100).toFixed(0)}%)`
    )
  }
}

// ---- 4. Regression gate vs report tersimpan (pass-rate per task) ---------
let taskRegression = false
if (comparePath) {
  if (!existsSync(comparePath)) {
    console.log(`  [!] --compare ${comparePath}: file tidak ada, dilewati.`)
  } else {
    const prev = JSON.parse(readFileSync(comparePath, 'utf8'))
    // Gunakan dimensi sebagai "tasks" sintetis untuk memakai compareReports.
    const current = {
      tasks: Object.fromEntries(
        tested.map(([k, v]) => [k, { passRate: v, runs: 1 }])
      ),
    }
    const prevReport = {
      tasks: Object.fromEntries(
        Object.entries(prev.dimensions || {}).map(([k, v]) => [
          k,
          { passRate: v, runs: 1 },
        ])
      ),
    }
    const regs = compareReports(current, prevReport, 0)
    if (regs.length > 0) {
      taskRegression = true
      console.log('  [X] REGRESI pass-rate dimensi vs baseline:')
      for (const r of regs) {
        console.log(`      ${r.taskId}: ${r.before} -> ${r.after}`)
      }
    }
  }
}

// ---- 5. Save baseline -----------------------------------------------------
if (saveMode) {
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify(
      {
        savedAt: new Date().toISOString(),
        verifierMs: +elapsedMs.toFixed(2),
        overall: smoke.report.overall,
        dimensions: dims,
      },
      null,
      2
    ) + '\n'
  )
  console.log(`\n[bench-gate] Baseline disimpan: ${BASELINE_PATH}`)
}

// ---- Verdict ---------------------------------------------------------------
const passed =
  smoke.expectedAllPass &&
  smoke.report.overall === 1 &&
  failedDims.length === 0 &&
  contractsOk &&
  !latencyRegression &&
  !taskRegression

if (passed) {
  console.log('\n[bench-gate] LOLOS — arsitektur stabil, tidak ada regresi kualitas.')
} else {
  console.log(
    `\n[bench-gate] GAGAL — ${failedDims.length ? `dimensi gagal: ${failedDims.join(', ')}. ` : ''}${!contractsOk ? 'kontrak evaluasi rusak. ' : ''}Perbaiki sebelum commit.`
  )
  process.exit(1)
}
