import { fetchAI, cleanAndParse } from './core'
import { saveLearnedSkill } from '../db'
import { buildTrajectoryLearningPack, formatTrajectoryLearningPack } from './trajectoryLearning.js'

/**
 * Dedicated Skill Synthesizer (Abelink Meta-Learning Engine)
 * Dieksekusi secara khusus ketika Abelink menyetel `should_learn: true` pada giliran terakhir.
 * Menghasilkan objek skill murni { name, description, content } dan menyimpannya ke Dexie.
 */
export async function synthesizeSkillAndSave({
  userPrompt = '',
  executedTools = [],
  finalAnswer = '',
  thought = '',
  verificationState = 'not_run',
  outcome = 'unknown'
}) {
  try {
    if (!executedTools || executedTools.length === 0) {
      console.log('[Meta-Learner] Skip: Tidak ada tool yang dieksekusi.')
      return null
    }

    const learningPack = buildTrajectoryLearningPack({
      objective: userPrompt,
      executedTools,
      finalAnswer,
      verificationState,
      outcome
    })
    const groundedTrajectory = formatTrajectoryLearningPack(learningPack)

    const promptText = `Berikut adalah jejak kerja Abelink yang harus dipelajari secara hati-hati.

${groundedTrajectory}

[ANALISIS & LOGIKA TERPOTONG]:
${thought ? thought.slice(0, 500) : '(Tidak ada thought)'}

Tugasmu: Rumuskan hanya prosedur yang didukung oleh bukti observasi di atas menjadi berkas SKILL.md yang terstruktur dan dapat digunakan kembali. Jangan mengubah kegagalan atau klaim akhir model menjadi fakta. Jika bukti prosedural tidak cukup, hasilkan prosedur yang sempit dan jujur daripada mengisi kekosongan dengan asumsi.`

    const systemPrompt = `Kamu adalah Abelink Meta-Learning Synthesizer Engine.
Tugasmu adalah menyaring alur kerja teknis yang baru saja BERHASIL diselesaikan oleh Abelink menjadi sebuah PROSEDUR SKILL (.md) yang rapi, modular, dan dapat dieksekusi kembali secara otomatis oleh Abelink di masa depan via 'read-skill'.

# ATURAN PENYUSUNAN SKILL:
1. "name": Buat nama skill dalam format kebab-case (huruf kecil, gunakan strip '-', contoh: "scrape-dynamic-table", "setup-node-env", "fix-shell-permission").
2. "description": Tulis 1-2 kalimat ringkas menjelaskan kegunaan skill ini dan kapan Abelink harus memanggilnya.
3. "content": Tulis isi panduan teknis langkah-demi-langkah dalam format Markdown:
   - Gambaran umum tujuan prosedur.
   - Langkah kerja berurutan (Sebutkan nama tool dan parameter query yang tepat).
   - Validasi hasil / pengujian.
   - Aturan khusus & hal yang harus dihindari (berdasarkan kendala yang sempat dialami).

# FORMAT OUTPUT JSON WAJIB:
{
  "name": "nama-skill-kebab-case",
  "description": "Deskripsi singkat dalam 1-2 kalimat",
  "content": "# Judul Panduan Prosedur\\n\\n## Gambaran Umum\\n...\\n\\n## Langkah-Langkah\\n1. ...\\n2. ...\\n\\n## Aturan & Validasi\\n- ..."
}`

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: promptText }
    ]

    const response = await fetchAI(messages, null, true, {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['name', 'description', 'content']
    })

    const parsed = cleanAndParse(response)
    if (!parsed || !parsed.name || !parsed.content) {
      console.warn('[Meta-Learner] Format respons synthesizer tidak valid:', response)
      return null
    }

    const savedSkill = await saveLearnedSkill({
      name: parsed.name,
      description: parsed.description || 'Prosedur teknis teruji buatan Abelink',
      content: parsed.content,
      // General Agentic Runtime: structural mini-eval cannot establish factual
      // correctness. Only independently verified trajectories may unlock
      // eval-based graduation; all new skills remain trial by default.
      state: 'trial',
      evidenceVerified: verificationState === 'verified'
    })

    if (savedSkill) {
      console.log(`[Meta-Learner] ✨ Keahlian baru berhasil dipelajari & disimpan ke Dexie: /${savedSkill.name}`)
      try {
        const { evaluateAndGraduateSkill } = await import('./skillMiniEval.js')
        await evaluateAndGraduateSkill(savedSkill.id)
      } catch (e) {
        console.warn('[Meta-Learner] Gagal mengevaluasi mini-eval skill baru:', e)
      }
    }

    return savedSkill
  } catch (err) {
    console.error('[Meta-Learner] Error in synthesizeSkillAndSave:', err)
    return null
  }
}
