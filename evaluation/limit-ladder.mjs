// limit-ladder.mjs - inti pencari batas panjang-task (pure, tanpa I/O).
//
// Pertanyaan yang dijawab modul ini: "seberapa besar task yang masih bisa
// diselesaikan Abelink sebelum pecah, dan pada rung berapa ia pecah?"
//
// Model pengukuran: TANGGA, bukan satu angka. Setiap rung meminta N artefak
// berurutan (chain) yang isinya saling bergantung (jumlah kumulatif), jadi
// rung N tidak bisa dijawab dengan menyalin rung N-1, dan verifier-nya
// memeriksa DUNIA (isi berkas di workdir), bukan teks jawaban.
//
// Rung dijalankan menaik. Rung terkecil yang gagal menghentikan tangga, dan
// probe melaporkan: artefak maksimum yang bertahan, penyebab pecahnya, serta
// apakah rung terakhir yang lolos masih muat budget langkah produksi
// (execution_step_budget dari effortSystem, satu sumber angka yang sama
// dengan yang dipakai useAbelinkPlan).
//
// Modul ini SENGAJA tanpa I/O supaya bisa dites offline di CI.

import { EffortLevel, EFFORT_VALUES, resolve_effort } from '../src/api/ai/effortSystem.js'

// --------------------------------------------------------------- kontrak dunia
export const CHAIN_DIR = 'chain'
export const DONE_FILE = 'DONE.txt'
export const RUNG_PREFIX = 'limit-chain-'

// Tangga default. 8/16 sejajar budget medium/high lama; sejak budget 24/48,
// rung 32 pun muat di high — lalu 64/96/128 mencari plafon di xhigh/max/ultra.
export const LADDER = Object.freeze([8, 16, 32, 64, 96, 128])

// Langkah minimum: N tulis berkas + 1 berkas penutup + 1 langkah jawaban akhir.
// Angka ini prasyarat FISIK, bukan estimasi gaya: di bawah ini mustahil selesai.
export const ARTIFACT_MARGIN = 2

// Agent nyata memakai langkah lebih banyak dari minimum (baca ulang, retry,
// verifikasi). 1.5 dipakai sebagai margin rekomendasi, bukan klaim efisiensi.
export const SAFETY_FACTOR = 1.5

export const pad3 = (k) => String(k).padStart(3, '0')

/** Nama berkas artefak ke-k: 1 -> "001.txt". */
export const artifactName = (k) => `${pad3(k)}.txt`

/** Jumlah 1..k. Isi artefak ke-k, jadi tiap rung berbeda dan tidak bisa disalin. */
export const chainSum = (k) => (k * (k + 1)) / 2

/** Id task untuk rung N: 32 -> "limit-chain-032". */
export const rungId = (n) => `${RUNG_PREFIX}${pad3(n)}`

/** Kebalikan rungId; null bila bukan id rung. */
export function artifactsFromRungId(id) {
  const m = new RegExp(`^${RUNG_PREFIX}(\\d{3,4})$`).exec(String(id || ''))
  return m ? Number(m[1]) : null
}

/** Baris kanonik di artefak ke-k (juga dipakai contoh di prompt). */
export const expectedArtifactLine = (sentinel, k) => `${sentinel} step ${pad3(k)} sum=${chainSum(k)}`

/** Baris kanonik di berkas penutup. */
export const expectedDoneLine = (n) => `count=${n}`

// ------------------------------------------------------- budget langkah kanonis
/**
 * Budget langkah per effort, dibaca dari effortSystem (bukan tabel hardcode di
 * sini) supaya angka tidak pernah drift dari yang dipakai useAbelinkPlan.
 * @returns {Record<string, number|null>}
 */
export function effortBudgets() {
  const out = {}
  for (const level of EFFORT_VALUES) {
    const key = String(level).toUpperCase()
    const enumEntry = EffortLevel[key]
    if (!enumEntry) {
      out[level] = null
      continue
    }
    try {
      const budget = resolve_effort(enumEntry).policy.execution_step_budget
      out[level] = Number.isFinite(budget) ? budget : null
    } catch {
      out[level] = null
    }
  }
  return out
}

export function minStepsForArtifacts(n) {
  return Number(n) + ARTIFACT_MARGIN
}

export function recommendedStepsForArtifacts(n) {
  return Math.ceil(minStepsForArtifacts(n) * SAFETY_FACTOR)
}

/** Effort terendah yang budget-nya memuat rekomendasi; null bila tak ada yang muat. */
export function recommendedEffortFor(n, budgets = effortBudgets()) {
  const need = recommendedStepsForArtifacts(n)
  for (const level of EFFORT_VALUES) {
    const b = budgets[level]
    if (Number.isFinite(b) && b >= need) return level
  }
  return null
}

/** Apakah rung N mungkin selesai sama sekali pada effort ini (prasyarat fisik). */
export function fitsBudget(n, effort, budgets = effortBudgets()) {
  const b = budgets[effort]
  return Number.isFinite(b) && b >= minStepsForArtifacts(n)
}

/** Rung terbesar yang masih mungkin (prasyarat fisik) pada effort ini; null bila tak ada. */
export function largestFeasibleRung(effort, budgets = effortBudgets(), ladder = LADDER) {
  let best = null
  for (const n of ladder) {
    if (fitsBudget(n, effort, budgets)) best = n
  }
  return best
}

// ------------------------------------------------------ predikat isi artefak
/** Cek isi artefak ke-k terhadap kontrak (dipakai verifier task DAN tes). */
export function checkArtifactText(text, sentinel, k) {
  if (typeof text !== 'string' || !text) return false
  if (!sentinel || !text.includes(sentinel)) return false
  if (!text.includes(`step ${pad3(k)}`)) return false
  if (!text.includes(`sum=${chainSum(k)}`)) return false
  return true
}

/** Cek berkas penutup terhadap kontrak. */
export function checkDoneText(text, sentinel, n) {
  if (typeof text !== 'string' || !text) return false
  if (!sentinel || !text.includes(sentinel)) return false
  return text.includes(expectedDoneLine(n))
}

// -------------------------------------------------------------- verdict probe
/**
 * Artefak maksimum yang BERTAHAN: rung terbesar yang lolos sebelum kegagalan
 * pertama. Kegagalan di rung kecil menghentikan tangga, jadi rung besar di
 * belakangnya tidak boleh menaikkan angka ini.
 * @param {Array<{artifacts:number, passed:boolean}>} results
 */
export function maxSustainedArtifacts(results) {
  const sorted = [...(results || [])]
    .filter((r) => Number.isFinite(r?.artifacts))
    .sort((a, b) => a.artifacts - b.artifacts)
  let best = null
  for (const r of sorted) {
    if (!r.passed) break
    best = r.artifacts
  }
  return best
}

/**
 * Klasifikasi penyebab pecah, dari data yang benar-benar ada di laporan run.
 * Sengaja tidak menebak: tanpa data yang cukup -> 'unknown'.
 */
export function classifyLimitFailure({
  passed = false,
  runs = 0,
  stepsAvg = null,
  stepBudget = null,
  timedOut = false,
} = {}) {
  if (passed) return 'none'
  if (runs === 0) return 'not-run'
  if (timedOut) return 'timeout'
  if (!Number.isFinite(stepsAvg) || stepsAvg === 0) return 'no-progress'
  if (Number.isFinite(stepBudget) && stepsAvg >= stepBudget) return 'budget-exhausted'
  return 'incorrect-artifact'
}

/** Penjelasan singkat penyebab pecah, dipakai CLI dan laporan. */
const FAILURE_NOTE = Object.freeze({
  none: 'tidak ada kegagalan pada rung yang dijalankan',
  'not-run': 'rung tidak sempat dijalankan (runner gagal sebelum agent jalan)',
  timeout: 'rung melewati batas waktu probe',
  'no-progress': 'agent tidak memakai tool sama sekali (steps 0)',
  'budget-exhausted': 'langkah habis mentok di plafon budget: batasnya budget, bukan kemampuan',
  'incorrect-artifact': 'langkah cukup tapi artefak tidak lengkap/salah: batasnya kebenaran',
  unknown: 'data tidak cukup untuk menyimpulkan penyebab',
})

export function failureNote(mode) {
  return FAILURE_NOTE[mode] || FAILURE_NOTE.unknown
}

/**
 * Verdict akhir probe.
 *
 * sustainedArtifacts : rung terbesar yang lolos (batas KEMAMPUAN).
 * maxWithinBudget    : rung terbesar yang lolos DAN muat budget langkah effort
 *                      ini (batas PRODUKSI; ini angka yang dipakai user).
 */
export function buildLimitVerdict({
  arch = 'basic',
  effort = null,
  runs = 1,
  results = [],
  budgets = effortBudgets(),
} = {}) {
  const stepBudget = Number.isFinite(budgets?.[effort]) ? budgets[effort] : null
  const rows = (results || []).map((r) => ({ ...r }))
  const sustainedArtifacts = maxSustainedArtifacts(rows)
  const failures = rows.filter((r) => !r.passed)
  const firstFailure = failures.length
    ? failures.reduce((a, b) => (a.artifacts <= b.artifacts ? a : b))
    : null

  const failureMode = firstFailure
    ? classifyLimitFailure({
        passed: false,
        runs: firstFailure.runs,
        stepsAvg: firstFailure.stepsAvg,
        stepBudget,
        timedOut: firstFailure.timedOut,
      })
    : 'none'

  const withinBudget = rows
    .filter(
      (r) =>
        r.passed &&
        Number.isFinite(r.stepsAvg) &&
        Number.isFinite(stepBudget) &&
        r.stepsAvg <= stepBudget
    )
    .map((r) => r.artifacts)

  return {
    schemaVersion: 1,
    kind: 'abelinkbench-limit-report',
    arch,
    effort,
    runs,
    stepBudget,
    ladder: [...LADDER],
    sustainedArtifacts,
    maxWithinBudget: withinBudget.length ? Math.max(...withinBudget) : null,
    firstFailureAt: firstFailure ? firstFailure.artifacts : null,
    failureMode,
    failureNote: failureNote(failureMode),
    results: rows,
  }
}
