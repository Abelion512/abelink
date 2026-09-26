// tests/ts-probe.test.ts — probe migrasi JS->TS (M0/B-4, DoD).
//
// Tujuan ganda:
//  1. Membuktikan `vitest.config.mjs` benar-benar MENJALANKAN test .ts. Sebelum
//     2026-09-26 `include` hanya js/mjs: file ini akan DIAM-DIAM DILEWATI dan
//     suite tetap hijau (hijau palsu). Bila probe ini hilang dari output vitest,
//     jaring paritas migrasi bocor.
//  2. Memberi input nyata pada `tsconfig.json` sehingga `tsc --noEmit` tidak
//     gagal dengan "No inputs were found".
//
// Sengaja mengimpor modul .js melalui seam bertipe eksplisit: ini pola yang
// dipakai selama strangler (file lama tetap JS, konsumen baru boleh TS).
import { describe, it, expect } from 'vitest'
import { compare, valid } from '../src/api/semverLite.js'

const version: string | null = valid('1.0.0-alpha.5')

describe('probe toolchain TS (M0)', () => {
  it('semverLite dipakai dari test .ts tanpa perubahan perilaku', () => {
    expect(version).toBe('1.0.0-alpha.5')
  })

  it('perbandingan SemVer tetap konsisten di jalur bertipe', () => {
    expect(compare('1.1.0-alpha.5', '1.0.0')).toBeGreaterThan(0)
    expect(compare('1.0.0', '1.0.0')).toBe(0)
  })
})
