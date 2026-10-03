// webui-server/approval.ts — deterministik, tanpa model.
// Fase home read-only: engine dipakai + diuji, belum memblokir yang live.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type Action = { kind: 'read' | 'write' | 'shell' | 'net'; target: string }
export type Verdict = 'allow' | 'deny' | 'ask'

const DENY_SHELL = [
  /rm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\s+(~|\/(\s|$))/,
  /:\(\)\s*\{/,
  /mkfs|dd\s+.*of=/,
]
const DENY_NET = /^(?!127\.0\.0\.1|localhost)/
const DENY_PUBLISH = /\bgit\s+(push|publish)\b|\bnpm\s+publish\b/

let allowExtra: string[] = [] // dimuat dari web-allow.json (restu user), pola prefix sederhana

function dataDir(): string {
  return process.env.ABELINK_DATA_HOME ?? join(homedir(), '.local', 'share', 'abelink')
}

export const allowPath: string = join(dataDir(), 'web-allow.json')

export async function loadAllowFile(): Promise<string[]> {
  try {
    const raw = await readFile(allowPath, 'utf8')
    const j = JSON.parse(raw) as { allow?: unknown }
    const list = Array.isArray(j.allow) ? j.allow.filter((p) => typeof p === 'string') : []
    allowExtra = list as string[]
  } catch {
    allowExtra = []
  }
  return allowExtra
}

// Tambah ke allow-file hanya setelah restu — restu via endpoint khusus Fase berikut.
export async function proposeRule(prefix: string): Promise<void> {
  const cur = await loadAllowFile()
  if (cur.includes(prefix)) return
  await mkdir(dataDir(), { recursive: true })
  await writeFile(allowPath, JSON.stringify({ allow: [...cur, prefix] }))
  allowExtra = [...cur, prefix]
}

function isOutsideWorkspace(target: string): boolean {
  if (target.startsWith('/') || target.startsWith('~') || target.includes('..')) return true
  return false
}

export function decide(a: Action): Verdict {
  if (allowExtra.some((p) => a.target.startsWith(p))) return 'allow' // sudah di-allow: tidak pernah tanya lagi
  if (a.kind === 'read') return 'allow'
  if (a.kind === 'shell') {
    if (DENY_SHELL.some((re) => re.test(a.target))) return 'deny'
    if (DENY_PUBLISH.test(a.target)) return 'deny'
    return 'ask'
  }
  if (a.kind === 'net' && DENY_NET.test(a.target)) return 'deny'
  if (a.kind === 'write') {
    if (a.target.includes('web-allow.json')) return 'deny'
    if (isOutsideWorkspace(a.target)) return 'deny'
    return 'ask'
  }
  return 'ask'
}
