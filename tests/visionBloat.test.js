import { describe, it, expect } from 'vitest'
import {
  stripImageContent,
  stripDataUrls,
  buildOptimizedChatSession,
  IMAGE_PLACEHOLDER
} from '../src/api/ai/contextCompactor'

const bigDataUrl = `data:image/png;base64,${'iVBORw0KGgo'.repeat(50)}`

describe('stripDataUrls', () => {
  it('teks pendek tanpa gambar lolos tanpa diubah', () => {
    expect(stripDataUrls('halo bro')).toBe('halo bro')
  })

  it('dataURL panjang diganti placeholder', () => {
    const out = stripDataUrls(`lihat ini ${bigDataUrl} oke`)
    expect(out).not.toContain('iVBORw0KGgo')
    expect(out).toContain(IMAGE_PLACEHOLDER)
  })
})

describe('stripImageContent', () => {
  it('array tanpa keep: image_url dibuang, teks dipertahankan', () => {
    const out = stripImageContent([
      { type: 'text', text: 'jelaskan layar ini' },
      { type: 'image_url', image_url: { url: bigDataUrl } }
    ])
    expect(out).toEqual([{ type: 'text', text: 'jelaskan layar ini' }])
  })

  it('array image-only tanpa keep: jadi placeholder', () => {
    const out = stripImageContent([{ type: 'image_url', image_url: { url: bigDataUrl } }])
    expect(JSON.stringify(out)).toContain(IMAGE_PLACEHOLDER)
  })

  it('array dengan keep: gambar utuh dipertahankan', () => {
    const content = [
      { type: 'text', text: 'lihat ini' },
      { type: 'image_url', image_url: { url: bigDataUrl } }
    ]
    expect(stripImageContent(content, true)).toBe(content)
  })
})

describe('buildOptimizedChatSession', () => {
  it('gambar hanya bertahan di giliran terakhir', () => {
    const img = [{ type: 'text', text: 'ss lama' }, { type: 'image_url', image_url: { url: bigDataUrl } }]
    const data = [
      { role: 'user', content: img },
      { role: 'ai', content: 'ok lama' },
      { role: 'user', content: img },
      { role: 'ai', content: 'ok baru' }
    ]
    const out = buildOptimizedChatSession(data, 10)
    expect(JSON.stringify(out.slice(0, -1))).not.toContain('iVBORw0KGgo')
  })
})
