// RAG ingest: Lite Mode menyimpan chunk fulltext-only (vectorModel 'none'),
// bukan drop semua -> "Gagal mengekstrak vektor". Hash tak boleh bocor.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const dbMocks = vi.hoisted(() => ({
  bulkInsertDocuments: vi.fn(async (recs) => recs.map((_, i) => i + 1)),
  getAllDocuments: vi.fn(async () => []),
  deleteDocumentByName: vi.fn(async () => {})
}))
const oramaMocks = vi.hoisted(() => ({
  insertDocumentChunksToOrama: vi.fn(async () => {}),
  deleteDocumentFromOrama: vi.fn(async () => {})
}))
const vecMocks = vi.hoisted(() => ({
  generateStorableVector: vi.fn(async () => null),
  getVectorModel: vi.fn(() => 'hash')
}))

vi.mock('../src/api/db', () => dbMocks)
vi.mock('../src/api/oramaStore', () => oramaMocks)
vi.mock('../src/api/vectorMemory', () => vecMocks)

const { ingestDocument } = await import('../src/api/ragPipeline.js')

const fakeFile = (name, text) => ({ name, size: text.length, text: async () => text })

beforeEach(() => {
  vi.clearAllMocks()
  dbMocks.getAllDocuments.mockResolvedValue([])
  dbMocks.bulkInsertDocuments.mockImplementation(async (recs) => recs.map((_, i) => i + 1))
})

describe('ingestDocument Lite fallback', () => {
  it('chunk tanpa vektor tetap disimpan fulltext-only + degraded:true', async () => {
    vecMocks.generateStorableVector.mockResolvedValue(null)
    vecMocks.getVectorModel.mockReturnValue('hash')
    const res = await ingestDocument(fakeFile('a.txt', 'halo dunia rag lite '.repeat(30)))
    expect(res.degraded).toBe(true)
    expect(res.storableCount).toBe(0)
    const recs = dbMocks.bulkInsertDocuments.mock.calls[0][0]
    expect(recs.length).toBeGreaterThan(0)
    for (const r of recs) {
      expect(r.vectorModel).toBe('none')
      expect(r.vector).toBeUndefined()
    }
    const oramaRows = oramaMocks.insertDocumentChunksToOrama.mock.calls[0][0]
    expect(oramaRows.every((r) => r.vectorModel === 'none')).toBe(true)
  })

  it('mode normal: vektor + tag model tersimpan', async () => {
    const v = new Array(384).fill(0.1)
    vecMocks.generateStorableVector.mockResolvedValue(v)
    vecMocks.getVectorModel.mockReturnValue('minilm')
    const res = await ingestDocument(fakeFile('b.txt', 'konten normal embedding '.repeat(30)))
    expect(res.degraded).toBe(false)
    expect(res.storableCount).toBeGreaterThan(0)
    const recs = dbMocks.bulkInsertDocuments.mock.calls[0][0]
    expect(recs[0].vector).toEqual(v)
    expect(recs[0].vectorModel).toBe('minilm')
  })
})
