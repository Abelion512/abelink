// AbelinkBench long-horizon limit tasks: tangga artefak 8 sampai 128.
//
// Tugasnya sengaja panjang dan berurutan: rung N menuntut N berkas yang isinya
// bergantung pada indeksnya (jumlah kumulatif), jadi tidak bisa dijawab dengan
// menyalin berkas sebelumnya atau dengan satu jawaban teks.
//
// Verifier memeriksa DUNIA (isi berkas di workdir + bukti tool di stepLog),
// bukan teks chat. Kontrak verifier sama dengan task CORP:
//   (output, { sentinel, workdir, stepLog }) -> boolean
//
// maxTurns di sini SENGAJA longgar (2x langkah minimum). Yang diukur adalah
// kemampuan agent menyelesaikan rung, bukan plafon harness; perbandingan
// dengan budget langkah produksi dilakukan oleh limit-probe.mjs memakai
// effortBudgets() dari effortSystem.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hasToolEvidence } from './tasks-student-corporate.mjs'
import {
  CHAIN_DIR,
  DONE_FILE,
  LADDER,
  artifactName,
  checkArtifactText,
  checkDoneText,
  minStepsForArtifacts,
  rungId,
} from './limit-ladder.mjs'

// Plafon loop harness. Lihat catatan header: ini bukan angka yang diukur.
const HARNESS_SLACK = 2

export function rungMaxTurns(artifacts) {
  return minStepsForArtifacts(artifacts) * HARNESS_SLACK
}

function readWorldFile(workdir, ...parts) {
  try {
    const p = join(workdir, ...parts)
    return existsSync(p) ? readFileSync(p, 'utf8') : null
  } catch {
    return null
  }
}

/**
 * Verifier rung: semua berkas 001..N ada dengan isi benar, plus berkas penutup.
 * Butuh bukti tool `write-file` di stepLog: teks chat tanpa jejak tool = gagal.
 */
export function verifyChainArtifacts(output, { sentinel, workdir, stepLog } = {}, artifacts) {
  if (!Number.isInteger(artifacts) || artifacts < 1) return false
  if (!sentinel || !workdir) return false
  if (!hasToolEvidence(stepLog, ['write-file'])) return false

  for (let k = 1; k <= artifacts; k++) {
    const text = readWorldFile(workdir, CHAIN_DIR, artifactName(k))
    if (!checkArtifactText(text, sentinel, k)) return false
  }
  return checkDoneText(readWorldFile(workdir, CHAIN_DIR, DONE_FILE), sentinel, artifacts)
}

/** Helper verifikasi dunia untuk smoke test (dipakai tanpa LLM). */
export const VERIFY_LIMIT = { verifyChainArtifacts, checkArtifactText, checkDoneText }

/** Prompt rung N. Satu tempat, dipakai registry dan tes. */
export function buildChainPrompt(artifacts) {
  const dir = `{{WORKDIR}}/${CHAIN_DIR}`
  const example = `{{SENTINEL}} step 003 sum=6`
  return (
    `Buat ${artifacts} berkas berurutan di ${dir}/, bernama 001.txt sampai ${pad3Name(artifacts)}. ` +
    `Berkas NNN.txt wajib memuat tepat satu baris dengan format: {{SENTINEL}} step NNN sum=<total>, ` +
    `di mana NNN adalah nomor berkas 3 digit dan <total> adalah jumlah bilangan 1 sampai NNN. ` +
    `Contoh isi untuk 003.txt: "${example}". ` +
    `Setelah semua berkas selesai, tulis ${dir}/${DONE_FILE} yang memuat baris "count=${artifacts}" ` +
    `beserta kode referensi di atas. Jangan menyentuh berkas lain di luar ${dir}/. ` +
    `Kerjakan berkas satu per satu secara berurutan dan jangan berhenti sebelum berkas terakhir selesai. ` +
    `Jawab singkat setelah selesai.`
  )
}

function pad3Name(n) {
  return `${String(n).padStart(3, '0')}.txt`
}

/** Registry rung, dibangun dari LADDER supaya tangga hanya punya satu sumber. */
export const LIMIT_TASKS = Object.fromEntries(
  LADDER.map((artifacts) => [
    rungId(artifacts),
    {
      prompt: buildChainPrompt(artifacts),
      requiredTools: ['write-file'],
      maxTurns: rungMaxTurns(artifacts),
      sentinel: true,
      // Tanpa pin effort: probe yang menentukan effort lewat run.mjs --effort,
      // supaya satu effort berlaku untuk SEMUA rung (membandingkan rung, bukan
      // mencampur budget).
      verifier: (output, ctx) => verifyChainArtifacts(output, ctx, artifacts),
    },
  ])
)

export function listLimitTasks() {
  return Object.entries(LIMIT_TASKS).map(([id, t]) => ({
    taskId: id,
    artifacts: Number(id.slice(-3)),
    maxTurns: t.maxTurns,
    requiredTools: t.requiredTools,
  }))
}
