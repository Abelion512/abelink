import { describe, it, expect } from 'vitest'
import { sanitizeToolOutput } from '../src/renderer/src/api/ai/output-sanitizer.js'

describe('sanitizeToolOutput', () => {
  it('truncates long strings to MAX_SANITIZED_LENGTH (8000)', () => {
    const long = 'x'.repeat(10000)
    const out = sanitizeToolOutput('read-file', long)
    expect(out.length).toBeLessThanOrEqual(8000 + 100) // + truncation suffix
    expect(out).toContain('...[truncated by system]')
  })

  it('returns [Empty result] for blank input', () => {
    expect(sanitizeToolOutput('read-file', '   ')).toBe('[Empty result]')
  })

  it('preserves interactive element list for browser-read', () => {
    const html = '<html><body><p>Noise</p><div>[1] button: "Search"</div><div>[2] input: "q"</div></body></html>'
    const out = sanitizeToolOutput('browser-read', html)
    expect(out).toContain('== ELEMEN INTERAKTIF ==')
    expect(out).toContain('[1] button')
  })

  it('strips ANSI codes for CLI tools', () => {
    const ansi = '\x1b[31mError\x1b[0m occurred'
    const out = sanitizeToolOutput('run-shell', ansi)
    expect(out).not.toContain('\x1b[')
  })
})
