// Test providerRegistry: smart normalizer endpoint (smart system + UX),
// preset data-driven, dan idempotensi — tanpa I/O, tanpa mock jaringan.
import { describe, it, expect } from 'vitest'
import {
  canonicalizeEndpointUrl,
  resolveEndpointUrl,
  resolveChatEndpoint,
  presetEndpoint,
  getPreset,
  listPresets,
  suggestProtocol,
  detectFromUrl,
  LEGACY_HOSTS,
} from '../src/api/ai/providerRegistry.ts'

describe('canonicalizeEndpointUrl', () => {
  it('membuang trailing slash (termasuk dobel) secara idempoten', () => {
    expect(canonicalizeEndpointUrl('http://h:8080/v1//', 'chat')).toBe('http://h:8080/v1')
    expect(canonicalizeEndpointUrl('http://h:8080/v1/', 'chat')).toBe('http://h:8080/v1')
  })

  it('mengonversi localhost ke 127.0.0.1 (WebKitGTK [::1] guard)', () => {
    expect(canonicalizeEndpointUrl('http://localhost:1234/v1', 'chat')).toBe('http://127.0.0.1:1234/v1')
    expect(canonicalizeEndpointUrl('https://localhost/', 'chat')).toBe('https://127.0.0.1')
  })

  it('membuang suffix path final per kind', () => {
    expect(canonicalizeEndpointUrl('http://h/v1/chat/completions', 'chat')).toBe('http://h/v1')
    expect(canonicalizeEndpointUrl('http://h/v1/audio/transcriptions', 'stt')).toBe('http://h/v1')
    expect(canonicalizeEndpointUrl('http://h/v1/audio/speech', 'tts')).toBe('http://h/v1')
  })

  it('input kosong/aneh -> string kosong, tidak pernah throw', () => {
    expect(canonicalizeEndpointUrl('', 'chat')).toBe('')
    expect(canonicalizeEndpointUrl(null, 'chat')).toBe('')
    expect(canonicalizeEndpointUrl(undefined, 'chat')).toBe('')
  })
})

describe('resolveEndpointUrl (smart system)', () => {
  it('base tanpa /v1 -> otomatis /v1 + suffix', () => {
    expect(resolveEndpointUrl('https://x.com/openai', 'chat')).toBe('https://x.com/openai/v1/chat/completions')
    expect(resolveEndpointUrl('http://127.0.0.1:20128', 'chat')).toBe('http://127.0.0.1:20128/v1/chat/completions')
  })

  it('base dengan /v1 -> cukup suffix', () => {
    expect(resolveEndpointUrl('https://x.com/v1', 'chat')).toBe('https://x.com/v1/chat/completions')
    expect(resolveEndpointUrl('https://x.com/v1/', 'chat')).toBe('https://x.com/v1/chat/completions')
  })

  it('URL final lengkap -> identik (idempoten, tanpa dobel path)', () => {
    const once = resolveEndpointUrl('https://x.com/v1', 'chat')
    expect(resolveEndpointUrl(once, 'chat')).toBe(once)
    expect(resolveEndpointUrl('https://x.com/v1/chat/completions/', 'chat')).toBe('https://x.com/v1/chat/completions')
  })

  it('versi di tengah path (https://host/openai/v1) tetap dikenali', () => {
    expect(resolveEndpointUrl('https://host/openai/v1', 'chat')).toBe('https://host/openai/v1/chat/completions')
  })

  it('kind stt & tts', () => {
    expect(resolveEndpointUrl('http://127.0.0.1:20128', 'stt')).toBe('http://127.0.0.1:20128/v1/audio/transcriptions')
    expect(resolveEndpointUrl('http://127.0.0.1:20128/v1', 'tts')).toBe('http://127.0.0.1:20128/v1/audio/speech')
  })

  it('input kosong -> kosong', () => {
    expect(resolveEndpointUrl('', 'chat')).toBe('')
  })
})

describe('resolveChatEndpoint', () => {
  it('presetId eksplisit menang', () => {
    expect(resolveChatEndpoint({ presetId: 'openrouter', customEndpoint: 'http://ignored/v1' }))
      .toBe('https://openrouter.ai/api/v1/chat/completions')
  })

  it('customEndpoint dinormalisasi smart', () => {
    expect(resolveChatEndpoint({ customEndpoint: 'myhost:8080/v1/chat/completions' }))
      .toBe('myhost:8080/v1/chat/completions')
    expect(resolveChatEndpoint({ customEndpoint: 'http://localhost:8080/openai' }))
      .toBe('http://127.0.0.1:8080/openai/v1/chat/completions')
  })

  it('aiProvider lm-studio -> preset lm-studio (kompatibilitas config lama)', () => {
    expect(resolveChatEndpoint({ aiProvider: 'lm-studio' })).toBe('http://127.0.0.1:1234/v1/chat/completions')
  })

  it('fallback: 9Router lokal', () => {
    expect(resolveChatEndpoint({})).toBe('http://127.0.0.1:20128/v1/chat/completions')
  })
})

describe('preset data-driven', () => {
  it('preset tanpa kapabilitas kind -> string kosong (bukan URL bohong)', () => {
    expect(presetEndpoint('lm-studio', 'stt')).toBe('')
    expect(presetEndpoint('openrouter', 'stt')).toBe('')
  })

  it('getPreset/listPresets konsisten dan selalu punya name+protocol', () => {
    const all = listPresets()
    expect(all.length).toBeGreaterThanOrEqual(7)
    for (const p of all) {
      expect(getPreset(p.id)).toBeTruthy()
      expect(typeof p.name).toBe('string')
      expect(['openai', 'anthropic']).toContain(p.protocol)
    }
  })

  it('menambah provider = menambah ENTRI, bukan cabang kode', () => {
    // Kontrak desain: semua preset bentuknya seragam (id/name/protocol/chat).
    for (const p of listPresets()) {
      expect(Object.keys(p)).toEqual(expect.arrayContaining(['id', 'name', 'protocol', 'chat']))
    }
  })
})

describe('suggestProtocol', () => {
  it('protocol eksplisit (bukan auto) menang', () => {
    expect(suggestProtocol({ customApiProtocol: 'anthropic', presetId: 'openrouter' })).toBe('anthropic')
  })

  it('preset -> protocol preset; URL anthropic -> anthropic; selainnya auto', () => {
    expect(suggestProtocol({ presetId: 'anthropic' })).toBe('anthropic')
    expect(suggestProtocol({ customEndpoint: 'https://api.anthropic.com/v1' })).toBe('anthropic')
    expect(suggestProtocol({ customEndpoint: 'http://h:8080/v1' })).toBe('auto')
  })
})

describe('detectFromUrl (legacy-aware)', () => {
  it('endpoint legacy BUKAN preset (jalur custom, bukan target bawaan)', () => {
    expect(detectFromUrl('https://api.groq.com/openai/v1')).toBeNull()
    expect(LEGACY_HOSTS['api.groq.com']).toBe('https://api.groq.com/openai/v1')
    expect(LEGACY_HOSTS['api.cerebras.ai']).toBe('https://api.cerebras.ai/v1')
  })

  it('mengenali host/port preset yang hidup', () => {
    expect(detectFromUrl('http://127.0.0.1:20128/v1/chat/completions')).toBe('9router')
    expect(detectFromUrl('https://openrouter.ai/api/v1')).toBe('openrouter')
  })

  it('URL asing -> null', () => {
    expect(detectFromUrl('https://example.com/v1')).toBeNull()
    expect(detectFromUrl('')).toBeNull()
  })
})
