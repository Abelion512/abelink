// Audit nama upstream: blok identitas dikecualikan (atribusi sah),
// kemunculan di luar blok tetap ketangkap.
import { describe, it, expect } from 'vitest'
import { findSuspiciousName } from '../src/api/ai/planning.js'

const IDENTITY_BLOCK = `# IDENTITAS DIRI (SUMBER KEBENARAN TUNGGAL TENTANG SIAPA KAMU):
- Kamu adalah Abelink Linux v1.0.0-alpha.3.
- ide dan karya orisinal: Mada Putra Adhadriyanto (Mazees) (https://github.com/Mazees/mark-agent).
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
