import { describe, it, expect } from 'vitest'
import { startWebServer } from '../webui-server/serve.ts'

describe('web serve fondasi', () => {
  it('health 200 + traversal 404', async () => {
    const srv = await startWebServer(0) // 0 = port acak bebas
    const base = `http://127.0.0.1:${srv.port}`
    const h = await fetch(`${base}/health`).then((r) => r.json())
    expect(h.ok).toBe(true)
    const t = await fetch(`${base}/..%2f..%2fpackage.json`)
    expect(t.status).toBe(404)
    await srv.close()
  })
})
