import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  searchViaRouter,
  fetchViaRouter,
  SKIP_NO_KEY,
  DEFAULT_ROUTER_ENDPOINT
} from '../sidecar/main/tools/routerSearch.mjs'
import { extractGoogleResults } from '../sidecar/main/tools/browserTools.mjs'

const realFetch = globalThis.fetch

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  globalThis.fetch = realFetch
})

const jsonRes = (body, ok = true, status = 200) => ({
  ok,
  status,
  statusText: ok ? 'OK' : 'Unauthorized',
  json: async () => body
})

describe('searchViaRouter', () => {
  it('memetakan results -> {title,url,snippet}', async () => {
    globalThis.fetch = vi.fn(async () => jsonRes({
      results: [
        { title: 'T1', url: 'https://a.test/1', snippet: 'S1' },
        { title: 'T2', url: 'https://a.test/2', description: 'S2' }
      ]
    }))
    const out = await searchViaRouter('q', { endpoint: 'http://x:1', apiKey: 'k' })
    expect(out).toEqual([
      { title: 'T1', url: 'https://a.test/1', snippet: 'S1' },
      { title: 'T2', url: 'https://a.test/2', snippet: 'S2' }
    ])
    const [url, opts] = globalThis.fetch.mock.calls[0]
    expect(url).toBe('http://x:1/v1/search')
    expect(opts.headers.Authorization).toBe('Bearer k')
    expect(JSON.parse(opts.body)).toMatchObject({ model: 'search-combo', query: 'q' })
  })

  it('non-2xx -> throw eksplisit', async () => {
    globalThis.fetch = vi.fn(async () => jsonRes({ error: 'nope' }, false, 401))
    await expect(searchViaRouter('q', { apiKey: 'k' })).rejects.toThrow(/9Router 401/)
  })

  it('hasil kosong -> throw eksplisit', async () => {
    globalThis.fetch = vi.fn(async () => jsonRes({ results: [] }))
    await expect(searchViaRouter('q', { apiKey: 'k' })).rejects.toThrow(/kosong/)
  })

  it('tanpa apiKey -> sinyal skip-to-next-layer', async () => {
    globalThis.fetch = vi.fn()
    const err = await searchViaRouter('q', {}).catch((e) => e)
    expect(err.code).toBe(SKIP_NO_KEY)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('timeout -> AbortController membatalkan', async () => {
    globalThis.fetch = vi.fn(async (_url, opts) => {
      await new Promise((_, rej) => {
        opts.signal.addEventListener('abort', () => {
          const e = new Error('aborted')
          e.name = 'AbortError'
          rej(e)
        })
      })
    })
    await expect(searchViaRouter('q', { apiKey: 'k', timeoutMs: 20 })).rejects.toThrow(/timeout/)
  })

  it('endpoint default + trailing slash dinormalisasi', async () => {
    globalThis.fetch = vi.fn(async () => jsonRes({ results: [{ title: 'T', url: 'https://a/' }] }))
    await searchViaRouter('q', { apiKey: 'k' })
    expect(globalThis.fetch.mock.calls[0][0]).toBe(`${DEFAULT_ROUTER_ENDPOINT}/v1/search`)
  })
})

describe('fetchViaRouter', () => {
  it('markdown passthrough', async () => {
    globalThis.fetch = vi.fn(async () => jsonRes({ markdown: '# Hi\nbody' }))
    const md = await fetchViaRouter('https://a.test/', { apiKey: 'k' })
    expect(md).toBe('# Hi\nbody')
    const [url, opts] = globalThis.fetch.mock.calls[0]
    expect(url).toMatch(/\/v1\/web\/fetch$/)
    expect(JSON.parse(opts.body)).toMatchObject({ model: 'fetch-combo', format: 'markdown' })
  })

  it('konten kosong -> throw', async () => {
    globalThis.fetch = vi.fn(async () => jsonRes({ markdown: '  ' }))
    await expect(fetchViaRouter('https://a.test/', { apiKey: 'k' })).rejects.toThrow(/kosong/)
  })
})

describe('extractGoogleResults', () => {
  it('links array', () => {
    const out = extractGoogleResults({ links: [{ title: 'T', url: 'https://a/' }, {}] })
    expect(out).toEqual([{ title: 'T', url: 'https://a/', snippet: '' }])
  })

  it('elements array menyaring link google internal', () => {
    const out = extractGoogleResults({
      elements: [
        { text: 'Hasil', href: 'https://hasil.test/x' },
        { text: 'next', href: 'https://www.google.com/search?q=x' }
      ]
    })
    expect(out).toEqual([{ title: 'Hasil', url: 'https://hasil.test/x', snippet: '' }])
  })

  it('null/html kosong -> []', () => {
    expect(extractGoogleResults(null)).toEqual([])
    expect(extractGoogleResults({})).toEqual([])
  })
})
