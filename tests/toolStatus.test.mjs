// Status extension di konteks planner: tidak pernah melempar, selalu 1 baris.
import { describe, it, expect } from 'vitest'
import { browserExtensionStatusLine, GROUP_TOOLS_DEFINITION } from '../src/api/tools/group-tools.js'

describe('browserExtensionStatusLine', () => {
  it('di luar renderer -> fallback aman tanpa throw', async () => {
    const line = await browserExtensionStatusLine()
    expect(typeof line).toBe('string')
    expect(line.length).toBeGreaterThan(0)
    expect(line).toMatch(/extension browser/i)
  })

  it('deskripsi click/type mewajibkan read-dom sesi sama', () => {
    const tools = GROUP_TOOLS_DEFINITION.advanced_browser.tools
    expect(tools['browser-click']).toMatch(/SESI YANG SAMA/)
    expect(tools['browser-type']).toMatch(/SESI YANG SAMA/)
  })
})
