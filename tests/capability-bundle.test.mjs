// Bundle kapabilitas: install ok, missing id throw, remove, file 0600 di XDG temp.
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-bundle-test-'))
process.env.XDG_DATA_HOME = tmpRoot
// installBundle -> listRegistry -> loadPlugins(): isolasi folder plugin
// agar tidak memindai ~/Documents asli (lambat + tidak hermetik).
process.env.XDG_DOCUMENTS_DIR = path.join(tmpRoot, 'Documents')

const { installBundle, listBundles, removeBundle } = await import(
  '../sidecar/main/capabilities/bundles.mjs'
)

const BUNDLE_FILE = path.join(tmpRoot, 'abelink', 'capabilities', 'bundles.json')

beforeAll(async () => {
  await removeBundle('paket-uji').catch(() => {})
})

describe('bundle install/list/remove', () => {
  it('install ok dengan capability yang ada', async () => {
    const res = await installBundle({
      id: 'paket-uji',
      name: 'Paket Uji',
      capabilities: ['time:now', 'fs:read'],
      privacy: { deniedScopes: ['fs.delete'] }
    })
    expect(res).toEqual({ id: 'paket-uji', enabled: 2 })
    const all = await listBundles()
    expect(all.some((b) => b.id === 'paket-uji')).toBe(true)
  })

  it('bundles.json ber-mode 0600', () => {
    expect(fs.existsSync(BUNDLE_FILE)).toBe(true)
    expect(fs.statSync(BUNDLE_FILE).mode & 0o777).toBe(0o600)
  })

  it('id tak dikenal melempar dengan daftar missing', async () => {
    await expect(
      installBundle({ id: 'paket-hantu', capabilities: ['time:now', 'hantu:x'] })
    ).rejects.toThrow(/hantu:x/)
  })

  it('id bundle invalid melempar', async () => {
    await expect(installBundle({ id: 'Bad ID!', capabilities: [] })).rejects.toThrow(/tidak valid/)
  })

  it('remove bekerja + idempotent', async () => {
    expect(await removeBundle('paket-uji')).toEqual({ removed: true })
    expect(await removeBundle('paket-uji')).toEqual({ removed: false })
    expect(await listBundles()).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ id: 'paket-uji' })])
    )
  })
})
