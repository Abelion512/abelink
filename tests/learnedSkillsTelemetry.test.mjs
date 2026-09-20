// R1a: telemetri reuse learnedSkills (RSI terukur).
// - Skill baru lahir dengan use_count 0 / state active.
// - bumpLearnedSkillUse menaikkan counter + last_used_at.
// - archiveStaleLearnedSkills mengarsipkan yang tak dipakai > N hari (tanpa hapus).
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  db,
  saveLearnedSkill,
  bumpLearnedSkillUse,
  archiveStaleLearnedSkills,
  graduateTrialSkill
} from '../src/api/db.js'

describe('learnedSkills reuse telemetry (R1a)', () => {
  beforeEach(async () => {
    await db.learnedSkills.clear()
  })

  it('skill baru lahir dengan telemetri default', async () => {
    const s = await saveLearnedSkill({ name: 'uji-reuse', description: 'd', content: 'isi' })
    expect(s.use_count).toBe(0)
    expect(s.last_used_at).toBeNull()
    expect(s.state).toBe('active')
  })

  it('bump menaikkan use_count + last_used_at', async () => {
    const s = await saveLearnedSkill({ name: 'uji-bump', description: 'd', content: 'isi' })
    const b1 = await bumpLearnedSkillUse(s.id)
    expect(b1.use_count).toBe(1)
    expect(typeof b1.last_used_at).toBe('number')
    const b2 = await bumpLearnedSkillUse('uji-bump')
    expect(b2.use_count).toBe(2)
  })

  it('bump skill tak ada -> null (tidak throw)', async () => {
    expect(await bumpLearnedSkillUse('tak-ada')).toBeNull()
  })

  it('arsipkan yang tak dipakai > N hari, yang segar tidak', async () => {
    const old = await saveLearnedSkill({ name: 'jadul', description: 'd', content: 'isi' })
    await db.learnedSkills.put({ ...old, updatedAt: Date.now() - 40 * 24 * 3600 * 1000, last_used_at: null })
    await saveLearnedSkill({ name: 'segar', description: 'd', content: 'isi' })
    const n = await archiveStaleLearnedSkills(30)
    expect(n).toBe(1)
    expect((await db.learnedSkills.get(old.id)).state).toBe('archived')
    expect((await db.learnedSkills.where('name').equals('segar').first()).state).toBe('active')
  })

  it('skill yang sudah archived tidak diarsip ulang', async () => {
    const s = await saveLearnedSkill({ name: 'arsip', description: 'd', content: 'isi' })
    await db.learnedSkills.put({ ...s, state: 'archived', updatedAt: 0 })
    expect(await archiveStaleLearnedSkills(30)).toBe(0)
  })
})

describe('trial gate empiris (R1b)', () => {
  beforeEach(async () => {
    await db.learnedSkills.clear()
  })

  it('reuse > 0 meluluskan trial -> active', async () => {
    const s = await saveLearnedSkill({ name: 'trial-reuse', description: 'd', content: 'isi', state: 'trial' })
    await bumpLearnedSkillUse(s.id)
    expect(await graduateTrialSkill(s.id)).toBe('active')
    expect((await db.learnedSkills.get(s.id)).state).toBe('active')
  })

  it('evalPassed alone does not promote an unverified trial', async () => {
    const s = await saveLearnedSkill({ name: 'trial-eval', description: 'd', content: 'isi', state: 'trial' })
    expect(await graduateTrialSkill(s.id, { evalPassed: true })).toBe('trial')
  })

  it('evalPassed promotes a trial when originating evidence was verified', async () => {
    const s = await saveLearnedSkill({
      name: 'trial-eval-verified',
      description: 'd',
      content: 'isi',
      state: 'trial',
      evidenceVerified: true
    })
    expect(await graduateTrialSkill(s.id, { evalPassed: true })).toBe('active')
  })

  it('trial muda tanpa reuse tetap trial', async () => {
    const s = await saveLearnedSkill({ name: 'trial-muda', description: 'd', content: 'isi', state: 'trial' })
    expect(await graduateTrialSkill(s.id)).toBe('trial')
  })

  it('trial tua tanpa reuse -> archived', async () => {
    const s = await saveLearnedSkill({ name: 'trial-tua', description: 'd', content: 'isi', state: 'trial' })
    await db.learnedSkills.put({ ...s, createdAt: Date.now() - 10 * 24 * 3600 * 1000 })
    expect(await graduateTrialSkill(s.id, { trialDays: 7 })).toBe('archived')
  })

  it('non-trial dikembalikan apa adanya (active tetap active)', async () => {
    const s = await saveLearnedSkill({ name: 'biasa', description: 'd', content: 'isi' })
    expect(await graduateTrialSkill(s.id)).toBe('active')
  })
})
