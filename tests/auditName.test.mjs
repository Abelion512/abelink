// Audit nama: blok identitas dikecualikan (identitas sah Abelink/Abelion512),
// kemunculan nama warisan di luar blok tetap ketangkap.
import { describe, it, expect } from 'vitest'
import { findSuspiciousName } from '../src/api/ai/planning.js'

const IDENTITY_BLOCK = `# IDENTITAS DIRI (SUMBER KEBENARAN TUNGGAL TENTANG SIAPA KAMU):
- Kamu adalah Abelink v1.1.0-alpha.5.
- produk eksklusif Abelion Group: Abelion512 (https://github.com/Abelion512/abelink).
# DESAIN DIRI:
- Local-first.`

describe('findSuspiciousName', () => {
  it('nama di dalam blok identitas = bukan temuan', () => {
    expect(findSuspiciousName(IDENTITY_BLOCK)).toBeNull()
    expect(findSuspiciousName('prompt bersih tanpa nama')).toBeNull()
    expect(findSuspiciousName('')).toBeNull()
  })

  it('nama di luar blok identitas = ketangkap + snippet', () => {
    const r = findSuspiciousName(`# MEMORI:\n- user bernama Mada suka kopi.\n# LAIN:\nx`)
    expect(r?.name).toMatch(/Mada/i)
    expect(r?.snippet).toMatch(/Mada/i)
  })
})
