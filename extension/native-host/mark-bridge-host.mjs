#!/usr/bin/env bun
// Mark Bridge — native messaging host (token tanpa copas).
//
// Dipanggil Chrome/Chromium via stdin/stdout (length-prefixed, LE uint32).
// Satu-satunya tugas: membaca file token sidecar dan mengembalikannya ke
// extension. Tidak ada akses lain, tidak ada network, tidak ada state.
// Dipasang otomatis oleh sidecar saat bridge start (native-host.mjs).
import fs from 'node:fs'
import path from 'node:path'

function tokenFile() {
  const dataHome = process.env.XDG_DATA_HOME || `${process.env.HOME}/.local/share`
  return path.join(dataHome, 'browser-bridge-token')
}

function writeMsg(obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8')
  const head = Buffer.alloc(4)
  head.writeUInt32LE(body.length, 0)
  process.stdout.write(Buffer.concat([head, body]))
}

function handle(msg) {
  if (!msg || msg.type !== 'get-token') {
    writeMsg({ ok: false, error: 'perintah tidak dikenal (hanya get-token)' })
    return
  }
  try {
    const raw = fs.readFileSync(tokenFile(), 'utf8').trim()
    if (!raw) {
      writeMsg({ ok: false, error: 'file token kosong (sidecar belum start?)' })
      return
    }
    let token = raw
    try {
      const rec = JSON.parse(raw)
      if (rec && typeof rec.token === 'string') token = rec.token
    } catch {}
    writeMsg({ ok: true, token })
  } catch (e) {
    writeMsg({ ok: false, error: `token tidak terbaca: ${e.message}` })
  }
}

let buf = Buffer.alloc(0)
process.stdin.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk])
  for (;;) {
    if (buf.length < 4) return
    const len = buf.readUInt32LE(0)
    if (len > 1024 * 1024) {
      writeMsg({ ok: false, error: 'pesan melebihi 1MB' })
      buf = Buffer.alloc(0)
      return
    }
    if (buf.length < 4 + len) return
    const body = buf.subarray(4, 4 + len).toString('utf8')
    buf = buf.subarray(4 + len)
    try {
      handle(JSON.parse(body))
    } catch {
      writeMsg({ ok: false, error: 'body bukan JSON' })
    }
  }
})
process.stdin.on('end', () => process.exit(0))
