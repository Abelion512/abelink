// Tests: resolusi alias model Gemini Web (murni, tanpa network).
// Kasus asal: opsi 'gemini-3.7-flash' di dropdown jatuh ke 3.6 tanpa efek;
// tidak ada alias latest; mode PRO (3) hilang dari map.
import { describe, it, expect } from 'vitest'
import {
  GEMINI_WEB_MODELS,
  resolveGeminiWebModel
} from '../sidecar/main/services/gemini-web.js'

describe('alias latest + versi 2026', () => {
  it('gemini-latest -> mode 1 (Flash terbaru)', () => {
    expect(resolveGeminiWebModel('gemini-latest').mode).toBe(1)
  })

  it('3.8 / 3.7 eksplisit terdaftar mode 1', () => {
    expect(resolveGeminiWebModel('gemini-3.8-flash').mode).toBe(1)
    expect(resolveGeminiWebModel('gemini-3.8-flash-cyber').mode).toBe(1)
    expect(resolveGeminiWebModel('gemini-3.7-flash').mode).toBe(1)
  })

  it('nama tak dikenal jatuh ke latest (bukan 3.6 pin)', () => {
    expect(resolveGeminiWebModel('gemini-9.9-xyz').name).toBe('gemini-latest')
  })

  it('mode PRO tersedia (3)', () => {
    expect(GEMINI_WEB_MODELS['gemini-3.1-pro'].mode).toBe(3)
    expect(resolveGeminiWebModel('sesuatu-pro').mode).toBe(3)
  })

  it('keluarga lama tak berubah (mode + think)', () => {
    expect(resolveGeminiWebModel('gemini-3.5-flash-thinking')).toMatchObject({ mode: 2, think: 0 })
    expect(resolveGeminiWebModel('gemini-auto').mode).toBe(4)
    expect(resolveGeminiWebModel('gemini-flash-lite').mode).toBe(6)
  })
})
