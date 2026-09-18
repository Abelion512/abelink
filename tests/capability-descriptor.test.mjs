// Uji CapabilityDescriptor — kontrak terpadu connector|plugin|skill|native.
import { describe, it, expect } from 'vitest'
import {
  validateDescriptor,
  normalizeDescriptor,
  toPromptLine,
  toGuide
} from '../sidecar/main/capabilities/descriptor.mjs'

const valid = {
  id: 'time',
  kind: 'connector',
  version: '1',
  description: 'Utilitas waktu offline',
  inputSchema: { type: 'object', properties: {} },
  scopes: ['time.now'],
  guide: { steps: ['panggil time.now'], examples: ['jam berapa?'] },
  enabled: true,
  source: 'builtin'
}

describe('validateDescriptor', () => {
  it('deskriptor connector valid lolos', () => {
    expect(validateDescriptor(valid)).toEqual({ ok: true, errors: [] })
  })

  it('id namespaced plugin:foo diterima', () => {
    expect(validateDescriptor({ ...valid, id: 'plugin:foo' }).ok).toBe(true)
  })

  it('id tidak valid ditolak', () => {
    const r = validateDescriptor({ ...valid, id: 'Bad ID!' })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/id/i)
  })

  it('kind di luar 4 nilai ditolak', () => {
    const r = validateDescriptor({ ...valid, kind: 'alien' })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/kind/i)
  })

  it('inputSchema tanpa type object ditolak', () => {
    const r = validateDescriptor({ ...valid, inputSchema: { type: 'string' } })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/inputSchema/i)
  })
})

describe('normalizeDescriptor', () => {
  it('mengisi default yang hilang', () => {
    const n = normalizeDescriptor({ id: 'x', kind: 'skill', description: 'd' })
    expect(n.version).toBe('1')
    expect(n.scopes).toEqual([])
    expect(n.guide).toEqual({ steps: [], examples: [] })
    expect(n.enabled).toBe(true)
  })
})

describe('prompt & guide', () => {
  it('toPromptLine satu baris kind:id — description', () => {
    expect(toPromptLine(valid)).toBe('connector:time — Utilitas waktu offline')
  })

  it('toGuide mengembalikan objek detail penuh', () => {
    const g = toGuide(valid)
    expect(g.id).toBe('time')
    expect(g.inputSchema.type).toBe('object')
    expect(Array.isArray(g.scopes)).toBe(true)
  })
})
