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

interface HandoffStepLike {
  id?: number | string
  index?: number
  title?: string
  status?: string
  objective?: string
  deliverable?: string
  outputSummary?: string
  artifactPath?: string
  contentHash?: string | null
  verification?: { state?: string } | null
  acceptanceCriteria?: string[]
}

interface HandoffTaskLike {
  id?: number | string
  objective?: string
  title?: string
  status?: string
  error?: string | null
  steps?: HandoffStepLike[]
  currentStepIndex?: number
  activeStepId?: number | string | null
}

interface HandoffOptions {
  objective?: string
  nextAction?: string
  blockedReasons?: string[]
  extraArtifacts?: Array<string | { path: string; contentHash?: string | null; summary?: string | null }>
}

/**
 * Validasi apakah suatu objek memenuhi kontrak Handoff JSON wajib.
 * @param contract
 */
export function validateHandoffContract(contract: unknown) {
  if (!contract || typeof contract !== 'object') {
    return { valid: false, missing: [...MANDATORY_HANDOFF_FIELDS], errors: ['Contract must be a non-null object'] }
  }

  const c = contract as Record<string, unknown>
  const missing: string[] = []
  const errors: string[] = []

  for (const field of MANDATORY_HANDOFF_FIELDS) {
    if (!(field in c)) {
      missing.push(field)
    }
  }

  if (typeof c.objective !== 'string') {
    errors.push('Field "objective" must be a string')
  }

  if (!Array.isArray(c.done)) {
    errors.push('Field "done" must be an array of completed deliverables')
  }

  if (!Array.isArray(c.remaining)) {
    errors.push('Field "remaining" must be an array of remaining steps')
  }

  if (c.blocked !== null && !Array.isArray(c.blocked)) {
    errors.push('Field "blocked" must be null or an array of blocking reasons')
  }

  if (!Array.isArray(c.artifacts)) {
    errors.push('Field "artifacts" must be an array')
  }

  if (typeof c.verified !== 'boolean' && (typeof c.verified !== 'object' || c.verified === null)) {
    errors.push('Field "verified" must be a boolean or an object')
  }

  if (typeof c.next_action !== 'string') {
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
export function buildHandoffContract(taskWithSteps: HandoffTaskLike | null | undefined, options: HandoffOptions = {}) {
  const task: HandoffTaskLike = taskWithSteps || {}
  const steps: HandoffStepLike[] = Array.isArray(task.steps) ? task.steps : []

  const objective = String(options.objective || task.objective || task.title || 'Durable Task Execution').trim()

  const done: string[] = []
  const remaining: string[] = []
  const artifacts: Array<{ path: string; contentHash?: string | null; summary?: string | null }> = []
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
  let blocked: string[] | null = null
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
export function formatHandoffContractPrompt(contract: unknown) {
  if (!contract || typeof contract !== 'object') return ''
  const ct = contract as {
    taskId?: number | string | null
    taskStatus?: string
    objective?: string
    done?: string[]
    remaining?: string[]
    blocked?: string[] | null
    artifacts?: Array<string | { path: string; summary?: string | null }>
    verified?: { isVerified?: boolean } | boolean
    next_action?: string
  }

  const lines = [
    '# RESUMED DURABLE TASK HANDOFF CONTRACT (KONTRAK TRANSISI SESI)',
    `Task ID: ${ct.taskId || '-'} (Status: ${ct.taskStatus || '-'})`,
    `Tujuan Utama (Objective): ${ct.objective || '-'}`,
    '',
    '## 1. SUDAH SELESAI (DONE):',
    Array.isArray(ct.done) && ct.done.length > 0
      ? ct.done.map((d) => `- ${d}`).join('\n')
      : '- Belum ada langkah yang selesai.',
    '',
    '## 2. LANGKAH TERSISA (REMAINING):',
    Array.isArray(ct.remaining) && ct.remaining.length > 0
      ? ct.remaining.map((r) => `- ${r}`).join('\n')
      : '- Tidak ada langkah tersisa.',
    '',
    '## 3. HAMBATAN / BLOCKED:',
    Array.isArray(ct.blocked) && ct.blocked.length > 0
      ? ct.blocked.map((b) => `! [BLOCKED] ${b}`).join('\n')
      : '- Tidak ada hambatan aktif.',
    '',
    '## 4. ARTIFACTS YANG DIHASILKAN:',
    Array.isArray(ct.artifacts) && ct.artifacts.length > 0
      ? ct.artifacts.map((a) => typeof a === 'string' ? `- ${a}` : `- ${a.path}${a.summary ? `: ${a.summary}` : ''}`).join('\n')
      : '- Belum ada artefak berkas.',
    '',
    '## 5. STATUS VERIFIKASI (VERIFIED):',
    `- Terverifikasi: ${(typeof ct.verified === 'object' && ct.verified ? ct.verified.isVerified : ct.verified) ? 'YA (Lolos bukti eksekusi)' : 'PARSIAL / BELUM PENUH'}`,
    '',
    '## 6. LANGKAH KERJA BERIKUTNYA (NEXT ACTION):',
    `>>> ${ct.next_action || 'Lanjutkan tugas.'}`,
    'PETUNJUK: Kamu me-resume tugas bertahap. FOKUS LANGSUNG pada "NEXT ACTION" di atas tanpa mengulang apa yang sudah ada di daftar "DONE"!'
  ]

  return lines.join('\n')
}
