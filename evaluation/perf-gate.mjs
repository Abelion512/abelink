#!/usr/bin/env node
// Perf Gate MARK Linux — pengukur performa nyata per commit.
//
// Requirement owner: "setiap commit harus di real test apakah meningkatkan
// performa atau bahkan menurunkan performa nyata."
//
// Cara kerja:
// 1. Menjalankan workload hot-path deterministik (parser JSON AI, pemulihan
//    field, validator URL SSRF — jalur yang dipanggil setiap giliran agen).
// 2. Membandingkan hasil median terhadap baseline tersimpan
//    (evaluation/perf-baseline.json). Regresi nyata > REGRESSION_THRESHOLD
//    = gagal (exit 1). Peningkatan dicetak + ditandai untuk disimpan.
// 3. `--save` menulis baseline baru (dipakai saat commit memang mempercepat).
//
// Tanpa dependensi eksternal. Dipanggil CI (perf-gate.yml) & pre-push hook.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE_PATH = path.join(ROOT, 'evaluation', 'perf-baseline.json')
const ITERATIONS = 30
const REGRESSION_THRESHOLD = 0.15 // 15% lebih lambat = regresi nyata

// ---------------------------------------------------------------- workloads
// Semua workload IMPORT modul asli (bukan copy) supaya mengukur jalur produksi.

const workloadParserValid = async () => {
  const { cleanAndParse } = await import(path.join(ROOT, 'src/api/ai/core.js'))
  const sample =
    '{"thought":"analisis permintaan user secara mendalam","intermediate_answer":null,"is_done":true,"suggested_mode":"direct","task_status":"done","objective":null,"action":null,"answer":"Jawaban lengkap dengan markdown **bold** dan tautan [contoh](https://example.com)","should_learn":false,"mood":"neutral","active_topic":"Ngobrol","memory":null}'
  let sink = 0
  return () => {
    for (let i = 0; i < 200; i++) {
      const r = cleanAndParse(sample)
      if (r?.answer) sink += r.answer.length
    }
    return sink
  }
}

const workloadParserMalformed = async () => {
  const { cleanAndParse } = await import(path.join(ROOT, 'src/api/ai/core.js'))
  const samples = [
    '```json\n{"thought":"x","answer":"jawaban dalam fence"}\n```',
    '{"answer":"trailing comma","action":null,}',
    '<think>reasoning panjang {dengan brace}</think>{"answer":"setelah think"}',
    '{"thought":"kutip rusak \\u201cbegini\\u201d","answer":"jawab"}'
  ]
  let sink = 0
  return () => {
    for (const s of samples) {
      for (let i = 0; i < 50; i++) {
        const r = cleanAndParse(s)
        if (r?.answer) sink += r.answer.length
      }
    }
    return sink
  }
}

const workloadLenientField = async () => {
  const { extractLenientField } = await import(path.join(ROOT, 'src/api/ai/core.js'))
  const raw =
    '{"thought":"proses","intermediate_answer":"Bentar ya bro, gue cek dulu","answer":"Jawaban akhir yang cukup panjang untuk diukur performa pemulihannya","action":null}'
  let sink = 0
  return () => {
    for (let i = 0; i < 200; i++) {
      const a = extractLenientField(raw, 'answer')
      const b = extractLenientField(raw, 'intermediate_answer')
      if (a) sink += a.length
      if (b) sink += b.length
    }
    return sink
  }
}

const workloadUrlGuard = async () => {
  const { isPublicHttpUrl } = await import(path.join(ROOT, 'src/utils/attachments.js'))
  const urls = [
    'https://example.com/gambar-lengkap-dengan-nama-panjang.png',
    'http://192.168.1.1/admin',
    'http://169.254.169.254/latest/meta-data/',
    'https://[2001:db8::1]/v6.png',
    'http://localhost:1420/src/main.jsx',
    'ftp://files.example.com/pub'
  ]
  let sink = 0
  return () => {
    for (let i = 0; i < 100; i++) {
      for (const u of urls) {
        if (isPublicHttpUrl(u)) sink += 1
      }
    }
    return sink
  }
}

const workloadPromptBudget = async () => {
  // Jalur persona/prompt: gabungan string system prompt besar per giliran.
  const fs = await import('node:fs')
  const src = fs.readFileSync(path.join(ROOT, 'src/api/ai/planning.js'), 'utf8')
  let sink = 0
  return () => {
    for (let i = 0; i < 20; i++) {
      const joined = src.split('# ').join('\n# ').slice(0, 60000)
      sink += joined.length & 0xffff
    }
    return sink
  }
}

const WORKLOADS = {
  'parser-valid-json': workloadParserValid,
  'parser-malformed-json': workloadParserMalformed,
  'lenient-field-recovery': workloadLenientField,
  'url-guard-ssrf': workloadUrlGuard,
  'prompt-assembly-scan': workloadPromptBudget
}

// ---------------------------------------------------------------- runner
const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const runWorkload = async (name, factory) => {
  // Warmup (JIT + module cache) — tidak diukur.
  const warm = await factory()
  for (let i = 0; i < 3; i++) warm()

  const samples = []
  for (let i = 0; i < ITERATIONS; i++) {
    const fn = await factory()
    const t0 = process.hrtime.bigint()
    fn()
    const t1 = process.hrtime.bigint()
    samples.push(Number(t1 - t0) / 1e6) // ms
  }
  return { name, median: median(samples), min: Math.min(...samples), max: Math.max(...samples) }
}

// ---------------------------------------------------------------- main
const saveMode = process.argv.includes('--save')
const results = []
console.log(
  `[perf-gate] Menjalankan ${Object.keys(WORKLOADS).length} workload x ${ITERATIONS} iterasi...`
)
for (const [name, factory] of Object.entries(WORKLOADS)) {
  results.push(await runWorkload(name, factory))
}

console.log('\nWorkload                     median (ms)   min      max')
for (const r of results) {
  console.log(
    `${r.name.padEnd(28)} ${r.median.toFixed(3).padStart(9)}   ${r.min.toFixed(3).padStart(7)}  ${r.max.toFixed(3).padStart(7)}`
  )
}

const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  : { savedAt: null, commit: null, results: {} }

let hasRegression = false
let hasImprovement = false
console.log('\nPerbandingan vs baseline:')
for (const r of results) {
  const prev = baseline.results?.[r.name]?.median
  if (!prev) {
    console.log(`  ${r.name}: baseline belum ada (pertama kali)`)
    continue
  }
  const delta = (r.median - prev) / prev
  const pct = (delta * 100).toFixed(1)
  if (delta > REGRESSION_THRESHOLD) {
    hasRegression = true
    console.log(`  ${r.name}: REGRESI ${pct}% (${prev.toFixed(3)} -> ${r.median.toFixed(3)} ms)`)
  } else if (delta < -REGRESSION_THRESHOLD) {
    hasImprovement = true
    console.log(
      `  ${r.name}: PENINGKATAN ${pct}% (${prev.toFixed(3)} -> ${r.median.toFixed(3)} ms)`
    )
  } else {
    console.log(`  ${r.name}: stabil (${pct}%)`)
  }
}

if (saveMode) {
  const next = {
    savedAt: new Date().toISOString(),
    commit: process.env.GIT_COMMIT || null,
    results: Object.fromEntries(
      results.map((r) => [r.name, { median: r.median, min: r.min, max: r.max }])
    )
  }
  writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n')
  console.log(`\n[perf-gate] Baseline disimpan ke evaluation/perf-baseline.json`)
} else {
  console.log(
    `\n[perf-gate] Tips: jalankan "bun run perf:save" bila commit ini memang mempercepat (untuk memperbarui baseline).`
  )
}

if (hasRegression && !saveMode) {
  console.error('\n[perf-gate] GAGAL: ada regresi performa nyata. Perbaiki sebelum commit/push.')
  process.exit(1)
}
console.log(
  '\n[perf-gate] LOLOS' + (hasImprovement ? ' (dengan peningkatan — pertimbangkan perf:save)' : '')
)
