import { describe, it, expect } from 'vitest'
import { cleanAndParse, extractLenientField } from '../src/api/ai/core.js'

// Parser harus tahan banting: model kecil/China sering keluarkan curly quotes,
// reasoning <think>, atau JSON rusak — jangan buang jawabannya.

describe('cleanAndParse — hardening anti diskoneksi jawaban', () => {
  it('tetap parse JSON valid', () => {
    expect(cleanAndParse('{"answer":"halo","action":null}')).toEqual({
      answer: 'halo',
      action: null
    })
  })

  it('normalisasi curly quotes dari model Cina', () => {
    const out = cleanAndParse('{“thought”:“pikir”,“answer”:“jawaban”,“action”:null}')
    expect(out).toEqual({ thought: 'pikir', answer: 'jawaban', action: null })
  })

  it('strip blok <think> sebelum ekstraksi brace', () => {
    const out = cleanAndParse(
      '<think>Hmm, {kubaca dulu ya} oke.</think>\n{"thought":"x","answer":"jawab","action":null}'
    )
    expect(out).toEqual({ thought: 'x', answer: 'jawab', action: null })
  })

  it('tetap parse fence + teks sekitar (regresi lama)', () => {
    expect(cleanAndParse('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(cleanAndParse('oke: {"answer":"siap"} mantap')).toEqual({ answer: 'siap' })
  })
})

describe('extractLenientField — pemulihan field dari JSON rusak', () => {
  it('pulihkan answer dari objek terpotong', () => {
    const raw = '{"thought":"analisis","answer":"Ini jawaban lengkap model" // trailing'
    expect(extractLenientField(raw, 'answer')).toBe('Ini jawaban lengkap model')
  })

  it('pulihkan answer dengan newline & escape di dalam value', () => {
    const raw = '{"answer":"baris satu\\nbaris dua","action":null}'
    expect(extractLenientField(raw, 'answer')).toBe('baris satu\nbaris dua')
  })

  it('null untuk field yang tidak ada', () => {
    expect(extractLenientField('{"thought":"x"}', 'answer')).toBeNull()
    expect(extractLenientField('', 'answer')).toBeNull()
    expect(extractLenientField(null, 'answer')).toBeNull()
  })

  it('pulihkan thought & intermediate_answer', () => {
    const raw = '{"thought":"proses berjalan","intermediate_answer":"Bentar ya bro"}'
    expect(extractLenientField(raw, 'thought')).toBe('proses berjalan')
    expect(extractLenientField(raw, 'intermediate_answer')).toBe('Bentar ya bro')
  })
})
