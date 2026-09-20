// WS-2: token streaming chunk assembler (murni, tanpa network).
// Simulasi urutan chunk SSE -> teks penuh + urutan emit onToken.

import { describe, it, expect } from 'vitest'
import { assembleStreamChunks, __aiBridgeTest } from '../sidecar/main/ai-bridge.js'
import { __geminiWebTest } from '../sidecar/main/services/gemini-web.js'

const { extractGeminiText, diffStreamText } = __geminiWebTest

const sseLines = [
  'data: {"choices":[{"delta":{"content":"Halo"}}]}',
  '',
  'data: {"choices":[{"delta":{"content":" dunia"}}]}',
  'data: {"choices":[{"delta":{"reasoning_content":"mikir"}}]}',
  'data: [DONE]'
]

describe('assembleStreamChunks', () => {
  it('merakit content + reasoning penuh dari urutan chunk SSE', () => {
    const { fullContent, fullReasoning } = assembleStreamChunks(sseLines)
    expect(fullContent).toBe('Halo dunia')
    expect(fullReasoning).toBe('mikir')
  })

  it('meng-emit tiap delta via onToken sesuai urutan', () => {
    const seen = []
    assembleStreamChunks(sseLines, (c) => seen.push(c))
    expect(seen.map((c) => c.text)).toEqual(['Halo', ' dunia', 'mikir'])
    expect(seen.every((c) => c.done === false)).toBe(true)
  })

  it('baris rusak dilewati tanpa menggagalkan rakitan', () => {
    const { fullContent } = assembleStreamChunks(['data: {bukan-json', ...sseLines])
    expect(fullContent).toBe('Halo dunia')
  })
})

describe('gemini-web incremental helpers', () => {
  const lineFor = (text) => {
    const inner = JSON.stringify([['rc_x', [text]]])
    return JSON.stringify([['wrb.fr', null, inner]])
  }

  it('extractGeminiText mengambil teks terpanjang dari buffer', () => {
    const buf = `${lineFor('Halo')}\n${lineFor('Halo dunia')}\nnoise`
    expect(extractGeminiText(buf)).toBe('Halo dunia')
  })

  it('diffStreamText mengembalikan delta prefix-tumbuh', () => {
    expect(diffStreamText('Halo', 'Halo dunia')).toBe(' dunia')
    expect(diffStreamText('Halo', 'Halo')).toBe('')
    // Non-prefix (jawaban direvisi) -> seluruh teks baru di-emit ulang.
    expect(diffStreamText('abc', 'xyz')).toBe('xyz')
  })

  it('simulasi stream: buffer bertambah -> delta berurutan = teks penuh', () => {
    const full = 'Satu dua tiga'
    const pieces = ['Satu', 'Satu dua', 'Satu dua tiga']
    let emitted = ''
    const deltas = []
    for (const cur of pieces) {
      const d = diffStreamText(emitted, cur)
      if (d) {
        emitted = cur
        deltas.push(d)
      }
    }
    expect(deltas.join('')).toBe(full)
  })

  it('__aiBridgeTest mengekspos assembler yang sama', () => {
    expect(__aiBridgeTest.assembleStreamChunks).toBe(assembleStreamChunks)
  })
})
