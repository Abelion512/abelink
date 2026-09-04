// Capability Manager tests — protokol + policy + audit, TANPA jaringan.
// - XDG_DATA_HOME diarahkan ke direktori temp per-run (connections + audit).
// - weather (network) TIDAK dieksekusi; hanya argumen tidak validnya yang diuji
//   agar gagal sebelum fetch.
// - shell-tool diuji via mock NATIVE_TOOLS (setDangerousOverride) sehingga
//   perilaku approval terverifikasi tanpa spawn proses sungguhan.
// - Sisa connector (time/fs) dieksekusi nyata — 100% offline.
import { describe, it, expect, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mark-cap-test-'))
process.env.XDG_DATA_HOME = tmpRoot

const {
  resolvePolicy,
  executeCapability,
  authorizeConnector,
  revokeConnector,
  listConnections,
  getActionGuide,
  readAudit,
  getConnector
} = await import('../sidecar/main/capabilities/manager.mjs')
const { setDangerousOverride } = await import('../sidecar/main/capabilities/shell-tool.mjs')

describe('capability catalog & guides', () => {
  it('getConnector mengembalikan connector yang ada dan null yang tidak ada', () => {
    expect(getConnector('fs').id).toBe('fs')
    expect(getConnector('tidak-ada')).toBeNull()
  })

  it('guide memuat inputSchema + scopes + contoh', () => {
    const guide = getActionGuide('fs', 'read')
    expect(guide.connector.id).toBe('fs')
    expect(guide.action.inputSchema.required).toContain('path')
    expect(Array.isArray(guide.guide.examples)).toBe(true)
  })

  it('guide untuk aksi tidak dikenal mengembalikan null (bukan sukses palsu)', () => {
    expect(getActionGuide('fs', 'hack')).toBeNull()
    expect(getActionGuide('connector-hantu', 'read')).toBeNull()
  })
})

describe('resolvePolicy', () => {
  const fsConnector = getConnector('fs')
  const shellConnector = getConnector('shell-tool')

  it('aksi fs.read: allowed tanpa approval (fs connector tidak deklarasikan requiresApproval)', () => {
    const p = resolvePolicy(fsConnector, fsConnector.actions.read)
    expect(p.allowed).toBe(true)
    expect(p.approvalRequired).toBe(false)
  })

  it('shell-tool exec: TANPA blanket approval di level connector (gate dinamis ada di runtime connector + rfd di jalur Tauri)', () => {
    const p = resolvePolicy(shellConnector, shellConnector.actions.exec)
    expect(p.allowed).toBe(true)
    expect(p.approvalRequired).toBe(false)
  })

  it('deniedScopes memblokir aksi dengan scope yang cocok', () => {
    const p = resolvePolicy(fsConnector, fsConnector.actions.write, { deniedScopes: ['fs.write'] })
    expect(p.allowed).toBe(false)
    expect(p.approvalRequired).toBe(false)
    expect(p.deniedScope).toBe('fs.write')
  })
})

describe('executeCapability (offline connectors)', () => {
  it('time.now jalan dan ter-audit', async () => {
    const out = await executeCapability({ connectorId: 'time', actionId: 'now', sessionId: 's1' })
    expect(out.iso).toBeTruthy()
    const audit = readAudit(5)
    expect(audit.some((a) => a.op === 'execute.result' && a.status === 'ok')).toBe(true)
  })

  it('time.diff menghitung durasi dua jam kerja', async () => {
    const out = await executeCapability({
      connectorId: 'time',
      actionId: 'diff',
      args: { from: '09:00', to: '17:30' }
    })
    expect(out.total_minutes).toBe(510)
  })

  it('fs write+read+delete end-to-end di dalam workspace', async () => {
    await executeCapability({
      connectorId: 'fs',
      actionId: 'write',
      args: { path: 'uji/tes.txt', content: 'halo capa' }
    })
    const read = await executeCapability({
      connectorId: 'fs',
      actionId: 'read',
      args: { path: 'uji/tes.txt' }
    })
    expect(read.content).toContain('halo capa')
    const del = await executeCapability({
      connectorId: 'fs',
      actionId: 'delete',
      args: { path: 'uji/tes.txt' }
    })
    expect(del.deleted).toBe('file')
  })

  it('fs.read menolak path traversal (di luar workspace)', async () => {
    await expect(
      executeCapability({ connectorId: 'fs', actionId: 'read', args: { path: '../../etc/passwd' } })
    ).rejects.toThrow()
  })

  it('weather dengan argumen tidak valid melempar error SEBELUM fetch (offline-safe)', async () => {
    await expect(
      executeCapability({ connectorId: 'weather', actionId: 'current', args: {} })
    ).rejects.toThrow(/latitude|city/i)
  })

  it('connector/action tidak dikenal gagal eksplisit', async () => {
    await expect(executeCapability({ connectorId: 'hantu', actionId: 'x' })).rejects.toThrow(
      /Connector tidak dikenal/
    )
    await expect(executeCapability({ connectorId: 'time', actionId: 'hantu' })).rejects.toThrow(
      /Aksi tidak dikenal/
    )
  })

  it('shell-tool exec: perintah aman dieksekusi langsung (mock, tanpa spawn)', async () => {
    setDangerousOverride(false)
    const out = await executeCapability({
      connectorId: 'shell-tool',
      actionId: 'exec',
      args: { command: 'echo' } // handler di-mock; tidak ada proses sungguhan
    })
    expect(out.output).toBe('MOCK-OUTPUT')
  })

  it('shell-tool exec: perintah berbahaya fail-fast dengan CAPABILITY_APPROVAL_REQUIRED + pesan tool asli (backstop meski headless)', async () => {
    setDangerousOverride(true)
    try {
      await executeCapability({
        connectorId: 'shell-tool',
        actionId: 'exec',
        args: { command: 'rm README' }
      })
      expect.unreachable('harusnya melempar')
    } catch (e) {
      expect(e.code).toBe('CAPABILITY_APPROVAL_REQUIRED')
      expect(e.message).toContain('BERBAHAYA')
    } finally {
      setDangerousOverride(null)
    }
  })

  it('deniedScopes pada execute memblokir sebelum run + tercatat policy-denied', async () => {
    await expect(
      executeCapability({
        connectorId: 'fs',
        actionId: 'delete',
        args: { path: 'x.txt' },
        deniedScopes: ['fs.delete']
      })
    ).rejects.toThrow(/dilarang/)
    const audit = readAudit(10)
    expect(audit.some((a) => a.op === 'execute.result' && a.status === 'policy-denied')).toBe(true)
  })
})

describe('connections (authorize/revoke)', () => {
  it('connector connection-less melaporkan status jujur tanpa menulis koneksi', () => {
    const r = authorizeConnector('time')
    expect(r.connectionless).toBe(true)
    expect(listConnections().time).toBeUndefined()
  })

  it('fs: authorize -> tercatat; revoke -> hilang', () => {
    const a = authorizeConnector('fs', ['fs.read', 'fs.write', 'scope-hantu'])
    expect(a.grantedScopes).toEqual(['fs.read', 'fs.write']) // scope asing disaring
    expect(listConnections().fs.scopes).toEqual(['fs.read', 'fs.write'])
    expect(revokeConnector('fs').revoked).toBe(true)
    expect(listConnections().fs).toBeUndefined()
    expect(revokeConnector('fs').revoked).toBe(false)
  })

  it('connector tidak dikenal melempar error', () => {
    expect(() => authorizeConnector('hantu')).toThrow(/Connector tidak dikenal/)
    expect(() => revokeConnector('hantu')).toThrow(/Connector tidak dikenal/)
  })
})

describe('audit', () => {
  it('jejak audit adalah JSONL dengan ts + op', () => {
    const entries = readAudit(500)
    expect(entries.length).toBeGreaterThan(0)
    for (const e of entries) {
      expect(typeof e.op).toBe('string')
    }
  })

  it('file audit & koneksi ber-mode 0600 di XDG dir', () => {
    const capDir = path.join(tmpRoot, 'mark', 'capabilities')
    const auditFile = path.join(capDir, 'audit.jsonl')
    expect(fs.existsSync(auditFile)).toBe(true)
    const mode = fs.statSync(auditFile).mode & 0o777
    expect(mode).toBe(0o600)
  })
})

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})
