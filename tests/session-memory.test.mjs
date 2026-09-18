// Session memory: wider window (20) + 2-line old tool results + giant-obs cut + fakta sesi.
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { buildOptimizedChatSession, truncateGiantObservation } from '../src/api/ai/contextCompactor.js'
import { getWorkspaceContext } from '../src/api/workspaceRag.js'

const userMsg = (i) => ({ role: 'user', content: `pesan user ${i}` })
const aiMsg = (i, result) => ({
  role: 'ai',
  content: `jawaban ${i}`,
  isTaskDone: true,
  executedTools: result ? [{ tool: 'read-file', query: `file${i}.js`, fullResult: result }] : []
})

describe('session memory — wider window', () => {
  it('default window keeps 20 msgs', () => {
    const msgs = Array.from({ length: 30 }, (_, i) => userMsg(i))
    const out = buildOptimizedChatSession(msgs)
    expect(out).toHaveLength(20)
    expect(out[0].content).toBe('pesan user 10')
  })

  it('explicit maxTurns still respected', () => {
    const msgs = Array.from({ length: 30 }, (_, i) => userMsg(i))
    expect(buildOptimizedChatSession(msgs, 5)).toHaveLength(5)
  })
})

describe('session memory — old tool log 2-line result', () => {
  it('keeps tool + first 200 chars of result', () => {
    const big = `HASIL-${'x'.repeat(500)}`
    const msgs = Array.from({ length: 5 }, (_, i) => aiMsg(i, i === 0 ? big : `ok-${i}`))
    const out = buildOptimizedChatSession(msgs)
    const first = out[0].content
    expect(first).toContain('[Tool: read-file]')
    expect(first).toContain(`-> ${big.slice(0, 200)}`)
    expect(first).not.toContain(big.slice(200, 400))
  })
})

describe('session memory — giant observation truncation', () => {
  it('head 2500 + tail 500 + marker', () => {
    const text = `HEAD-${'a'.repeat(3000)}-MID-${'b'.repeat(3000)}-TAIL`
    const cut = truncateGiantObservation(text)
    expect(cut.startsWith(text.slice(0, 2500))).toBe(true)
    expect(cut.endsWith(text.slice(-500))).toBe(true)
    expect(cut).toContain('dipangkas')
    expect(cut.length).toBeLessThan(text.length)
  })

  it('leaves <=4000 char text untouched', () => {
    const text = 'z'.repeat(4000)
    expect(truncateGiantObservation(text)).toBe(text)
  })

  it('history assembly marks >4000 char tool result', () => {
    const giant = `G-${'q'.repeat(5000)}`
    const msgs = Array.from({ length: 5 }, (_, i) => aiMsg(i, i === 0 ? giant : `ok-${i}`))
    const out = buildOptimizedChatSession(msgs)
    expect(out[0].content).toContain('dipangkas')
  })
})

describe('session memory — working memory facts', () => {
  const realWindow = globalThis.window
  beforeEach(() => {
    globalThis.window = {
      api: {
        workspaceEnsure: async () => true,
        workspaceIndex: async () => true,
        workspaceGetMemory: async () => ({
          activeObjective: 'refactor auth',
          recentFiles: ['src/auth.js'],
          notes: 'pakai JWT'
        }),
        workspaceQuery: async () => []
      }
    }
  })
  afterEach(() => {
    globalThis.window = realWindow
  })

  it('returns verbatim session facts capped 2000 chars', async () => {
    const ctx = await getWorkspaceContext('/tmp/ws-test', 'halo dunia')
    expect(ctx.workingMemoryText).toContain('refactor auth')
    expect(ctx.sessionFactsText).toContain('refactor auth')
    expect(ctx.sessionFactsText.length).toBeLessThanOrEqual(2000)
  })

  it('skips silently without workspace', async () => {
    const ctx = await getWorkspaceContext(null, 'halo')
    expect(ctx.sessionFactsText).toBe('')
  })
})
