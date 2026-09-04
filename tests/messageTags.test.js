import { describe, it, expect } from 'vitest'
import { stripAgentTags, LEAD_AGENT_TAG, CREATOR_TAG } from '../src/utils/messageTags'

describe('stripAgentTags', () => {
  it('melepas tag lead agent di awal pesan', () => {
    expect(stripAgentTags(`${LEAD_AGENT_TAG} halo dari mark`)).toBe('halo dari mark')
    expect(stripAgentTags('[DARI LEAD AGENT (MARK)]:  perintah eksekusi')).toBe('perintah eksekusi')
  })

  it('melepas tag creator dengan nama apa pun (termasuk karakter regex)', () => {
    expect(stripAgentTags('[DARI CREATOR / USER (MADA)]: siap dijalankan')).toBe('siap dijalankan')
    expect(stripAgentTags('[DARI CREATOR / USER (Abel (512))]: pesan')).toBe('pesan')
    expect(stripAgentTags('[DARI CREATOR / USER (A.B+C)]: pesan')).toBe('pesan')
  })

  it('hanya melepas tag di awal pesan', () => {
    const mid = 'teks [DARI LEAD AGENT (MARK)]: di tengah'
    expect(stripAgentTags(mid)).toBe(mid)
  })

  it('tanpa tag -> tidak berubah (no-op)', () => {
    expect(stripAgentTags('pesan biasa tanpa tag')).toBe('pesan biasa tanpa tag')
    expect(stripAgentTags('')).toBe('')
  })

  it('dua tag beruntun -> keduanya terlepas (lazy match per-regex)', () => {
    expect(
      stripAgentTags('[DARI LEAD AGENT (MARK)]: [DARI CREATOR / USER (MADA)]: isi')
    ).toBe('isi')
  })

  it('menjaga spasi awal baris dalam isi pesan', () => {
    expect(stripAgentTags('[DARI LEAD AGENT (MARK)]: baris1\n  baris2')).toBe('baris1\n  baris2')
  })

  it('aman untuk input non-string (passthrough)', () => {
    expect(stripAgentTags(null)).toBe(null)
    expect(stripAgentTags(undefined)).toBe(undefined)
    expect(stripAgentTags(42)).toBe(42)
  })

  it('konstanta tag cocok dengan pola strip (kontrak executor <-> render)', () => {
    expect(stripAgentTags(`${LEAD_AGENT_TAG}x`)).toBe('x')
    expect(stripAgentTags(`${CREATOR_TAG}x`)).toBe('x')
  })
})
