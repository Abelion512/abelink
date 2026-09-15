/**
 * Gemini Web RPC Engine for ABELINK
 * Ported from gemini-core.js by Mazees (https://github.com/Mazees)
 */
import https from 'https'
import crypto from 'crypto'

// Server RPC hanya membaca ANGKA mode (inner[79]): 1=Flash, 2=Thinking,
// 3=Pro, 4=Auto, 5=Thinking-lite, 6=Flash-lite. Nama model = label lokal.
// ponytail: pola mode, bukan entri per versi (semua Flash = mode 1,
// nama baru otomatis ikut tanpa update map).
const MODES = {
  flash: { mode: 1, think: 4 },
  thinking: { mode: 2, think: 0 },
  pro: { mode: 3, think: 4 },
  auto: { mode: 4, think: 4 },
  'thinking-lite': { mode: 5, think: 0 },
  'flash-lite': { mode: 6, think: 4 }
}
const modeEntry = (kind, name, desc) => ({ ...MODES[kind], name, desc })

export const GEMINI_WEB_MODELS = {
  'gemini-latest': modeEntry('flash', 'gemini-latest', 'Flash terbaru (alias, dimajukan tiap rilis)'),
  'gemini-3.6-flash': modeEntry('flash', 'gemini-3.6-flash', 'Pin lama (backward-compat; setara latest)'),
  'gemini-3.5-flash': modeEntry('flash', 'gemini-3.5-flash', 'Flash seimbang dan stabil'),
  'gemini-3.5-flash-thinking': modeEntry('thinking', 'gemini-3.5-flash-thinking', 'Penalaran mendalam'),
  'gemini-3.5-flash-thinking-lite': modeEntry('thinking-lite', 'gemini-3.5-flash-thinking-lite', 'Penalaran cepat'),
  'gemini-auto': modeEntry('auto', 'gemini-auto', 'Otomatis server'),
  'gemini-3.1-pro': modeEntry('pro', 'gemini-3.1-pro', 'PRO (berbayar; gratis di-route ke Flash)'),
  'gemini-flash-lite': modeEntry('flash-lite', 'gemini-flash-lite', 'Super ringan, respon instan')
}

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

const sorryError = () => {
  const e = new Error(
    'Gemini Web dibatasi Google (halaman verifikasi / rate-limit). ' +
      'Tunggu 1-2 menit lalu coba lagi, atau ganti provider di Configuration > Model.'
  )
  e.code = 'GEMINI_WEB_LIMITED'
  return e
}

// Diekspor untuk unit test (logika murni, tanpa network).
export const __geminiWebTest = {
  isSorryPage,
  sorryError,
  resetCircuit: () => {
    sorryStreak = 0
    sorryBlockedUntil = 0
  },
  tripCircuit: () => {
    sorryStreak = 3
    sorryBlockedUntil = Date.now() + SORRY_COOLDOWN_MS
  }
}

export function resolveGeminiWebModel(modelName) {
  // Auto-latest: pola kata kunci -> mode (lihat MODES). Nama tak dikenal
  // (mis. gemini-3.9-flash) langsung mode Flash tanpa perlu entri baru —
  // urutan if-else = prioritas pola; ponytail: 1 rantai, bukan map+rantai.
  const reqModel = (modelName || 'gemini-latest').toLowerCase()
  const direct = GEMINI_WEB_MODELS[reqModel]
  if (direct) return direct
  if (reqModel.includes('thinking-lite')) return modeEntry('thinking-lite', reqModel, '')
  if (reqModel.includes('think')) return modeEntry('thinking', reqModel, '')
  if (reqModel.includes('auto')) return modeEntry('auto', reqModel, '')
  if (reqModel.includes('lite') || reqModel.includes('fast')) return modeEntry('flash-lite', reqModel, '')
  if (reqModel.includes('pro')) return modeEntry('pro', reqModel, '')
  return modeEntry('flash', reqModel, '')
}

function httpPost(urlStr, headers, bodyData, timeoutMs = 120000) {
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
      res.on('data', (chunk) => (data += chunk.toString()))
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

export async function generateGeminiResponse(
  prompt,
  modelName = 'gemini-3.6-flash',
  cookie = '',
  bl = DEFAULT_BL
) {
  // Gagal-cepat selama cooldown blokir (tanpa menghantam Google lagi).
  if (Date.now() < sorryBlockedUntil) {
    throw sorryError()
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

  const rawText = await httpPost(url, headers, bodyParams.toString())

  let finalAnswer = ''
  const lines = rawText.split('\n')
  for (const line of lines) {
    if (line.trim().startsWith('[["wrb.fr"')) {
      try {
        const parsed = JSON.parse(line.trim())
        const innerStr = parsed[0][2]
        if (innerStr) {
          const innerParsed = JSON.parse(innerStr)
          const text = findRc(innerParsed)
          if (text && text.length > finalAnswer.length) {
            finalAnswer = text
          }
        }
      } catch (e) {}
    }
  }

  if (!finalAnswer) {
    if (rawText.includes('BardErrorInfo')) {
      sorryStreak = 0
      throw new Error('Google menolak request (Session / Cookie mungkin expired atau terblokir).')
    }
    // Halaman sorry/rate-limit Google: JANGAN dump HTML mentah ke user
    // (noise), dan mulai hitung streak anti-hammer.
    if (isSorryPage(rawText)) {
      sorryStreak++
      if (sorryStreak >= 3) sorryBlockedUntil = Date.now() + SORRY_COOLDOWN_MS
      throw sorryError()
    }
    sorryStreak = 0
    throw new Error('Gagal mengekstrak jawaban dari Gemini Web (balasan bukan format yang diharapkan).')
  }
  sorryStreak = 0

  return finalAnswer
}
