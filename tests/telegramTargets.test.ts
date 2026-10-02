import { describe, it, expect } from 'vitest'
import { splitTgAdminIds } from '../src/utils/telegramTargets'

describe('splitTgAdminIds', () => {
  it('memecah pemisah spasi, koma, titik-koma, dan baris baru', () => {
    expect(splitTgAdminIds('111, 222;333 444\n555')).toEqual(['111', '222', '333', '444', '555'])
  })

  it('membuang entri kosong dan whitespace berlebih', () => {
    expect(splitTgAdminIds('  , ;; \n  ')).toEqual([])
    expect(splitTgAdminIds('')).toEqual([])
  })

  it('null / undefined menghasilkan array kosong (bukan string "undefined")', () => {
    expect(splitTgAdminIds(null)).toEqual([])
    expect(splitTgAdminIds(undefined)).toEqual([])
  })

  it('input number tetap dikonversi aman', () => {
    expect(splitTgAdminIds(12345)).toEqual(['12345'])
  })
})
