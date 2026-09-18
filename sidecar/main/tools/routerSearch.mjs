// 9Router search/fetch via composite endpoint (pure global fetch, no deps).
// Non-2xx/empty -> throw explicit Error (never silent empty). Missing apiKey
// -> throw SKIP error so the caller falls through to the next layer.

export const SKIP_NO_KEY = 'ROUTER_SKIP_NO_KEY'
export const DEFAULT_ROUTER_ENDPOINT = 'http://127.0.0.1:20128'

const post = async (url, apiKey, body, timeoutMs) => {
  if (!apiKey) {
    const err = new Error('9Router API key kosong — lewati ke layer berikutnya.')
    err.code = SKIP_NO_KEY
    throw err
  }
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: ctrl.signal
    })
    if (!res.ok) throw new Error(`9Router ${res.status} ${res.statusText || ''}`.trim())
    return await res.json()
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`9Router timeout ${timeoutMs}ms: ${url}`)
    throw err
  } finally {
    clearTimeout(t)
  }
}

// POST {endpoint}/v1/search {model:'search-combo',query,...} -> [{title,url,snippet}]
export const searchViaRouter = async (query, { endpoint, apiKey, timeoutMs = 30000 } = {}) => {
  const base = String(endpoint || DEFAULT_ROUTER_ENDPOINT).replace(/\/+$/, '')
  const data = await post(
    `${base}/v1/search`,
    apiKey,
    { model: 'search-combo', query, search_type: 'web', max_results: 5 },
    timeoutMs
  )
  const raw = data?.results || data?.data || []
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('9Router search: hasil kosong.')
  return raw.slice(0, 5).map((r) => ({
    title: r.title || r.name || 'Web Result',
    url: r.url || r.link || '',
    snippet: r.snippet || r.description || r.content || ''
  }))
}

// POST {endpoint}/v1/web/fetch {model:'fetch-combo',url,...} -> markdown string
export const fetchViaRouter = async (url, { endpoint, apiKey, timeoutMs = 30000 } = {}) => {
  const base = String(endpoint || DEFAULT_ROUTER_ENDPOINT).replace(/\/+$/, '')
  const data = await post(
    `${base}/v1/web/fetch`,
    apiKey,
    { model: 'fetch-combo', url, format: 'markdown' },
    timeoutMs
  )
  const md = data?.markdown || data?.content || data?.data
  if (!md || (typeof md === 'string' && !md.trim())) throw new Error('9Router fetch: konten kosong.')
  return typeof md === 'string' ? md : JSON.stringify(md)
}
