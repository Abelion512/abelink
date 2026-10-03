// webui-server/serve.ts — Bun.serve stdlib, tanpa dep baru.
// Dual-runtime: Bun.serve saat jalan via `bun` (prod); fallback node:http
// saat diimpor dari vitest (node), karena import.meta.dir/Bun tidak ada di node.
import { readFile } from 'node:fs/promises'
import { join, normalize, sep, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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
  return serveStatic(url.pathname)
}

export async function startWebServer(port: number) {
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
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const r = await handleFetch(new Request(url.toString()), () => actualPort)
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
