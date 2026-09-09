import { describe, it, expect, vi } from 'vitest'
import { normalizeSttUrl, getHardwareSttSupport, transcribeAudioUnified } from '../src/api/sttRouter.js'
import { extractClipboardFiles } from '../src/utils/attachments.js'
import * as db from '../src/api/db.js'

describe('sttRouter - Multi-Provider Audio Router Combo', () => {
  it('normalizes localhost to 127.0.0.1 and appends /audio/transcriptions', () => {
    expect(normalizeSttUrl('http://localhost:20128')).toBe('http://127.0.0.1:20128/v1/audio/transcriptions')
    expect(normalizeSttUrl('http://localhost:20128/v1')).toBe('http://127.0.0.1:20128/v1/audio/transcriptions')
    expect(normalizeSttUrl('http://localhost:20128/v1/audio/transcriptions')).toBe('http://127.0.0.1:20128/v1/audio/transcriptions')
    expect(normalizeSttUrl('https://api.groq.com/openai/v1')).toBe('https://api.groq.com/openai/v1/audio/transcriptions')
  })

  it('detects hardware support properly', async () => {
    const hw = await getHardwareSttSupport()
    expect(hw).toHaveProperty('cores')
    expect(hw).toHaveProperty('isLowEnd')
    expect(hw).toHaveProperty('recommendation')
    expect(['custom', 'whisper']).toContain(hw.recommendation)
  })

  it('executes fallback when primary connection fails', async () => {
    const mockConfigs = [
      {
        sttProvider: 'custom',
        sttStrategy: 'fallback',
        sttLanguage: 'id',
        sttConnections: [
          {
            id: 'conn-1-fail',
            name: 'Failing Provider',
            endpoint: 'http://127.0.0.1:9999/v1/audio/transcriptions',
            apiKey: '',
            model: 'whisper-1',
            enabled: true
          },
          {
            id: 'conn-2-ok',
            name: 'Working Provider',
            endpoint: 'http://127.0.0.1:20128/v1/audio/transcriptions',
            apiKey: '',
            model: 'whisper-1',
            enabled: true
          }
        ]
      }
    ]

    vi.spyOn(db, 'getAllConfig').mockResolvedValue(mockConfigs)

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockImplementation(async (url) => {
      if (String(url).includes('9999')) {
        throw new Error('Connection refused')
      }
      return {
        ok: true,
        json: async () => ({ text: 'Halo Abelink berhasil transkripsi' })
      }
    })

    const dummyPcm = new Float32Array(1600)
    const statusMessages = []
    const result = await transcribeAudioUnified(dummyPcm, null, (msg) => {
      if (msg) statusMessages.push(msg)
    })

    expect(result).toBe('Halo Abelink berhasil transkripsi')
    expect(statusMessages.some((m) => m.includes('Failing Provider') && m.includes('Failover'))).toBe(true)

    global.fetch = originalFetch
  })

  it('rotates connections in round-robin strategy and passes language parameter', async () => {
    const mockConfigs = [
      {
        sttProvider: 'custom',
        sttStrategy: 'round-robin',
        sttLanguage: 'zh',
        sttConnections: [
          {
            id: 'conn-a',
            name: 'Provider A',
            endpoint: 'http://127.0.0.1:20128/v1/audio/transcriptions',
            apiKey: '',
            model: 'whisper-1',
            enabled: true
          },
          {
            id: 'conn-b',
            name: 'Provider B',
            endpoint: 'http://127.0.0.1:20129/v1/audio/transcriptions',
            apiKey: '',
            model: 'whisper-1',
            enabled: true
          }
        ]
      }
    ]

    vi.spyOn(db, 'getAllConfig').mockResolvedValue(mockConfigs)

    const calls = []
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockImplementation(async (url, opts) => {
      calls.push({ url: String(url), body: opts?.body })
      return {
        ok: true,
        json: async () => ({ text: 'zh transcription success' })
      }
    })

    const dummyPcm = new Float32Array(1600)
    await transcribeAudioUnified(dummyPcm, null, () => {})
    await transcribeAudioUnified(dummyPcm, null, () => {})

    expect(calls.length).toBe(2)
    // Verifikasi rotasi round-robin ke endpoint berbeda
    const urls = calls.map((c) => c.url)
    expect(urls).toContain('http://127.0.0.1:20128/v1/audio/transcriptions')
    expect(urls).toContain('http://127.0.0.1:20129/v1/audio/transcriptions')

    global.fetch = originalFetch
  })
})

describe('attachments - Clipboard File Extraction', () => {
  it('extracts files from clipboard data', async () => {
    const mockFile = new File(['fake-image-bytes'], 'screenshot.png', { type: 'image/png' })
    const clipboardData = {
      items: [
        {
          kind: 'file',
          type: 'image/png',
          getAsFile: () => mockFile
        }
      ]
    }

    const items = await extractClipboardFiles(clipboardData)
    expect(items.length).toBe(1)
    expect(items[0].name).toBe('screenshot.png')
    expect(items[0].type).toBe('image/png')
  })

  it('returns empty array when clipboard has no files', async () => {
    const clipboardData = {
      items: [
        {
          kind: 'string',
          type: 'text/plain'
        }
      ]
    }
    const items = await extractClipboardFiles(clipboardData)
    expect(items).toEqual([])
  })
})
