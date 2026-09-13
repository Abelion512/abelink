import { describe, it, expect } from 'vitest'
import { detectProviderFromUrl } from '../src/api/ai/providerDetect.js'

describe('detectProviderFromUrl', () => {
  it('keyword mengalahkan port', () => {
    expect(detectProviderFromUrl('http://localhost:20128/v1')).toEqual({
      id: 'local-router',
      name: 'Local Router',
      protocol: 'openai'
    })
    expect(detectProviderFromUrl('http://127.0.0.1:9999/omniroute/v1')).toMatchObject({ id: 'omniroute' })
    expect(detectProviderFromUrl('https://9router.local/v1')).toMatchObject({ id: '9router', protocol: 'openai' })
  })

  it('port dikenal: 1234 LM Studio, 11434 Ollama', () => {
    expect(detectProviderFromUrl('http://localhost:1234/v1')).toMatchObject({ id: 'lm-studio' })
    expect(detectProviderFromUrl('http://127.0.0.1:11434/v1')).toMatchObject({ id: 'ollama' })
  })

  it('cloud: openrouter + anthropic (protokol ikut)', () => {
    expect(detectProviderFromUrl('https://openrouter.ai/api/v1')).toMatchObject({ id: 'openrouter', protocol: 'openai' })
    expect(detectProviderFromUrl('https://api.anthropic.com/v1')).toMatchObject({ id: 'anthropic', protocol: 'anthropic' })
  })

  it('tak dikenal/aneh -> custom auto, tak pernah throw', () => {
    expect(detectProviderFromUrl('http://localhost:20128/v1')).toMatchObject({ protocol: 'openai' })
    expect(detectProviderFromUrl('http://myserver:8080/api')).toEqual({ id: 'custom', name: 'Custom', protocol: 'auto' })
    expect(detectProviderFromUrl('')).toEqual({ id: 'custom', name: 'Custom', protocol: 'auto' })
    expect(detectProviderFromUrl(null)).toEqual({ id: 'custom', name: 'Custom', protocol: 'auto' })
    expect(detectProviderFromUrl(42)).toEqual({ id: 'custom', name: 'Custom', protocol: 'auto' })
  })
})
