// Penyimpanan koneksi & jejak audit untuk Capability Manager.
//
// Kredensial/izin TIDAK pernah keluar dari mesin: berkas koneksi disimpan di
// XDG data dir dengan mode 0600 (pola sama dengan browser-bridge-token).
// Audit = JSONL append-only dengan trim sederhana (anti membengkak tanpa
// rotasi penuh). Tanpa telemetri, tanpa jaringan.

import fs from 'fs'
import path from 'path'
import os from 'os'

const MAX_AUDIT_BYTES = 1024 * 1024 // 1MB
const MAX_AUDIT_TAIL = 500 // baris yang dipertahankan saat trim

export const capDir = () => {
  const xdg = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
  return path.join(xdg, 'mark', 'capabilities')
}

const connectionsFile = () => path.join(capDir(), 'connections.json')
const auditFile = () => path.join(capDir(), 'audit.jsonl')

// ------------------------------------------------------------- connections

export function readConnections() {
  const file = connectionsFile()
  try {
    const raw = fs.readFileSync(file, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.connections) return parsed.connections
    return {}
  } catch (e) {
    if (e.code !== 'ENOENT') {
      // Berkas rusak: jangan diam-diam dianggap kosong selamanya — reset dengan
      // jejak jelas di audit, tapi tetap lanjut (fail-open untuk availability,
      // bukan untuk keamanan: koneksi hilang = akses ikut hilang, aman).
      appendAudit({
        op: 'connections.reset',
        status: 'error',
        error: String(e?.message || e).slice(0, 300)
      })
    }
    return {}
  }
}

export function writeConnections(map) {
  const dir = capDir()
  fs.mkdirSync(dir, { recursive: true })
  const file = connectionsFile()
  const payload = JSON.stringify({ version: 1, connections: map }, null, 2)
  // Tulis via temp + rename agar tidak ada keadaan setengah-tertulis.
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, payload, { mode: 0o600 })
  fs.renameSync(tmp, file)
  try {
    fs.chmodSync(file, 0o600)
  } catch {
    // chmod gagal (mis. FS tanpa dukungan mode) — file tetap dibuat via
    // writeFileSync mode 0600, jadi aman diabaikan.
  }
}

// ------------------------------------------------------------------ audit

export function appendAudit(entry) {
  try {
    const dir = capDir()
    fs.mkdirSync(dir, { recursive: true })
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n'
    fs.appendFileSync(auditFile(), line, { mode: 0o600 })
    trimAuditIfNeeded()
  } catch {
    // Audit tidak boleh membuat eksekusi capability gagal — kegagalan I/O
    // audit ditelan (execution path tetap tegas lewat policy check).
  }
}

function trimAuditIfNeeded() {
  const file = auditFile()
  let stat
  try {
    stat = fs.statSync(file)
  } catch {
    return
  }
  if (stat.size <= MAX_AUDIT_BYTES) return
  try {
    const raw = fs.readFileSync(file, 'utf8')
    const lines = raw.split('\n').filter(Boolean)
    const keep = lines.slice(-MAX_AUDIT_TAIL)
    fs.writeFileSync(file, keep.join('\n') + '\n', { mode: 0o600 })
  } catch {
    // Trim gagal: biarkan audit tumbuh sampai cycle berikutnya; jangan pernah
    // membuat eksekusi capability gagal karena I/O audit.
  }
}

export function readAudit(limit = 50) {
  const n = Math.max(1, Math.min(500, Number(limit) || 50))
  let raw
  try {
    raw = fs.readFileSync(auditFile(), 'utf8')
  } catch {
    return []
  }
  const lines = raw.split('\n').filter(Boolean)
  return lines.slice(-n).map((l) => {
    try {
      return JSON.parse(l)
    } catch {
      return { ts: null, op: 'corrupt-line', raw: l.slice(0, 200) }
    }
  })
}
