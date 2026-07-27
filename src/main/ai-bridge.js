import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

// ponytail: lazy require so missing dep doesn't crash module at eval time
let jsonrepair = null
try { jsonrepair = require('jsonrepair').jsonrepair || require('jsonrepair').default || null } catch {}

// ========== MODEL REGISTRY (Dynamic, Pluggable) ==========
const REGISTRY_PATH = join(__dirname, 'model-registry.json')

function loadRegistry() {
  try {
    if (existsSync(REGISTRY_PATH)) {
      return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'))
    }
  } catch (e) {
    console.warn('[ModelRegistry] Failed to load:', e.message)
  }
  return { combos: {}, analytics: { models: {} } }
}

function saveRegistry(registry) {
  try {
    writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2))
  } catch (e) {
    console.warn('[ModelRegistry] Failed to save:', e.message)
  }
}

function resolveModelChain(input) {
  if (!input) return ['gemma-3-12b-it']
  const trimmed = input.trim()
  const registry = loadRegistry()

  // Check combo registry
  if (registry.combos[trimmed]) {
    const combo = registry.combos[trimmed]
    console.log(`[ModelRegistry] Resolved combo "${trimmed}": ${combo.models.join(' → ')}`)
    return [...combo.models]
  }

  // Comma-separated fallback
  const models = trimmed.split(',').map(m => m.trim()).filter(Boolean)
  return models.length > 0 ? models : ['gemma-3-12b-it']
}

function resolveVisionModel(input) {
  const registry = loadRegistry()
  const trimmed = (input || '').trim()
  if (registry.combos[trimmed]?.vision) return registry.combos[trimmed].vision
  return null
}

// Track model analytics
function trackModelUsage(model, success, latencyMs, finishReason) {
  const registry = loadRegistry()
  if (!registry.analytics) registry.analytics = { models: {} }
  if (!registry.analytics.models) registry.analytics.models = {}

  const m = registry.analytics.models[model] || {
    uses: 0, successes: 0, failures: 0,
    avgLatencyMs: 0, lastUsed: null,
    tags: []  // 'reasoning', 'vision', 'fast', 'automation'
  }

  m.uses++
  m.lastUsed = new Date().toISOString()
  m.avgLatencyMs = Math.round((m.avgLatencyMs * (m.uses - 1) + latencyMs) / m.uses)

  if (success) {
    m.successes++
    if (finishReason === 'length') m.truncated = (m.truncated || 0) + 1
  } else {
    m.failures++
  }

  // Auto-tag
  if (!m.tags.includes('reasoning') && model.includes('deepseek')) m.tags.push('reasoning')
  if (!m.tags.includes('vision') && model.includes('gemini')) m.tags.push('vision')
  if (!m.tags.includes('fast') && (model.includes('nemotron') || model.includes('north-mini'))) m.tags.push('fast')

  registry.analytics.models[model] = m
  saveRegistry(registry)
}

// ========== RETRY POLICIES (Configurable) ==========
const RETRY_POLICIES = {
  custom:   { maxRetries: 10, baseDelay: 2000, maxDelay: 30000, backoff: 'exponential' },
  groq:     { maxRetries: 10, baseDelay: 3000, maxDelay: 60000, backoff: 'exponential' },
  cerebras: { maxRetries: 8,  baseDelay: 2000, maxDelay: 30000, backoff: 'exponential' },
  lmstudio: { maxRetries: 3,  baseDelay: 1000, maxDelay: 5000,  backoff: 'linear' },
}

function getRetryPolicy(provider) {
  return RETRY_POLICIES[provider] || RETRY_POLICIES.custom
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ========== ERROR CLASSES ==========
class AIServiceError extends Error {
  constructor(message, ctx = {}) {
    super(message)
    this.name = 'AIServiceError'
    this.provider = ctx.provider
    this.model = ctx.model
    this.httpStatus = ctx.httpStatus
    this.originalError = ctx.originalError
    this.suggestion = ctx.suggestion
  }
}

// ========== RESPONSE EXTRACTION ==========
function extractAIContent(parsed) {
  const msg = parsed.choices?.[0]?.message
  if (!msg) return null
  return msg.content
    || msg.reasoning       // DeepSeek-R1, north-mini, QwQ
    || parsed.choices?.[0]?.text
    || parsed.content
    || null
}

// ========== RSI OBSERVATION ==========
function logObservation(ctx) {
  const obs = {
    time: new Date().toLocaleTimeString('id-ID'),
    model: ctx.model,
    latency: `${ctx.latencyMs}ms`,
    status: ctx.httpStatus || 'ok',
    tokens: ctx.contentLength || 0,
    retries: ctx.retryCount || 0,
    ok: ctx.success,
  }
  if (ctx.error) obs.err = ctx.error
  if (ctx.finishReason) obs.finish = ctx.finishReason
  console.log('📊 [OBS]', JSON.stringify(obs))
}

// Pretty console helpers
const log = {
  info: (tag, msg) => console.log(`  ${tag} ${msg}`),
  warn: (tag, msg) => console.warn(`  ⚠️  ${tag} ${msg}`),
  err:  (tag, msg) => console.error(`  ❌ ${tag} ${msg}`),
  ok:   (tag, msg) => console.log(`  ✅ ${tag} ${msg}`),
  model: (tag, msg) => console.log(`  🤖 ${tag} ${msg}`),
}

// ========== CONFIG ==========
const defaultConfig = {
  aiProvider: process.env.DEFAULT_AI_PROVIDER || 'lmstudio',
  customEndpoint: process.env.CUSTOM_AI_ENDPOINT || '',
  customModel: process.env.CUSTOM_AI_MODEL || '',
  customApiKey: process.env.CUSTOM_AI_API_KEY || ''
}

let globalConfig = { ...defaultConfig }

export const setGlobalConfig = (config) => {
  globalConfig = { ...defaultConfig, ...config }
}

export const getGlobalConfig = () => ({ ...globalConfig })

// ========== ABORT ==========
const activeFetches = new Map()
let fetchCounter = 0

export const abortAllFetches = () => {
  activeFetches.forEach((c) => { try { c.abort() } catch {} })
  activeFetches.clear()
  fetchCounter = 0
}

const addFetch = (signal) => {
  fetchCounter++
  const id = fetchCounter
  const controller = new AbortController()
  activeFetches.set(id, controller)
  signal?.addEventListener('abort', () => activeFetches.delete(id))
  return { id, controller }
}

// ========== MAIN FETCH ==========
export const fetchAI = async (
  messages,
  config,
  signal,
  isSmallTask = false,
  jsonSchema = null,
  onStream = null,
  onStatus = null
) => {
  const conf = config || globalConfig
  const activeProvider = conf.aiProvider || conf.activeProvider || 'lmstudio'
  const customEndpoint = conf.customEndpoint?.replace(/\/+$/, '') || 'http://localhost:1234'
  const customApiKey = conf.customApiKey || ''
  const maxTokens = isSmallTask ? (conf.smallMaxTokens || 512) : (conf.maxTokens || 4096)
  const temperature = isSmallTask ? (conf.smallTemperature ?? 0.3) : (conf.temperature ?? 0.7)

  const modelChain = resolveModelChain(conf.customModel)

  // ========== ENDPOINT ==========
  let url, headers
  if (activeProvider === 'custom' && customEndpoint) {
    const base = customEndpoint.replace(/\/+$/, '')
    url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
    headers = { 'Content-Type': 'application/json' }
    if (customApiKey) {
      if (customEndpoint.includes('anthropic.com')) {
        headers['x-api-key'] = customApiKey
        headers['anthropic-version'] = '2023-06-01'
      } else {
        headers['Authorization'] = `Bearer ${customApiKey}`
      }
    }
  } else {
    url = `http://localhost:1234/v1/chat/completions`
    headers = { 'Content-Type': 'application/json' }
  }

  // ========== JSON SCHEMA ==========
  const baseBody = {
    messages,
    max_tokens: maxTokens,
    temperature,
    stream: false,
  }
  if (jsonSchema && activeProvider !== 'lmstudio') {
    baseBody.messages = baseBody.messages.map((m) => ({ ...m }))
    const sysIdx = baseBody.messages.findIndex((m) => m.role === 'system')
    const instruction = `\n\n[CRITICAL] YOU MUST RETURN ONLY VALID JSON THAT STRICTLY MATCHES THIS EXACT SCHEMA:\n${JSON.stringify(jsonSchema)}\n`
    if (sysIdx >= 0) {
      baseBody.messages[sysIdx].content += instruction
    } else {
      baseBody.messages.unshift({ role: 'system', content: instruction })
    }
  } else if (jsonSchema) {
    baseBody.response_format = {
      type: 'json_schema',
      json_schema: { name: 'mark_schema', strict: true, schema: jsonSchema }
    }
  }

  // ========== MESSAGE NORMALIZATION ==========
  if (activeProvider === 'custom') {
    const normalized = []
    for (const m of baseBody.messages) {
      const last = normalized[normalized.length - 1]
      if (last && last.role === m.role) {
        if (Array.isArray(last.content) || Array.isArray(m.content)) {
          const prevArr = Array.isArray(last.content) ? last.content : [{ type: 'text', text: last.content }]
          const currArr = Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }]
          last.content = [...prevArr, ...currArr]
        } else {
          last.content += `\n\n${m.content}`
        }
      } else {
        normalized.push({ ...m })
      }
    }
    baseBody.messages = normalized
  }

  // ========== LOG HEADER ==========
  console.log('')
  log.info('📡', `POST ${url}`)
  log.model('📋', `Models: ${modelChain.join(' → ')}`)
  log.info('💬', `Messages: ${messages.length} | Prompt: ~${Math.round(messages.reduce((a, m) => a + (m.content?.length || 0), 0) / 2)} tokens`)
  if (jsonSchema) log.info('📐', `Schema: ${Object.keys(jsonSchema.properties || {}).join(', ')}`)

  // ========== MODEL FALLBACK LOOP ==========
  const policy = getRetryPolicy(activeProvider)
  let lastError = null

  for (let modelIdx = 0; modelIdx < modelChain.length; modelIdx++) {
    const model = modelChain[modelIdx]
    const requestBody = { ...baseBody, model }

    log.model(`[${modelIdx + 1}/${modelChain.length}]`, model)

    let retryCount = 0
    let success = false
    let result = null

    while (retryCount <= policy.maxRetries && !success) {
      const { id, controller } = addFetch(signal)
      const fetchSignal = controller.signal
      const abortHandler = () => controller.abort(new Error('AbortError'))
      if (signal && !signal.aborted) signal.addEventListener('abort', abortHandler, { once: true })

      const startTime = Date.now()
      let response
      try {
        response = await fetch(new Request(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: fetchSignal
        }))
      } catch (error) {
        activeFetches.delete(id)
        if (signal && !signal.aborted) signal.removeEventListener('abort', abortHandler)
        if (error.name === 'AbortError') throw new AIServiceError('Request dibatalkan', { provider: activeProvider, model, originalError: error })

        // Network error
        const delay = Math.min(policy.baseDelay * Math.pow(2, retryCount), policy.maxDelay)
        log.warn('🌐', `Network error: ${error.message} ${retryCount < policy.maxRetries ? `→ retry ${retryCount + 1}/${policy.maxRetries} in ${Math.round(delay / 1000)}s` : '→ next model'}`)
        if (onStatus) onStatus(`Network error, retry ${retryCount + 1}...`)
        if (retryCount < policy.maxRetries) {
          await sleep(delay)
          retryCount++
          continue
        }
        lastError = new AIServiceError(`Network: ${error.message}`, { provider: activeProvider, model, originalError: error })
        break
      }

      activeFetches.delete(id)
      if (signal && !signal.aborted) signal.removeEventListener('abort', abortHandler)

      const latencyMs = Date.now() - startTime

      // ========== HTTP ERROR ==========
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        const isRetryable = [429, 500, 503].includes(response.status)

        if (isRetryable && retryCount < policy.maxRetries) {
          const delay = Math.min(policy.baseDelay * Math.pow(2, retryCount), policy.maxDelay)
          const retryAfter = response.headers?.get('retry-after')
          const actualDelay = retryAfter ? Math.ceil(parseFloat(retryAfter) * 1000) : delay
          log.warn('⏳', `HTTP ${response.status} → retry ${retryCount + 1}/${policy.maxRetries} in ${Math.round(actualDelay / 1000)}s`)
          if (onStatus) onStatus(`Server sibuk (${response.status}), retry ${retryCount + 1}...`)
          await sleep(actualDelay)
          retryCount++
          continue
        }

        const errMsg = errorText.slice(0, 150)
        log.err('🚫', `HTTP ${response.status}: ${errMsg}`)
        lastError = new AIServiceError(`HTTP ${response.status}: ${errMsg}`, {
          provider: activeProvider, model, httpStatus: response.status,
          suggestion: response.status === 401 ? 'Check API key' :
                      response.status === 404 ? 'Check endpoint URL' : null
        })
        trackModelUsage(model, false, latencyMs, null)
        break
      }

      // ========== PARSE ==========
      const rawText = await response.text()
      let cleanText = rawText.trim()
      const firstBrace = cleanText.indexOf('{')
      const lastBrace = cleanText.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
        cleanText = cleanText.substring(firstBrace, lastBrace + 1)
      }

      const parsed = cleanAndParse(cleanText)
      if (parsed === null) {
        log.err(' parse', 'Response bukan JSON valid')
        lastError = new AIServiceError('Response bukan JSON valid', { provider: activeProvider, model })
        trackModelUsage(model, false, latencyMs, null)
        break
      }

      const content = extractAIContent(parsed)
      const finishReason = parsed.choices?.[0]?.finish_reason

      if (!content || content.trim() === '') {
        log.warn(' empty', 'Content kosong (content: null)')
        lastError = new AIServiceError('Response kosong', { provider: activeProvider, model })
        trackModelUsage(model, false, latencyMs, finishReason)
        break
      }

      if (finishReason === 'length') {
        log.warn('✂️', 'Truncated (finish_reason: length)')
      }

      // SUCCESS
      result = { content }
      success = true
      trackModelUsage(model, true, latencyMs, finishReason)
      logObservation({
        provider: activeProvider, model, latencyMs,
        httpStatus: response.status, finishReason,
        contentLength: content.length, retryCount, success: true,
      })
    }

    if (result) return result
    if (modelIdx < modelChain.length - 1) log.info('🔄', 'Switching to next model...')
  }

  throw lastError || new AIServiceError('Semua model gagal', {
    provider: activeProvider, model: modelChain.join(','),
  })
}

// ========== JSON PARSER ==========
export const cleanAndParse = (rawResponse) => {
  try {
    if (!rawResponse) return null
    const cleaned = rawResponse.replace(/```[\s\S]*?```/g, '').replace(/^\xEF\xBB\xBF/, '').trim()
    const repaired = jsonrepair ? jsonrepair(cleaned) : cleaned
    return JSON.parse(repaired)
  } catch (error) {
    try {
      const match = rawResponse.trim().replace(/^\xEF\xBB\xBF/, '').match(/\{[\s\S]*\}/)
      return match ? JSON.parse(match[0]) : null
    } catch {
      return null
    }
  }
}
