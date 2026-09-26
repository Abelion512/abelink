// shared-config.js — jembatan SATU produk: config AI GUI -> file yang dibaca
// CLI/TUI. GUI menyimpan konfigurasi di Dexie (IndexedDB WebKitGTK) yang TIDAK
// bisa dibaca proses Bun; jadi GUI menulis snapshot ke
// ~/.config/abelink/shared.json (0600) via channel `sync-config`, dan
// headlessCli.loadCliFileConfig membacanya sebagai lapis dasar. Tanpa ini
// GUI dan TUI menjadi dua produk dengan dua kebenaran konfigurasi.
//
// Murni + never-throw (pola loadCliFileConfig): GUI tidak boleh gagal sync
// hanya karena tulis file gagal.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Field AI yang relevan untuk runtime headless. Field GUI-only (camera,
// windowOpacity, dsb) sengaja tidak ikut.
export const SHARED_AI_KEYS = Object.freeze([
  'aiProvider',
  'customEndpoint',
  'customApiKey',
  'customModel',
  'groqApiKey',
  'groqModel',
  'cerebrasApiKey',
  'cerebrasModel',
  'geminiWebModel',
  'embedProvider',
  'lmStudioEmbedModel',
])

export function sharedConfigPath({ homeDir = null } = {}) {
  const home = homeDir || os.homedir?.() || process.env.HOME || ''
  return path.join(home, '.config', 'abelink', 'shared.json')
}

// Ambil hanya field AI dari config GUI (drop sisanya agar file tidak bocorkan
// seluruh Dexie row: token telegram, dsb).
export function pickSharedAiConfig(config = {}) {
  const out = {}
  if (!config || typeof config !== 'object') return out
  for (const key of SHARED_AI_KEYS) {
    if (config[key] !== undefined) out[key] = config[key]
  }
  return out
}

// Tulis snapshot AI GUI. Merge dengan isi lama supaya config parsial
// (CapabilitiesHub/Shortcuts memanggil syncConfig dengan objek kecil) tidak
// menghapus field yang sudah tersimpan. Return { ok, path } | { ok:false, error }.
export function writeSharedConfig(config = {}, { homeDir = null, now = Date.now() } = {}) {
  try {
    const ai = pickSharedAiConfig(config)
    if (!Object.keys(ai).length) return { ok: false, error: 'tanpa field AI', path: null }
    const file = sharedConfigPath({ homeDir })
    let current = {}
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (parsed && typeof parsed === 'object') current = parsed
    } catch { /* belum ada / korup -> mulai baru */ }
    const merged = { ...current, ...ai, source: 'gui', updatedAt: new Date(now).toISOString() }
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    const tmp = `${file}.tmp-${now}`
    fs.writeFileSync(tmp, JSON.stringify(merged, null, 2) + '\n', { mode: 0o600 })
    fs.renameSync(tmp, file)
    try { fs.chmodSync(file, 0o600) } catch { /* mode sudah 0600 saat create */ }
    return { ok: true, path: file }
  } catch (err) {
    return { ok: false, error: String(err?.message || err), path: null }
  }
}

// Baca snapshot (untuk status/diagnostik). Never throws.
export function readSharedConfig({ homeDir = null } = {}) {
  try {
    const parsed = JSON.parse(fs.readFileSync(sharedConfigPath({ homeDir }), 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}
