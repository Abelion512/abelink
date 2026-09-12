// Penyimpanan koneksi & jejak audit untuk Capability Manager.
//
// Kredensial/izin TIDAK pernah keluar dari mesin: berkas koneksi disimpan di
// XDG data dir dengan mode 0600 (pola sama dengan browser-bridge-token).
// Audit = JSONL append-only dengan trim sederhana (anti membengkak tanpa
// rotasi penuh). Tanpa telemetri, tanpa jaringan.

import fsp from 'fs/promises'
import path from 'path'
import os from 'os'

const MAX_AUDIT_BYTES = 1024 * 1024 // 1MB
const MAX_AUDIT_TAIL = 500 // baris yang dipertahankan saat trim

export const capDir = () => {
  const xdg = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
  return path.join(xdg, 'abelink', 'capabilities')
}

const connectionsFile = () => path.join(capDir(), 'connections.json')
const auditFile = () => path.join(capDir(), 'audit.jsonl')

// ------------------------------------------------------------- connections

export async function readConnections() {
  const file = connectionsFile()
  try {
    const raw = await fsp.readFile(file, 'utf8')
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

export async function writeConnections(map) {
  const dir = capDir()
  await fsp.mkdir(dir, { recursive: true })
  const file = connectionsFile()
  const payload = JSON.stringify({ version: 1, connections: map }, null, 2)
  // Tulis via temp + rename agar tidak ada keadaan setengah-tertulis.
  const tmp = file + '.tmp'
  await fsp.writeFile(tmp, payload, { mode: 0o600 })
  await fsp.rename(tmp, file)
  try {
    await fsp.chmod(file, 0o600)
  } catch {
    // chmod gagal (mis. FS tanpa dukungan mode) — file tetap dibuat via
    // writeFile mode 0600, jadi aman diabaikan.
  }
}

// ------------------------------------------------------------------ audit

// Fire-and-forget-able TAPI mengembalikan promise: jalur manager meng-await
// agar urutan request->result deterministik dan tes tidak flaky. Cek trim
// di-throttle (tiap 25 append) agar stat+rewrite tidak terjadi tiap execute.
let appendCount = 0
export function appendAudit(entry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n'
  return fsp
    .mkdir(capDir(), { recursive: true })
    .then(() => fsp.appendFile(auditFile(), line, { mode: 0o600 }))
    .then(() => {
      appendCount += 1
      if (appendCount % 25 === 0) return trimAuditIfNeeded()
    })
    .catch(() => {
      // Audit tidak boleh membuat eksekusi capability gagal — kegagalan I/O
      // audit ditelan (execution path tetap tegas lewat policy check).
    })
}

async function trimAuditIfNeeded() {
  const file = auditFile()
  let stat
  try {
    stat = await fsp.stat(file)
  } catch {
    return
  }
  if (stat.size <= MAX_AUDIT_BYTES) return
  try {
    const raw = await fsp.readFile(file, 'utf8')
    const lines = raw.split('\n').filter(Boolean)
    const keep = lines.slice(-MAX_AUDIT_TAIL)
    await fsp.writeFile(file, keep.join('\n') + '\n', { mode: 0o600 })
  } catch {
    // Trim gagal: biarkan audit tumbuh sampai cycle berikutnya; jangan pernah
    // membuat eksekusi capability gagal karena I/O audit.
  }
}

export async function readAudit(limit = 50, offset = 0) {
  const n = Math.max(1, Math.min(500, Number(limit) || 50))
  const off = Math.max(0, Number(offset) || 0)
  let raw
  try {
    raw = await fsp.readFile(auditFile(), 'utf8')
  } catch {
    return []
  }
  const lines = raw.split('\n').filter(Boolean)
  // Halaman dari entri TERBARU: offset 0 = n terbaru (kompatibel perilaku lama),
  // offset n = n sebelumnya — UI "muat lagi" tinggal naikkan offset.
  const total = lines.length
  const end = Math.max(0, total - off)
  const start = Math.max(0, end - n)
  return lines.slice(start, end).map((l) => {
    try {
      return JSON.parse(l)
    } catch {
      return { ts: null, op: 'corrupt-line', raw: l.slice(0, 200) }
    }
  })
}
