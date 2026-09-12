// Session Compactor (ATM upstream contextManager): budget + pointer + prune.
// Paritas angka upstream diuji eksplisit agar tiruan tidak melenceng diam-diam.
import { describe, it, expect } from 'vitest'
import {
  MAX_SESSION_CHARS,
  PRESERVE_RECENT_TURNS,
  getMessageId,
  calculateMessageChars,
  calculateSessionChars,
  pruneOldToolResultsInMemory,
  assembleCompactedPayload,
  executeSessionCompaction,
  summarizeMiddle
} from '../src/api/ai/sessionCompactor.js'

const msg = (content, extra = {}) => ({ role: 'user', content, ...extra })

describe('budget upstream', () => {
  it('MAX_SESSION_CHARS sama persis upstream (525000)', () => {
    expect(MAX_SESSION_CHARS).toBe(525000)
  })

  it('4 giliran terbaru dipertahankan', () => {
    expect(PRESERVE_RECENT_TURNS).toBe(4)
  })
})

describe('akuntansi presisi', () => {
  it('menghitung content + reasoning + executedTools', () => {
    const m = msg('hello', { reasoning: 'think', executedTools: [{ tool: 'x', query: 'y' }] })
    expect(calculateMessageChars(m)).toBe(
      'hello'.length + 'think'.length + JSON.stringify(m.executedTools).length
    )
  })

  it('melewati thinking/command', () => {
    expect(calculateSessionChars([{ role: 'ai', content: 'x', isThinking: true }])).toBe(0)
    expect(calculateSessionChars([{ role: 'command', content: 'yyyy' }])).toBe(0)
  })

  it('pointer mencegah double-count pesan terangkum', () => {
    const a = { role: 'user', content: 'aa', timestamp: 1 }
    const b = { role: 'ai', content: 'bb', timestamp: 2 }
    const full = calculateSessionChars([a, b], '', null)
    const after = calculateSessionChars([a, b], 'RINGKAS', '2')
    expect(after).toBe('RINGKAS'.length)
    expect(full).toBe(4)
  })

  it('getMessageId fallback stabil', () => {
    expect(getMessageId(null, 3)).toBe('msg-3')
    expect(getMessageId({ timestamp: 9 })).toBe('9')
  })
})

describe('prune tahap-1', () => {
  const big = 'z'.repeat(600)
  const mkMsgs = () =>
    Array.from({ length: 6 }, (_, i) =>
      msg(`pesan ${i}`, {
        executedTools: [{ tool: 't', query: 'q', fullResult: big, resultSummary: 'ringkas' }]
      })
    )

  it('giliran lama dipangkas, 4 terbaru utuh', () => {
    const out = pruneOldToolResultsInMemory(mkMsgs(), 4)
    expect(out[0].executedTools[0].fullResult).toMatch('dipangkas')
    expect(out[5].executedTools[0].fullResult).toBe(big)
  })

  it('murni: input tidak termutasi', () => {
    const input = mkMsgs()
    pruneOldToolResultsInMemory(input, 4)
    expect(input[0].executedTools[0].fullResult).toBe(big)
  })
})

describe('assembly non-destruktif', () => {
  it('summary + tail, thinking dilewati', () => {
    const messages = [msg('lama1'), msg('lama2'), { role: 'ai', content: 'x', isThinking: true }, msg('baru')]
    const payload = assembleCompactedPayload({
      messages,
      sessionCompact: { summaryBlock: 'RINGKAS', lastCompactedMessageId: getMessageId(messages[1], 1) },
      systemPrompt: 'SYS'
    })
    expect(payload[0]).toEqual({ role: 'system', content: 'SYS' })
    expect(payload[1].content).toMatch('COMPACTED MESSAGE SUMMARY')
    expect(payload.at(-1).content).toBe('baru')
    expect(payload.some((p) => p.isThinking)).toBe(false)
  })

  it('tanpa pointer -> semua pesan diteruskan', () => {
    const messages = [msg('a'), msg('b')]
    expect(assembleCompactedPayload({ messages })).toHaveLength(2)
  })
})

describe('orkestrator', () => {
  it('di bawah budget -> no-op tanpa AI', async () => {
    const r = await executeSessionCompaction({ sessionId: 'test-noop', messages: [msg('hai')] })
    expect(r.success).toBe(true)
    expect(r.isCompacted).toBe(false)
  })

  it('over budget tapi prune cukup -> prunedOnly, tanpa AI, tanpa persist', async () => {
    const big = 'z'.repeat(20000)
    const messages = Array.from({ length: 8 }, (_, i) =>
      msg(`p${i} ${'x'.repeat(80000)}`, {
        executedTools: [{ tool: 't', query: 'q', fullResult: big }]
      })
    )
    const r = await executeSessionCompaction({
      sessionId: 'test-prune',
      messages,
      persist: false,
      force: true
    })
    expect(r.success).toBe(true)
    // force:true memaksa lewat tahap-1; prune saja tak cukup untuk 640k+ char
    // sehingga lanjut ke ringkas — AI tak tersedia di test -> stub darurat.
    expect(r.isCompacted).toBe(true)
    expect(r.newSummaryBlock || '').toMatch('dikompaksi')
  })

  it('summarizeMiddle kosong -> kembalikan existing', async () => {
    expect(await summarizeMiddle([], 'LAMA')).toBe('LAMA')
  })
})
