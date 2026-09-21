import { describe, it, expect } from 'vitest'
import { parseCliArgs } from '../bin/abelink.mjs'

describe('Abelink CLI Argument Parsing', () => {
  it('parses valid agent run prompt and flags correctly', () => {
    const argv = [
      'bun',
      'bin/abelink.mjs',
      'agent',
      'run',
      'hitung 2+2',
      '--provider',
      'groq',
      '--model',
      'llama-3.1-8b-instant',
      '--effort',
      'medium',
      '--max-turns',
      '10',
      '--workspace',
      '/tmp/test-space',
      '--json',
      '--trace'
    ]

    const opts = parseCliArgs(argv)
    expect(opts.prompt).toBe('hitung 2+2')
    expect(opts.provider).toBe('groq')
    expect(opts.model).toBe('llama-3.1-8b-instant')
    expect(opts.effort).toBe('medium')
    expect(opts.maxTurns).toBe(10)
    expect(opts.workspace).toBe('/tmp/test-space')
    expect(opts.json).toBe(true)
    expect(opts.trace).toBe(true)
  })

  it('sets default parameters when optional flags are omitted', () => {
    const argv = [
      'bun',
      'bin/abelink.mjs',
      'agent',
      'run',
      'selesaikan tugas'
    ]

    const opts = parseCliArgs(argv)
    expect(opts.prompt).toBe('selesaikan tugas')
    expect(opts.provider).toBe('gemini-web')
    expect(opts.effort).toBe('low')
    expect(opts.maxTurns).toBe(15)
    expect(opts.json).toBe(false)
    expect(opts.trace).toBe(false)
  })
})
