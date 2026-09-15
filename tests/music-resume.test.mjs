/**
 * Logika murni resume + loop musik (tanpa mount React / IFrame API).
 * Mencerminkan implementasi di YoutubeMusicContext: readLastTrack,
 * siklus loop off->one->all->off, dan perilaku ENDED per mode.
 */
import { describe, it, expect, beforeEach } from 'vitest'

const LAST_TRACK_KEY = 'abelink:last_track'

function readLastTrack(store) {
  try {
    const raw = store[LAST_TRACK_KEY]
    if (!raw) return null
    const t = JSON.parse(raw)
    if (!t || typeof t.id !== 'string' || !t.id) return null
    return {
      id: t.id,
      title: typeof t.title === 'string' ? t.title : 'Lagu Pilihan',
      artist: typeof t.artist === 'string' ? t.artist : 'YouTube Music',
      duration: typeof t.duration === 'string' ? t.duration : '',
      thumbnail: typeof t.thumbnail === 'string' ? t.thumbnail : ''
    }
  } catch (_) {
    return null
  }
}

function nextLoopMode(mode) {
  return mode === 'off' ? 'one' : mode === 'one' ? 'all' : 'off'
}

// Replika keputusan handleEnded: 'replay' | 'advance' | 'stop'.
function endedAction(mode, { hasCurrent, queueLen }) {
  if (mode === 'one' && hasCurrent) return 'replay'
  if (mode === 'all' && queueLen > 0) return 'advance'
  return 'stop'
}

// Replika keputusan FAB: 'resume' | 'toggle'.
function fabAction({ hasCurrent, last }) {
  if (!hasCurrent && last?.id) return 'resume'
  return 'toggle'
}

describe('readLastTrack', () => {
  let store
  beforeEach(() => { store = {} })

  it('null bila kosong', () => {
    expect(readLastTrack(store)).toBeNull()
  })

  it('null bila JSON rusak', () => {
    store[LAST_TRACK_KEY] = 'bukan-json{{{'
    expect(readLastTrack(store)).toBeNull()
  })

  it('null bila id hilang/kosong', () => {
    store[LAST_TRACK_KEY] = JSON.stringify({ title: 'x' })
    expect(readLastTrack(store)).toBeNull()
    store[LAST_TRACK_KEY] = JSON.stringify({ id: '' })
    expect(readLastTrack(store)).toBeNull()
  })

  it('normalisasi field hilang ke default', () => {
    store[LAST_TRACK_KEY] = JSON.stringify({ id: 'abc123xyz45' })
    expect(readLastTrack(store)).toEqual({
      id: 'abc123xyz45',
      title: 'Lagu Pilihan',
      artist: 'YouTube Music',
      duration: '',
      thumbnail: ''
    })
  })

  it('round-trip penuh', () => {
    const track = { id: 'abc123xyz45', title: 'T', artist: 'A', duration: '3:00', thumbnail: 'http://x/y.jpg' }
    store[LAST_TRACK_KEY] = JSON.stringify(track)
    expect(readLastTrack(store)).toEqual(track)
  })
})

describe('siklus loop 3-state', () => {
  it('off -> one -> all -> off', () => {
    expect(nextLoopMode('off')).toBe('one')
    expect(nextLoopMode('one')).toBe('all')
    expect(nextLoopMode('all')).toBe('off')
  })
})

describe('keputusan ENDED per mode', () => {
  it('one + lagu aktif = replay', () => {
    expect(endedAction('one', { hasCurrent: true, queueLen: 1 })).toBe('replay')
  })

  it('one tanpa lagu = stop (bukan crash)', () => {
    expect(endedAction('one', { hasCurrent: false, queueLen: 0 })).toBe('stop')
  })

  it('all + antrean = advance', () => {
    expect(endedAction('all', { hasCurrent: true, queueLen: 3 })).toBe('advance')
  })

  it('all antrean kosong = stop', () => {
    expect(endedAction('all', { hasCurrent: false, queueLen: 0 })).toBe('stop')
  })

  it('off selalu stop', () => {
    expect(endedAction('off', { hasCurrent: true, queueLen: 3 })).toBe('stop')
  })
})

describe('keputusan FAB', () => {
  it('fresh-boot + simpanan valid = resume', () => {
    expect(fabAction({ hasCurrent: false, last: { id: 'x' } })).toBe('resume')
  })

  it('lagu aktif = toggle (perilaku lama)', () => {
    expect(fabAction({ hasCurrent: true, last: { id: 'x' } })).toBe('toggle')
  })

  it('tanpa simpanan = toggle (panel kosong seperti dulu)', () => {
    expect(fabAction({ hasCurrent: false, last: null })).toBe('toggle')
  })
})
