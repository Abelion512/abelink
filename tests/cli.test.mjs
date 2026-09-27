import { describe, it, expect } from 'vitest'
import { parseCliArgs, resolveNoArgsCommand } from '../bin/abelink.mjs'

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

  it('accepts bare prompt without agent run prefix', () => {
    const opts = parseCliArgs(['bun', 'bin/abelink.mjs', 'hitung 2+2', '-m', 'free'])
    expect(opts.command).toBe('run')
    expect(opts.prompt).toBe('hitung 2+2')
    expect(opts.model).toBe('free')
    expect(opts.provider).toBe('custom')
  })

  it('parses --session/-s and --continue/-c resume flags', () => {
    const s = parseCliArgs(['bun', 'bin/abelink.mjs', 'agent', 'run', 'lanjutkan', '--session', 'abc123'])
    expect(s.session).toBe('abc123')
    expect(s.prompt).toBe('lanjutkan')
    const c = parseCliArgs(['bun', 'bin/abelink.mjs', '--continue'])
    expect(c.continueLatest).toBe(true)
    expect(c.prompt).toBeNull()
    const short = parseCliArgs(['bun', 'bin/abelink.mjs', '-s', 'xyz-1'])
    expect(short.session).toBe('xyz-1')
  })

  it('prompt optional when resuming, required otherwise', () => {
    // resume tanpa prompt = OK
    expect(parseCliArgs(['bun', 'bin/abelink.mjs', 'agent', 'run', '--session', 'abc']).session).toBe('abc')
    // trailing prompt setelah resume flag ikut tertangkap
    const t = parseCliArgs(['bun', 'bin/abelink.mjs', '--session', 'abc', 'lanjutkan X'])
    expect(t.prompt).toBe('lanjutkan X')
  })

  it('routes sessions subcommand without prompt', () => {
    expect(parseCliArgs(['bun', 'bin/abelink.mjs', 'sessions']).command).toBe('sessions')
  })

  it('routes setup and models subcommands without prompt', () => {
    expect(parseCliArgs(['bun', 'bin/abelink.mjs', 'setup']).command).toBe('setup')
    const m = parseCliArgs(['bun', 'bin/abelink.mjs', 'models', 'gemini'])
    expect(m.command).toBe('models')
    expect(m.filter).toBe('gemini')
  })

  it('parses --api-key flag', () => {
    const opts = parseCliArgs(['bun', 'bin/abelink.mjs', 'halo', '--api-key', 'sk-test'])
    expect(opts.apiKey).toBe('sk-test')
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
    // Headless default = custom + frontier (gemini-web butuh sesi browser GUI)
    expect(opts.provider).toBe('custom')
    expect(opts.model).toBe('oc/muse-spark-1.3-contributor-free')
    expect(opts.effort).toBe('low')
    expect(opts.maxTurns).toBeNull()
    const optsWithTurns = parseCliArgs([...argv, '--max-turns', '42'])
    expect(optsWithTurns.maxTurns).toBe(42)
    expect(opts.json).toBe(false)
    expect(opts.trace).toBe(false)
  })

  it('routes bare no-args to TUI on TTY, help on pipe', () => {
    // Bare `abelink` ala opencode: TTY -> TUI, pipe -> help (tanpa hang).
    expect(resolveNoArgsCommand({ stdinTTY: true, stdoutTTY: true })).toBe('tui')
    expect(resolveNoArgsCommand({ stdinTTY: false, stdoutTTY: true })).toBe('help')
    expect(resolveNoArgsCommand({ stdinTTY: true, stdoutTTY: false })).toBe('help')
    expect(resolveNoArgsCommand({})).toBe('help')
  })
})
