import fs from 'fs'
import path from 'path'
import os from 'os'

const QUARANTINE_BASE = path.join(os.homedir(), '.mark', 'quarantine')

function ensureBase() {
  if (!fs.existsSync(QUARANTINE_BASE)) {
    fs.mkdirSync(QUARANTINE_BASE, { recursive: true })
  }
}

function timestampDir() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

/**
 * Quarantine a file: move to ~/.mark/quarantine/{timestamp}/preserving/relative/path
 * @param {string} filePath - absolute path to file
 * @param {{ reason?: string, risk?: string }} meta
 * @returns {{ quarantineId: string, quarantinedPath: string } | null}
 */
export function quarantineFile(filePath, meta = {}) {
  ensureBase()
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) return null

  const dirName = timestampDir()
  const quarantineId = `q-${dirName.replace(/T.*/, '').replace(/-/g, '')}-${Date.now().toString(36)}`
  const quarantineDir = path.join(QUARANTINE_BASE, dirName)

  // Preserve relative path structure
  const rel = path.relative('/', resolved)
  const dest = path.join(quarantineDir, rel)

  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.renameSync(resolved, dest)

    // Write manifest for this quarantine batch
    const manifestPath = path.join(quarantineDir, 'manifest.json')
    const manifest = fs.existsSync(manifestPath)
      ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      : {
          id: quarantineId,
          timestamp: new Date().toISOString(),
          reason: meta.reason || 'quarantined',
          files: [],
        }

    manifest.files.push({
      original: resolved,
      quarantined: dest,
      risk: meta.risk || 'unknown',
      size: fs.statSync(dest).size,
    })
    manifest.totalFiles = manifest.files.length
    manifest.totalSize = manifest.files.reduce((s, f) => s + f.size, 0)

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

    return { quarantineId, quarantinedPath: dest }
  } catch (e) {
    console.warn('[Quarantine] failed:', e.message)
    return null
  }
}

/**
 * Restore a quarantined file to its original path.
 * @param {string} quarantineId - quarantine directory name
 * @param {string} originalPath - where to restore
 * @returns {boolean}
 */
export function restoreFile(quarantineId, originalPath) {
  ensureBase()

  // Find quarantine dir by id in manifest
  const dirs = fs.readdirSync(QUARANTINE_BASE)
  for (const dir of dirs) {
    const manifestPath = path.join(QUARANTINE_BASE, dir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) continue
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    if (manifest.id !== quarantineId) continue

    const entry = manifest.files.find((f) => f.original === originalPath)
    if (!entry || !fs.existsSync(entry.quarantined)) return false

    try {
      fs.mkdirSync(path.dirname(originalPath), { recursive: true })
      fs.renameSync(entry.quarantined, originalPath)
      return true
    } catch (e) {
      console.warn('[Quarantine] restore failed:', e.message)
      return false
    }
  }
  return false
}

/**
 * List all quarantined files across all quarantine batches.
 * @returns {{ quarantineId: string, timestamp: string, files: object[], reason?: string }[]}
 */
export function listQuarantined() {
  ensureBase()
  const dirs = fs.readdirSync(QUARANTINE_BASE)
  const batches = []

  for (const dir of dirs) {
    const manifestPath = path.join(QUARANTINE_BASE, dir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) continue
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      // Filter to files that still exist on disk
      manifest.files = manifest.files.filter((f) => fs.existsSync(f.quarantined))
      if (manifest.files.length > 0) {
        batches.push(manifest)
      }
    } catch {
      // skip corrupt manifests
    }
  }

  return batches
}
