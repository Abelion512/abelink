import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAbelinkMusic } from '../src/hooks/agent/useAbelinkMusic.js'

const TRACK = { id: 'AAAAAAAAAAA', title: 'Lagu A', artist: 'Artis A' }

const makeTools = (queue = []) => {
  const state = { queue: [...queue] }
  return {
    tools: {
      queue: state.queue,
      playUrl: vi.fn(() => true),
      playTrack: vi.fn(() => true),
      nextTrack: vi.fn(() => true),
      prevTrack: vi.fn(() => true),
      playPause: vi.fn(() => 'playing'),
      enqueuePlaylist: vi.fn((tracks) => {
        for (const t of tracks) {
          if (t?.id && !state.queue.some((x) => x.id === t.id)) state.queue.push(t)
        }
        return true
      }),
      enqueueTrack: vi.fn((t) => {
        if (t?.id && !state.queue.some((x) => x.id === t.id)) state.queue.push(t)
        return true
      })
    },
    state
  }
}

describe('music-queue-add resolves before enqueueing', () => {
  beforeEach(() => {
    globalThis.window = {
      api: { searchMusic: vi.fn(async () => [{ ...TRACK }]) }
    }
  })

  it('enqueues resolved ID with repeat count (no silent drop)', async () => {
    const { tools, state } = makeTools([{ id: 'BBBBBBBBBBB', title: 'Lagu B' }])
    const { handleMusic } = useAbelinkMusic(() => {}, { current: null }, tools)
    const res = await handleMusic('music-queue-add', 'Lagu A x2')
    expect(res).toContain('Lagu A')
    expect(state.queue.some((t) => t.id === TRACK.id && t.repeat === 2)).toBe(true)
  })

  it('honest failure when search finds nothing (queue unchanged)', async () => {
    globalThis.window.api.searchMusic = vi.fn(async () => [])
    const { tools, state } = makeTools([{ id: 'BBBBBBBBBBB', title: 'Lagu B' }])
    const { handleMusic } = useAbelinkMusic(() => {}, { current: null }, tools)
    const before = state.queue.length
    const res = await handleMusic('music-queue-add', 'Lagu entah apa xyz')
    expect(res).toMatch(/tidak menemukan|tidak berubah/i)
    expect(state.queue.length).toBe(before)
  })
})
