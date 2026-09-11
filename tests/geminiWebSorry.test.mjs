// Tests: penanganan halaman /sorry Google di Gemini Web RPC.
// Kasus asal: Google mengembalikan 302 ke google.com/sorry (bot-detection),
// user melihat dump HTML mentah + tiap giliran menghantam ulang sehingga
// blokir makin panjang.
//
// Kontrak: sorry terdeteksi -> error singkat ramah berkode
// GEMINI_WEB_LIMITED (tanpa HTML); 3x beruntun -> gagal-cepat 5 menit.

import { describe, it, expect } from 'vitest'
import {
  generateGeminiResponse,
  __geminiWebTest
} from '../sidecar/main/services/gemini-web.js'

const SORRY_HTML =
  '<HTML><HEAD><TITLE>302 Moved</TITLE></HEAD><BODY><H1>302 Moved</H1>' +
  'The document has moved <A HREF="https://www.google.com/sorry/index?x">here</A></BODY></HTML>'

describe('sorry detection (pure)', () => {
  it('mengenali halaman sorry/302 Google', () => {
    expect(__geminiWebTest.isSorryPage(SORRY_HTML)).toBe(true)
    expect(__geminiWebTest.isSorryPage('unusual traffic from your network')).toBe(true)
    expect(__geminiWebTest.isSorryPage('[["wrb.fr",null,"{}"]]')).toBe(false)
    expect(__geminiWebTest.isSorryPage('')).toBe(false)
  })

  it('error ramah berkode, tanpa HTML', () => {
    const e = __geminiWebTest.sorryError()
    expect(e.code).toBe('GEMINI_WEB_LIMITED')
    expect(e.message).not.toContain('<HTML>')
    expect(e.message).toContain('Configuration > Model')
  })
})

describe('anti-hammer circuit', () => {
  it('gagal-cepat tanpa network saat cooldown aktif', async () => {
    __geminiWebTest.resetCircuit()
    __geminiWebTest.tripCircuit()
    await expect(generateGeminiResponse('halo', 'gemini-3.6-flash')).rejects.toMatchObject({
      code: 'GEMINI_WEB_LIMITED'
    })
    __geminiWebTest.resetCircuit()
  })
})
