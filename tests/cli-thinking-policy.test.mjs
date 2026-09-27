// tests/cli-thinking-policy.test.mjs — S2: thinking per-model (qwen-pattern).
// Truth-table per thinkingFormat 9Router + clamp + maxOut clamp. Murni.
import { describe, it, expect } from 'vitest'
import {
  EFFORT_ORDER,
  effortsFor,
  clampEffort,
  thinkingPayload,
  capSummary,
} from '../cli/tui/thinkingPolicy.mjs'

describe('effortsFor (subset per profile)', () => {
  it('claude-adaptive full; claude-budget tanpa xhigh', () => {
    expect(effortsFor('claude-adaptive')).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    expect(effortsFor('claude-budget')).toEqual(['low', 'medium', 'high', 'max'])
  })
  it('openai full set; format lain -> konservatif', () => {
    expect(effortsFor('openai')).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    for (const f of ['qwen', 'kimi', 'deepseek', 'zai', 'gemini-level', null, 'aneh']) {
      expect(effortsFor(f)).toEqual(['low', 'medium', 'high'])
    }
  })
})

describe('clampEffort (claude-code fallback)', () => {
  it('didukung -> utuh', () => {
    expect(clampEffort('high', ['low', 'medium', 'high'])).toBe('high')
  })
  it('tak didukung -> tertinggi di bawahnya', () => {
    expect(clampEffort('xhigh', ['low', 'medium', 'high', 'max'])).toBe('high')
    expect(clampEffort('max', ['low'])).toBe('low')
  })
  it('unknown -> medium', () => {
    expect(clampEffort('ngawur', ['low', 'medium', 'high'])).toBe('medium')
  })
})

describe('thinkingPayload truth-table', () => {
  it('claude-adaptive: adaptive + output_config, tanpa budget', () => {
    const p = thinkingPayload({ thinkFmt: 'claude-adaptive', reasoning: true, effort: 'xhigh', maxTokens: 65536 })
    expect(p.thinking).toEqual({ type: 'adaptive' })
    expect(p.output_config).toEqual({ effort: 'xhigh' })
    expect(p.reasoning_effort).toBe(undefined)
    expect(p.max_tokens).toBe(65536)
  })
  it('claude-budget: flag budget + clamp (tanpa xhigh)', () => {
    const p = thinkingPayload({ thinkFmt: 'claude-budget', reasoning: true, effort: 'xhigh', maxTokens: 32768 })
    expect(p.clamped).toBe('high')
    expect(p.budgetTokens).toBe(true)
    expect(p.thinking).toBe(null)
  })
  it('openai/zen-free: reasoning_effort saja', () => {
    const p = thinkingPayload({ thinkFmt: 'openai', reasoning: true, effort: 'high', maxTokens: 16384 })
    expect(p.reasoning_effort).toBe('high')
    expect(p.thinking).toBe(undefined)
    expect(p.profile).toBe('openai')
  })
  it('tanpa reasoning -> strip semua', () => {
    const p = thinkingPayload({ thinkFmt: null, reasoning: false, effort: 'high', maxTokens: 4096 })
    expect(p).toMatchObject({ profile: 'none', max_tokens: 4096 })
    expect(p.reasoning_effort).toBe(undefined)
    expect(p.thinking).toBe(undefined)
  })
  it('maxOut clamp: want > cap -> cap', () => {
    expect(thinkingPayload({ thinkFmt: 'qwen', reasoning: true, effort: 'high', maxTokens: 65536, maxOut: 64000 }).max_tokens).toBe(64000)
    expect(thinkingPayload({ thinkFmt: 'qwen', reasoning: true, effort: 'high', maxTokens: null, maxOut: 64000 }).max_tokens).toBe(64000)
  })
})

describe('capSummary', () => {
  it('satu baris ringkas', () => {
    expect(capSummary({ reasoning: true, ctx: 1048576, maxOut: 131072, thinkFmt: 'openai' }))
      .toBe('reasoning · 1048576ctx · max131072 · openai')
    expect(capSummary({})).toBe('no-reasoning')
  })
})

describe('EFFORT_ORDER stabil', () => {
  it('low..max berurutan', () => {
    expect([...EFFORT_ORDER]).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
  })
})
