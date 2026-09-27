// Tahap 4: validasi argumen + sanitasi koneksi. Offline: time/fs nyata,
// weather hanya argumen invalidnya (gagal sebelum fetch).
import { describe, it, expect, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-cap-valid-'))
process.env.XDG_DATA_HOME = tmpRoot

const { validateArgs } = await import('../sidecar/main/capabilities/validation.mjs')
const {
  executeCapability,
  listConnections,
  readAudit,
  registerConnector
} = await import('../sidecar/main/capabilities/manager.mjs')

describe('validateArgs unit', () => {
  it('valid passes', () => {
    expect(
      validateArgs(
        { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
        { path: 'a.txt' }
      )
    ).toEqual({ ok: true, errors: [] })
  })

  it('wrong type fails with path', () => {
    const r = validateArgs(
      { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      { path: 42 }
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/path/)
  })

  it('missing required fails with path', () => {
    const r = validateArgs(
      { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      {}
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/path/)
  })

  it('bad enum fails with path', () => {
    const r = validateArgs(
      { type: 'object', properties: { mode: { type: 'string', enum: ['a', 'b'] } } },
      { mode: 'z' }
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/mode/)
  })

  it('unknown schema passes (fail-open legacy)', () => {
    expect(validateArgs(null, { apa: 1 }).ok).toBe(true)
    expect(validateArgs({ type: 'object' }, { apa: 1 }).ok).toBe(true)
    expect(validateArgs({ type: 'string' }, 'x').ok).toBe(true)
  })

  it('never throws on garbage', () => {
    expect(() => validateArgs(42, null)).not.toThrow()
    expect(() => validateArgs({ type: 'object', properties: null }, [])).not.toThrow()
  })
})

describe('executeCapability validation gate', () => {
  it('fs.read wrong type -> CAPABILITY_INVALID_ARGS + audit invalid-args', async () => {
    await expect(
      executeCapability({ connectorId: 'fs', actionId: 'read', args: { path: 123 } })
    ).rejects.toMatchObject({ code: 'CAPABILITY_INVALID_ARGS' })
    expect(
      (await readAudit(10)).some((a) => a.op === 'execute.result' && a.status === 'invalid-args')
    ).toBe(true)
  })

  it('fs.read missing required -> CAPABILITY_INVALID_ARGS', async () => {
    await expect(executeCapability({ connectorId: 'fs', actionId: 'read', args: {} })).rejects.toMatchObject(
      { code: 'CAPABILITY_INVALID_ARGS' }
    )
  })

  it('time.diff valid args still pass (no regression)', async () => {
    const out = await executeCapability({
      connectorId: 'time',
      actionId: 'diff',
      args: { from: '09:00', to: '17:30' }
    })
    expect(out.total_minutes).toBe(510)
  })
})

describe('listConnections sanitized', () => {
  it('no headers key; urlHost hostname only; toolCount present', async () => {
    registerConnector({ id: 'rahasia', url: 'https://api.contoh.test:8443/jalur/x?q=1', headers: { Authorization: 'Bearer S3CR3T' } })
    // Simulasi koneksi terotorisasi tanpa jaringan: tulis langsung via authorize
    // path connection-less tidak cocok, jadi tulis store mentah lalu baca sanitasi.
    const { writeConnections } = await import('../sidecar/main/capabilities/connections.mjs')
    const { readConnections } = await import('../sidecar/main/capabilities/connections.mjs')
    const map = await readConnections()
    map.rahasia = {
      url: 'https://api.contoh.test:8443/jalur/x?q=1',
      headers: { Authorization: 'Bearer S3CR3T' },
      tools: [{ name: 'cari', description: 'cari', inputSchema: { type: 'object' } }],
      authorizedAt: new Date().toISOString()
    }
    await writeConnections(map)
    const sanitized = await listConnections()
    expect(sanitized.rahasia).toBeDefined()
    expect('headers' in sanitized.rahasia).toBe(false)
    expect(JSON.stringify(sanitized.rahasia)).not.toMatch(/S3CR3T|Bearer/)
    expect(sanitized.rahasia.urlHost).toBe('api.contoh.test')
    expect(sanitized.rahasia.toolCount).toBe(1)
    expect(sanitized.rahasia.authorizedAt).toBeTruthy()
  })
})

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})
