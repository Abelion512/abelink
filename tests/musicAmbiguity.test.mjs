import { describe, it, expect } from 'vitest'
import { parseChoiceQuery } from '../src/api/choiceBus.js'

describe('musicAmbiguity & OST Choice Bus payload', () => {
  it('mendeteksi query OST dan menghasilkan multimodal options dengan metadata yang valid', () => {
    const candidates = [
      { id: 'track-1', title: 'Dark Aria', artist: 'SawanoHiroyuki', duration: '3:45', thumbnail: 'https://img/1.jpg' },
      { id: 'track-2', title: 'Level', artist: 'Tomorrow X Together', duration: '3:15', thumbnail: 'https://img/2.jpg' },
      { id: 'track-3', title: '4eVR', artist: 'SawanoHiroyuki', duration: '4:10', thumbnail: 'https://img/3.jpg' }
    ]

    const choicePayload = {
      question: 'Ditemukan beberapa track untuk "ost solo leveling" — lagu mana yang ingin diputar?',
      type: 'music_preview',
      options: candidates.map((c) => ({
        label: `${c.title} — ${c.artist}`,
        title: c.title,
        artist: c.artist,
        duration: c.duration,
        thumbnail: c.thumbnail,
        id: c.id
      }))
    }

    const parsed = parseChoiceQuery(choicePayload)
    expect(parsed).not.toBeNull()
    expect(parsed.type).toBe('music_preview')
    expect(parsed.options).toHaveLength(3)
    expect(parsed.options[0]).toBe('Dark Aria — SawanoHiroyuki')
    expect(parsed.rawOptions[0].title).toBe('Dark Aria')
    expect(parsed.rawOptions[0].duration).toBe('3:45')
    expect(parsed.rawOptions[0].thumbnail).toBe('https://img/1.jpg')
  })

  it('regex deteksi kompilasi OST membedakan lagu tunggal vs kompilasi bertema', () => {
    const isOstOrCompilation = (q) => /\b(ost|soundtrack|album|theme song|lagu tema|bgm)\b/i.test(q)
    expect(isOstOrCompilation('setel ost solo leveling')).toBe(true)
    expect(isOstOrCompilation('putar soundtrack naruto')).toBe(true)
    expect(isOstOrCompilation('mainkan lagu tema detective conan')).toBe(true)
    expect(isOstOrCompilation('bgm epic battle')).toBe(true)
    expect(isOstOrCompilation('album coldplay')).toBe(true)
    expect(isOstOrCompilation('setel bohemian rhapsody queen')).toBe(false)
    expect(isOstOrCompilation('putar komang raim laode')).toBe(false)
  })
})
