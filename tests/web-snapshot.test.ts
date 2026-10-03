import { describe, it, expect } from 'vitest'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('snapshot push/pull', () => {
  it('push tanpa token 401, dengan token tersimpan lalu terbaca', async () => {
    process.env.ABELINK_DATA_HOME = await mkdtemp(join(tmpdir(), 'abelink-web-'))
    const { startWebServer } = await import('../webui-server/serve.ts')
    const { tokenPath } = await import('../webui-server/snapshot.ts')
    const srv = await startWebServer(0)
    try {
      const base = `http://127.0.0.1:${srv.port}`
      const noAuth = await fetch(`${base}/api/push-snapshot`, { method: 'POST', body: '{}' })
      expect(noAuth.status).toBe(401)
      const token = (await readFile(tokenPath, 'utf8')).trim()
      expect(token.length).toBeGreaterThan(16)
      expect((await stat(tokenPath)).mode & 0o777).toBe(0o600)
      const payload = { sessions: [{ id: '1', title: 'Main Thread', messageCount: 3 }] }
      const pushed = await fetch(`${base}/api/push-snapshot`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-abelink-token': token },
        body: JSON.stringify(payload),
      })
      expect(pushed.status).toBe(200)
      const snap = await fetch(`${base}/api/snapshot`).then((r) => r.json())
      expect(snap.sessions).toEqual(payload.sessions)
      expect(typeof snap.note).toBe('string')
    } finally {
      await srv.close()
    }
  })
})
