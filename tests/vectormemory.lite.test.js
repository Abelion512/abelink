import { describe, it, expect, beforeAll } from 'vitest'
import { setLiteMode, generateVector, cosineSimilarity } from '../src/api/vectorMemory.js'

beforeAll(() => {
  // Lite Mode: hash embedding murni — tanpa worker/model (deterministik & cepat)
  setLiteMode(true)
})

describe('vectorMemory lite (hash embedding)', () => {
  it('generateVector menghasilkan vektor 384-dim ternormalisasi', async () => {
    const v = await generateVector('halo dunia')
    expect(v).toHaveLength(384)
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
    expect(norm).toBeCloseTo(1, 5)
  })
  it('deterministik: input sama -> vektor sama', async () => {
    const a = await generateVector('tes determinisme')
    const b = await generateVector('tes determinisme')
    expect(a).toEqual(b)
  })
  it('input beda -> vektor beda', async () => {
    const a = await generateVector('kucing')
    const b = await generateVector('mobil')
    expect(a).not.toEqual(b)
  })
  it('cosineSimilarity: diri sendiri = 1, orthogonal = 0', () => {
    const a = new Array(384).fill(0)
    a[0] = 1
    const b = new Array(384).fill(0)
    b[1] = 1
    expect(cosineSimilarity(a, a)).toBeCloseTo(1)
    expect(cosineSimilarity(a, b)).toBe(0)
  })
})
