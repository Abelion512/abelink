import { describe, it, expect } from 'vitest'
import { extractVideoId, parseQueueAdd, parseLoopMode, isVagueMusicQuery, buildDirectTrack } from '../src/hooks/agent/musicQuery.js'

const ID = 'dQw4w9WgXcQ'

describe('extractVideoId', () => {
  it('menerima raw 11-char ID', () => {
    expect(extractVideoId(ID)).toBe(ID)
  })
  it('youtube.com/watch?v=', () => {
    expect(extractVideoId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID)
  })
  it('music.youtube.com/watch?v=', () => {
    expect(extractVideoId(`https://music.youtube.com/watch?v=${ID}&list=RDAMVMxyz`)).toBe(ID)
  })
  it('youtu.be/<id>', () => {
    expect(extractVideoId(`https://youtu.be/${ID}?si=abc`)).toBe(ID)
  })
  it('/shorts/<id>', () => {
    expect(extractVideoId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID)
  })
  it('/embed/<id>', () => {
    expect(extractVideoId(`https://www.youtube.com/embed/${ID}`)).toBe(ID)
  })
  it('/live/<id>', () => {
    expect(extractVideoId(`https://www.youtube.com/live/${ID}?feature=share`)).toBe(ID)
  })
  it('bukan URL -> null', () => {
    expect(extractVideoId('komang raim laode')).toBeNull()
    expect(extractVideoId('')).toBeNull()
    expect(extractVideoId(null)).toBeNull()
  })
})

describe('parseQueueAdd', () => {
  it('"Lagu A x2" -> {query, repeat:2}', () => {
    expect(parseQueueAdd('Lagu A x2')).toEqual({ query: 'Lagu A', repeat: 2 })
  })
  it('plain -> repeat 1', () => {
    expect(parseQueueAdd('Komang')).toEqual({ query: 'Komang', repeat: 1 })
  })
  it('kupas kutip + spasi', () => {
    expect(parseQueueAdd('"Lagu A x3"')).toEqual({ query: 'Lagu A', repeat: 3 })
  })
  it('x besar tetap utuh', () => {
    expect(parseQueueAdd('Lagu B x10')).toEqual({ query: 'Lagu B', repeat: 10 })
  })
})

describe('parseLoopMode', () => {
  it('"one 3x" -> {mode one, limit 3}', () => {
    expect(parseLoopMode('one 3x')).toEqual({ mode: 'one', limit: 3 })
  })
  it('one/all/off tanpa limit', () => {
    expect(parseLoopMode('one')).toEqual({ mode: 'one', limit: null })
    expect(parseLoopMode('all')).toEqual({ mode: 'all', limit: null })
    expect(parseLoopMode('off')).toEqual({ mode: 'off', limit: null })
  })
  it('argumen asing -> null', () => {
    expect(parseLoopMode('forever')).toBeNull()
    expect(parseLoopMode('')).toBeNull()
  })
})

describe('isVagueMusicQuery', () => {
  it.each([
    'lagu yang enak',
    'lagu yang enak apa',
    'terserah',
    'acak',
    'random',
    'lagu acak',
    'musik acak',
    'putar sesuatu',
    'play something',
    'play anything',
    'anything',
    'lagu favorit',
    'bebas',
    ''
  ])('"%s" kabur', (q) => {
    expect(isVagueMusicQuery(q)).toBe(true)
  })
  it.each(['komang raim laode', 'bohemian rhapsody queen'])('"%s" spesifik', (q) => {
    expect(isVagueMusicQuery(q)).toBe(false)
  })
})

describe('buildDirectTrack', () => {
  it('ID tidak pernah diganti metadata', () => {
    const t = buildDirectTrack(ID, { title: 'X', artist: 'Y' })
    expect(t.id).toBe(ID)
    expect(t.title).toBe('X')
    expect(t.artist).toBe('Y')
  })
  it('fallback thumbnail dari ID', () => {
    const t = buildDirectTrack(ID, null)
    expect(t.thumbnail).toContain(ID)
  })
})
