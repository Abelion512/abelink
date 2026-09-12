import { describe, it, expect } from 'vitest'
import {
  parseChoiceQuery,
  requestChoice,
  resolveChoice,
  dropChoice,
  pendingChoiceCount,
  MAX_CHOICE_OPTIONS
} from '../src/api/choiceBus.js'

describe('choiceBus parseChoiceQuery', () => {
  it('mem-parse pertanyaan + opsi dipisah || dan ;', () => {
    expect(parseChoiceQuery('Lanjut di mana?||A;B')).toEqual({
      question: 'Lanjut di mana?',
      options: ['A', 'B']
    })
  })

  it('menolak query tanpa pemisah || atau tanpa opsi', () => {
    expect(parseChoiceQuery('halo saja')).toBeNull()
    expect(parseChoiceQuery('tanya?||')).toBeNull()
    expect(parseChoiceQuery('tanya?|| ; ')).toBeNull()
    expect(parseChoiceQuery('')).toBeNull()
  })

  it(`membatasi opsi ke ${MAX_CHOICE_OPTIONS} dan memangkas opsi panjang`, () => {
    const parsed = parseChoiceQuery(`pilih?||${['a', 'b', 'c', 'd', 'e'].join(';')}`)
    expect(parsed.options).toEqual(['a', 'b', 'c', 'd'])
    const long = parseChoiceQuery(`pilih?||${'x'.repeat(200)}`)
    expect(long.options[0].length).toBeLessThanOrEqual(120)
  })
})

describe('choiceBus resolve-once', () => {
  it('klik pertama resolve, klik kedua no-op', async () => {
    const id = `test-${Date.now()}`
    const pending = requestChoice(id)
    expect(pendingChoiceCount()).toBeGreaterThanOrEqual(1)
    expect(resolveChoice(id, 'A')).toBe(true)
    expect(resolveChoice(id, 'A')).toBe(false)
    await expect(pending).resolves.toBe('A')
    expect(pendingChoiceCount()).toBe(0)
  })

  it('id tak dikenal dan batal mengembalikan nilai aman', () => {
    expect(resolveChoice('tidak-ada', 'X')).toBe(false)
    dropChoice('tidak-ada')
    expect(pendingChoiceCount()).toBe(0)
  })
})
