import { describe, it, expect } from 'vitest'
import { isFreeModelId, orderModelsPreferFree, selectNextModelInPool } from '../sidecar/main/ai-bridge.js'

describe('orderModelsPreferFree (urutan server dihormati, gratis duluan)', () => {
  it('mendeteksi id gratis ala OpenRouter', () => {
    expect(isFreeModelId('kc/nvidia/nemotron-3-super-120b-a12b:free')).toBe(true)
    expect(isFreeModelId('kc/openrouter/free')).toBe(true)
    expect(isFreeModelId('FREE')).toBe(true) // id persis `free` (arti harfiah)
    expect(isFreeModelId('claude-work')).toBe(false)
    expect(isFreeModelId('qwen')).toBe(false)
    expect(isFreeModelId('')).toBe(false)
  })

  it('stabil: gratis naik duluan, sisanya ikut urutan server (tanpa sort abjad)', () => {
    const server = ['abelink', 'claude-work', 'kc/openrouter/free', 'ahm', 'zzz-paid', 'kc/nvidia/x:free', 'qwen']
    expect(orderModelsPreferFree(server)).toEqual([
      'kc/openrouter/free',
      'kc/nvidia/x:free',
      'abelink',
      'claude-work',
      'ahm',
      'zzz-paid',
      'qwen'
    ])
  })

  it('dedupe + buang kosong, tanpa mengubah urutan relatif', () => {
    expect(orderModelsPreferFree(['b', '', 'a', 'b', null, 'a'])).toEqual(['b', 'a'])
  })
})

describe('selectNextModelInPool (resiliensi model pool dan rotasi multi-provider)', () => {
  it('rotasi model dari claude-work ke fallbackModel default saat limit', () => {
    const next = selectNextModelInPool('claude-work')
    expect(next).toBe('gemini-2.5-flash')
  })

  it('rotasi model dari claude-work ke custom fallbackModel', () => {
    const next = selectNextModelInPool('claude-work', { fallbackModel: 'deepseek-r1' })
    expect(next).toBe('deepseek-r1')
  })

  it('rotasi berurutan dalam modelPool jika tersedia array pool', () => {
    const pool = ['claude-work', 'deepseek-r1', 'gemini-2.5-flash']
    expect(selectNextModelInPool('claude-work', { modelPool: pool })).toBe('deepseek-r1')
    expect(selectNextModelInPool('deepseek-r1', { modelPool: pool })).toBe('gemini-2.5-flash')
    expect(selectNextModelInPool('gemini-2.5-flash', { modelPool: pool })).toBe('claude-work')
  })
})
