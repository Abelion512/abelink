// Best-effort: gagal = diam, tidak pernah throw ke UI.
// Port/token TIDAK di-hardcode: port dari Vite env ABELINK_WEB_PORT (atau
// override localStorage `abelink:web-port`), token dari localStorage
// `abelink:web-push-token` (disalin sekali dari file token 0600 server).
// Tanpa keduanya = no-op diam.
export async function pushSnapshot(port: number, token: string): Promise<void> {
  try {
    const { db } = await import('./db')
    const sessions = await db.sessions.toArray()
    const slim = sessions.map((s) => ({
      id: String(s.id),
      title: s.title ?? '',
      messageCount: Array.isArray(s.data) ? s.data.length : 0,
    }))
    await fetch(`http://127.0.0.1:${port}/api/push-snapshot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-abelink-token': token },
      body: JSON.stringify({ sessions: slim }),
    })
  } catch { /* best-effort: diam */ }
}

export function pushSnapshotAuto(): void {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    const port = Number(localStorage.getItem('abelink:web-port') ?? '') || Number(env?.ABELINK_WEB_PORT ?? '')
    const token = localStorage.getItem('abelink:web-push-token') ?? ''
    if (!port || !token) return
    void pushSnapshot(port, token)
  } catch { /* best-effort: diam */ }
}
