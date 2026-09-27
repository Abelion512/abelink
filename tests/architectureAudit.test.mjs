// Validator evidence JSONL audit arsitektur sesuai framework debat owner:
// satu schema universal, id unik, referensi resolve, field wajib per type,
// dan konsistensi coverage dengan SUMMARY.md.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/PLANNED/2026-09-27_architecture-audit')
const lines = readFileSync(path.join(DIR, 'evidence.jsonl'), 'utf8').trim().split('\n')
const records = lines.map((l, i) => {
  let parsed
  try {
    parsed = JSON.parse(l)
  } catch (e) {
    throw new Error(`baris ${i + 1} bukan JSON valid: ${e.message}`)
  }
  return parsed
})
const ids = new Set(records.map((r) => r.id))

const REQUIRED_ALL = ['id', 'type', 'category', 'claim', 'source', 'confidence', 'created_at']
const TYPE_RULES = {
  OBSERVED: { prefix: 'E-', minRelated: 0 },
  INFERRED: { prefix: 'I-', minRelated: 1 },
  HYPOTHESIS: { prefix: 'H-', minRelated: 1 },
  CONTRADICTION: { prefix: 'C-', minRelated: 2 },
  UNKNOWN: { prefix: 'U-', minRelated: 0, extra: ['missing_evidence'] },
  DECISION: { prefix: 'D-', minRelated: 0, extra: ['supporting_evidence', 'contradicting_evidence', 'decision'] },
  SUMMARY: { prefix: 'S-', minRelated: 0, extra: ['coverage'] },
}
const ID_TYPES = { 'E-': 'OBSERVED', 'I-': 'INFERRED', 'H-': 'HYPOTHESIS', 'C-': 'CONTRADICTION', 'U-': 'UNKNOWN', 'D-': 'DECISION', 'S-': 'SUMMARY' }

describe('architecture audit evidence.jsonl (schema universal)', () => {
  it('setiap baris JSON valid dan field wajib universal lengkap', () => {
    for (const r of records) {
      for (const f of REQUIRED_ALL) expect(r, `${r?.id} kehilangan ${f}`).toHaveProperty(f)
      expect(Array.isArray(r.category)).toBe(true)
      expect(r.category.length).toBeGreaterThan(0)
      expect(['HIGH', 'MEDIUM', 'LOW']).toContain(r.confidence)
      expect(r.source).toHaveProperty('kind')
    }
  })

  it('id unik + pola id cocok dengan type (discriminator konsisten)', () => {
    expect(ids.size).toBe(records.length)
    for (const r of records) {
      const rule = TYPE_RULES[r.type]
      expect(rule, `type tak dikenal: ${r.type}`).toBeTruthy()
      expect(r.id.startsWith(rule.prefix), `${r.id} harus berprefix ${rule.prefix}`).toBe(true)
      for (const f of rule.extra ?? []) expect(r, `${r.id} kehilangan ${f}`).toHaveProperty(f)
      if (rule.minRelated > 0) expect((r.related_evidence ?? []).length).toBeGreaterThanOrEqual(rule.minRelated)
    }
  })

  it('setiap referensi evidence menunjuk id yang ADA (no dangling refs)', () => {
    for (const r of records) {
      const refs = [...(r.related_evidence ?? []), ...(r.supporting_evidence ?? []), ...(r.contradicting_evidence ?? [])]
      for (const ref of refs) {
        expect(ids.has(ref), `${r.id} menunjuk ${ref} yang tidak ada`).toBe(true)
      }
    }
  })

  it('OBSERVED tidak mengandung hedging (probably/appears/seems/likely)', () => {
    const hedge = /\b(probably|appears to|seems|likely)\b/i
    for (const r of records.filter((x) => x.type === 'OBSERVED')) {
      expect(hedge.test(r.claim), `${r.id} memakai kata hedging di OBSERVED`).toBe(false)
    }
  })

  it('coverage cocok dengan SUMMARY.md (19 record: 13E/2I/2C/1U/2D)', () => {
    const counts = {}
    for (const r of records) counts[r.type] = (counts[r.type] ?? 0) + 1
    expect(counts.OBSERVED).toBe(13)
    expect(counts.INFERRED).toBe(2)
    expect(counts.CONTRADICTION).toBe(2)
    expect(counts.UNKNOWN).toBe(1)
    expect(counts.DECISION).toBe(2)
    // Semua DECISION punya classification valid
    for (const r of records.filter((x) => x.type === 'DECISION')) {
      expect(['ADOPT', 'ADAPT', 'REJECT', 'NOT_APPLICABLE', 'INVESTIGATE']).toContain(r.decision.classification)
      expect(r.decision.rationale.length).toBeGreaterThan(0)
    }
  })
})
