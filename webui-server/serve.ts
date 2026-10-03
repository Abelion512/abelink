// webui-server/serve.ts — Bun.serve stdlib, tanpa dep baru.
// Dual-runtime: Bun.serve saat jalan via `bun` (prod); fallback node:http
// saat diimpor dari vitest (node), karena import.meta.dir/Bun tidak ada di node.
import { readFile } from 'node:fs/promises'
import { join, normalize, sep, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensurePushToken, readPushToken, readSnapshot, writeSnapshot } from './snapshot.ts'
import { loadAllowFile } from './approval.ts'

const here: string =
  // @ts-expect-error import.meta.dir hanya ada di Bun
  (import.meta.dir as string | undefined) ?? dirname(fileURLToPath(import.meta.url))
const DIST = join(here, '..', 'webui', 'dist')

async function serveStatic(rawPath: string): Promise<Response> {
  let rel: string
  try {
    rel = rawPath === '/' ? 'index.html' : decodeURIComponent(rawPath).slice(1)
  } catch {
    return new Response('not-found', { status: 404 })
  }
  const abs = normalize(join(DIST, rel))
  if (abs !== DIST && !abs.startsWith(DIST + sep))
    return new Response('not-found', { status: 404 })
  try {
    const bytes = await readFile(abs)
    const type = abs.endsWith('.html') ? 'text/html; charset=utf-8'
      : abs.endsWith('.js') ? 'text/javascript; charset=utf-8'
      : abs.endsWith('.css') ? 'text/css; charset=utf-8'
      : 'application/octet-stream'
    return new Response(bytes, { headers: { 'content-type': type, 'cache-control': 'no-store' } })
  } catch {
    return new Response('not-found', { status: 404 })
  }
}

async function handleFetch(req: Request, portOf: () => number): Promise<Response> {
  const url = new URL(req.url)
  if (url.pathname === '/health')
    return Response.json({ ok: true, proto: 'abelink-web', port: portOf() })
  if (url.pathname === '/api/snapshot') {
    const snap = await readSnapshot()
    return Response.json(snap ?? { sessions: [], note: 'belum tersambung' })
  }
  if (url.pathname === '/api/push-snapshot') {
    if (req.method !== 'POST') return new Response('method-not-allowed', { status: 405 })
    const want = (await readPushToken()) ?? ''
    const got = req.headers.get('x-abelink-token') ?? ''
    if (!want || !timingSafeEqualStr(got, want))
      return new Response('unauthorized', { status: 401 })
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return new Response('bad-request', { status: 400 })
    }
    const sessions = (body as { sessions?: unknown }).sessions
    if (!Array.isArray(sessions)) return new Response('bad-request', { status: 400 })
    await writeSnapshot({ sessions: sessions as never, note: '' })
    return Response.json({ ok: true })
  }
  return serveStatic(url.pathname)
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function startWebServer(port: number) {
  await ensurePushToken()
  await loadAllowFile() // Fase home read-only: dimuat + diuji, belum memblokir yang live
  const B = typeof Bun !== 'undefined' ? Bun : undefined
  if (B) {
    const server = B.serve({
      hostname: '127.0.0.1',
      port,
      fetch: (req: Request) => handleFetch(req, () => server.port),
    })
    return { port: server.port as number, close: async () => { server.stop() } }
  }
  const { createServer } = await import('node:http')
  let actualPort = port
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const body = Buffer.concat(chunks)
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers.set(k, v)
      else if (Array.isArray(v)) headers.set(k, v.join(', '))
    }
    const r = await handleFetch(
      new Request(url.toString(), {
        method: req.method ?? 'GET',
        headers,
        body: body.length && req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
      }),
      () => actualPort,
    )
    res.writeHead(r.status, Object.fromEntries(r.headers.entries()))
    res.end(Buffer.from(await r.arrayBuffer()))
  })
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
  actualPort = (server.address() as { port: number }).port
  return { port: actualPort, close: async () => { server.close() } }
}

if (import.meta.main) {
  let port: number | undefined
  for (let p = 49719; p < 49719 + 100; p++) {
    try {
      const c = await Bun.connect({ hostname: '127.0.0.1', port: p })
      c.close()
    } catch {
      port = p
      break
    }
  }
  if (port === undefined) throw new Error('no free port in 49719-49818')
  const srv = await startWebServer(port)
  const url = `http://127.0.0.1:${srv.port}`
  console.log(`abelink-web listening on ${url}`)
  try {
    Bun.spawn(['xdg-open', url], { stdout: 'ignore', stderr: 'ignore' })
  } catch { /* headless/ENOENT: server tetap jalan */ }
}
