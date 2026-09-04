// rtk output compression (layer EKSEKUSI, sidecar/main/node-tools.js).
// Kontrak:
//   - toggle OFF (config.rtkCompress === false) -> data asli tanpa diproses
//   - data pendek (< 2000 chars) / bukan string -> data asli
//   - binary `rtk` tidak terpasang -> no-op senyap, data asli tetap keluar
//     (fitur degrades gracefully, tidak pernah gagalkan tool)
// Lingkungan CI/dev ini tidak punya binary `rtk`, sehingga jalur ENOENT
// diuji secara nyata tanpa mock — persis perilaku produksi saat rtk absen.
import { describe, it, expect } from 'vitest'
import { _rtkFilterForTest as rtkFilter } from '../sidecar/main/node-tools.js'

const LONG = 'x'.repeat(2500)

describe('rtkFilter (output compression, execution layer)', () => {
  it('config.rtkCompress === false -> data asli, tanpa spawn rtk', async () => {
    expect(await rtkFilter(LONG, 'git-diff', { rtkCompress: false })).toBe(LONG)
  })

  it('data pendek (< 2000 chars) -> data asli', async () => {
    expect(await rtkFilter('short output', 'grep', {})).toBe('short output')
  })

  it('data bukan string (null/undefined) -> apa adanya', async () => {
    expect(await rtkFilter(null, 'git-status', {})).toBe(null)
    expect(await rtkFilter(undefined, 'git-status', {})).toBe(undefined)
  })

  it('rtk tidak terpasang (ENOENT) -> no-op senyap, data asli tetap keluar', async () => {
    const out = await rtkFilter(LONG, 'git-status', {})
    expect(out).toBe(LONG)
  }, 20000)

  it('config undefined -> tetap aktif (default ON), rtk absen -> data asli', async () => {
    const out = await rtkFilter(LONG, 'grep', undefined)
    expect(out).toBe(LONG)
  }, 20000)
})
