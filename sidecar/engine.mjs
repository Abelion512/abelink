// Mark Sidecar Engine — Node/Bun runtime untuk fase A/B migrasi Tauri.
//
// Composition root tipis: satu-satunya tugasnya adalah memuat semua modul
// channel (yang masing-masing mendaftarkan handler ke registry), lalu
// menjalankan loop stdin/stdout. Tidak ada logika channel di sini —
// tambah channel baru = buat/ubah modul di engine/channels/, tanpa menyentuh
// file ini. Lihat docs/ARCHITECTURE.md untuk peta modul dan alur data.
import readline from 'readline'
import { handlers, send, fail } from './engine/registry.mjs'

// Urutan import = urutan registrasi handler. Modul saling lepas; satu-satunya
// coupling adalah sync-config (ai.mjs) yang menyalin config ke telegram.mjs.
import './engine/channels/ai.mjs'
import './engine/channels/media.mjs'
import './engine/channels/telegram.mjs'
import './engine/channels/services.mjs'
import './engine/channels/music.mjs'
import './engine/channels/skills.mjs'

// ------------------------------------------------------------------- Main loop
send({ event: 'engine:ready', payload: Object.keys(handlers) })

const rl = readline.createInterface({ input: process.stdin, terminal: false })
let stdinClosed = false
let pendingHandlers = 0
const maybeExit = () => {
  if (!stdinClosed || pendingHandlers > 0) return
  setTimeout(() => {
    if (stdinClosed && pendingHandlers === 0) process.exit(0)
  }, 100).unref()
}
// Batas panjang satu frame JSON agar stdin tidak bisa menghabiskan memori.
const MAX_FRAME_LENGTH = 32 * 1024 * 1024
rl.on('line', async (line) => {
  pendingHandlers++
  try {
    await handleLine(line)
  } finally {
    pendingHandlers--
  }
})

const handleLine = async (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  if (trimmed.length > MAX_FRAME_LENGTH) {
    send({ id: null, success: false, error: 'json frame terlalu besar (batas 32MB)' })
    return
  }
  let req
  try {
    req = JSON.parse(trimmed)
  } catch {
    send({ id: null, success: false, error: 'malformed json frame' })
    return
  }
  const { id, action, payload } = req
  const handler = handlers[action]
  if (!handler) {
    send({ id, success: false, error: `Aksi tidak dikenal: ${action}` })
    return
  }
  try {
    const result = await handler(payload === undefined ? [] : payload)
    send({ id, ...result })
  } catch (err) {
    send({ id, ...fail(err) })
  }
}
// stdin ditutup: tunggu semua handler async selesai, lalu keluar secara deterministik.
// Tanpa ini proses bisa jadi zombie (Telegraf polling menjaga event loop tetap hidup),
// atau sebaliknya mati sebelum handler selesai bila kita exit langsung.
rl.on('close', () => {
  stdinClosed = true
  maybeExit()
})
