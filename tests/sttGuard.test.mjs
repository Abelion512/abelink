// sttGuard — anti-halusinasi VAD/STT (pure, tanpa I/O).
import { describe, it, expect, vi } from 'vitest'
import {
  isSpeechValid,
  isHallucinationText,
  filterSegments,
  DEFAULT_STT_MODEL,
  PLACEHOLDER_STT_MODELS,
  PEAK_RMS_MIN,
  SPEECH_RATIO_MIN,
  VOCAL_SEC_MIN,
} from '../src/api/sttGuard.js'
import { transcribeToEndpoint } from '../src/api/sttRouter.js'
import * as db from '../src/api/db.js'
import { resolveDataHome, brandDir } from '../sidecar/main/utils/dataHome.mjs'

describe('isSpeechValid (pre-STT gate)', () => {
  it('menolak durasi vokal di bawah minimum', () => {
    const r = isSpeechValid({ peakRms: 0.1, speechFrames: 8, totalFrames: 10, durationSec: 0.2 })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/durasi/)
  })
  it('menolak peak RMS noise lantai', () => {
    const r = isSpeechValid({ peakRms: 0.005, speechFrames: 8, totalFrames: 10, durationSec: 2 })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/peak RMS/)
  })
  it('menolak rasio speech-frame rendah (kasus 65536 sampel noise)', () => {
    const r = isSpeechValid({ peakRms: 0.05, speechFrames: 2, totalFrames: 16, durationSec: 4.096 })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/rasio/)
  })
  it('menerima ucapan valid', () => {
    const r = isSpeechValid({ peakRms: PEAK_RMS_MIN + 0.05, speechFrames: 8, totalFrames: 10, durationSec: VOCAL_SEC_MIN + 1 })
    expect(r.ok).toBe(true)
  })
  it('menerima ucapan pendek (2 frame speech + 8 frame trailing silence)', () => {
    const r = isSpeechValid({ peakRms: 0.05, speechFrames: 2, totalFrames: 10, durationSec: 0.512 })
    expect(r.ok).toBe(true)
  })
  it('batas tepat di ambang diterima', () => {
    const r = isSpeechValid({
      peakRms: PEAK_RMS_MIN,
      speechFrames: SPEECH_RATIO_MIN * 100,
      totalFrames: 100,
      durationSec: VOCAL_SEC_MIN,
    })
    expect(r.ok).toBe(true)
  })
})

describe('isHallucinationText (post-filter teks)', () => {
  it('membuang teks kosong / 1 char', () => {
    expect(isHallucinationText('', 4).drop).toBe(true)
    expect(isHallucinationText('a', 4).drop).toBe(true)
  })
  it('membuang intro asisten khas halusinasi (kasus nyata log)', () => {
    const t1 = 'Halo! Saya adalah asisten Linux berbahasa Indonesia. Saya bisa membantu Anda dengan berbagai macam tugas.'
    expect(isHallucinationText(t1, 4.096).drop).toBe(true)
    const t2 = 'Halo! Saya adalah asisten AI, dan saya bisa membantu Anda. Saya dilatih oleh Google.'
    expect(isHallucinationText(t2, 4.096).drop).toBe(true)
  })
  it('membuang template subtitle (en + zh)', () => {
    expect(isHallucinationText('Thanks for watching, please subscribe', 3).drop).toBe(true)
    expect(isHallucinationText('谢谢观看请订阅', 3).drop).toBe(true)
  })
  it('membuang cps tak wajar (400+ char dalam 4s)', () => {
    const long = 'kata '.repeat(100)
    const r = isHallucinationText(long, 4.096)
    expect(r.drop).toBe(true)
    expect(r.reason).toMatch(/cps/)
  })
  it('melewatkan ucapan normal id/en/zh', () => {
    expect(isHallucinationText('Tolong bukakan YouTube dan putar musik jazz', 3).drop).toBe(false)
    expect(isHallucinationText('Please open the terminal and list files', 3).drop).toBe(false)
    expect(isHallucinationText('你好请打开浏览器', 2).drop).toBe(false)
  })
  it('melewatkan ucapan cepat berimbuhan bahasa Indonesia (35 cps)', () => {
    // 35 karakter dalam 1.0 detik
    expect(isHallucinationText('Pertanggungjawabkan laporan ini segera', 1.0).drop).toBe(false)
  })
  it('tanpa durasi: hanya denylist yang berlaku', () => {
    expect(isHallucinationText('kata '.repeat(100), 0).drop).toBe(false)
    expect(isHallucinationText('Saya adalah asisten virtual', 0).drop).toBe(true)
  })
})

describe('filterSegments (verbose_json)', () => {
  it('membuang segmen sunyi / tak-percaya-diri / repetitif, gabung sisanya', () => {
    const out = filterSegments([
      { text: ' halo dunia ', no_speech_prob: 0.1, avg_logprob: -0.2, compression_ratio: 1.1 },
      { text: 'sunyi', no_speech_prob: 0.9, avg_logprob: -0.2, compression_ratio: 1.1 },
      { text: 'ragu', no_speech_prob: 0.1, avg_logprob: -2.5, compression_ratio: 1.1 },
      { text: 'ulang ulang ulang', no_speech_prob: 0.1, avg_logprob: -0.2, compression_ratio: 3.0 },
      { text: '   ', no_speech_prob: 0.1, avg_logprob: -0.2, compression_ratio: 1.1 },
    ])
    expect(out).toBe('halo dunia')
  })
  it('mempertahankan segmen dengan avg_logprob wajar untuk bahasa non-Inggris (-1.2)', () => {
    const out = filterSegments([
      { text: 'selamat pagi kawan', no_speech_prob: 0.05, avg_logprob: -1.2, compression_ratio: 1.2 }
    ])
    expect(out).toBe('selamat pagi kawan')
  })
  it('semua segmen dibuang -> string kosong', () => {
    expect(filterSegments([{ text: 'x', no_speech_prob: 0.99 }])).toBe('')
  })
  it('non-array -> null (fallback teks polos)', () => {
    expect(filterSegments(null)).toBe(null)
    expect(filterSegments(undefined)).toBe(null)
  })
})

describe('transcribeToEndpoint (anti-halusinasi request)', () => {
  it('tanpa prompt + temperature 0 + coba verbose_json dulu', async () => {
    const bodies = []
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockImplementation(async (url, opts) => {
      const form = opts?.body
      const entries = {}
      for (const [k, v] of form.entries()) {
        if (typeof v === 'string') entries[k] = v
      }
      bodies.push({ url: String(url), entries })
      return { ok: true, json: async () => ({ text: 'halo' }) }
    })
    try {
      const text = await transcribeToEndpoint(new Float32Array(1600), {
        endpoint: 'http://127.0.0.1:20128',
        model: 'm',
        language: 'zh',
      })
      expect(text).toBe('halo')
      expect(bodies.length).toBe(1)
      expect(bodies[0].entries.response_format).toBe('verbose_json')
      expect(bodies[0].entries.temperature).toBe('0')
      expect(bodies[0].entries.language).toBe('zh')
      expect('prompt' in bodies[0].entries).toBe(false)
    } finally {
      global.fetch = originalFetch
    }
  })

  it('fallback ke json bila endpoint menolak verbose_json', async () => {
    let calls = 0
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockImplementation(async (url, opts) => {
      calls += 1
      const fmt = [...opts.body.entries()].find(([k]) => k === 'response_format')?.[1]
      if (fmt === 'verbose_json') {
        return { ok: false, status: 400, statusText: 'Bad Request', text: async () => 'unknown format' }
      }
      return { ok: true, json: async () => ({ text: 'ok-fallback' }) }
    })
    try {
      const text = await transcribeToEndpoint(new Float32Array(1600), { endpoint: 'http://127.0.0.1:20128' })
      expect(text).toBe('ok-fallback')
      expect(calls).toBe(2)
    } finally {
      global.fetch = originalFetch
    }
  })

  it('memfilter segmen verbose_json sebelum return', async () => {
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        text: 'halo sunyi',
        segments: [
          { text: 'halo', no_speech_prob: 0.1, avg_logprob: -0.2, compression_ratio: 1.0 },
          { text: 'sunyi', no_speech_prob: 0.95, avg_logprob: -0.2, compression_ratio: 1.0 },
        ],
      }),
    })
    try {
      const text = await transcribeToEndpoint(new Float32Array(1600), { endpoint: 'http://127.0.0.1:20128' })
      expect(text).toBe('halo')
    } finally {
      global.fetch = originalFetch
    }
  })

  it('bahasa id/en/zh diteruskan apa adanya', async () => {
    vi.spyOn(db, 'getAllConfig').mockResolvedValue([
      {
        sttProvider: 'custom',
        sttStrategy: 'fallback',
        sttLanguage: 'en',
        sttConnections: [{ id: 'c', name: 'C', endpoint: 'http://127.0.0.1:20128/v1/audio/transcriptions', apiKey: '', model: 'm', enabled: true }],
      },
    ])
    const seen = []
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockImplementation(async (url, opts) => {
      seen.push([...opts.body.entries()].find(([k]) => k === 'language')?.[1])
      return { ok: true, json: async () => ({ text: 'hi' }) }
    })
    try {
      const { transcribeAudioUnified } = await import('../src/api/sttRouter.js')
      await transcribeAudioUnified(new Float32Array(1600), null, () => {})
      expect(seen).toEqual(['en'])
    } finally {
      global.fetch = originalFetch
      vi.restoreAllMocks()
    }
  })

  it('bootstrap tanpa model mengirim default 9router namespaced', async () => {
    vi.spyOn(db, 'getAllConfig').mockResolvedValue([
      {
        sttProvider: 'custom',
        sttStrategy: 'fallback',
        sttLanguage: 'id',
        customSttEndpoint: 'http://127.0.0.1:20128/v1/audio/transcriptions',
        customSttApiKey: '',
        sttConnections: [],
      },
    ])
    const seen = []
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockImplementation(async (url, opts) => {
      seen.push([...opts.body.entries()].find(([k]) => k === 'model')?.[1])
      return { ok: true, json: async () => ({ text: 'halo' }) }
    })
    try {
      const { transcribeAudioUnified } = await import('../src/api/sttRouter.js')
      await transcribeAudioUnified(new Float32Array(1600), null, () => {})
      expect(seen).toEqual([DEFAULT_STT_MODEL])
    } finally {
      global.fetch = originalFetch
      vi.restoreAllMocks()
    }
  })
})

describe('dataHome (unifikasi namespace)', () => {
  it('ABELINK_DATA_HOME menang (sudah termasuk brand)', () => {
    expect(resolveDataHome({ ABELINK_DATA_HOME: '/d/abelink-dev', XDG_DATA_HOME: '/x', HOME: '/h' })).toBe('/d/abelink-dev')
    expect(brandDir({ ABELINK_DATA_HOME: '/d/abelink-dev' })).toBe('/d/abelink-dev/abelink')
  })
  it('tanpa override: XDG + brand sekali', () => {
    expect(brandDir({ XDG_DATA_HOME: '/x', HOME: '/h' })).toBe('/x/abelink')
    expect(brandDir({ HOME: '/h' })).toBe('/h/.local/share/abelink')
  })
})

describe('model STT default (placeholder -> 9router namespaced)', () => {
  it('default = groq/whisper-large-v3-turbo; placeholder lama terdaftar', () => {
    expect(DEFAULT_STT_MODEL).toBe('groq/whisper-large-v3-turbo')
    expect(PLACEHOLDER_STT_MODELS).toContain('selfhosted-stt/whisper-1')
  })
  it('migrasi v28: logika rewrite hanya sentuh placeholder', () => {
    // Simulasi fungsi modify v28 tanpa Dexie: placeholder -> default,
    // model custom user dipertahankan.
    const isPlaceholder = (m) => PLACEHOLDER_STT_MODELS.includes((m || '').trim())
    const rewrite = (config) => {
      if (isPlaceholder(config.customSttModel)) config.customSttModel = DEFAULT_STT_MODEL
      for (const c of config.sttConnections || []) {
        if (c && isPlaceholder(c.model)) c.model = DEFAULT_STT_MODEL
      }
      return config
    }
    const out = rewrite({
      customSttModel: 'selfhosted-stt/whisper-1',
      sttConnections: [
        { id: 'a', model: 'selfhosted-stt/whisper-1' },
        { id: 'b', model: 'whisper-large-v3' },
        { id: 'c', model: '  selfhosted-stt/whisper-1  ' },
      ],
    })
    expect(out.customSttModel).toBe(DEFAULT_STT_MODEL)
    expect(out.sttConnections[0].model).toBe(DEFAULT_STT_MODEL)
    expect(out.sttConnections[1].model).toBe('whisper-large-v3')
    expect(out.sttConnections[2].model).toBe(DEFAULT_STT_MODEL)
  })
})
