/**
 * Gemini Web RPC Engine for ABELINK
 * Ported from gemini-core.js by Mazees (https://github.com/Mazees)
 */
import https from 'https'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'

// Cooldown PERSISTEN (file XDG, bukan memori): sidecar restart tidak boleh
// menghapus ingatan blokir — restart lalu hantam lagi hanya memperpanjang
// blokir Google. Best-effort: gagal I/O -> fallback memori saja.
const cooldownFile = () => {
  const base =
    process.env.ABELINK_DATA_HOME || process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
  return path.join(base, 'abelink', 'gemini-web-cooldown.json')
}
const loadPersistedCooldown = () => {
  try {
    const raw = fs.readFileSync(cooldownFile(), 'utf8')
    const until = Number(JSON.parse(raw)?.blockedUntil || 0)
    if (Number.isFinite(until) && until > Date.now()) sorryBlockedUntil = until
  } catch {
    // File belum ada / rusak: mulai tanpa ingatan blokir (fallback memori).
  }
}
const persistCooldown = () => {
  try {
    fs.mkdirSync(path.dirname(cooldownFile()), { recursive: true })
    fs.writeFileSync(cooldownFile(), JSON.stringify({ blockedUntil: sorryBlockedUntil }), { mode: 0o600 })
  } catch {
    // FS read-only dkk: cooldown tetap hidup di memori proses ini.
  }
}

// Server RPC hanya membaca ANGKA mode (inner[79]): 1=Flash, 2=Thinking,
// 3=Pro, 4=Auto, 5=Thinking-lite, 6=Flash-lite. Nama model = label lokal.
// ponytail: satu rantai kata kunci, tanpa map per versi (nama baru otomatis
// mode Flash; yang tak dikenal pun = mode 1).
const modeEntry = (mode, think, name) => ({ mode, think, name, desc: '' })

// ponytail: map per-model dihapus — resolver kata kunci di bawah satu-satunya
// sumber kebenaran. Nama export dipertahankan untuk kompatibilitas (`{}`).
export const GEMINI_WEB_MODELS = {}

const DEFAULT_BL = 'boq_assistant-bard-web-server_20260730.01_p1'

// Anti-hammer: Google menjawab halaman /sorry (bot-detection) bila
// request menumpuk. Menghantam ulang tiap giliran hanya memperpanjang blokir
// — setelah 3 gagal sorry beruntun, gagal-cepat 5 menit tanpa HTTP call.
// Sukses apa pun me-reset. State modul (per proses sidecar).
let sorryStreak = 0
let sorryBlockedUntil = 0
const SORRY_COOLDOWN_MS = 5 * 60 * 1000

const isSorryPage = (text = '') =>
  /google\.com\/sorry|302 Moved|unusual traffic|our systems have detected/i.test(
    String(text || '').slice(0, 2000)
  )

const sorryError = (retryAfterMs = 0) => {
  const wait =
    retryAfterMs > 0
      ? ` Coba lagi dalam ${Math.max(1, Math.ceil(retryAfterMs / 60000))} menit, atau ganti provider di Configuration > Model.`
      : ' Tunggu 1-2 menit lalu coba lagi, atau ganti provider di Configuration > Model.'
  const e = new Error('Gemini Web dibatasi Google (halaman verifikasi / rate-limit).' + wait)
  e.code = 'GEMINI_WEB_LIMITED'
  e.retryAfterMs = retryAfterMs
  return e
}

// Diekspor untuk unit test (logika murni, tanpa network).
export const __geminiWebTest = {
  isSorryPage,
  sorryError,
  cooldownFile,
  remainingCooldownMs: () => Math.max(0, sorryBlockedUntil - Date.now()),
  extractGeminiText,
  diffStreamText,
  resetCircuit: () => {
    sorryStreak = 0
    sorryBlockedUntil = 0
    persistCooldown()
  },
  tripCircuit: () => {
    sorryStreak = 3
    sorryBlockedUntil = Date.now() + SORRY_COOLDOWN_MS
    persistCooldown()
  }
}

// Muat ingatan blokir saat modul pertama diimpor (proses sidecar baru).
loadPersistedCooldown()

export function resolveGeminiWebModel(modelName) {
  // Kata kunci -> mode 1-6, tak dikenal -> mode 1 (flash).
  const req = String(modelName || 'gemini-latest').toLowerCase()
  if (req.includes('thinking-lite')) return modeEntry(5, 0, req)
  if (req.includes('think')) return modeEntry(2, 0, req)
  if (req.includes('auto')) return modeEntry(4, 4, req)
  if (req.includes('lite') || req.includes('fast')) return modeEntry(6, 4, req)
  if (req.includes('pro')) return modeEntry(3, 4, req)
  return modeEntry(1, 4, req)
}

function httpPost(urlStr, headers, bodyData, timeoutMs = 120000, onData = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlStr)
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: headers
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        const text = chunk.toString()
        data += text
        try {
          onData?.(text)
        } catch {}
      })
      res.on('end', () => resolve(data))
    })
    req.on('error', (err) => reject(err))
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timeout ${timeoutMs / 1000}s menunggu respons Gemini Web.`))
    })
    req.write(bodyData)
    req.end()
  })
}

function findRc(arr) {
  if (!Array.isArray(arr)) return null
  if (arr[0] && typeof arr[0] === 'string' && arr[0].startsWith('rc_')) {
    return arr[1][0]
  }
  for (const item of arr) {
    const res = findRc(item)
    if (res) return res
  }
  return null
}

// Murni (tanpa network): teks terpanjang dari garis wrb.fr dalam buffer.
// Dipakai jawaban final SEKALIGUS incremental streaming (buffer parsial ->
// delta vs teks terakhir yang sudah di-emit). Function declaration (hoisted)
// agar __geminiWebTest di atas bisa mereferensikannya tanpa TDZ.
export function extractGeminiText(rawText = '') {
  let best = ''
  for (const line of String(rawText).split('\n')) {
    if (line.trim().startsWith('[["wrb.fr"')) {
      try {
        const parsed = JSON.parse(line.trim())
        const innerStr = parsed[0][2]
        if (innerStr) {
          const text = findRc(JSON.parse(innerStr))
          if (typeof text === 'string' && text.length > best.length) {
            best = text
          }
        }
      } catch {}
    }
  }
  return best
}

// Murni: porsi teks yang belum di-emit (kasus umum = prefix tumbuh).
export function diffStreamText(prev = '', cur = '') {
  const p = String(prev)
  const c = String(cur)
  if (!c || c === p) return ''
  return c.startsWith(p) ? c.slice(p.length) : c
}

export async function generateGeminiResponse(
  prompt,
  modelName = 'gemini-latest',
  cookie = '',
  bl = DEFAULT_BL,
  onToken = null
) {
  // Gagal-cepat selama cooldown blokir (tanpa menghantam Google lagi).
  // Cooldown dibaca ulang dari file: proses sidecar lain mungkin yang trip.
  loadPersistedCooldown()
  if (Date.now() < sorryBlockedUntil) {
    throw sorryError(sorryBlockedUntil - Date.now())
  }
  const reqModel = (modelName || 'gemini-latest').toLowerCase()

  const selected = resolveGeminiWebModel(reqModel)

  const modelId = selected.mode
  const thinkMode = selected.think

  const inner = new Array(80).fill(null)
  inner[0] = [prompt, 0, null, null, null, null, 0]
  inner[1] = ['en']
  inner[2] = ['', '', '', null, null, null, null, null, null, '']
  inner[6] = [0]
  inner[7] = 1
  inner[10] = 1
  inner[11] = 0
  inner[17] = [[thinkMode]]
  inner[18] = 0
  inner[27] = 1
  inner[30] = [4]
  inner[41] = [2]
  inner[53] = 0
  inner[59] = crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36)
  inner[61] = []
  inner[68] = 1
  inner[79] = modelId

  const outer = [null, JSON.stringify(inner)]
  const bodyParams = new URLSearchParams()
  bodyParams.set('f.req', JSON.stringify(outer))

  const reqid = Math.floor(Date.now() / 1000) % 1000000
  const url = `https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=${bl}&hl=id&_reqid=${reqid}&rt=c`

  const headers = {
    'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
    accept: '*/*',
    'x-same-domain': '1',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    referer: 'https://gemini.google.com/'
  }

  if (cookie) {
    headers['cookie'] = cookie
  }

  // Streaming incremental: tiap potongan body diakumulasi, teks terpanjang
  // sejauh ini di-diff vs yang sudah di-emit -> delta dikirim via onToken.
  // Tanpa onToken = jalur buffer lama (hasil akhir identik).
  let streamBuf = ''
  let streamEmitted = ''
  const rawText = await httpPost(
    url,
    headers,
    bodyParams.toString(),
    undefined,
    onToken
      ? (piece) => {
          streamBuf += String(piece ?? '')
          const cur = extractGeminiText(streamBuf)
          const delta = diffStreamText(streamEmitted, cur)
          if (delta) {
            streamEmitted = cur
            onToken({ text: delta, done: false })
          }
        }
      : null
  )

  const finalAnswer = extractGeminiText(rawText)

  if (!finalAnswer) {
    if (rawText.includes('BardErrorInfo')) {
      sorryStreak = 0
      throw new Error('Google menolak request (Session / Cookie mungkin expired atau terblokir).')
    }
    // Halaman sorry/rate-limit Google: JANGAN dump HTML mentah ke user
    // (noise), dan mulai hitung streak anti-hammer.
    if (isSorryPage(rawText)) {
      sorryStreak++
      if (sorryStreak >= 3) {
        sorryBlockedUntil = Date.now() + SORRY_COOLDOWN_MS
        persistCooldown()
      }
      throw sorryError(Math.max(0, sorryBlockedUntil - Date.now()))
    }
    sorryStreak = 0
    throw new Error('Gagal mengekstrak jawaban dari Gemini Web (balasan bukan format yang diharapkan).')
  }
  sorryStreak = 0

  // Sisa delta (garis terakhir yang tiba bersamaan dengan 'end') + sinyal selesai.
  if (onToken) {
    try {
      const tail = diffStreamText(streamEmitted, finalAnswer)
      if (tail) onToken({ text: tail, done: false })
      onToken({ text: '', done: true })
    } catch {}
  }

  return finalAnswer
}
