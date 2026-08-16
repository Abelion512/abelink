// ModelDiscovery — unified discovery untuk deteksi model lintas provider.
// Provider: lmstudio, groq, cerebras, custom (OpenAI-compatible).
// Return status: ready | needs-key | offline | error | config
import { loadRegistry } from './ai-bridge.js'

const PROVIDER_CONF = {
  lmstudio: {
    base: 'http://localhost:1234',
    needsKey: false,
    requirements: 'LM Studio harus aktif di localhost:1234 (Start API Server).',
  },
  groq: {
    base: 'https://api.groq.com/openai/v1',
    needsKey: true,
    keyField: 'groqApiKey',
    requirements: 'Wajib Groq API Key (console.groq.com/keys).',
  },
  cerebras: {
    base: 'https://api.cerebras.ai/v1',
    needsKey: true,
    keyField: 'cerebrasApiKey',
    requirements: 'Wajib Cerebras API Key (cloud.cerebras.ai).',
  },
  custom: {
    base: null, // dari cfg.customEndpoint, distandarisasi oleh normalizeChatCompletionsUrl
    needsKey: false,
    keyField: 'customApiKey',
    requirements: 'Endpoint wajib diakhiri /v1. Sistem menambahkan /chat/completions otomatis.',
  },
}

// Normalisasi endpoint user → URL /chat/completions final.
// User cukup ketik sampai /v1; trailing slash ditoleransi.
export function normalizeChatCompletionsUrl(endpoint) {
  const e = (endpoint || '').replace(/\/+$/, '')
  if (!e) return ''
  if (e.endsWith('/chat/completions')) return e
  return `${e}/chat/completions`
}

/**
 * discoverModels(provider, cfg) → { status, url, message?, requirements, models? }
 * cfg = { customEndpoint, customApiKey, groqApiKey, cerebrasApiKey }
 */
export async function discoverModels(provider, cfg = {}) {
  const conf = PROVIDER_CONF[provider]
  if (!conf) {
    return { status: 'error', message: `Provider tidal dikenali: ${provider}`, requirements: '' }
  }

  // Ketentuan berlaku (requirements) disertakan di semua return — UI menampilkannya
  // bersama status, supaya user tahu persis yang harus dipenuhi.

  if (conf.needsKey && !(cfg[conf.keyField] || '').trim()) {
    return { status: 'needs-key', requirements: conf.requirements }
  }

  let base
  if (provider === 'custom') {
    if (!(cfg.customEndpoint || '').trim()) {
      return { status: 'config', message: 'Isi Custom Endpoint URL dulu', requirements: conf.requirements }
    }
    base = cfg.customEndpoint.replace(/\/+$/, '').replace(/\/chat\/completions$/, '')
  } else {
    base = conf.base
  }

  const candidates = [`${base}/models`, `${base}/v1/models`]
  let data = null
  let usedUrl = null
  let lastErr = null
  const apiKey = cfg[conf.keyField]
  for (const url of candidates) {
    try {
      const h = {}
      if (apiKey) h.Authorization = `Bearer ${apiKey}`
      const res = await fetch(url, { headers: h, signal: AbortSignal.timeout(8000) })
      if (!res.ok) throw new Error(`HTTP ${res.status} dari ${url}`)
      const j = await res.json()
      if (j?.data?.length) { data = j.data; usedUrl = url; break }
    } catch (e) {
      lastErr = e
    }
  }

  if (!data) {
    const offline = provider === 'lmstudio' || /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|Failed to fetch/i.test(lastErr?.message || '')
    return {
      status: offline ? 'offline' : 'error',
      url: candidates[0],
      message: lastErr ? lastErr.message : 'Tidak ada /models yang merespons',
      requirements: conf.requirements,
    }
  }

  let models = data.map(m => ({ id: m.id, ownedBy: m.owned_by || '', isCombo: m.owned_by === 'combo' }))

  // Merge model dari registry lokal (9Router: oc/*, opencode/* tidak selalu
  // ter-list di /v1/models tapi tetap invokable). Hanya untuk custom provider.
  if (provider === 'custom') {
    try {
      const reg = loadRegistry()
      const combos = reg.combos || {}
      const comboOf = (id) => Object.entries(combos)
        .filter(([, c]) => (c.models || []).includes(id))
        .map(([name]) => name)
      const localIds = new Set()
      for (const c of Object.values(combos)) {
        for (const m of [c.models, c.vision, c.visionRealtime].flat().filter(Boolean)) localIds.add(m)
      }
      const remoteIds = new Set(models.map(m => m.id))
      for (const id of localIds) {
        if (remoteIds.has(id)) continue
        models.push({ id, ownedBy: 'local', isCombo: false, comboOf: comboOf(id), local: true })
      }
    } catch { /* non-fatal */ }
  }

  return { status: 'ready', url: usedUrl, models, requirements: conf.requirements }
}