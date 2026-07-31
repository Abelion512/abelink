import { describe, it, expect } from 'vitest'
import { cleanAndParse } from '../src/shared/cleanAndParse.js'

describe('cleanAndParse', () => {
  it('parses plain valid JSON object', async () => {
    expect(await cleanAndParse('{"a":1}')).toEqual({ a: 1 })
  })

  it('parses JSON wrapped in markdown fences', async () => {
    expect(await cleanAndParse('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('repairs broken JSON with trailing comma', async () => {
    expect(await cleanAndParse('{"a":1,}')).toEqual({ a: 1 })
  })

  it('extracts first object from surrounding prose', async () => {
    expect(await cleanAndParse('Here you go: {"a":1} thanks!')).toEqual({ a: 1 })
  })

  it('strips UTF-8 BOM prefix', async () => {
    expect(await cleanAndParse('\uFEFF{"a":1}')).toEqual({ a: 1 })
  })

  it('returns null for array-only JSON (schema requires object)', async () => {
    expect(await cleanAndParse('[1,2,3]')).toBeNull()
  })

  it('returns null for garbage input', async () => {
    expect(await cleanAndParse('not json at all')).toBeNull()
  })

  it('returns null for empty input', async () => {
    expect(await cleanAndParse('')).toBeNull()
  })
})
