// compactZone boundary gaps (fraksi MAX_SESSION_CHARS).
import { describe, expect, it } from 'vitest'
import { COMPACT_SUGGEST_AT, COMPACT_WARN_AT, MAX_SESSION_CHARS, compactZone } from '../src/api/ai/sessionCompactor.js'

const pct = (p) => Math.floor(MAX_SESSION_CHARS * p)

describe('compactZone boundaries', () => {
  it('exports progressive thresholds', () => {
    expect(COMPACT_WARN_AT).toBe(0.75)
    expect(COMPACT_SUGGEST_AT).toBe(0.9)
  })

  it('74% -> ok, 75% -> warn', () => {
    expect(compactZone(pct(0.74))).toBe('ok')
    expect(compactZone(pct(0.75))).toBe('warn')
  })

  it('90% -> suggest, 100% -> full', () => {
    expect(compactZone(pct(0.9))).toBe('suggest')
    expect(compactZone(MAX_SESSION_CHARS)).toBe('full')
  })

  it('just-below edges stay in lower zone', () => {
    expect(compactZone(pct(0.75) - 1)).toBe('ok')
    expect(compactZone(pct(0.9) - 1)).toBe('warn')
    expect(compactZone(MAX_SESSION_CHARS - 1)).toBe('suggest')
  })
})
