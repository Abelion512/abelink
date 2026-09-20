// Tests: penanganan halaman /sorry Google di Gemini Web RPC.
// Kasus asal: Google mengembalikan 302 ke google.com/sorry (bot-detection),
// user melihat dump HTML mentah + tiap giliran menghantam ulang sehingga
// blokir makin panjang.
//
// Kontrak: sorry terdeteksi -> error singkat ramah berkode
// GEMINI_WEB_LIMITED (tanpa HTML); 3x beruntun -> gagal-cepat 5 menit
// (cooldown PERSISTEN di file XDG, selamat dari restart sidecar).

// Isolasi cooldown persisten: env WAJIB diset SEBELUM import modul
// (modul membaca cooldown file saat diimpor) — dynamic import.
import fs from 'fs'
import os from 'os'
import path from 'path'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-gemini-test-'))
process.env.XDG_DATA_HOME = tmpRoot
delete process.env.ABELINK_DATA_HOME

const { describe, it, expect } = await import('vitest')
const { generateGeminiResponse, __geminiWebTest } = await import(
  '../sidecar/main/services/gemini-web.js'
)

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

  it('error ramah berkode, tanpa HTML, dengan sisa cooldown', () => {
    const e = __geminiWebTest.sorryError()
    expect(e.code).toBe('GEMINI_WEB_LIMITED')
    expect(e.message).not.toContain('<HTML>')
    expect(e.message).toContain('Configuration > Model')
    const e2 = __geminiWebTest.sorryError(5 * 60 * 1000)
    expect(e2.retryAfterMs).toBe(5 * 60 * 1000)
    expect(e2.message).toContain('5 menit')
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

  it('cooldown persisten: trip tersimpan di file dan terbaca ulang', async () => {
    __geminiWebTest.resetCircuit()
    __geminiWebTest.tripCircuit()
    const raw = fs.readFileSync(__geminiWebTest.cooldownFile(), 'utf8')
    expect(Number(JSON.parse(raw).blockedUntil)).toBeGreaterThan(Date.now())
    expect(__geminiWebTest.remainingCooldownMs()).toBeGreaterThan(0)
    __geminiWebTest.resetCircuit()
    expect(__geminiWebTest.remainingCooldownMs()).toBe(0)
  })
})
