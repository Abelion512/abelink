// Regression tests: pesan error AI yang ramah & informatif.
// Target: src/api/ai/fetchError.js — kasus asal: 9Router dimatikan,
// user hanya melihat "AI fetch gagal" tanpa sebab & tanpa aksi perbaikan.
//
// Kontrak:
// - Pesan asli yang informatif diteruskan apa adanya.
// - Error teknis mentah yang pendek diterjemahkan + diberi hint aksi.
// - Pesan kosong (sebab tertelan di bridge) -> fallback beraksi, bukan buta.

import { describe, it, expect } from 'vitest'
import { friendlyAiFetchError } from '../src/api/ai/fetchError.js'

describe('friendlyAiFetchError', () => {
  it('meneruskan pesan informatif apa adanya', () => {
    const msg =
      'Server AI lokal tidak merespons di localhost:20128 (9Router/LM Studio). Nyalakan dulu aplikasinya, lalu coba lagi.'
    expect(friendlyAiFetchError({ success: false, error: { message: msg } })).toBe(msg)
    expect(friendlyAiFetchError({ success: false, error: msg })).toBe(msg)
  })

  it('menerjemahkan error teknis pendek + hint aksi', () => {
    const r = friendlyAiFetchError({ success: false, error: 'fetch failed' })
    expect(r).toContain('tidak bisa terhubung ke server AI')
    expect(r).toContain('Nyalakan dulu servernya')
    expect(friendlyAiFetchError({ success: false, error: 'Request Timeout' })).toContain(
      'kehabisan waktu'
    )
  })

  it('pesan kosong -> fallback beraksi, tidak pernah buta', () => {
    // Bentuk yang dulu menghasilkan "AI fetch gagal".
    for (const res of [
      { success: false, error: null },
      { success: false },
      { success: false, error: {} },
      { success: false, error: '   ' }
    ]) {
      const r = friendlyAiFetchError(res)
      expect(r.length).toBeGreaterThan(20)
      expect(r).not.toBe('AI fetch gagal')
      expect(r).toContain('localhost:20128')
    }
  })

  it('kode error tanpa pesan tetap disebut', () => {
    const r = friendlyAiFetchError({ success: false, error: { code: 'FETCH_FAILED' } })
    expect(r).toContain('FETCH_FAILED')
    expect(r).toContain('Nyalakan dulu servernya')
  })
})
