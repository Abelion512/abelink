// Tripwire: setiap klaim model-diri WAJIB menunjuk file yang ada.
// Mencegah identitas/model basi saat refactor/rename.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { SELF_MODEL_SOURCES } from '../src/api/selfModel.js'
import { getSelfModelBlock } from '../src/api/selfModel.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Cari basename file secara rekursif di pohon source (abaikan node_modules/dist).
const findFile = (dir, name) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist-sidecar' || e.name === '.git') continue
    const p = path.join(dir, e.name)
    if (e.isFile() && e.name === name) return true
    if (e.isDirectory() && findFile(p, name)) return true
  }
  return false
}

describe('selfModel sources exist', () => {
  const all = [
    ...SELF_MODEL_SOURCES.DESIGN,
    ...SELF_MODEL_SOURCES.ERROR_HANDLING,
    ...SELF_MODEL_SOURCES.SELF_IMPROVEMENT,
    ...SELF_MODEL_SOURCES.LIMITS
  ]
  for (const { claim, source } of all) {
    it(`sumber ada: ${source} (${claim.slice(0, 40)}…)`, () => {
      // Entri path ("a/b.js", "dir/") dicek langsung; basename dicari rekursif.
      const parts = source.split(',').map((s) => s.trim().split(/\s+/)[0])
      const hit = parts.some((s) => {
        if (s.endsWith('/')) return fs.existsSync(path.join(ROOT, s))
        if (s.includes('/')) return fs.existsSync(path.join(ROOT, s))
        return /\.\w+$/.test(s) && findFile(ROOT, s)
      })
      expect(parts.length).toBeGreaterThan(0)
      expect(hit).toBe(true)
    })
  }
  it('blok render tak kosong', () => {
    expect(getSelfModelBlock().length).toBeGreaterThan(200)
  })
})
