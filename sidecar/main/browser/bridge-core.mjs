// Mark Browser Bridge — inti logika antara sidecar dan ekstensi browser (Fase C3 Jalur A).
//
// Model komunikasi (tanpa dependensi eksternal):
//   - Ekstensi Chrome/Chromium melakukan LONG-POLL keluar ke server HTTP lokal
//     (127.0.0.1, lihat server.mjs) memakai fetch — jadi tidak butuh native
//     messaging manifest maupun dependency `ws` di sidecar.
//   - Sidecar mengantre perintah (`navigate` / `act` / `read-dom` / ...) per
//     sessionId; ekstensi mengambilnya, mengeksekusinya lewat chrome.tabs /
//     chrome.scripting, lalu POST hasilnya kembali.
//   - Semua state hidup di memori proses sidecar (single-writer), timeout
//     ketat agar tidak ada request yang menggantung selamanya.
//
// Keamanan:
//   - Token auth acak per proses. Ekstensi mengambil token lewat file token
//     yang ditulis di direktori data XDG mark (mode 0600) — bukan env var
//     global, bukan hardcode. Tanpa token, endpoint menolak (401).
//   - Bind 127.0.0.1 saja; tidak pernah 0.0.0.0.
//   - Tidak ada eksekusi JS arbitrer dari sisi ekstensi ke sidecar; arah
//     kepercayaan satu arah: sidecar -> ekstensi.

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

// --------------------------------------------------------------- konstanta
export const BROWSER_BRIDGE = {
  PORT: Number(process.env.MARK_BRIDGE_PORT || 49712),
  HOST: '127.0.0.1',
  // Long-poll: ekstensi menunggu perintah maksimal selama ini sebelum
  // reconnect. Harus lebih kecil dari timeout HTTP default ekstensi.
  POLL_TIMEOUT_MS: 25000,
  // Batas waktu ekstensi mengeksekusi satu perintah dan mengirim hasil.
  COMMAND_TIMEOUT_MS: 90000,
  // Session lama dianggap mati bila ekstensi tidak pernah ping lagi.
  SESSION_TTL_MS: 5 * 60 * 1000,
  MAX_QUEUE: 16,
  MAX_RESULT_CHARS: 400000
}

// ------------------------------------------------------------- state global
// sessionId -> {
//   token, createdAt, lastSeenAt,
//   pending: [{id, type, payload, resolve, reject, timer}],
//   waiting: [{resolve, timer}],           // long-poll resolvers
//   groups: { [task]: { status, task, color, lastUpdate } }  // browser-use grouping
// }
const sessions = new Map()

// Group colors cycle (sesuai Chrome tabGroup.color enum: grey/blue/red/yellow/green/pink/purple/cyan)
export const GROUP_COLORS = ['grey', 'blue', 'yellow', 'green', 'pink', 'purple', 'cyan', 'red']

// Status ikon untuk group tab. UI menampilkan icon ini di nama group.
export const STATUS_ICON = {
  loading: '⏳',
  reading: '📖',
  acting: '🖱️',
  idle: '🟢',
  done: '✅',
  error: '❌'
}

// Konvensi penamaan group: "{icon} ({status}) — {task}"
export function deriveGroupName(status, task) {
  const icon = STATUS_ICON[status] || STATUS_ICON.idle
  const safeTask = String(task || 'untitled').slice(0, 32)
  return `${icon} (${status}) — ${safeTask}`
}

function prng() {
  return crypto.randomBytes(16).toString('hex')
}

function now() {
  return Date.now()
}

// ------------------------------------------------------------ session mgmt
export function getSession(sessionId = 'default') {
  return sessions.get(sessionId) || null
}

export function ensureSession(sessionId = 'default') {
  let s = sessions.get(sessionId)
  if (!s) {
    s = {
      token: prng(),
      createdAt: now(),
      lastSeenAt: 0,
      pending: [],
      waiting: [],
      groups: {} // browser-use: { [task]: { status, color, lastUpdate } }
    }
    sessions.set(sessionId, s)
  }
  return s
}

export function dropSession(sessionId) {
  const s = sessions.get(sessionId)
  if (!s) return false
  for (const w of s.waiting) {
    clearTimeout(w.timer)
    w.resolve(null) // long-poll berakhir tanpa perintah
  }
  // Resolver perintah hidup di peta inflight (bukan di antrean) sejak
  // desain reconnect-safe; gagalkan semuanya secara eksplisit.
  for (const p of s.pending) {
    const w = inflight.get(p.id)
    if (w) {
      clearTimeout(w.timer)
      inflight.delete(p.id)
      w.reject(new Error('Sesi browser ditutup sebelum perintah dieksekusi.'))
    }
  }
  sessions.delete(sessionId)
  return true
}

export function listSessions() {
  return [...sessions.entries()].map(([id, s]) => ({
    id,
    createdAt: s.createdAt,
    lastSeenAt: s.lastSeenAt,
    connected: now() - s.lastSeenAt < BROWSER_BRIDGE.SESSION_TTL_MS,
    queued: s.pending.length,
    groups: { ...s.groups }
  }))
}

// -------------------------------------------------------- group-session command
// Update group status untuk task tertentu. Ekstensi akan
// membuat/memindahkan tab ke group dengan nama yang diturunkan.
export function groupSession(sessionId, { task, status, color, groupId }) {
  const s = sessions.get(sessionId)
  if (!s) return { ok: false, error: 'Sesi tidak dikenal.' }
  if (!task) return { ok: false, error: 'task wajib.' }

  const colorIdx = typeof color === 'number' ? color : 0
  const selectedColor = GROUP_COLORS[colorIdx % GROUP_COLORS.length]

  s.groups[task] = {
    status: status || 'idle',
    color: selectedColor,
    groupId: groupId || null,
    lastUpdate: now()
  }
  return { ok: true, group: s.groups[task] }
}

// Get group info for a specific task (or all tasks)
export function getSessionGroups(sessionId) {
  const s = sessions.get(sessionId)
  if (!s) return { ok: false, error: 'Sesi tidak dikenal.' }
  return { ok: true, groups: s.groups }
}

// --------------------------------------------------------------- handshake
// Dipanggil server.mjs saat ekstensi GET /handshake dengan token valid.
export function handshake(sessionId, token) {
  const s = ensureSession(sessionId)
  if (s.token !== token) return { ok: false, error: 'Token tidak cocok.' }
  s.lastSeenAt = now()
  return { ok: true, pollTimeoutMs: BROWSER_BRIDGE.POLL_TIMEOUT_MS }
}

// ---------------------------------------------------------------- dispatch
// Dipanggil channel browser:* (navigate/read-dom/action/close/show).
// Mengembalikan Promise yang resolve ketika ekstensi mengirim hasil.
//
// Perintah yang sudah diserahkan ke long-poll tidak disimpan di antrean
// lagi; penuntasan dilakukan lewat peta `inflight` agar reconnect ekstensi
// tidak menggugurkan state session.

function wake(s) {
  // Bangunkan semua long-poll yang menggantung; mereka akan mengambil
  // perintah dari antrean lewat takeNext().
  const waiters = s.waiting.splice(0, s.waiting.length)
  for (const w of waiters) {
    clearTimeout(w.timer)
    w.resolve(null)
  }
}

// ------------------------------------------------------------- long-polling
// Dipanggil server.mjs saat ekstensi GET /poll. Mengembalikan satu perintah
// atau null (timeout tanpa pekerjaan). sidecarToken diverifikasi dulu.
export function takeNext(sessionId, token) {
  const s = sessions.get(sessionId)
  if (!s || s.token !== token)
    return Promise.reject(new Error('Sesi tidak dikenal atau token salah.'))
  s.lastSeenAt = now()
  const existing = s.pending[0]
  if (existing) return Promise.resolve(serializeCommand(existing, s))
  return new Promise((resolve) => {
    const w = { resolve: null, timer: null }
    w.resolve = (cmd) => {
      const i = s.waiting.indexOf(w)
      if (i >= 0) s.waiting.splice(i, 1)
      const next = s.pending[0]
      resolve(next ? serializeCommand(next, s) : cmd)
    }
    w.timer = setTimeout(() => w.resolve(null), BROWSER_BRIDGE.POLL_TIMEOUT_MS)
    s.waiting.push(w)
  })
}

function serializeCommand(entry, s) {
  // Hapus dari antrean saat diserahkan; hasilnya yang akan menutup promise.
  const i = s.pending.indexOf(entry)
  if (i >= 0) s.pending.splice(i, 1)
  clearTimeout(entry.timer)
  return { id: entry.id, type: entry.type, payload: entry.payload ?? null }
}

// ------------------------------------------------------------------ hasil
// Dipanggil server.mjs saat ekstensi POST /result. Menuntaskan promise
// dispatch() yang sesuai. sidecarToken + commandId wajib.
export function resolveCommand(sessionId, token, commandId, result) {
  const s = sessions.get(sessionId)
  if (!s || s.token !== token) return { ok: false, error: 'Sesi tidak dikenal atau token salah.' }
  s.lastSeenAt = now()
  if (!commandId) return { ok: false, error: 'commandId wajib.' }
  // Perintah yang sudah diserahkan tidak disimpan di antrean lagi, jadi
  // resolve-nya dilakukan lewat peta promise terpisah agar long-poll tetap
  // stateless. Lihat inflight map di bawah.
  const waiter = inflight.get(commandId)
  if (!waiter) return { ok: false, error: 'Perintah tidak ditemukan atau sudah selesai.' }
  inflight.delete(commandId)
  clearTimeout(waiter.timer)
  const text = typeof result?.data === 'string' ? result.data : JSON.stringify(result?.data ?? null)
  const trimmed =
    text && text.length > BROWSER_BRIDGE.MAX_RESULT_CHARS
      ? text.slice(0, BROWSER_BRIDGE.MAX_RESULT_CHARS) + '…[dipotong]'
      : text
  waiter.resolve({
    ok: !!result?.ok,
    data: result?.ok ? trimmed : null,
    error: result?.error || null
  })
  return { ok: true }
}

// Promise dispatch() menunggu hasil lewat peta inflight agar takeNext()
// bisa murni menyerahkan perintah tanpa menyimpan referensi resolver di
// antrean session (tahan terhadap reconnect ekstensi).
const inflight = new Map()

// Varian dispatch yang memakai inflight map (dipakai channel browser:*).
export function dispatchCommand(sessionId, type, payload) {
  const s = ensureSession(sessionId)
  if (s.pending.length >= BROWSER_BRIDGE.MAX_QUEUE) {
    return Promise.reject(new Error(`Antrean browser session '${sessionId}' penuh.`))
  }
  return new Promise((resolve, reject) => {
    const commandId = prng()
    const timer = setTimeout(() => {
      inflight.delete(commandId)
      const i = s.pending.findIndex((e) => e.id === commandId)
      if (i >= 0) s.pending.splice(i, 1)
      reject(
        new Error(
          `Perintah browser '${type}' kedaluwarsa (${BROWSER_BRIDGE.COMMAND_TIMEOUT_MS}ms). ` +
            'Kemungkinan ekstensi Mark tidak terpasang/tidak berjalan di browser tujuan.'
        )
      )
    }, BROWSER_BRIDGE.COMMAND_TIMEOUT_MS)
    inflight.set(commandId, { resolve, timer })
    s.pending.push({ id: commandId, type, payload })
    wake(s)
  })
}

// ------------------------------------------------------------------- token
// Lokasi file token: ikuti pola XDG modul lain (~/.local/share/mark).
export function tokenFilePath(xdgDataDir) {
  return path.join(xdgDataDir, 'browser-bridge-token')
}

export function writeTokenFile(xdgDataDir) {
  const file = tokenFilePath(xdgDataDir)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  // 0600: hanya user yang boleh baca. Server mengizinkan salah satu dari
  // banyak token sesi; file ini menyimpan token sesi 'default'.
  const s = ensureSession('default')
  fs.writeFileSync(file, s.token, { mode: 0o600 })
  return { file, token: s.token }
}

// ------------------------------------------------------------- sweep sesi
export function sweepSessions() {
  const t = now()
  const dropped = []
  for (const [id, s] of sessions.entries()) {
    if (
      s.lastSeenAt &&
      t - s.lastSeenAt > BROWSER_BRIDGE.SESSION_TTL_MS &&
      s.pending.length === 0
    ) {
      dropSession(id)
      dropped.push(id)
    }
  }
  return dropped
}
