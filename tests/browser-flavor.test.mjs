import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Kanonik flavor hidup di extension/background.js (script klasik MV3, tanpa
// modul). Test ini membaca literal langsung + meng-hardcode ekspektasi
// (test boleh hardcode expected values; tak ada modul flavor terpisah).

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension')
const read = (f) => readFileSync(join(root, f), 'utf8')

describe('flavor mapping kanonik', () => {
  it('port prod/dev + host native benar (literal di background.js)', () => {
    const bg = read('background.js')
    for (const lit of [
      'prod: 49712',
      'dev: 49713',
      "prod: 'id.abelink.bridge'",
      "dev: 'id.abelink.bridge.dev'",
      'abelink.pairing',
    ])
      expect(bg).toContain(lit)
  })
})

describe('anti-drift pairing terpin', () => {
  it('background.js resume terpagar pairing', () => {
    const bg = read('background.js')
    // tryAutoResume wajib menolak tanpa pairing (tanpa auto-switch sisa):
    // set lastError jujur + jadwalkan ulang, TANPA handshake/loop.
    // Ambil body tryAutoResume dan pastikan tak ada pemicu loop di jalur
    // tanpa-pairing (running=true + loop() hanya boleh sesudah pairing ada).
    const body = bg.slice(bg.indexOf('async function tryAutoResume'))
    const noPairingBlock = body.slice(body.indexOf('if (!pairing)'), body.indexOf('let cfg = await getCfg()'))
    expect(noPairingBlock).toMatch(/lastError/)
    expect(noPairingBlock).toMatch(/scheduleAutoResume/)
    expect(noPairingBlock).not.toMatch(/running\s*=\s*true/)
    expect(noPairingBlock).not.toMatch(/[^a-zA-Z]loop\(\)/)
  })

  it('popup.js tanpa silent auto-pilih-port-hidup', () => {
    const pop = read('popup.js')
    expect(pop).not.toMatch(/alive\.find|alive\[0\]/)
    expect(pop).toContain('probe.pairing')
    expect(pop).toContain('pilih flavor sekali')
  })
})

describe('isolasi flavor strict: getTokenViaNativeHost', () => {
  it('tidak ada fallback cross-flavor (hosts array multi-elemen untuk dev)', () => {
    const bg = read('background.js')
    // Verifikasi bahwa konstruksi hosts-array dengan fallback lintas flavor sudah dihapus.
    // Pola lama: `[primary, 'id.abelink.bridge']` saat primary = dev host.
    // Setelah fix: hostNameForPort(port) dipakai langsung (single host, no array for fallback).
    expect(bg).not.toMatch(/hosts\s*=\s*primary\s*===\s*['"]id\.abelink\.bridge['"]/)
    expect(bg).not.toMatch(/\[primary,\s*['"]id\.abelink\.bridge['"]\]/)
  })

  it('getTokenViaNativeHost menggunakan satu host tanpa loop fallback', () => {
    const bg = read('background.js')
    // Cari fungsi getTokenViaNativeHost dan verifikasi tidak ada 'for' loop di dalamnya
    // (fallback array loop dihapus; kini langsung sendNativeMessage ke satu host).
    const fnMatch = bg.match(/async function getTokenViaNativeHost[\s\S]*?\n}/)
    expect(fnMatch).not.toBeNull()
    const fnBody = fnMatch[0]
    expect(fnBody).not.toMatch(/for\s*\(/)
    expect(fnBody).toContain('hostNameForPort(port)')
    // Memastikan hanya satu sendNativeMessage call (bukan di dalam loop).
    const nmCalls = fnBody.match(/sendNativeMessage/g) || []
    expect(nmCalls.length).toBe(1)
  })

  it('host dev tidak pernah fall back ke id.abelink.bridge (prod)', () => {
    const bg = read('background.js')
    // Cari blok di dalam getTokenViaNativeHost saja -- bukan di tempat lain.
    const fnMatch = bg.match(/async function getTokenViaNativeHost[\s\S]*?\n}/)
    expect(fnMatch).not.toBeNull()
    const fnBody = fnMatch[0]
    // id.abelink.bridge (tanpa .dev) tidak boleh muncul sebagai string literal fallback.
    expect(fnBody).not.toMatch(/'id\.abelink\.bridge'(?!\s*\+|\.dev)/)
  })
})

