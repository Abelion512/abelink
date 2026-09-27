// Bundle kapabilitas: paket bernama berisi daftar descriptor id + privacy.
// Persist di bundles.json (capDir, 0600, pola temp+rename seperti connections.mjs).
// installBundle memvalidasi setiap id terhadap listRegistry() — id tak dikenal
// melempar error eksplisit berisi daftar yang hilang (fail-fast, bukan sukses palsu).
import fsp from 'fs/promises'
import path from 'path'
import { capDir } from './connections.mjs'

const ID_RE = /^[a-z0-9][a-z0-9_-]*$/

const bundlesFile = () => path.join(capDir(), 'bundles.json')

async function readBundles() {
  try {
    const raw = await fsp.readFile(bundlesFile(), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.bundles && typeof parsed.bundles === 'object') {
      return parsed.bundles
    }
    return {}
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[bundles] baca gagal, dianggap kosong:', e?.message)
    return {}
  }
}

async function writeBundles(map) {
  const dir = capDir()
  await fsp.mkdir(dir, { recursive: true })
  const file = bundlesFile()
  const tmp = `${file}.tmp`
  await fsp.writeFile(tmp, JSON.stringify({ version: 1, bundles: map }, null, 2), { mode: 0o600 })
  await fsp.rename(tmp, file)
  try {
    await fsp.chmod(file, 0o600)
  } catch {
    // FS tanpa dukungan mode — file tetap dibuat via writeFile mode 0600.
  }
}

export async function installBundle(bundle = {}) {
  const id = String(bundle.id || '').trim()
  if (!ID_RE.test(id)) {
    throw new Error(`ID bundle tidak valid: '${bundle.id}' (huruf kecil/angka/dash/underscore).`)
  }
  const caps = Array.isArray(bundle.capabilities) ? bundle.capabilities.map((c) => String(c)) : null
  if (!caps) throw new Error('Bundle harus punya capabilities berupa array descriptor id.')
  const denied = bundle.privacy?.deniedScopes
  if (denied !== undefined && (!Array.isArray(denied) || denied.some((s) => typeof s !== 'string'))) {
    throw new Error('privacy.deniedScopes harus array string.')
  }
  const { listRegistry } = await import('./registry.mjs')
  const known = new Set((await listRegistry()).map((d) => d.id))
  const missing = caps.filter((c) => !known.has(c))
  if (missing.length) {
    throw new Error(`Capability tidak dikenal: ${missing.join(', ')} (lihat capabilities:registry)`)
  }
  const map = await readBundles()
  map[id] = {
    id,
    name: String(bundle.name || id),
    description: String(bundle.description || ''),
    capabilities: caps,
    privacy: { deniedScopes: Array.isArray(denied) ? denied : [] },
    installedAt: new Date().toISOString()
  }
  await writeBundles(map)
  return { id, enabled: caps.length }
}

export async function listBundles() {
  return Object.values(await readBundles())
}

export async function removeBundle(id) {
  const key = String(id || '')
  const map = await readBundles()
  if (!(key in map)) return { removed: false }
  delete map[key]
  await writeBundles(map)
  return { removed: true }
}
