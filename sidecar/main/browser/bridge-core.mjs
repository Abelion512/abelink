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
// (Kontrak lama, dipakai test + status mirror sidecar. Judul grup Chrome
// yang tampil ke user memakai format "(icon) <task>" di extension/.)
export function deriveGroupName(status, task) {
  const icon = STATUS_ICON[status] || STATUS_ICON.idle
  const safeTask = String(task || 'untitled').slice(0, 32)
  return `${icon} (${status}) — ${safeTask}`
}

// ------------------------------------------------------- config browser
// Diisi dari renderer via channel sync-config (ai.mjs). Default: jangan
// auto-close (user masih butuh lihat hasil kerja), jangan auto-launch
// (membuka aplikasi user butuh persetujuan eksplisit).
const browserConfig = { autoCloseTabs: false, autoLaunch: false }

export function setBrowserConfig(partial = {}) {
  if (typeof partial.autoCloseTabs === 'boolean') {
    browserConfig.autoCloseTabs = partial.autoCloseTabs
  }
  if (typeof partial.autoLaunch === 'boolean') {
    browserConfig.autoLaunch = partial.autoLaunch
  }
  return { ...browserConfig }
}

export function getBrowserConfig() {
  return { ...browserConfig }
}

// Normalisasi ID elemen: "3" -> "mk3" (format data-mark-id); "mk3" tetap.
export function normalizeMarkId(q) {
  const t = String(q ?? '').trim()
  if (/^mk\d+$/i.test(t)) return t.toLowerCase()
  if (/^\d+$/.test(t)) return `mk${t}`
  return t
}

// ------------------------------------------------------- pagar scrape
// Deteksi perintah shell yang mengambil + mem-parse halaman web
// (pola spiral observasi nyata: curl|grep|sed berulang → gagal → ulangi).
// curl polos (cek API), curl -o (download), dan localhost tanpa parse
// tetap diizinkan — yang ditolak hanya fetch-lalu-parse HTML.
export function isWebScrapeCommand(query) {
  const q = String(query ?? '')
  if (!/https?:\/\//i.test(q)) return false
  if (/\b(curl|wget)\b[^|]*\|\s*(grep|sed|awk|perl|python|node|php|ruby|cut|sort|head|tail)\b/i.test(q)) return true
  if (/python\d?\s+-c\b[^;]*\b(urllib|requests|urlopen|BeautifulSoup|htmlparser)\b/i.test(q)) return true
  // Heredoc crawler: cat << 'EOF' > /tmp/x.py ... urllib/requests ... python3 /tmp/x.py
  // (pola kabur observasi nyata — query satu blok berisi definisi + eksekusi).
  if (/<<\s*'?[A-Z_]+\b/i.test(q) && /\b(urllib|requests|urlopen|BeautifulSoup)\b/i.test(q)) return true
  return false
}

// File .py yang isinya crawler web (dipakai write-file guard sisi renderer).
export function looksLikeCrawlerSource(content) {
  const c = String(content ?? '')
  if (!/https?:\/\//i.test(c)) return false
  return /\b(urllib|requests|urlopen|BeautifulSoup|htmlparser|selenium|playwright)\b/i.test(c)
    && /\b(re|findall|find_all|select|cssselect|href)\b/i.test(c)
}

// ------------------------------------------------------- sanitasi URL
// Model sering mengembalikan URL berbalut markdown "[label](url)" atau tanpa
// skema. Bersihkan sebelum fetch/dispatch agar satu format aneh tidak
// menggagalkan seluruh sesi (kasus nyata: 20 turn retry → give up).
export function extractUrl(query) {
  const text = String(query ?? '')
  const m = text.match(/https?:\/\/[^\s)\]>"]+/)
  if (m) return m[0].replace(/[.,;:!?]+$/, '')
  const t = text.trim()
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return `https://${t}`
  return ''
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
  if (!tokenOk(s, token)) return { ok: false, error: 'Token tidak cocok.' }
  s.lastSeenAt = now()
  const out = { ok: true, pollTimeoutMs: BROWSER_BRIDGE.POLL_TIMEOUT_MS }
  // Rotasi hanya dari handshake VALID dengan token aktif (bukan grace).
  if (s.token === token) {
    const rotated = maybeRotate(s)
    if (rotated) out.newToken = rotated
  }
  return out
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
  if (!s || !tokenOk(s, token))
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
  if (!s || !tokenOk(s, token)) return { ok: false, error: 'Sesi tidak dikenal atau token salah.' }
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
    inflight.set(commandId, { resolve, reject, timer })
    s.pending.push({ id: commandId, type, payload })
    wake(s)
  })
}

// ------------------------------------------------------------------- token
// File token JSON: { token, createdAt } + opsional { prevToken, prevExpiresAt }.
// - File plaintext lama (hanya token) diadopsi apa adanya (createdAt = sekarang).
// - Rotasi refresh-on-use: handshake VALID yang umurnya > batas -> terbitkan
//   token baru, token lama tetap diterima selama masa grace (poll yang sedang
//   jalan tidak putus). Token baru dikembalikan di respons handshake agar
//   extension menukar diam-diam — tanpa tempel ulang, tanpa putus sesi.
// - Batas default 30 hari, grace 24 jam (env MARK_TOKEN_ROTATE_MS untuk test).
function rotateMs() {
  return Number(process.env.MARK_TOKEN_ROTATE_MS || 30 * 24 * 3600 * 1000)
}
const TOKEN_GRACE_MS = 24 * 3600 * 1000

// Lokasi file token: ikuti pola XDG modul lain (~/.local/share/mark).
export function tokenFilePath(xdgDataDir) {
  return path.join(xdgDataDir, 'browser-bridge-token')
}

export function readTokenRecord(xdgDataDir) {
  try {
    const raw = fs.readFileSync(tokenFilePath(xdgDataDir), 'utf8').trim()
    if (!raw) return null
    try {
      const rec = JSON.parse(raw)
      if (rec && typeof rec.token === 'string' && rec.token) {
        return {
          token: rec.token,
          createdAt: Number(rec.createdAt) || Date.now(),
          prevToken: typeof rec.prevToken === 'string' ? rec.prevToken : null,
          prevExpiresAt: Number(rec.prevExpiresAt) || 0
        }
      }
    } catch {
      /* bukan JSON -> anggap plaintext lawas */
    }
    if (/^\S+$/.test(raw)) {
      return { token: raw, createdAt: Date.now(), prevToken: null, prevExpiresAt: 0, adopted: true }
    }
  } catch {
    /* belum ada file */
  }
  return null
}

function persistTokenRecord(xdgDataDir, rec) {
  const file = tokenFilePath(xdgDataDir)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(rec), { mode: 0o600 })
  return file
}

export function writeTokenFile(xdgDataDir) {
  let rec = readTokenRecord(xdgDataDir)
  if (!rec) {
    rec = { token: prng(), createdAt: Date.now(), prevToken: null, prevExpiresAt: 0 }
    persistTokenRecord(xdgDataDir, rec)
  } else if (!rec.createdAt || rec.adopted) {
    rec.createdAt = rec.createdAt || Date.now()
    delete rec.adopted
    persistTokenRecord(xdgDataDir, rec)
  }
  // 0600: hanya user yang boleh baca. Server mengizinkan salah satu dari
  // banyak token sesi; file ini menyimpan token sesi 'default'.
  const s = ensureSession('default')
  s.token = rec.token
  s.tokenCreatedAt = rec.createdAt
  s.prevToken = rec.prevToken
  s.prevExpiresAt = rec.prevExpiresAt
  s.tokenXdg = xdgDataDir
  return { file: tokenFilePath(xdgDataDir), token: s.token }
}

function safeTokenCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

// Token cocok: token aktif ATAU token lama dalam masa grace.
export function tokenOk(s, token) {
  if (!s || !token) return false
  if (safeTokenCompare(s.token, token)) return true
  return !!(s.prevToken && safeTokenCompare(s.prevToken, token) && Date.now() < (s.prevExpiresAt || 0))
}

// Rotasi bila kedaluwarsa. Dipanggil HANYA dari handshake valid (jalur
// terautentikasi) — tidak pernah dari jalur gagal.
function maybeRotate(s) {
  if (Date.now() - (s.tokenCreatedAt || Date.now()) < rotateMs()) return null
  const rotated = {
    token: prng(),
    createdAt: Date.now(),
    prevToken: s.token,
    prevExpiresAt: Date.now() + TOKEN_GRACE_MS
  }
  s.prevToken = rotated.prevToken
  s.prevExpiresAt = rotated.prevExpiresAt
  s.token = rotated.token
  s.tokenCreatedAt = rotated.createdAt
  if (s.tokenXdg) {
    try {
      persistTokenRecord(s.tokenXdg, rotated)
    } catch {
      /* file gagal ditulis: rotasi tetap berlaku sesi ini */
    }
  }
  return rotated.token
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
