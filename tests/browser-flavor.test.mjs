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
    // tryAutoResume wajib menolak tanpa pairing (tanpa auto-switch sisa).
    expect(bg).toMatch(/tryAutoResume[\s\S]*?getPairing\(\)[\s\S]*?if \(!pairing\) return/)
  })

  it('popup.js tanpa silent auto-pilih-port-hidup', () => {
    const pop = read('popup.js')
    expect(pop).not.toMatch(/alive\.find|alive\[0\]/)
    expect(pop).toContain('probe.pairing')
    expect(pop).toContain('pilih flavor sekali')
  })
})
