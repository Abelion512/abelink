// Sinkronisasi PONYTAIL.md <-> marker `ponytail:` di kode.
// Kontrak: setiap file yang mengandung marker ponytail: HARUS punya entri di
// ledger; fixture data (builtinPlugins) dikecualikan (bukan keputusan pragmatis).
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LEDGER = readFileSync(path.join(ROOT, 'PONYTAIL.md'), 'utf8')

const EXCLUDED = new Set([
  'tests/builtinPlugins.test.ts', // fixture data, bukan keputusan
  'src/api/ai/builtinPlugins.ts', // field data plugin bernama ponytail, bukan marker
])

function filesWithMarkers() {
  return execFileSync('git', ['grep', '-l', 'ponytail:', '--', 'src', 'sidecar', 'cli', 'bin', 'tests', 'scripts', 'evaluation'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter((f) => !EXCLUDED.has(f))
}

function ledgerRows() {
  return LEDGER.split('\n').filter((l) => /^\| P-\d+ \|/.test(l))
}

describe('PONYTAIL ledger <-> marker kode', () => {
  it('setiap file dengan marker ponytail: terdaftar di ledger', () => {
    const files = filesWithMarkers()
    expect(files.length).toBeGreaterThanOrEqual(10)
    for (const file of files) {
      const basename = path.basename(file)
      expect(LEDGER.includes(basename), `${file} ada marker ponytail: tapi tak ada di PONYTAIL.md`).toBe(true)
    }
  })

  it('ledger tidak mereferensikan file yang tidak lagi punya marker (anti-basi)', () => {
    const markers = new Set(filesWithMarkers().map((f) => path.basename(f)))
    const rows = ledgerRows()
    expect(rows.length).toBeGreaterThanOrEqual(15)
    for (const row of rows) {
      // Kolom Lokasi (index 2): boleh berisi banyak file dipisah "+".
      // Setiap file yang disebut WAJIB masih punya marker di kode.
      const cells = row.split('|').map((c) => c.trim())
      const loc = cells[2] ?? ''
      const mentioned = [...loc.matchAll(/([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.[A-Za-z0-9]+)/g)].map((m) => m[1])
      expect(mentioned.length, `baris tanpa lokasi file: ${row}`).toBeGreaterThan(0)
      for (const basename of mentioned) {
        if (EXCLUDED.has(`tests/${basename}`)) continue
        expect(markers.has(basename), `PONYTAIL.md menyebut ${basename} tapi marker-nya hilang dari kode`).toBe(true)
      }
    }
  })

  it('setiap entri ledger punya kriteria naik (kolom terakhir tidak kosong)', () => {
    for (const row of ledgerRows()) {
      const cells = row.split('|').map((c) => c.trim())
      const criteria = cells[4] ?? ''
      expect(criteria.length, `${cells[1]} tanpa kriteria naik`).toBeGreaterThan(10)
    }
  })
})
