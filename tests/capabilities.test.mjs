// Capability Manager tests — protokol + policy + audit, TANPA jaringan.
// - XDG_DATA_HOME diarahkan ke direktori temp per-run (connections + audit).
// - weather (network) TIDAK dieksekusi; hanya argumen tidak validnya yang diuji
//   agar gagal sebelum fetch.
// - shell-tool diuji via mock NATIVE_TOOLS (setDangerousOverride) sehingga
//   perilaku approval terverifikasi tanpa spawn proses sungguhan.
// - Sisa connector (time/fs) dieksekusi nyata — 100% offline.
import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-cap-test-'))
process.env.XDG_DATA_HOME = tmpRoot

const {
  resolvePolicy,
  executeCapability,
  authorizeConnector,
  revokeConnector,
  listConnections,
  getActionGuide,
  readAudit,
  getConnector,
  registerConnector
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
    const audit = await readAudit(5)
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

  it(
    'shell-tool exec: perintah aman dieksekusi langsung (mock, tanpa spawn)',
    async () => {
      setDangerousOverride(false)
      const out = await executeCapability({
        connectorId: 'shell-tool',
        actionId: 'exec',
        args: { command: 'echo' } // handler di-mock; tidak ada proses sungguhan
      })
      expect(out.output).toBe('MOCK-OUTPUT')
    },
    20000
  )

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
    const audit = await readAudit(10)
    expect(audit.some((a) => a.op === 'execute.result' && a.status === 'policy-denied')).toBe(true)
  })
})

describe('connections (authorize/revoke)', () => {
  it('connector connection-less melaporkan status jujur tanpa menulis koneksi', async () => {
    const r = await authorizeConnector('time')
    expect(r.connectionless).toBe(true)
    expect((await listConnections()).time).toBeUndefined()
  })

  it('fs: authorize -> tercatat; revoke -> hilang', async () => {
    const a = await authorizeConnector('fs', ['fs.read', 'fs.write', 'scope-hantu'])
    expect(a.grantedScopes).toEqual(['fs.read', 'fs.write']) // scope asing disaring
    expect((await listConnections()).fs.scopes).toEqual(['fs.read', 'fs.write'])
    expect((await revokeConnector('fs')).revoked).toBe(true)
    expect((await listConnections()).fs).toBeUndefined()
    expect((await revokeConnector('fs')).revoked).toBe(false)
  })

  it('connector tidak dikenal melempar error', async () => {
    await expect(authorizeConnector('hantu')).rejects.toThrow(/Connector tidak dikenal/)
    await expect(revokeConnector('hantu')).rejects.toThrow(/Connector tidak dikenal/)
  })
})

describe('custom MCP registration (seam)', () => {
  it('registerConnector menolak id/URL tidak valid', () => {
    expect(() => registerConnector({ id: 'bad id!', url: 'https://x.test' })).toThrow(/ID connector/)
    expect(() => registerConnector({ id: 'ok-id', url: 'ftp://x.test' })).toThrow(/http/)
  })
})

describe('MCP transport (Streamable HTTP, server tiruan lokal)', () => {
  let server
  let baseUrl
  const seenAuth = {}

  beforeAll(async () => {
    const http = await import('node:http')
    server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        seenAuth.value = req.headers['x-test-key'] || null
        let msg = {}
        try {
          msg = JSON.parse(body || '{}')
        } catch {}
        const reply = (result) => {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id ?? 1, result }))
        }
        if (msg.method === 'initialize') {
          reply({ protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'fake', version: '0' } })
        } else if (msg.method === 'tools/list') {
          reply({ tools: [{ name: 'lookup', description: 'Cari docs', inputSchema: { type: 'object' } }] })
        } else if (msg.method === 'tools/call') {
          reply({ content: [{ type: 'text', text: `hasil:${msg.params?.arguments?.q || '-'}` }] })
        } else if (msg.method === 'notifications/initialized') {
          res.writeHead(202)
          res.end()
        } else {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id ?? 1, error: { code: -32601, message: 'nope' } }))
        }
      })
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}/mcp`
  })

  afterAll(() => {
    server?.close()
  })

  it('authorize probe tools, simpan koneksi; execute panggil tool', async () => {
    registerConnector({ id: 'ctx7', name: 'Ctx7', url: baseUrl, headers: { 'X-Test-Key': 's3cr3t' } })
    const a = await authorizeConnector('ctx7', [])
    expect(a.transport).toBe('mcp')
    expect(a.tools.map((t) => t.name)).toEqual(['lookup'])
    // Tahap 4: listConnections disanitasi — tanpa url mentah/headers, hanya
    // hostname + jumlah tool + transport.
    const sanitized = await listConnections()
    expect(sanitized.ctx7.urlHost).toBe('127.0.0.1')
    expect(sanitized.ctx7.toolCount).toBe(1)
    expect('headers' in sanitized.ctx7).toBe(false)
    expect(JSON.stringify(sanitized.ctx7)).not.toMatch(/s3cr3t/)
    expect(seenAuth.value).toBe('s3cr3t')
    const out = await executeCapability({ connectorId: 'ctx7', actionId: 'lookup', args: { q: 'halo' } })
    expect(out).toContain('hasil:halo')
    expect((await revokeConnector('ctx7')).revoked).toBe(true)
  })

  it('authorize ke server mati gagal eksplisit (MCP_UNREACHABLE)', async () => {
    registerConnector({ id: 'mati', url: 'http://127.0.0.1:1/mcp' })
    await expect(authorizeConnector('mati', [])).rejects.toMatchObject({ code: 'MCP_UNREACHABLE' })
  })

  it('execute tanpa authorize gagal eksplisit (MCP_NOT_AUTHORIZED)', async () => {
    registerConnector({ id: 'belum', url: baseUrl })
    await expect(
      executeCapability({ connectorId: 'belum', actionId: 'lookup', args: {} })
    ).rejects.toMatchObject({ code: 'MCP_NOT_AUTHORIZED' })
  })
})

describe('audit', () => {
  it('jejak audit adalah JSONL dengan ts + op', async () => {
    const entries = await readAudit(500)
    expect(entries.length).toBeGreaterThan(0)
    for (const e of entries) {
      expect(typeof e.op).toBe('string')
    }
  })

  it('file audit & koneksi ber-mode 0600 di XDG dir', () => {
    const capDir = path.join(tmpRoot, 'abelink', 'capabilities')
    const auditFile = path.join(capDir, 'audit.jsonl')
    expect(fs.existsSync(auditFile)).toBe(true)
    const mode = fs.statSync(auditFile).mode & 0o777
    expect(mode).toBe(0o600)
  })
})

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})
