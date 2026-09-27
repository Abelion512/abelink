import { describe, it, expect } from 'vitest'
import {
  MAX_SESSION_CHARS,
  COMPACT_WARN_AT,
  MIDLOOP_COMPACT_COOLDOWN_TURNS,
  shouldCompactLoop,
  buildCompactedLoopWindow
} from '../src/api/ai/sessionCompactor.js'

const THRESHOLD = MAX_SESSION_CHARS * COMPACT_WARN_AT

describe('shouldCompactLoop', () => {
  it('fires at/above 75% budget with cooldown elapsed', () => {
    expect(shouldCompactLoop({ chars: THRESHOLD, turnsSinceCompact: 5 })).toBe(true)
  })

  it('skips below threshold', () => {
    expect(shouldCompactLoop({ chars: THRESHOLD - 1, turnsSinceCompact: 99 })).toBe(false)
  })

  it('respects cooldown (no compact-every-turn)', () => {
    expect(shouldCompactLoop({ chars: THRESHOLD * 2, turnsSinceCompact: MIDLOOP_COMPACT_COOLDOWN_TURNS - 1 })).toBe(false)
    expect(shouldCompactLoop({ chars: THRESHOLD * 2, turnsSinceCompact: MIDLOOP_COMPACT_COOLDOWN_TURNS })).toBe(true)
  })

  it('defaults allow when turnsSinceCompact omitted (Infinity)', () => {
    expect(shouldCompactLoop({ chars: THRESHOLD })).toBe(true)
  })
})

describe('buildCompactedLoopWindow', () => {
  const tail = [{ role: 'user', content: 'lanjutkan' }]
  const mk = (over = {}) => ({
    success: true,
    isCompacted: true,
    summaryBlock: 'Ringkasan: langkah 1-10 selesai.',
    lastCompactedMessageId: 'm10',
    compactedMessages: [{ id: 'm1' }, { id: 'm10' }],
    tailMessages: tail,
    ...over
  })

  it('returns null on summarizer failure (no fake coverage)', () => {
    expect(buildCompactedLoopWindow([], { success: false })).toBeNull()
    expect(buildCompactedLoopWindow([], null)).toBeNull()
    expect(buildCompactedLoopWindow([], mk({ success: true, isCompacted: false }))).toBeNull()
  })

  it('returns null when summary lacks verified pointer', () => {
    expect(buildCompactedLoopWindow([], mk({ lastCompactedMessageId: null }))).toBeNull()
    expect(buildCompactedLoopWindow([], mk({ summaryBlock: '' }))).toBeNull()
    // pointer not resolvable in window
    expect(buildCompactedLoopWindow([{ id: 'zzz' }], mk({ compactedMessages: [{ id: 'zzz' }] }))).toBeNull()
  })

  it('builds [summary]+tail+system-note window on verified compaction', () => {
    const win = buildCompactedLoopWindow([], mk())
    expect(Array.isArray(win)).toBe(true)
    expect(win.length).toBe(tail.length + 2)
    expect(win[0].content).toContain('Ringkasan')
    expect(win[win.length - 1].content).toContain('SYSTEM / COMPACTION')
  })

  it('pruned-only without AI summary returns pruned messages (safe)', () => {
    const pruned = [{ role: 'user', content: 'a' }]
    const win = buildCompactedLoopWindow([], mk({ prunedOnly: true, summaryBlock: '', compactedMessages: pruned }))
    expect(win).toEqual(pruned)
  })
})
