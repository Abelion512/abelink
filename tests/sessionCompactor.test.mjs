// Session Compactor (ATM upstream contextManager): budget + pointer + prune.
// Paritas angka upstream diuji eksplisit agar tiruan tidak melenceng diam-diam.
import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  MAX_SESSION_CHARS,
  MAX_SUMMARY_CHUNKS_PER_RUN,
  PRESERVE_RECENT_TURNS,
  getMessageId,
  findMessageIndex,
  getCompactionTail,
  calculateMessageChars,
  calculateSessionChars,
  pruneOldToolResultsInMemory,
  assembleCompactedPayload,
  executeSessionCompaction,
  summarizeMiddle,
  buildSummaryChunks
} from '../src/api/ai/sessionCompactor.js'
import { db, deleteSession, getSessionCompact, saveSessionCompact } from '../src/api/db.js'

// Mock fetchAI (dipakai summarizer) agar coverage AI nyata bisa diuji tanpa network.
const { fetchAIMock } = vi.hoisted(() => ({ fetchAIMock: vi.fn() }))
vi.mock('../src/api/ai/core.js', () => ({ fetchAI: fetchAIMock }))

beforeEach(() => {
  fetchAIMock.mockReset()
})

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

  it('ber-saturasi di budget (pesan raksasa tidak dilaporkan mentah)', () => {
    const huge = msg('x'.repeat(MAX_SESSION_CHARS * 3))
    expect(calculateSessionChars([huge])).toBe(MAX_SESSION_CHARS)
  })

  it('getMessageId fallback stabil', () => {
    expect(getMessageId(null, 3)).toBe('msg-3')
    expect(getMessageId({ timestamp: 9 })).toBe('9')
  })

  it('pointer baru dan legacy cocok pada objek pesan yang sama', () => {
    const item = { id: 'msg-uuid', created_at: 123, timestamp: 'legacy-time' }
    expect(getMessageId(item)).toBe('msg-uuid')
    expect(findMessageIndex([item], 'msg-uuid')).toBe(0)
    expect(findMessageIndex([item], '123')).toBe(0)
    expect(findMessageIndex([item], 'legacy-time')).toBe(0)
  })

  it('pointer stale tidak menghitung summary yang tidak bisa dibuktikan', () => {
    const messages = [msg('aa', { id: 'a' }), msg('bb', { id: 'b' })]
    expect(calculateSessionChars(messages, 'RINGKAS', 'missing')).toBe(4)
  })
})

describe('prune tahap-1', () => {
  const big = 'z'.repeat(600)
  const mkMsgs = () =>
    Array.from({ length: 6 }, (_, i) =>
      msg(`pesan ${i}`, {
        executedTools: [{ tool: 't', query: 'q', fullResult: big }]
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
    const messages = [
      msg('lama1', { id: 'a' }),
      msg('lama2', { id: 'b' }),
      { role: 'ai', content: 'x', isThinking: true },
      msg('baru', { id: 'c' })
    ]
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

  it('pointer tidak ditemukan -> ringkasan tidak disuntikkan ke riwayat yang tidak dapat diverifikasi', () => {
    const messages = [msg('pesan-9', { id: '9' }), msg('pesan-10', { id: '10' })]
    const payload = assembleCompactedPayload({
      messages,
      sessionCompact: { summaryBlock: 'RINGKASAN_LAMA', lastCompactedMessageId: 'msg-ancient' }
    })
    expect(payload).toEqual([
      { role: 'user', content: 'pesan-9' },
      { role: 'user', content: 'pesan-10' }
    ])
  })

  it('no-op and active prompt reconstruction keep one summary plus only the tail', () => {
    const messages = [msg('lama', { id: 'a' }), msg('baru-1', { id: 'b' }), msg('baru-2', { id: 'c' })]
    const compact = { summaryBlock: 'RINGKAS', lastCompactedMessageId: 'a' }
    const active = assembleCompactedPayload({ messages, sessionCompact: compact })
    const noop = assembleCompactedPayload({ messages, sessionCompact: compact })

    expect(active).toEqual(noop)
    expect(active).toEqual([
      { role: 'user', content: '[ COMPACTED MESSAGE SUMMARY ] RINGKAS' },
      { role: 'user', content: 'baru-1' },
      { role: 'user', content: 'baru-2' }
    ])
    expect(getCompactionTail(messages, compact.summaryBlock, compact.lastCompactedMessageId)).toEqual(messages.slice(1))
  })

  it('legacy timestamp pointer still cuts a message that now has a stable id', () => {
    const messages = [
      msg('lama', { id: 'msg-a', created_at: 10, timestamp: 'old-ts' }),
      msg('baru', { id: 'msg-b', created_at: 11, timestamp: 'new-ts' })
    ]
    const payload = assembleCompactedPayload({
      messages,
      sessionCompact: { summaryBlock: 'RINGKAS', lastCompactedMessageId: 'old-ts' }
    })
    expect(payload).toEqual([
      { role: 'user', content: '[ COMPACTED MESSAGE SUMMARY ] RINGKAS' },
      { role: 'user', content: 'baru' }
    ])
  })
})

describe('orkestrator', () => {
  it('di bawah budget -> no-op tanpa AI tapi tetap sertakan summaryBlock', async () => {
    const r = await executeSessionCompaction({ sessionId: 'test-noop', messages: [msg('hai')] })
    expect(r.success).toBe(true)
    expect(r.isCompacted).toBe(false)
    expect('summaryBlock' in r).toBe(true)
  })

  it('no-op mempertahankan summary yang pointer-nya cocok dan hanya mengembalikan tail', async () => {
    const sessionId = 'test-noop-summary'
    const messages = [msg('lama', { id: 'a' }), msg('baru', { id: 'b' })]
    await saveSessionCompact(sessionId, { summaryBlock: 'RINGKAS', lastCompactedMessageId: 'a' })

    const r = await executeSessionCompaction({ sessionId, messages, persist: false })

    expect(r.success).toBe(true)
    expect(r.isCompacted).toBe(false)
    expect(r.summaryBlock).toBe('RINGKAS')
    expect(r.tailMessages).toEqual(messages.slice(1))
  })

  it('no-op membuang summary stale daripada menyuntikkannya ke sesi aktif', async () => {
    const sessionId = 'test-stale-summary'
    await saveSessionCompact(sessionId, { summaryBlock: 'RINGKAS_LAMA', lastCompactedMessageId: 'gone' })

    const r = await executeSessionCompaction({
      sessionId,
      messages: [msg('chat baru', { id: 'new' })],
      persist: false
    })

    expect(r.success).toBe(true)
    expect(r.summaryBlock).toBe('')
    expect(await getSessionCompact(sessionId)).toBeNull()
  })

  it('over budget, summarizer gagal -> success:false TANPA pointer palsu', async () => {
    const big = 'z'.repeat(20000)
    const messages = Array.from({ length: 8 }, (_, i) =>
      msg(`p${i} ${'x'.repeat(80000)}`, {
        id: `f-${i}`,
        executedTools: [{ tool: 't', query: 'q', fullResult: big }]
      })
    )
    // AI tidak tersedia: fetchAI gagal -> coverage 0 -> orchestrator harus
    // gagal jujur, BUKAN menulis stub "N pesan dikompaksi" + pointer palsu.
    fetchAIMock.mockRejectedValue(new Error('ai down'))
    const r = await executeSessionCompaction({
      sessionId: 'test-prune',
      messages,
      persist: false,
      force: true
    })
    expect(r.success).toBe(false)
    expect(r.lastCompactedMessageId).toBeNull()
    expect(r.summaryBlock).toBe('')
    expect(await getSessionCompact('test-prune')).toBeNull()
  })

  it('summarizeMiddle kosong -> kembalikan existing + cakupan 0', async () => {
    const run = await summarizeMiddle([], 'LAMA')
    expect(run.summaryBlock).toBe('LAMA')
    expect(run.coveredCount).toBe(0)
    expect(run.partial).toBe(false)
  })
})

describe('coverage pointer (INVARIANT COVERAGE)', () => {
  // 1 pesan = 1 tag h<N>; teksnya besar supaya chunking benar-benar terjadi.
  const tagged = (i, size = 3000) => ({
    role: i % 2 ? 'user' : 'ai',
    content: `h${i}|` + 'x'.repeat(size),
    timestamp: `ts-h${i}`
  })

  it('chunk menutup SEMUA pesan (tidak ada yang dibuang oleh potongan ekor)', () => {
    const messages = Array.from({ length: 40 }, (_, i) => tagged(i + 1))
    const chunks = buildSummaryChunks(messages, 20000)
    const seen = new Set()
    let lastIndex = -1
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeGreaterThan(0)
      for (const m of chunk.text.matchAll(/(?:User|Abelink): (h\d+)\|/g)) seen.add(m[1])
      expect(chunk.lastIndex).toBeGreaterThan(lastIndex) // oldest-first, monotonik
      lastIndex = chunk.lastIndex
    }
    expect(seen.size).toBe(40)
    expect(chunks.every((c) => c.text.length <= 20000)).toBe(true)
    expect(chunks.at(-1).lastIndex).toBe(39)
  })

  it('chunk 1 gagal, chunk berikut sukses -> coverage berhenti di chunk gagal, tanpa stub', async () => {
    fetchAIMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ content: 'R', error: null })
    const messages = Array.from({ length: 6 }, (_, i) => tagged(i + 1, 4000))
    const run = await summarizeMiddle(messages, '', {}, { maxInputChars: 12000 })
    expect(run.usedFallback).toBe(true)
    expect(run.coveredCount).toBe(0)
    expect(run.summaryBlock).toBe('')
    expect(run.partial).toBe(true)
  })

  it('chunk 1 sukses, chunk 2 gagal -> cakupan persis chunk 1, tanpa teks stub', async () => {
    const messages = Array.from({ length: 6 }, (_, i) => tagged(i + 1, 4000))
    const chunks = buildSummaryChunks(messages, 12000)
    fetchAIMock
      .mockResolvedValueOnce({ content: 'RINGKASAN_SATU', error: null })
      .mockRejectedValueOnce(new Error('boom'))
    const run = await summarizeMiddle(messages, '', {}, { maxInputChars: 12000 })
    expect(run.coveredCount).toBe(chunks[0].lastIndex + 1)
    expect(run.summaryBlock).toBe('RINGKASAN_SATU')
    expect(run.summaryBlock).not.toMatch('dikompaksi')
    expect(run.partial).toBe(true)
  })

  it('executeSessionCompaction tidak memajukan pointer melewati cakupan ringkasan', async () => {
    fetchAIMock.mockResolvedValue({ content: 'RINGKASAN_A', error: null })
    const messages = Array.from({ length: 200 }, (_, i) =>
      msg(`m${i} ${'x'.repeat(2000)}`, { id: `p${i}` })
    )
    // Ekspektasi diturunkan dari buildSummaryChunks sendiri (baris di-clip ~2.5k,
    // jadi pesan/chunk ditentukan kapasitas input, bukan panjang mentah).
    const expectedCovered = buildSummaryChunks(messages)
      .slice(0, MAX_SUMMARY_CHUNKS_PER_RUN)
      .reduce((n, c) => c.lastIndex + 1, 0)
    expect(expectedCovered).toBeLessThan(200) // partial coverage terjadi
    const r = await executeSessionCompaction({
      sessionId: 'test-coverage',
      messages,
      persist: false,
      force: true
    })
    expect(r.isCompacted).toBe(true)
    expect(r.summaryCoverage).toBeTruthy()
    expect(r.summaryCoverage.partial).toBe(true)
    expect(r.summarizedCount).toBe(expectedCovered)
    // Pointer = pesan terakhir yang BENAR-BENAR diringkas, bukan pesan terakhir rentang.
    expect(r.lastCompactedMessageId).toBe(`p${expectedCovered - 1}`)
    expect(r.lastCompactedMessageId).not.toBe('p199')
    // Sisa pesan tetap verbatim di tail window, tanpa gap.
    expect(r.tailMessages.length).toBe(200 - expectedCovered)
    expect(r.tailMessages[0].id).toBe(`p${expectedCovered}`)
    expect(r.tailMessages.at(-1).id).toBe('p199')
    // Persisted compact cocok dengan coverage.
    const persisted = await getSessionCompact('test-coverage')
    expect(persisted.lastCompactedMessageId).toBe(`p${expectedCovered - 1}`)
    expect(persisted.summaryBlock).toBe('RINGKASAN_A')
  })

  it('AI gagal semua -> executeSessionCompaction gagal tanpa menyentuh compact tersimpan', async () => {
    fetchAIMock.mockRejectedValue(new Error('ai down'))
    const messages = Array.from({ length: 10 }, (_, i) => msg(`m${i} ${'x'.repeat(35000)}`, { id: `q${i}` }))
    const r = await executeSessionCompaction({
      sessionId: 'test-fail-all',
      messages,
      persist: false,
      force: true
    })
    expect(r.success).toBe(false)
    expect(await getSessionCompact('test-fail-all')).toBeNull()
  })
})

describe('lifecycle session compact', () => {
  it('deleteSession juga membuang summary dan pointer session', async () => {
    await db.sessions.put({ id: 1, title: 'Main Thread', data: [msg('lama', { id: 'old' })] })
    await saveSessionCompact('1', { summaryBlock: 'RINGKAS', lastCompactedMessageId: 'old' })

    expect(await deleteSession(1)).toBe(true)
    expect(await getSessionCompact('1')).toBeNull()
  })
})
