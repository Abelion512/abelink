/**
 * Durable Task Handoff Contract Subsystem (Adopted from Hermes & Anthropic Long-Horizon Session Handoff)
 *
 * Menghasilkan dan memvalidasi Handoff Contract JSON yang terstruktur
 * dan deterministik pada setiap sesi durable task (pause/resume/checkpoint/transition).
 *
 * 7 Field Kontrak Wajib:
 * 1. objective (string)
 * 2. done (array of strings)
 * 3. remaining (array of strings)
 * 4. blocked (null atau array of strings)
 * 5. artifacts (array of { path, contentHash?, summary? } atau strings)
 * 6. verified (boolean atau object { isVerified, details })
 * 7. next_action (string)
 */

export const MANDATORY_HANDOFF_FIELDS = [
  'objective',
  'done',
  'remaining',
  'blocked',
  'artifacts',
  'verified',
  'next_action'
]

export const HANDOFF_CONTRACT_VERSION = '1.0'

/**
 * Validasi apakah suatu objek memenuhi kontrak Handoff JSON wajib.
 * @param {any} contract
 * @returns {{ valid: boolean, missing: string[], errors: string[] }}
 */
export function validateHandoffContract(contract) {
  if (!contract || typeof contract !== 'object') {
    return { valid: false, missing: [...MANDATORY_HANDOFF_FIELDS], errors: ['Contract must be a non-null object'] }
  }

  const missing = []
  const errors = []

  for (const field of MANDATORY_HANDOFF_FIELDS) {
    if (!(field in contract)) {
      missing.push(field)
    }
  }

  if (typeof contract.objective !== 'string') {
    errors.push('Field "objective" must be a string')
  }

  if (!Array.isArray(contract.done)) {
    errors.push('Field "done" must be an array of completed deliverables')
  }

  if (!Array.isArray(contract.remaining)) {
    errors.push('Field "remaining" must be an array of remaining steps')
  }

  if (contract.blocked !== null && !Array.isArray(contract.blocked)) {
    errors.push('Field "blocked" must be null or an array of blocking reasons')
  }

  if (!Array.isArray(contract.artifacts)) {
    errors.push('Field "artifacts" must be an array')
  }

  if (typeof contract.verified !== 'boolean' && (typeof contract.verified !== 'object' || contract.verified === null)) {
    errors.push('Field "verified" must be a boolean or an object')
  }

  if (typeof contract.next_action !== 'string') {
    errors.push('Field "next_action" must be a string')
  }

  return {
    valid: missing.length === 0 && errors.length === 0,
    missing,
    errors
  }
}

/**
 * Membangun Handoff Contract JSON dari state taskWithSteps.
 * @param {object} taskWithSteps Task object beserta array steps
 * @param {object} [options] Override opsi tambahan (nextAction, blockedReasons, extraArtifacts)
 * @returns {object} Valid Handoff Contract JSON
 */
export function buildHandoffContract(taskWithSteps, options = {}) {
  const task = taskWithSteps || {}
  const steps = Array.isArray(task.steps) ? task.steps : []

  const objective = String(options.objective || task.objective || task.title || 'Durable Task Execution').trim()

  const done = []
  const remaining = []
  const artifacts = []
  let allDoneVerified = true

  // Urutkan step berdasarkan index
  const sortedSteps = [...steps].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))

  for (const step of sortedSteps) {
    const title = step.title || `Step ${(step.index ?? 0) + 1}`
    const desc = step.outputSummary || step.deliverable || step.objective || ''

    if (step.status === 'completed') {
      done.push(`[${title}] ${desc ? desc.slice(0, 150) : 'Selesai'}`)
      if (step.artifactPath) {
        artifacts.push({
          path: step.artifactPath,
          contentHash: step.contentHash || null,
          summary: step.outputSummary ? step.outputSummary.slice(0, 100) : null
        })
      }
      // Verifikasi step
      if (step.verification && step.verification.state === 'fail') {
        allDoneVerified = false
      }
    } else {
      const criteria = Array.isArray(step.acceptanceCriteria) && step.acceptanceCriteria.length > 0
        ? ` (Kriteria: ${step.acceptanceCriteria.join(', ')})`
        : ''
      remaining.push(`[${title}] ${step.objective || step.deliverable || 'Belum selesai'}${criteria}`)
    }
  }

  // Tambahkan extra artifacts bila disediakan
  if (Array.isArray(options.extraArtifacts)) {
    for (const art of options.extraArtifacts) {
      if (typeof art === 'string') {
        artifacts.push({ path: art, contentHash: null, summary: null })
      } else if (art && typeof art === 'object') {
        artifacts.push(art)
      }
    }
  }

  // Blocked analysis
  let blocked = null
  if (options.blockedReasons && Array.isArray(options.blockedReasons) && options.blockedReasons.length > 0) {
    blocked = [...options.blockedReasons]
  } else if (task.status === 'failed') {
    blocked = [task.error || 'Task gagal dieksekusi']
  } else if (task.status === 'paused' && task.error && task.error !== 'app_restart') {
    blocked = [String(task.error)]
  }

  // Next action determination
  let nextAction = ''
  if (options.nextAction && typeof options.nextAction === 'string') {
    nextAction = options.nextAction.trim()
  } else if (task.status === 'completed' || remaining.length === 0) {
    nextAction = 'Seluruh langkah selesai. Buat ringkasan pencapaian dan laporkan ke pengguna.'
  } else {
    const activeStep = sortedSteps.find((s) => s.id === task.activeStepId) || sortedSteps.find((s) => s.status === 'pending' || s.status === 'needs_revision')
    if (activeStep) {
      nextAction = `Lanjutkan eksekusi [${activeStep.title || 'Langkah Aktif'}]: ${activeStep.objective || activeStep.deliverable || 'Penuhi kriteria deliverable'}`
    } else {
      nextAction = 'Lanjutkan langkah tersisa di task.'
    }
  }

  const contract = {
    version: HANDOFF_CONTRACT_VERSION,
    taskId: task.id || null,
    taskStatus: task.status || 'unknown',
    currentStepIndex: task.currentStepIndex ?? 0,
    activeStepId: task.activeStepId || null,
    timestamp: Date.now(),
    objective,
    done,
    remaining,
    blocked,
    artifacts,
    verified: {
      isVerified: done.length > 0 && allDoneVerified,
      stepsCompletedCount: done.length,
      stepsRemainingCount: remaining.length
    },
    next_action: nextAction
  }

  return contract
}

/**
 * Memformat Handoff Contract JSON menjadi blok markdown siap injeksi untuk prompt ReAct.
 * @param {object} contract
 * @returns {string}
 */
export function formatHandoffContractPrompt(contract) {
  if (!contract || typeof contract !== 'object') return ''

  const lines = [
    '# RESUMED DURABLE TASK HANDOFF CONTRACT (KONTRAK TRANSISI SESI)',
    `Task ID: ${contract.taskId || '-'} (Status: ${contract.taskStatus || '-'})`,
    `Tujuan Utama (Objective): ${contract.objective || '-'}`,
    '',
    '## 1. SUDAH SELESAI (DONE):',
    Array.isArray(contract.done) && contract.done.length > 0
      ? contract.done.map((d) => `- ${d}`).join('\n')
      : '- Belum ada langkah yang selesai.',
    '',
    '## 2. LANGKAH TERSISA (REMAINING):',
    Array.isArray(contract.remaining) && contract.remaining.length > 0
      ? contract.remaining.map((r) => `- ${r}`).join('\n')
      : '- Tidak ada langkah tersisa.',
    '',
    '## 3. HAMBATAN / BLOCKED:',
    Array.isArray(contract.blocked) && contract.blocked.length > 0
      ? contract.blocked.map((b) => `! [BLOCKED] ${b}`).join('\n')
      : '- Tidak ada hambatan aktif.',
    '',
    '## 4. ARTIFACTS YANG DIHASILKAN:',
    Array.isArray(contract.artifacts) && contract.artifacts.length > 0
      ? contract.artifacts.map((a) => typeof a === 'string' ? `- ${a}` : `- ${a.path}${a.summary ? `: ${a.summary}` : ''}`).join('\n')
      : '- Belum ada artefak berkas.',
    '',
    '## 5. STATUS VERIFIKASI (VERIFIED):',
    `- Terverifikasi: ${contract.verified?.isVerified ? 'YA (Lolos bukti eksekusi)' : 'PARSIAL / BELUM PENUH'}`,
    '',
    '## 6. LANGKAH KERJA BERIKUTNYA (NEXT ACTION):',
    `>>> ${contract.next_action || 'Lanjutkan tugas.'}`,
    'PETUNJUK: Kamu me-resume tugas bertahap. FOKUS LANGSUNG pada "NEXT ACTION" di atas tanpa mengulang apa yang sudah ada di daftar "DONE"!'
  ]

  return lines.join('\n')
}
