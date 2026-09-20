/**
 * Skill Mini Evaluation & Auto-Graduation Subsystem (Adopted from Hermes RSI & DGM AlphaEvolve)
 *
 * Menguji secara deterministik kelayakan empiris skill trial:
 * 1. Struktur SOP (markdown heading, langkah kerja konkret)
 * 2. Keamanan instruksi (tidak mengandung command terlarang/berbahaya)
 * 3. Kepadatan teknis (substansi > 100 karakter, actionable)
 *
 * Memfasilitasi sweep berkala dan kelulusan otomatis dari 'trial' -> 'active'
 * atau pengarsipan ke 'archived' bila kedaluwarsa.
 */

import {
  db,
  graduateTrialSkill
} from '../db.js'

export const DANGEROUS_SKILL_PATTERNS = [
  /rm\s+-rf\s+[/~]/i,
  /mkfs/i,
  /dd\s+if=.*of=\/dev/i,
  /:(){ :|:& };:/,
  /chmod\s+-R\s+777\s+\//i,
  /curl.*\|\s*(ba)?sh/i
]

/**
 * Menjalankan evaluasi deterministik mini terhadap satu konten skill.
 * @param {{ name: string, content: string, description?: string }} skill
 * @returns {{ evalPassed: boolean, score: number, checks: object, reasons: string[] }}
 */
export function runSkillMiniEval(skill) {
  const content = String(skill?.content || '').trim()
  const description = String(skill?.description || '').trim()

  const reasons = []
  const checks = {
    hasSubstance: false,
    hasStructure: false,
    hasActionableSteps: false,
    isSafe: false
  }

  // 1. Cek substansi minimal (panjang konten dan deskripsi)
  if (content.length >= 100 && description.length >= 10) {
    checks.hasSubstance = true
  } else {
    reasons.push('Konten terlalu pendek (<100 karakter) atau deskripsi tidak memadai')
  }

  // 2. Cek struktur format SOP (memiliki heading atau list langkah)
  const hasHeading = /^#{1,4}\s+.+$/m.test(content)
  const hasList = /^(\d+\.|-|\*)\s+.+$/m.test(content)
  if (hasHeading && hasList) {
    checks.hasStructure = true
  } else {
    reasons.push('Kurang memiliki struktur SOP formal (wajib ada heading markdown dan poin daftar langkah)')
  }

  // 3. Cek langkah konkret / actionable (kata kerja tindakan atau referensi tool)
  const actionKeywords = [
    'langkah', 'step', 'baca', 'periksa', 'eksekusi', 'jalankan', 'panggil',
    'tool', 'query', 'file', 'verifikasi', 'cek', 'analisis', 'simpan'
  ]
  const contentLower = content.toLowerCase()
  const matchedKeywords = actionKeywords.filter((kw) => contentLower.includes(kw))
  if (matchedKeywords.length >= 2) {
    checks.hasActionableSteps = true
  } else {
    reasons.push('Tidak memuat cukup kata kunci tindakan prosedural')
  }

  // 4. Cek keamanan (safety check)
  const isDangerous = DANGEROUS_SKILL_PATTERNS.some((pat) => pat.test(content))
  if (!isDangerous) {
    checks.isSafe = true
  } else {
    reasons.push('Mengandung pola perintah shell yang berbahaya')
  }

  const passedChecksCount = Object.values(checks).filter(Boolean).length
  const score = Number((passedChecksCount / 4).toFixed(2))
  const evalPassed = checks.isSafe && checks.hasSubstance && checks.hasStructure && checks.hasActionableSteps

  return {
    evalPassed,
    score,
    checks,
    reasons
  }
}

/**
 * Mengevaluasi dan meluluskan satu skill trial secara otomatis jika lolos kriteria.
 * @param {string} idOrName
 * @returns {Promise<{ skillId: string, previousState: string, newState: string, evalResult: object }>}
 */
export async function evaluateAndGraduateSkill(idOrName) {
  if (!idOrName) return null
  const skill = (await db.learnedSkills.get(idOrName)) ||
    (await db.learnedSkills.where('name').equalsIgnoreCase(idOrName).first())

  if (!skill) return null
  const previousState = skill.state || 'trial'

  // Jika sudah active atau archived, tidak perlu di-eval lagi
  if (previousState !== 'trial') {
    return {
      skillId: skill.id,
      previousState,
      newState: previousState,
      evalResult: null
    }
  }

  const evalResult = runSkillMiniEval(skill)
  const newState = await graduateTrialSkill(skill.id, {
    evalPassed: evalResult.evalPassed,
    now: Date.now()
  })

  if (newState === 'active') {
    await exportSkillToDisk(skill)
  }

  return {
    skillId: skill.id,
    skillName: skill.name,
    previousState,
    newState,
    evalResult
  }
}

/**
 * Ekspor berkas SKILL.md ke disk filesystem lokal (~/.local/share/abelink/skills)
 * Mengadopsi Active Self-Learning loop agar skill teruji bisa dipakai multi-agent.
 * @param {{ name: string, description?: string, content: string }} skill
 * @returns {Promise<boolean>}
 */
export async function exportSkillToDisk(skill) {
  if (!skill || !skill.name) return false
  if (typeof window !== 'undefined' && window.api?.saveSkill) {
    const rawContent = skill.content || ''
    const contentWithFrontmatter = rawContent.startsWith('---')
      ? rawContent
      : `---\nname: ${skill.name}\ndescription: ${skill.description || 'Skill otomatis Abelink'}\n---\n\n${rawContent}`
    try {
      await window.api.saveSkill(skill.name, contentWithFrontmatter)
      return true
    } catch (e) {
      console.warn(`[SkillMiniEval] Gagal ekspor skill /${skill.name} ke disk:`, e)
      return false
    }
  }
  return false
}

/**
 * Melakukan sweep otomatis ke seluruh learned skills bertipe 'trial':
 * - Meluluskan jika use_count > 0 atau evalPassed.
 * - Mengarsipkan jika sudah melampaui trialDays tanpa reuse dan gagal eval.
 * @param {{ autoEval?: boolean, trialDays?: number, now?: number }} [options]
 * @returns {Promise<{ graduated: string[], archived: string[], remainingTrial: string[] }>}
 */
export async function sweepTrialSkills({
  autoEval = true,
  trialDays = 7,
  now = Date.now()
} = {}) {
  const trialSkills = await db.learnedSkills.where('state').equals('trial').toArray()
  const result = {
    graduated: [],
    archived: [],
    remainingTrial: []
  }

  for (const skill of trialSkills) {
    let evalPassed = false
    if (autoEval) {
      const evalRes = runSkillMiniEval(skill)
      evalPassed = evalRes.evalPassed
    }

    const nextState = await graduateTrialSkill(skill.id, {
      evalPassed,
      trialDays,
      now
    })

    if (nextState === 'active') {
      result.graduated.push(skill.name || skill.id)
    } else if (nextState === 'archived') {
      result.archived.push(skill.name || skill.id)
    } else {
      result.remainingTrial.push(skill.name || skill.id)
    }
  }

  return result
}

/**
 * Membangun teks nudge untuk disuntikkan ke prompt jika ada trial skill yang relevan dengan query/tujuan user.
 * @param {Array} learnedSkills
 * @param {string} currentTaskText
 * @returns {string|null}
 */
export function buildTrialSkillNudge(learnedSkills, currentTaskText = '') {
  if (!Array.isArray(learnedSkills) || learnedSkills.length === 0) return null
  const trials = learnedSkills.filter((s) => s && s.state === 'trial')
  if (trials.length === 0) return null

  const taskLower = String(currentTaskText || '').toLowerCase()
  const relevantTrials = taskLower
    ? trials.filter((t) => {
        const name = (t.name || '').toLowerCase()
        const desc = (t.description || '').toLowerCase()
        return taskLower.includes(name) || desc.split(/\s+/).some((word) => word.length > 3 && taskLower.includes(word))
      })
    : trials

  const candidate = relevantTrials[0] || trials[0]
  if (!candidate) return null

  return `[NUDGE SKILL TRIAL]: Ada prosedur keahlian baru "/${candidate.name}" (${candidate.description}). Pertimbangkan untuk memuatnya via "read-skill: ${candidate.name}" guna menguji dan memvalidasi kelulusan skill ini.`
}
