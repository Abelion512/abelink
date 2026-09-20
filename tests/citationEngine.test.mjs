import { describe, it, expect } from 'vitest'
import {
  EphemeralPassageStore,
  extractCitations,
  verifyVerbatimQuote,
  verifyAnswerGrounding
} from '../src/api/ai/citationEngine.js'

describe('citationEngine', () => {
  describe('EphemeralPassageStore', () => {
    it('ingests raw text into indexed passages with chunking and overlap', () => {
      const store = new EphemeralPassageStore({ maxPassageLen: 60, overlap: 15 })
      const text = 'Abelink adalah sistem AI companion lokal berbasis Linux Tauri v2 dengan ReAct loop dan dynamic subagents.'
      const added = store.ingest(text, { source: 'web', url: 'https://abelink.dev' })

      expect(added.length).toBeGreaterThan(1)
      expect(added[0].id).toBe('P-1')
      expect(added[0].source).toBe('web')
      expect(added[0].url).toBe('https://abelink.dev')
      expect(store.getAll().length).toBe(added.length)
      expect(store.getPassage('p-1')).toEqual(added[0])
    })

    it('handles empty or blank text gracefully', () => {
      const store = new EphemeralPassageStore()
      expect(store.ingest('')).toEqual([])
      expect(store.ingest('   ')).toEqual([])
      expect(store.getAll()).toEqual([])
    })

    it('clears passages and resets counter on clear()', () => {
      const store = new EphemeralPassageStore()
      store.ingest('Satu dua tiga empat lima enam tujuh delapan sembilan sepuluh')
      expect(store.getAll().length).toBeGreaterThan(0)

      store.clear()
      expect(store.getAll().length).toBe(0)
      expect(store.getPassage('P-1')).toBeNull()

      const newPassages = store.ingest('Satu dua tiga empat lima enam tujuh delapan sembilan sepuluh')
      expect(newPassages[0].id).toBe('P-1')
    })

    it('formats passages for prompt injection correctly', () => {
      const store = new EphemeralPassageStore()
      store.ingest('Teks informasi penting untuk grounding.', { source: 'docs', url: 'manual.pdf' })
      const prompt = store.formatPassagesPrompt()
      expect(prompt).toContain('[P-1]')
      expect(prompt).toContain('(docs: manual.pdf)')
      expect(prompt).toContain('"Teks informasi penting untuk grounding."')
    })
  })

  describe('extractCitations', () => {
    it('extracts simple [P-X] tags and quoted citations', () => {
      const text = 'Menurut laporan [P-1: "Tauriv2 dirilis"] dan juga [P-2] fitur subagent telah aktif.'
      const citations = extractCitations(text)

      expect(citations).toHaveLength(2)
      expect(citations[0]).toEqual({ passageId: 'P-1', quote: 'Tauriv2 dirilis' })
      expect(citations[1]).toEqual({ passageId: 'P-2', quote: '' })
    })

    it('extracts bracket citation with colon and quotes', () => {
      const text = 'Data menunjukkan performa meningkat [P-3: "99.8% akurasi"].'
      const citations = extractCitations(text)
      expect(citations).toContainEqual({ passageId: 'P-3', quote: '99.8% akurasi' })
    })

    it('returns empty array when text has no citation tags', () => {
      expect(extractCitations('Teks tanpa sitasi sama sekali.')).toEqual([])
      expect(extractCitations('')).toEqual([])
    })
  })

  describe('verifyVerbatimQuote', () => {
    const passage = 'Arsitektur Abelink menggunakan model pool multi-provider dan Rust Tauri v2 shell.'

    it('matches exact verbatim quotes', () => {
      const res = verifyVerbatimQuote('model pool multi-provider', passage)
      expect(res.valid).toBe(true)
      expect(res.offset).toBe(passage.indexOf('model pool multi-provider'))
      expect(res.normalizedMatch).toBe(false)
    })

    it('matches normalized quotes with punctuation or whitespace differences', () => {
      const res = verifyVerbatimQuote('model  pool, multi-provider', passage)
      expect(res.valid).toBe(true)
      expect(res.normalizedMatch).toBe(true)
    })

    it('rejects hallucinated or non-existent quotes', () => {
      const res = verifyVerbatimQuote('Electron React 16 legacy shell', passage)
      expect(res.valid).toBe(false)
      expect(res.offset).toBe(-1)
    })

    it('rejects empty quotes or empty passages', () => {
      expect(verifyVerbatimQuote('', passage).valid).toBe(false)
      expect(verifyVerbatimQuote('test', '').valid).toBe(false)
    })
  })

  describe('verifyAnswerGrounding', () => {
    it('returns score 1.0 if passageStore is empty (unconstrained answer)', () => {
      const store = new EphemeralPassageStore()
      const res = verifyAnswerGrounding({ answer: 'Jawaban bebas.', passageStore: store })
      expect(res.score).toBe(1.0)
      expect(res.citationsCount).toBe(0)
    })

    it('returns score 0.0 if passages exist but answer provides no citations', () => {
      const store = new EphemeralPassageStore()
      store.ingest('Fakta valid yang seharusnya dirujuk.')
      const res = verifyAnswerGrounding({ answer: 'Jawaban tanpa sitasi.', passageStore: store })
      expect(res.score).toBe(0.0)
      expect(res.invalidCitations.length).toBeGreaterThan(0)
    })

    it('verifies valid citations and scores 1.0', () => {
      const store = new EphemeralPassageStore()
      store.ingest('Kernel Linux 6.8 mendukung driver grafis terbaru.')
      const answer = 'Kernel Linux mendukung hardware baru [P-1: "Kernel Linux 6.8 mendukung driver grafis terbaru"].'
      const res = verifyAnswerGrounding({ answer, passageStore: store })
      expect(res.score).toBe(1.0)
      expect(res.validCount).toBe(1)
      expect(res.invalidCitations).toHaveLength(0)
    })

    it('penalizes hallucinated quotes or non-existent passage IDs', () => {
      const store = new EphemeralPassageStore()
      store.ingest('Fakta A.')
      const answer = 'Fakta A benar [P-1: "Fakta A"] tapi Fakta B salah [P-99: "Fakta B"].'
      const res = verifyAnswerGrounding({ answer, passageStore: store })
      expect(res.score).toBe(0.5)
      expect(res.citationsCount).toBe(2)
      expect(res.validCount).toBe(1)
      expect(res.invalidCitations).toContain('Passage rujukan [P-99] tidak ditemukan dalam store.')
    })
  })
})
