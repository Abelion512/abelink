// Write-gate dedup: insertMemory menolak near-duplikat di SATU pintu
// (semua caller), bukan hanya plan loop via Orama.
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'

const { generateVectorMock } = vi.hoisted(() => ({ generateVectorMock: vi.fn() }))
vi.mock('../src/api/vectorLoader.js', () => ({
  generateVector: generateVectorMock,
  cosineSimilarity: (a, b) => {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0) return 0
    return a.reduce((s, x, i) => s + x * b[i], 0)
  }
}))

const { db, insertMemory, getAllMemory } = await import('../src/api/db.js')

beforeEach(async () => {
  generateVectorMock.mockReset()
  await db.memory.clear()
})

describe('insertMemory write-gate dedup', () => {
  it('near-duplikat (>=0.85) tidak ditulis ulang — kembalikan id existing', async () => {
    // Vektor satuan searah => cosine = 1.0
    generateVectorMock.mockResolvedValue([1, 0, 0])
    await insertMemory({ type: 'preference', summary: 's', memory: 'suka kopi tubruk' })
    generateVectorMock.mockResolvedValue([1, 0, 0])
    const id = await insertMemory({ type: 'preference', summary: 's', memory: 'suka kopi tubruk hangat' })
    const all = await getAllMemory()
    expect(all.length).toBe(1)
    expect(id).toBe(all[0].id)
  })

  it('mirip-tapi-beda (<0.85) tetap ditulis — urusan groomer', async () => {
    // [1,0,0] vs [0.5,~0.866,0] => cosine = 0.5
    generateVectorMock.mockResolvedValueOnce([1, 0, 0])
    await insertMemory({ type: 'preference', summary: 's', memory: 'suka kopi' })
    generateVectorMock.mockResolvedValueOnce([0.5, 0.866, 0])
    await insertMemory({ type: 'preference', summary: 's', memory: 'suka teh' })
    expect((await getAllMemory()).length).toBe(2)
  })

  it('tipe notes/learn dikecualikan (hanya profile/preference)', async () => {
    generateVectorMock.mockResolvedValue([1, 0, 0])
    await insertMemory({ type: 'notes', summary: 's', memory: 'catatan a' })
    await insertMemory({ type: 'notes', summary: 's', memory: 'catatan a' })
    expect((await getAllMemory()).length).toBe(2)
  })

  it('tanpa vektor (model mati) tetap tulis — fail-open, bukan drop sunyi', async () => {
    generateVectorMock.mockResolvedValue(null)
    await insertMemory({ type: 'preference', summary: 's', memory: 'x' })
    await insertMemory({ type: 'preference', summary: 's', memory: 'x' })
    expect((await getAllMemory()).length).toBe(2)
  })
})
