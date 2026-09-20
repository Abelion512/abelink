import { describe, it, expect } from 'vitest'
import { validateFileSyntax } from '../sidecar/main/syntax-validator.js'

describe('prose bypass', () => {
  it('.md dengan apostrof = valid', async () => {
    expect(await validateFileSyntax('doc.md', "it's user's file")).toMatchObject({ valid: true })
  })
  it.each(['.markdown', '.txt', '.rst', '.log'])('%s prosa bebas = valid', async (ext) => {
    expect(await validateFileSyntax(`f${ext}`, "it's <unclosed (bracket's")).toMatchObject({ valid: true })
  })
  it('gmail-list handler error BUKAN parsePagination is not defined', { timeout: 30000 }, async () => {
    const { getNativeToolsDefinition } = await import('../sidecar/main/node-tools.js')
    const res = await getNativeToolsDefinition()['gmail-list'].handler('0-10', [])
    expect(String(res.error || '')).not.toContain('parsePagination is not defined')
  })
})
