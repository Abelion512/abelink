// Tests: deterministic pre-check sebelum LLM rank (hemat 1 call).
// Target: trustworthyTopHit di src/api/ai/tools.js.
// Kontrak konservatif: skip LLM HANYA bila top-1 cocok kuat + tidak ada
// permintaan varian versi; sisanya null (jalur LLM seperti biasa).

import { describe, it, expect } from 'vitest'
import { trustworthyTopHit } from '../src/api/ai/tools.js'

const list = [
  { id: 'a1', title: 'Love You With All My Heart', artist: 'Crush', duration: '3:45' },
  { id: 'b2', title: 'Love You With All My Heart (Cover)', artist: 'Someone', duration: '4:00' },
  { id: 'c3', title: 'Unrelated Song', artist: 'Other', duration: '2:00' }
]

describe('trustworthyTopHit', () => {
  it('query persis -> top-1 langsung, tanpa LLM', () => {
    expect(trustworthyTopHit('setel lagu love you with all my heart crush', list)).toEqual({
      selectedId: 'a1',
      via: 'deterministic'
    })
  })

  it('minta cover -> null (LLM yang menilai)', () => {
    expect(trustworthyTopHit('putar cover love you with all my heart', list)).toBeNull()
    expect(trustworthyTopHit('versi live crush', list)).toBeNull()
    expect(trustworthyTopHit('karaoke love you with all my heart', list)).toBeNull()
  })

  it('dua kandidat cocok sama kuat -> null (ambigu)', () => {
    const dup = [
      { id: 'x1', title: 'Senja', artist: 'Band A' },
      { id: 'x2', title: 'Senja', artist: 'Band A Live' }
    ]
    expect(trustworthyTopHit('putar senja band a', dup)).toBeNull()
  })

  it('tidak cocok / kosong -> null', () => {
    expect(trustworthyTopHit('putar lagu yang tidak ada di daftar', list)).toBeNull()
    expect(trustworthyTopHit('setel lagu crush', [])).toBeNull()
    expect(trustworthyTopHit('', list)).toBeNull()
    expect(trustworthyTopHit(null, list)).toBeNull()
  })

  it('tidak pernah throw untuk input sampah', () => {
    expect(trustworthyTopHit({}, null)).toBeNull()
    expect(trustworthyTopHit('x', [{}])).toBeNull()
  })
})
