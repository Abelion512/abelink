// Uji skillToDescriptor — proyeksi skill ke CapabilityDescriptor terpadu.
import { describe, it, expect } from 'vitest'
import { skillToDescriptor } from '../sidecar/engine/channels/skills.mjs'

describe('skillToDescriptor', () => {
  it('skill normal diproyeksikan dengan benar', () => {
    const d = skillToDescriptor({ name: 'ringkas', description: 'Meringkas teks' })
    expect(d.id).toBe('skill:ringkas')
    expect(d.kind).toBe('skill')
    expect(d.version).toBe('1')
    expect(d.description).toBe('Meringkas teks')
    expect(d.inputSchema).toEqual({ type: 'object', properties: {} })
    expect(d.scopes).toEqual([])
    expect(d.guide.steps).toEqual(['Gunakan read-skill:ringkas untuk memuat isi penuh.'])
    expect(d.guide.examples).toEqual([])
    expect(d.enabled).toBe(true)
    expect(d.source).toEqual({ type: 'skill', name: 'ringkas' })
  })

  it('nama kosong -> null', () => {
    expect(skillToDescriptor({ name: '', description: 'x' })).toBeNull()
    expect(skillToDescriptor({ name: '   ' })).toBeNull()
    expect(skillToDescriptor({})).toBeNull()
  })

  it('nama dengan spasi/kapital disanitasi', () => {
    const d = skillToDescriptor({ name: 'My Skill', description: 'd' })
    expect(d.id).toBe('skill:my-skill')
    expect(d.id).toMatch(/^skill:[a-z0-9_-]+$/)
  })
})
