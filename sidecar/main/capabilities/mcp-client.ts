// MCP client minimal — transport Streamable HTTP (JSON-RPC).
// Tanpa dependensi baru: fetch global (Bun/Node 18+). SSE transport lawas
// dan stdio spawn BELUM didukung (gagal eksplisit, bukan diam).
//
// Privacy: header auth (mis. API key) hanya hidup di connections.json 0600
// + memori proses; tidak pernah ke renderer/log (lihat redact di bawah).

const RPC_TIMEOUT_MS = 20000

type HeadersLike =
  | Record<string, string>
  | (() => Promise<Record<string, string>>)
  | { getHeaders?: () => Promise<Record<string, string>>; headers?: Record<string, string> | (() => Promise<Record<string, string>>); onAuthRetry?: () => Promise<Record<string, string>> }

const redactHeaders = (headers: Record<string, string> = {}): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    out[k] = /key|token|auth|secret|bearer/i.test(k) ? '[REDACTED]' : v
  }
  return out
}

async function resolveHeaders(headersOrOpts: HeadersLike | null | undefined): Promise<Record<string, string>> {
  if (!headersOrOpts) return {}
  if (typeof headersOrOpts === 'function') {
    return (await headersOrOpts()) || {}
  }
  if (typeof headersOrOpts === 'object') {
    const opts = headersOrOpts as { getHeaders?: () => Promise<Record<string, string>>; headers?: Record<string, string> | (() => Promise<Record<string, string>>) }
    if (typeof opts.getHeaders === 'function') {
      return (await opts.getHeaders()) || {}
    }
    if (opts.headers) {
      if (typeof opts.headers === 'function') {
        return (await opts.headers()) || {}
      }
      return opts.headers
    }
  }
  return headersOrOpts as Record<string, string>
}

async function rpc(url: string, headersOrOpts: HeadersLike, method: string, params: Record<string, unknown> = {}, retryCount = 0): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`Timeout ${RPC_TIMEOUT_MS / 1000}s ke MCP ${url}`)), RPC_TIMEOUT_MS)
  let res: Response
  const headers = await resolveHeaders(headersOrOpts)
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...headers
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: Math.floor(Math.random() * 1e9), method, params }),
      signal: controller.signal
    })
  } catch (e) {
    throw new Error(`MCP ${method} gagal (jaringan/timeout): ${(e as Error)?.message || e}`)
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    const opts = headersOrOpts as { onAuthRetry?: () => Promise<Record<string, string>>; headers?: Record<string, string> }
    if (res.status === 401 && retryCount === 0 && opts?.onAuthRetry) {
      try {
        const freshHeaders = await opts.onAuthRetry()
        const nextOpts: HeadersLike = {
          ...opts,
          headers: freshHeaders || opts.headers
        }
        return await rpc(url, nextOpts, method, params, retryCount + 1)
      } catch (_) {}
    }
    const body = await res.text().catch(() => '')
    const err = new Error(`MCP ${method} HTTP ${res.status}: ${body.slice(0, 200)}`) as Error & { status?: number; code?: string }
    err.status = res.status
    if (res.status === 401) err.code = 'MCP_UNAUTHORIZED'
    throw err
  }
  const ctype = res.headers.get('content-type') || ''
  let payload: Record<string, any>
  if (ctype.includes('text/event-stream')) {
    // Streamable HTTP bisa membalas SSE: ambil frame data JSON terakhir.
    const text = await res.text()
    const frames = text
      .split('\n')
      .filter((l: string) => l.startsWith('data:'))
      .map((l: string) => l.slice(5).trim())
      .filter((d: string) => d && d !== '[DONE]')
    if (frames.length === 0) throw new Error(`MCP ${method}: stream SSE kosong.`)
    try {
      payload = JSON.parse(frames[frames.length - 1])
    } catch {
      throw new Error(`MCP ${method}: frame SSE bukan JSON.`)
    }
  } else {
    try {
      payload = await res.json()
    } catch {
      throw new Error(`MCP ${method}: respons bukan JSON (${ctype || 'tanpa content-type'}).`)
    }
  }
  if (payload?.error) {
    throw new Error(`MCP ${method}: ${payload.error.message || JSON.stringify(payload.error).slice(0, 200)}`)
  }
  return payload?.result
}

async function initialize(url: string, headersOrOpts: HeadersLike) {
  const result = await rpc(url, headersOrOpts, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'abelink', version: '1.0.0-alpha.3' }
  })
  // Notifikasi initialized: best-effort, kegagalan diabaikan.
  // Timeout ikut pola rpc() agar MCP lambat tidak menahan authorize.
  try {
    const headers = await resolveHeaders(headersOrOpts)
    const nCtrl = new AbortController()
    const nTimer = setTimeout(() => nCtrl.abort(), RPC_TIMEOUT_MS)
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
        signal: nCtrl.signal
      })
    } finally {
      clearTimeout(nTimer)
    }
  } catch {}
  return result
}

/** Daftar tools server MCP (probe saat authorize). */
export async function listMcpTools(url: string, headers: HeadersLike = {}) {
  if (!/^https?:\/\//i.test(url || '')) throw new Error(`URL MCP harus http(s): '${url}'`)
  await initialize(url, headers)
  const result = (await rpc(url, headers, 'tools/list', {})) as { tools?: Array<Record<string, unknown>> } | undefined
  const tools = Array.isArray(result?.tools) ? result!.tools! : []
  return tools.map((t: Record<string, unknown>) => ({
    name: String(t.name || ''),
    description: String(t.description || ''),
    inputSchema: t.inputSchema || { type: 'object' }
  })).filter((t: { name: string }) => t.name)
}

/** Panggil satu tool MCP. Hasil dinormalkan ke teks. */
export async function callMcpTool(url: string, headers: HeadersLike = {}, toolName: string, args: Record<string, unknown> = {}) {
  if (!toolName) throw new Error('Nama tool MCP kosong.')
  await initialize(url, headers)
  const result = (await rpc(url, headers, 'tools/call', {
    name: toolName,
    arguments: args && typeof args === 'object' ? args : {}
  })) as { content?: Array<Record<string, any>> } | undefined
  const content = Array.isArray(result?.content) ? result!.content! : []
  const texts = content
    .map((c: Record<string, any>) => {
      if (typeof c?.text === 'string') return c.text
      if (c?.type === 'resource' && c?.resource?.text) return String(c.resource.text)
      return null
    })
    .filter(Boolean)
  if (texts.length > 0) return texts.join('\n')
  if (result && typeof result === 'object' && Object.keys(result).length > 0) {
    return JSON.stringify(result).slice(0, 20000)
  }
  return '(Tool MCP tidak mengembalikan konten.)'
}

export { redactHeaders, resolveHeaders }
