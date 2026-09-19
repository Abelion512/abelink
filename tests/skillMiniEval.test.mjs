import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db, saveLearnedSkill } from '../src/api/db.js'
import {
  runSkillMiniEval,
  evaluateAndGraduateSkill,
  sweepTrialSkills,
  buildTrialSkillNudge
} from '../src/api/ai/skillMiniEval.js'

describe('runSkillMiniEval (Mini Evaluation Engine)', () => {
  it('skill dengan SOP lengkap dan aman lulus evaluasi', () => {
    const goodSkill = {
      name: 'format-json',
      description: 'Memformat dan merapikan string JSON yang rusak',
      content: `
# PROSEDUR MEMFORMAT JSON
Berikut adalah langkah-langkah kerja:
1. Baca input string JSON yang diterima.
2. Jalankan parse sintaksis untuk memeriksa error koma atau kutip.
3. Panggil tool perbaikan dan verifikasi hasil akhirnya.
`
    }

    const res = runSkillMiniEval(goodSkill)
    expect(res.evalPassed).toBe(true)
    expect(res.score).toBe(1)
    expect(res.checks.hasSubstance).toBe(true)
    expect(res.checks.hasStructure).toBe(true)
    expect(res.checks.hasActionableSteps).toBe(true)
    expect(res.checks.isSafe).toBe(true)
  })

  it('skill terlalu pendek gagal evaluasi', () => {
    const shortSkill = {
      name: 'short',
      description: 'pendek',
      content: '# Judul\n1. Selesai.'
    }

    const res = runSkillMiniEval(shortSkill)
    expect(res.evalPassed).toBe(false)
    expect(res.checks.hasSubstance).toBe(false)
    expect(res.reasons.some((r) => r.includes('terlalu pendek'))).toBe(true)
  })

  it('skill tanpa struktur formal (heading/list) gagal evaluasi', () => {
    const rawSkill = {
      name: 'unstructured',
      description: 'Deskripsi yang cukup panjang untuk lolos',
      content: 'Ini adalah teks prosedur biasa yang sangat panjang dan memuat kata kunci langkah eksekusi tool verifikasi baca file tapi tidak memiliki heading maupun list poin format markdown sama sekali.'
    }

    const res = runSkillMiniEval(rawSkill)
    expect(res.evalPassed).toBe(false)
    expect(res.checks.hasStructure).toBe(false)
  })

  it('skill dengan perintah berbahaya ditolak keras', () => {
    const dangerousSkill = {
      name: 'danger',
      description: 'Prosedur pembersihan paksa sistem',
      content: `
# PROSEDUR CLEANUP
Langkah eksekusi:
1. Jalankan perintah terminal: rm -rf /
2. Verifikasi penghapusan.
`
    }

    const res = runSkillMiniEval(dangerousSkill)
    expect(res.evalPassed).toBe(false)
    expect(res.checks.isSafe).toBe(false)
    expect(res.reasons.some((r) => r.includes('berbahaya'))).toBe(true)
  })
})

describe('evaluateAndGraduateSkill & sweepTrialSkills', () => {
  beforeEach(async () => {
    await db.learnedSkills.clear()
  })

  it('evaluateAndGraduateSkill otomatis meluluskan skill trial yang lolos', async () => {
    const skill = await saveLearnedSkill({
      name: 'auto-grad',
      description: 'Prosedur pengujian otomatis berkala',
      content: `
# PROSEDUR TESTING OTOMATIS
Langkah-langkah pengujian:
1. Baca berkas konfigurasi pengujian via tool.
2. Jalankan eksekusi test runner dan catat log.
3. Periksa kriteria lulus dan verifikasi artefak.
`,
      state: 'trial'
    })

    const res = await evaluateAndGraduateSkill(skill.id)
    expect(res.newState).toBe('active')
    expect(res.evalResult.evalPassed).toBe(true)

    const updated = await db.learnedSkills.get(skill.id)
    expect(updated.state).toBe('active')
  })

  it('sweepTrialSkills meluluskan trial yang valid dan mengarsipkan yang kedaluwarsa', async () => {
    // 1. Skill valid (harus lulus)
    await saveLearnedSkill({
      name: 'valid-trial',
      description: 'Prosedur valid untuk dievaluasi',
      content: `
# PANDUAN KERJA
Langkah kerja:
1. Baca data masukan dari file.
2. Eksekusi proses analisis.
3. Verifikasi konsistensi output.
`,
      state: 'trial'
    })

    // 2. Skill tua yang gagal eval (harus diarsipkan)
    const oldFailed = await saveLearnedSkill({
      name: 'old-trial',
      description: 'pendek',
      content: 'pendek',
      state: 'trial'
    })
    await db.learnedSkills.put({
      ...oldFailed,
      createdAt: Date.now() - 15 * 24 * 3600 * 1000
    })

    // 3. Skill muda yang gagal eval (tetap trial)
    await saveLearnedSkill({
      name: 'young-trial',
      description: 'pendek',
      content: 'pendek',
      state: 'trial'
    })

    const sweepRes = await sweepTrialSkills({ autoEval: true, trialDays: 7 })
    expect(sweepRes.graduated).toContain('valid-trial')
    expect(sweepRes.archived).toContain('old-trial')
    expect(sweepRes.remainingTrial).toContain('young-trial')

    expect((await db.learnedSkills.where('name').equals('valid-trial').first()).state).toBe('active')
    expect((await db.learnedSkills.where('name').equals('old-trial').first()).state).toBe('archived')
    expect((await db.learnedSkills.where('name').equals('young-trial').first()).state).toBe('trial')
  })
})

describe('buildTrialSkillNudge', () => {
  it('menghasilkan teks nudge ketika ada trial skill yang relevan', () => {
    const list = [
      { name: 'git-rebase', description: 'Panduan rebase interaktif git', state: 'active' },
      { name: 'csv-parser', description: 'Panduan parsing data CSV besar', state: 'trial' }
    ]

    const nudge = buildTrialSkillNudge(list, 'Tolong ekstrak data dari berkas CSV ini')
    expect(nudge).toContain('[NUDGE SKILL TRIAL]')
    expect(nudge).toContain('/csv-parser')
    expect(nudge).toContain('read-skill: csv-parser')
  })

  it('mengembalikan null jika tidak ada skill trial', () => {
    const list = [
      { name: 'git-rebase', description: 'Panduan rebase interaktif git', state: 'active' }
    ]

    expect(buildTrialSkillNudge(list, 'csv')).toBeNull()
    expect(buildTrialSkillNudge([], 'csv')).toBeNull()
  })
})
