// Regression tests: trusted learning evidence must come from the INDEPENDENT
// verifier's world-state verdict (objectiveVerifier.evaluateEvidence), never
// from an exemption, a model claim, or a structural mini-eval.
//
// Defect pinned here: evaluateEvidence reports conversational objectives as
// `verified` as an EXEMPTION (zero criteria, zero ops). Reading that state as
// evidence would mint a reusable skill from an unverified chat and then let it
// graduate to `active` on structural eval alone.
import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { db } from '../src/api/db.js'
import { synthesizeSkillAndSave } from '../src/api/ai/skillSynthesizer.js'

// Mock fetchAI (synthesizer LLM call) so the grounding/promotion contract can be
// tested without network. Mirrors the sessionCompactor test pattern.
const { fetchAIMock } = vi.hoisted(() => ({ fetchAIMock: vi.fn() }))
// Keep the real deterministic parser (cleanAndParse); only the network call is faked.
vi.mock('../src/api/ai/core.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, fetchAI: fetchAIMock }
})

// Structurally valid SOP: passes runSkillMiniEval (>=100 chars, heading + list,
// >=2 action keywords, safe, description >=10 chars). Structural validity is
// deliberately NOT sufficient for promotion.
const SOP = `# PROSEDUR DEMO

Langkah kerja:
1. Baca berkas konfigurasi lewat tool read-file.
2. Jalankan eksekusi dan catat log hasilnya.
3. Verifikasi artefak keluaran sebelum melanjutkan.`

const REPLY = JSON.stringify({
  name: 'synthesized-demo',
  description: 'Prosedur demo terverifikasi',
  content: SOP
})

const TOOLS = [
  { tool: 'read-file', query: 'laporan.md', status: 'done', fullResult: 'laporan isi' }
]

beforeEach(async () => {
  await db.learnedSkills.clear()
  fetchAIMock.mockReset()
  fetchAIMock.mockResolvedValue(REPLY)
})

describe('skillSynthesizer — trusted evidence provenance', () => {
  it('conversational exemption does NOT become evidence (skill stays trial)', async () => {
    const saved = await synthesizeSkillAndSave({
      userPrompt: 'Apa itu git rebase?',
      executedTools: TOOLS,
      finalAnswer: 'Git rebase memindahkan commit.',
      // The verifier exempts conversational objectives and reports `verified`
      // without any world-state criteria. That exemption is not proof.
      verificationState: 'verified',
      objectiveKind: 'conversational'
    })

    expect(saved).not.toBeNull()
    expect(saved.evidenceVerified).toBe(false)
    expect(saved.state).toBe('trial')
    // Consequence: structural eval alone cannot graduate it.
    expect((await db.learnedSkills.get(saved.id)).state).toBe('trial')
  })

  it('real world-state verification grants evidence and unlocks eval graduation', async () => {
    const saved = await synthesizeSkillAndSave({
      userPrompt: 'Buat laporan.md berisi ringkasan',
      executedTools: TOOLS,
      finalAnswer: 'Laporan dibuat.',
      verificationState: 'verified',
      objectiveKind: 'file'
    })

    expect(saved.evidenceVerified).toBe(true)
    // The synthesizer runs mini-eval + graduation: verified evidence + passing
    // structural eval promotes the skill.
    expect((await db.learnedSkills.get(saved.id)).state).toBe('active')
  })

  it('non-verified verdicts never become evidence', async () => {
    for (const state of ['not_run', 'partially_verified', 'failed', 'unavailable']) {
      await db.learnedSkills.clear()
      const saved = await synthesizeSkillAndSave({
        userPrompt: 'Buat laporan.md berisi ringkasan',
        executedTools: TOOLS,
        finalAnswer: 'Laporan dibuat.',
        verificationState: state,
        objectiveKind: 'file'
      })
      expect(saved.evidenceVerified).toBe(false)
      expect((await db.learnedSkills.get(saved.id)).state).toBe('trial')
    }
  })

  it('a model claim with no verification supplied never becomes evidence', async () => {
    const saved = await synthesizeSkillAndSave({
      userPrompt: 'Buat laporan.md berisi ringkasan',
      executedTools: TOOLS,
      finalAnswer: 'SELESAI. Semua berhasil dan sudah diverifikasi.',
      thought: 'Berhasil.'
      // no verificationState / objectiveKind: defaults must stay unverified
    })
    expect(saved.evidenceVerified).toBe(false)
    expect(saved.state).toBe('trial')
  })
})

// The synthesizer is only as trustworthy as what its caller hands it. The
// production caller owns `lastVerification` (the verifier verdict) and
// `objectiveKind`; if it does not forward them, the synthesizer falls back to
// its `not_run` / `general` defaults and no trajectory can ever be verified.
describe('useAbelinkPlan — production caller forwards verifier evidence', () => {
  const hookSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/hooks/agent/useAbelinkPlan.js'),
    'utf-8'
  )
  const callSite = hookSrc.match(/synthesizeSkillAndSave\(\{[\s\S]*?\n\s*\}\)/)

  it('forwards the runtime verdict + objective kind', () => {
    expect(callSite).not.toBeNull()
    expect(callSite[0]).toMatch(/\n\s*verificationState: lastVerification,/)
    expect(callSite[0]).toMatch(/\n\s*objectiveKind\s*\n/)
  })

  it('does not re-derive verification at the call site', () => {
    expect(callSite[0]).not.toContain('evaluateEvidence')
    expect(callSite[0]).not.toContain('isIndependentlyVerified')
  })
})
