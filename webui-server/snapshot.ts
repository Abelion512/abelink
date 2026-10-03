// webui-server/snapshot.ts — store snapshot + token push (stdlib node:* saja).
// Dual-runtime: dipakai Bun.serve (prod) maupun node:http fallback (vitest).
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type SnapshotSession = { id: string; title: string; messageCount: number }
// Bentuk WAJIB sama dengan webui/src/api.ts (Task 2).
export type Snapshot = { sessions: SnapshotSession[]; note: string }

function dataDir(): string {
  return process.env.ABELINK_DATA_HOME ?? join(homedir(), '.local', 'share', 'abelink')
}

// Dievaluasi saat import — ABELINK_DATA_HOME dibaca sebelum modul diimpor.
export const tokenPath: string = join(dataDir(), 'web-push-token')
const snapshotPath: string = join(dataDir(), 'web-snapshot.json')

export async function ensurePushToken(): Promise<string> {
  await mkdir(dataDir(), { recursive: true })
  try {
    const cur = (await readFile(tokenPath, 'utf8')).trim()
    if (cur) {
      await chmod(tokenPath, 0o600)
      return cur
    }
  } catch { /* belum ada — buat baru di bawah */ }
  const fresh = randomBytes(32).toString('hex')
  await writeFile(tokenPath, fresh + '\n', { mode: 0o600 })
  await chmod(tokenPath, 0o600)
  return fresh
}

export async function readPushToken(): Promise<string | null> {
  try {
    const cur = (await readFile(tokenPath, 'utf8')).trim()
    return cur || null
  } catch {
    return null
  }
}

export async function readSnapshot(): Promise<Snapshot | null> {
  try {
    const raw = await readFile(snapshotPath, 'utf8')
    const j = JSON.parse(raw) as Partial<Snapshot>
    if (!j || !Array.isArray(j.sessions)) return null
    return { sessions: j.sessions, note: typeof j.note === 'string' ? j.note : '' }
  } catch {
    return null
  }
}

export async function writeSnapshot(snap: Snapshot): Promise<void> {
  const slim: Snapshot = {
    sessions: snap.sessions.map((s) => ({
      id: String(s.id),
      title: String(s.title ?? ''),
      messageCount: Number(s.messageCount) || 0,
    })),
    note: typeof snap.note === 'string' ? snap.note : '',
  }
  await mkdir(dataDir(), { recursive: true })
  await writeFile(snapshotPath, JSON.stringify(slim))
}
