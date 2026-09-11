// Regression tests: pesan offline sesuai provider yang dipakai.
// Target: providerOfflineMessage di sidecar/main/ai-bridge.js.
// Kasus asal: 9Router dimatikan tapi user diberitahu "LM Studio mati ...
// port 1234" — provider salah, port salah, tidak bisa ditindaklanjuti.

import { describe, it, expect } from 'vitest'
import { providerOfflineMessage } from '../sidecar/main/ai-bridge.js'

describe('providerOfflineMessage', () => {
  it('jalur default menyebut 9Router + port 20128, bukan LM Studio port 1234', () => {
    for (const p of [undefined, null, 'lm-studio', 'gemini-web', '']) {
      const msg = providerOfflineMessage(p, 'http://localhost:20128/v1/chat/completions')
      expect(msg).toContain('20128')
      expect(msg).not.toContain('1234')
    }
  })

  it('custom menyebut endpoint-nya sendiri', () => {
    const msg = providerOfflineMessage('custom', 'http://myhost:8080/v1/chat/completions')
    expect(msg).toContain('myhost:8080')
    expect(msg).toContain('API key')
  })

  it('groq menyebut Groq (bukan localhost)', () => {
    const msg = providerOfflineMessage('groq', 'https://api.groq.com/openai/v1/chat/completions')
    expect(msg).toContain('Groq')
    expect(msg).not.toContain('localhost')
  })

  it('selalu memberi aksi perbaikan', () => {
    for (const msg of [
      providerOfflineMessage(undefined, ''),
      providerOfflineMessage('custom', ''),
      providerOfflineMessage('groq', '')
    ]) {
      expect(msg.length).toBeGreaterThan(30)
      expect(/nyalakan|cek|coba lagi/i.test(msg)).toBe(true)
    }
  })
})
