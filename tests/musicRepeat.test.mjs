import { describe, it, expect } from 'vitest'
import { nextPlaybackStep } from '../src/hooks/agent/musicQuery.js'

const A = { id: 'AAAAAAAAAAA', repeat: 2, repeatInit: 2 }
const B = { id: 'BBBBBBBBBBB', repeat: 1, repeatInit: 1 }
const C = { id: 'CCCCCCCCCCC', repeat: 3, repeatInit: 3 }

describe('nextPlaybackStep', () => {
  it('empty queue stops', () => {
    expect(nextPlaybackStep({ mode: 'all', queue: [], currentId: 'x' }).action).toBe('stop')
  })

  it('single track, off: stops at end', () => {
    const r = nextPlaybackStep({ mode: 'off', queue: [B], currentId: B.id })
    expect(r.action).toBe('stop')
  })

  it('per-track count: A x2 replays once then advances', () => {
    const first = nextPlaybackStep({ mode: 'off', queue: [A, B], currentId: A.id })
    expect(first.action).toBe('replay')
    expect(first.targetId).toBe(A.id)
    expect(first.queue[0].repeat).toBe(1)
    const second = nextPlaybackStep({ mode: 'off', queue: first.queue, currentId: A.id })
    expect(second.action).toBe('advance')
    expect(second.targetId).toBe(B.id)
  })

  it('off at queue tail: stops', () => {
    const r = nextPlaybackStep({ mode: 'off', queue: [A, B], currentId: B.id })
    expect(r.action).toBe('stop')
  })

  it('all wraps to head and resets counts', () => {
    const spent = [{ ...A, repeat: 1 }, B]
    const r = nextPlaybackStep({ mode: 'all', queue: spent, currentId: B.id })
    expect(r.action).toBe('restart')
    expect(r.targetId).toBe(A.id)
    expect(r.queue[0].repeat).toBe(2)
  })

  it('all mid-queue advances', () => {
    const r = nextPlaybackStep({ mode: 'all', queue: [C, B], currentId: C.id })
    // C has repeat 3 -> replay first
    expect(r.action).toBe('replay')
    expect(r.queue[0].repeat).toBe(2)
  })

  it('one infinite replays forever', () => {
    const r1 = nextPlaybackStep({ mode: 'one', queue: [A, B], currentId: A.id })
    const r2 = nextPlaybackStep({ mode: 'one', queue: [A, B], currentId: A.id })
    expect(r1.action).toBe('replay')
    expect(r2.action).toBe('replay')
    expect(r1.targetId).toBe(A.id)
  })

  it('one with limit 3: replays twice then advances + mode off', () => {
    const q = [A, B]
    const s1 = nextPlaybackStep({ mode: 'one', queue: q, currentId: A.id, oneLimit: 3, oneRemaining: 3 })
    expect(s1.action).toBe('replay')
    expect(s1.oneRemaining).toBe(2)
    const s2 = nextPlaybackStep({ mode: 'one', queue: q, currentId: A.id, oneLimit: 3, oneRemaining: s1.oneRemaining })
    expect(s2.action).toBe('replay')
    expect(s2.oneRemaining).toBe(1)
    const s3 = nextPlaybackStep({ mode: 'one', queue: q, currentId: A.id, oneLimit: 3, oneRemaining: s2.oneRemaining })
    expect(s3.action).toBe('advance')
    expect(s3.targetId).toBe(B.id)
    expect(s3.setMode).toBe('off')
  })

  it('one with limit on tail: stops + mode off', () => {
    const r = nextPlaybackStep({ mode: 'one', queue: [B], currentId: B.id, oneLimit: 2, oneRemaining: 1 })
    expect(r.action).toBe('stop')
    expect(r.setMode).toBe('off')
  })

  it('unknown currentId falls back to head', () => {
    const r = nextPlaybackStep({ mode: 'off', queue: [B], currentId: 'ZZZZZZZZZZZ' })
    expect(r.action).toBe('stop') // B repeat 1, single item -> stop (no crash)
  })
})
