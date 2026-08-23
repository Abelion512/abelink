import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
}))

const { discoverModels, normalizeChatCompletionsUrl } = await import('../src/main/modelDiscovery.js')

describe('normalizeChatCompletionsUrl', () => {
  it('appends /chat/completions to /v1 base', () => {
    expect(normalizeChatCompletionsUrl('https://api.openai.com/v1')).toBe('https://api.openai.com/v1/chat/completions')
  })
  it('keeps existing /chat/completions intact', () => {
    expect(normalizeChatCompletionsUrl('https://api.openai.com/v1/chat/completions'))
      .toBe('https://api.openai.com/v1/chat/completions')
  })
  it('strips trailing slash before append', () => {
    expect(normalizeChatCompletionsUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1/chat/completions')
  })
})

describe('modelDiscovery unified', () => {
  it('custom + 9router live: ready dengan merge registry oc/*', async () => {
    const r = await discoverModels('custom', { customEndpoint: 'http://localhost:20128/v1/chat/completions' })
    expect(r.status).toBe('ready')
    expect(r.models.length).toBeGreaterThan(10)
    const oc = r.models.filter((m) => /oc\/|opencode\//.test(m.id))
    expect(oc.length).toBeGreaterThan(0)
  }, 20000)

  it('groq tanpa key: needs-key + requirements', async () => {
    const r = await discoverModels('groq', {})
    expect(r.status).toBe('needs-key')
    expect(r.requirements).toContain('Groq')
  })

  it('custom tanpa endpoint: config', async () => {
    const r = await discoverModels('custom', {})
    expect(r.status).toBe('config')
  })

  it('lmstudio offline (server tidak jalan): offline', async () => {
    const r = await discoverModels('lmstudio', {})
    expect(['offline', 'error']).toContain(r.status)
  })

  it('endpoint salah: error/offline, bukan crash', async () => {
    const r = await discoverModels('custom', { customEndpoint: 'http://localhost:59999/v1/chat/completions' })
    expect(['offline', 'error']).toContain(r.status)
  })
})