// providerRegistry.js — SATU sumber kebenaran provider endpoint (data-driven).
//
// Prinsip (singkat owner): "modular, dynamic, and more smart". Menambah
// provider berarti menambah ENTRI di PRESETS, bukan menambah if/else per
// vendor di kode runtime. Semua fungsi MURNI (tanpa I/O) sehingga bisa
// dipakai renderer, sidecar, dan test — pola yang sama dengan semverLite.js.
//
// Smart system-nya ada di normalizeEndpointUrl(): user boleh menulis bentuk
// apa pun (base murni, dengan /v1, dengan suffix path lengkap, trailing
// slash, localhost) dan semua dirapikan deterministik ke URL final siap-POST.

const PRESETS = Object.freeze({
  '9router': Object.freeze({
    id: '9router',
    name: '9Router',
    protocol: 'openai',
    chat: 'http://127.0.0.1:20128/v1',
    stt: 'http://127.0.0.1:20128/v1',
    tts: 'http://127.0.0.1:20128/v1',
  }),
  'local-router': Object.freeze({
    id: 'local-router',
    name: 'Local Router',
    protocol: 'openai',
    chat: 'http://127.0.0.1:20128/v1',
    stt: 'http://127.0.0.1:20128/v1',
    tts: 'http://127.0.0.1:20128/v1',
  }),
  'lm-studio': Object.freeze({
    id: 'lm-studio',
    name: 'LM Studio',
    protocol: 'openai',
    chat: 'http://127.0.0.1:1234/v1',
    stt: '',
    tts: '',
  }),
  ollama: Object.freeze({
    id: 'ollama',
    name: 'Ollama',
    protocol: 'openai',
    chat: 'http://127.0.0.1:11434/v1',
    stt: '',
    tts: '',
  }),
  openrouter: Object.freeze({
    id: 'openrouter',
    name: 'OpenRouter',
    protocol: 'openai',
    chat: 'https://openrouter.ai/api/v1',
    stt: '',
    tts: '',
  }),
  deepseek: Object.freeze({
    id: 'deepseek',
    name: 'DeepSeek',
    protocol: 'openai',
    chat: 'https://api.deepseek.com/v1',
    stt: '',
    tts: '',
  }),
  anthropic: Object.freeze({
    id: 'anthropic',
    name: 'Anthropic',
    protocol: 'anthropic',
    chat: 'https://api.anthropic.com/v1',
    stt: '',
    tts: '',
  }),
})

// Endpoint legacy era pra-registry (hardcoded vendor). Kunci = penanda host,
// nilai = endpoint yang difahami normalizer. Dipakai migrasi config (db v30,
// sharedConfigToCliConfig) supaya kredensial lama tetap hidup lewat jalur
// custom generik — tanpa cabang vendor di runtime.
export const LEGACY_HOSTS = Object.freeze({
  'api.groq.com': 'https://api.groq.com/openai/v1',
  'api.cerebras.ai': 'https://api.cerebras.ai/v1',
})

const SUFFIXES = Object.freeze({
  chat: ['chat/completions', 'completions'],
  stt: ['audio/transcriptions', 'transcriptions'],
  tts: ['audio/speech', 'speech'],
})

const V1_RE = /\/v\d+$/

const stripTrailingSlashes = (s) => s.replace(/\/+$/, '')

/**
 * Bersihkan input mentah ke bentuk base kanonik:
 * - trim + buang trailing slash (idempoten, aman untuk trailing //)
 * - localhost -> 127.0.0.1 (WebKitGTK sering resolve ke [::1] dan gagal)
 * - buang suffix path final yang dikenali dari kind terkait
 *   (mis. endpoint user berisi .../v1/chat/completions -> .../v1)
 * TIDAK menambah /v1 — keputusan itu milik resolveEndpointUrl.
 */
export function canonicalizeEndpointUrl(raw, kind = 'chat') {
  const suffixes = SUFFIXES[kind] || []
  let cleaned = stripTrailingSlashes(String(raw || '').trim())
  if (!cleaned) return ''
  // localhost -> 127.0.0.1 (port opsional ikut dipertahankan).
  cleaned = cleaned.replace(/^(https?:\/\/)localhost(:\d+)?/i, '$1127.0.0.1$2')
  for (const suf of suffixes) {
    const re = new RegExp(`/${suf.replace(/\//g, '\\/')}/?$`, 'i')
    if (re.test(cleaned)) {
      cleaned = stripTrailingSlashes(cleaned.replace(re, ''))
      break
    }
  }
  return cleaned
}

/**
 * Bangun URL final siap-POST dari bentuk input apa pun.
 * Aturan smart (deterministik, idempoten):
 * - base SUDAH berakhir /v<digit>        -> cukup tambah suffix path
 * - base BELUM punya /v<digit>           -> tambah /v1 dulu (konvensi OpenAI
 *   compatible; Anthropic /v1/messages juga di bawah /v1)
 * - input sudah URL final                -> dikenali via canonicalize dan
 *   dibangun ulang identik (tak pernah dobel /v1/chat/completions/v1/...)
 * Menerima bentuk dengan ATAU tanpa versi di tengah, mis.
 *   https://host:port/openai/v1  dan  https://host:port/openai/v1/chat/completions
 */
export function resolveEndpointUrl(raw, kind = 'chat') {
  const suffix = kind === 'stt' ? 'audio/transcriptions' : kind === 'tts' ? 'audio/speech' : 'chat/completions'
  const base = canonicalizeEndpointUrl(raw, kind)
  if (!base) return ''
  // https://host/openai/v1 (versi BUKAN segmen terakhir) tetap dikenali
  // sebagai "sudah berversi" lewat cek segmen terakhir /v<digit>.
  if (V1_RE.test(base)) return `${base}/${suffix}`
  return `${base}/v1/${suffix}`
}

/**
 * Normalisasi konfigurasi provider legacy (pra-registry) SATU titik.
 * aiProvider 'groq'/'cerebras' dari config lama (Dexie, shared.json, atau
 * flag CLI --provider) dipetakan ke jalur custom generik: endpoint legacy
 * dari LEGACY_HOSTS + kredensial lama, tanpa cabang vendor di runtime.
 * Murni; mengembalikan objek BARU (input tidak dimutasi).
 */
export function normalizeLegacyProviderConfig(conf = {}) {
  const provider = String(conf?.aiProvider || '').trim().toLowerCase()
  if (provider !== 'groq' && provider !== 'cerebras') return conf
  const marker = provider === 'groq' ? 'api.groq.com' : 'api.cerebras.ai'
  const legacyEndpoint = LEGACY_HOSTS[marker]
  return {
    ...conf,
    aiProvider: 'custom',
    presetId: undefined,
    customEndpoint: conf.customEndpoint || legacyEndpoint,
    customApiKey: conf.customApiKey || conf.groqApiKey || conf.cerebrasApiKey || '',
    customModel: conf.customModel || conf.groqModel || conf.cerebrasModel || 'default-model',
    customApiProtocol: 'openai',
  }
}

/**
 * URL final per preset per kind. Preset tanpa kapabilitas kind tertentu
 * mengembalikan '' (dipakai UI untuk menyembunyikan opsi yang tak relevan).
 */
export function presetEndpoint(id, kind = 'chat') {
  const p = PRESETS[id]
  if (!p) return ''
  return p[kind] || ''
}

export function getPreset(id) {
  return PRESETS[id] || null
}

export function listPresets() {
  return Object.values(PRESETS)
}

/**
 * Resolusi smart endpoint chat:
 * 1. conf.presetId eksplisit menang (data-driven; user memilih preset UI).
 * 2. Bukan, pakai customEndpoint -> resolveEndpointUrl (smart normalizer).
 * 3. aiProvider 'lm-studio' -> preset lm-studio (kompatibilitas config lama).
 * 4. Fallback: 9Router lokal.
 */
export function resolveChatEndpoint(conf = {}) {
  const finalFor = (id) => resolveEndpointUrl(presetEndpoint(id, 'chat'), 'chat')
  if (conf.presetId && PRESETS[conf.presetId]) {
    return finalFor(conf.presetId)
  }
  if (conf.aiProvider === 'lm-studio') {
    return finalFor('lm-studio')
  }
  const ep = String(conf.customEndpoint || '').trim()
  if (ep) return resolveEndpointUrl(ep, 'chat')
  return finalFor('9router')
}

/**
 * Protocol hint dari preset/URL — 'openai' | 'anthropic' | 'auto'.
 * Hanya SARAN: keputusan final tetap milik customApiProtocol user ('auto'
 * = ikut hint). Tidak pernah throw.
 */
export function suggestProtocol(conf = {}) {
  if (conf.customApiProtocol && conf.customApiProtocol !== 'auto') return conf.customApiProtocol
  const preset = conf.presetId ? getPreset(conf.presetId) : null
  if (preset) return preset.protocol
  const presetId = detectFromUrl(conf.customEndpoint)
  if (getPreset(presetId)) return getPreset(presetId).protocol
  // URL berisi 'anthropic' (proxy/reverse) -> sarankan protokol Anthropic
  // (paritas dengan heuristik lama ai-bridge).
  if (/anthropic/i.test(String(conf.customEndpoint || ''))) return 'anthropic'
  return 'auto'
}

/**
 * Deteksi preset dari URL (diplisitkan dari providerDetect.js, tanpa siklus
 * impor). Return preset id bila cocok, null bila tidak. Endpoint legacy
 * (api.groq.com dkk) sengaja TIDAK dipetakan ke preset — mereka jalur custom,
 * bukan target bawaan.
 */
export function detectFromUrl(raw) {
  const low = String(raw || '').toLowerCase()
  if (!low) return null
  for (const p of Object.values(PRESETS)) {
    if (!p.chat) continue
    try {
      const host = new URL(p.chat).host
      if (host && low.includes(host)) return p.id
    } catch { /* preset chat bukan URL valid -> lewati */ }
  }
  return null
}
