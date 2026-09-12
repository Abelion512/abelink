// Regression: choice ask-choice wajib selamat sampai permukaan home
// (AbelinkHome -> ResponseArea). Dulu mapper membuang `choice` sehingga tombol
// opsi tidak pernah render di home dan agent menunggu klik yang tak bisa
// diberikan user. Lihat tests/responseChoice failing-first.
import { describe, it, expect } from 'vitest'
import { mapChatItemToResponse } from '../src/api/choiceBus.js'

const choiceMsg = {
  role: 'ai',
  content: 'Pilih fokus argumen debat:',
  choice: { id: 'choice-1', options: ['A', 'B', 'C'], selected: null }
}

describe('mapChatItemToResponse', () => {
  it('meneruskan choice pesan ai ke response home', () => {
    expect(mapChatItemToResponse(choiceMsg).choice).toEqual(choiceMsg.choice)
  })

  it('pesan tanpa choice -> choice null (ResponseArea tidak render tombol)', () => {
    expect(
      mapChatItemToResponse({ role: 'ai', content: 'halo' }).choice
    ).toBeNull()
  })

  it('bukan pesan ai -> null', () => {
    expect(mapChatItemToResponse({ role: 'user', content: 'x' })).toBeNull()
    expect(mapChatItemToResponse(null)).toBeNull()
  })
})
