import { describe, it, expect } from 'vitest'
import { cleanAndParse } from '../src/api/ai/core.js'

describe('cleanAndParse', () => {
  it('parse JSON murni', () => {
    expect(cleanAndParse('{"a":1}')).toEqual({ a: 1 })
  })
  it('parse JSON dalam markdown fence', () => {
    expect(cleanAndParse('```json\n{"thought":"x","action":null}\n```')).toEqual({
      thought: 'x',
      action: null
    })
  })
  it('parse objek dengan teks sekitar', () => {
    expect(cleanAndParse('oke ini hasilnya: {"answer":"siap"} mantap')).toEqual({ answer: 'siap' })
  })
  it('parse trailing comma', () => {
    expect(cleanAndParse('{"a":1,}')).toEqual({ a: 1 })
  })
  it('null untuk input kosong/sampah', () => {
    expect(cleanAndParse('')).toBe(null)
    expect(cleanAndParse('total bukan json')).toBe(null)
    expect(cleanAndParse(null)).toBe(null)
  })
  it('passthrough objek reaksi agent (thought/action/answer)', () => {
    const obj = { thought: 't', action: { tool: 'x', query: 'y' }, answer: null }
    expect(cleanAndParse(obj)).toBe(obj)
  })
})
