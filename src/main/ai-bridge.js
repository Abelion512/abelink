import { app } from 'electron'

// ponytail: lazy require so missing dep doesn't crash module at eval time
let jsonrepair = null
try { jsonrepair = require('jsonrepair').jsonrepair || require('jsonrepair').default || null } catch {}

// ========== MODEL REGISTRY (Pluggable) ==========
// Add new combos here — no other code changes needed.
// Config UI: set "Custom Model" to a registry key (e.g. "abelink") or comma-separated list.
const MODEL_REGISTRIES = {
  abelink: [
    'opencode/deepseek-v4-flash-free',
    'opencode/nemotron-3-ultra-free',
    'opencode/mimo-v2.5-free',
    'oc/north-mini-code-free'
  ],
  // Add more combos anytime:
  // fast: ['opencode/nemotron-3-ultra-free', 'oc/north-mini-code-free'],
  // quality: ['opencode/deepseek-v4-flash-free', 'opencode/mimo-v2.5-free'],
}

function resolveModelChain(input) {
  if (!input) return ['gemma-3-12b-it']
  const trimmed = input.trim()
  if (MODEL_REGISTRIES[trimmed]) return [...MODEL_REGISTRIES[trimmed]]
  const models = trimmed.split(',').map(m => m.trim()).filter(Boolean)
  return models.length > 0 ? models : ['gemma-3-12b-it']
}

// ========== RETRY POLICIES (Configurable per provider) ==========
const RETRY_POLICIES = {
  custom:    { maxRetries: 3, baseDelay: 2000, backoff: 'exponential' },
  groq:      { maxRetries: 5, baseDelay: 3000, backoff: 'exponential' },
  cerebras:  { maxRetries: 3, baseDelay: 1500, backoff: 'exponential' },
  lmstudio:  { maxRetries: 2, baseDelay: 1000, backoff: 'linear' },
}

function getRetryPolicy(provider) {
  return RETRY_POLICIES[provider] || RETRY_POLICIES.custom
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ========== ERROR CLASSES (Debuggable) ==========
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
// Handles both chat models (content) and reasoning models (reasoning field)
function extractAIContent(parsed) {
  const msg = parsed.choices?.[0]?.message
  if (!msg) return null
  return msg.content          // Chat models (GPT, Llama-instruct)
    || msg.reasoning          // Reasoning models (DeepSeek-R1, north-mini, QwQ)
    || parsed.choices?.[0]?.text  // Legacy format
    || parsed.content         // Non-OpenAI format
    || null
}

// ========== RSI OBSERVATION LOGGING ==========
function createObservation(ctx) {
  return {
    t: new Date().toISOString(),
    p: ctx.provider,
    m: ctx.model,
    e: ctx.endpoint,
    lat: ctx.latencyMs,
    status: ctx.httpStatus,
    fr: ctx.finishReason,
    hasReasoning: ctx.hasReasoning,
    cLen: ctx.contentLength,
    retry: ctx.retryCount,
    err: ctx.error || null,
    ok: ctx.success,
  }
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

// ========== ABORT CONTROLLERS ==========
const activeFetches = new Map()
let fetchCounter = 0

export const abortAllFetches = () => {
  activeFetches.forEach((controller) => {
    try { controller.abort() } catch { /* ignore */ }
  })
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
  // ========== RESOLVE CONFIG ==========
  const conf = config || globalConfig
  const activeProvider = conf.aiProvider || conf.activeProvider || 'lmstudio'
  const customEndpoint = conf.customEndpoint?.replace(/\/+$/, '') || 'http://localhost:1234'
  const customApiKey = conf.customApiKey || ''
  const maxTokens = isSmallTask ? (conf.smallMaxTokens || 512) : (conf.maxTokens || 4096)
  const temperature = isSmallTask ? (conf.smallTemperature ?? 0.3) : (conf.temperature ?? 0.7)

  // ========== RESOLVE MODEL CHAIN ==========
  const modelChain = resolveModelChain(conf.customModel)

  // ========== RESOLVE ENDPOINT ==========
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

  // ========== JSON SCHEMA HANDLING ==========
  const baseBody = {
    messages,
    max_tokens: maxTokens,
    temperature,
    stream: false,
  }
  if (jsonSchema && activeProvider !== 'lmstudio') {
    // Inject schema into system prompt for custom/cloud providers
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

  const endpoint = customEndpoint || 'localhost:1234'
  const endpointForLog = url

  console.log(`[FetchAI] POST ${url}`)
  console.log('[FetchAI] Models:', modelChain.join(' → '))
  console.log('[FetchAI] Messages:', messages.map(m => `${m.role}: ${m.content?.slice?.(0, 80) || '(no content)'}`).join(' | '))
  if (jsonSchema) console.log('[FetchAI] JSON Schema:', JSON.stringify(jsonSchema).slice(0, 100))

  // ========== MODEL FALLBACK LOOP ==========
  const policy = getRetryPolicy(activeProvider)
  let lastError = null

  for (let modelIdx = 0; modelIdx < modelChain.length; modelIdx++) {
    const model = modelChain[modelIdx]
    const requestBody = { ...baseBody, model }

    console.log(`[FetchAI] Trying model: ${model} (${modelIdx + 1}/${modelChain.length})`)

    // ========== EXECUTE FETCH WITH RETRY ==========
    let retryCount = 0
    let success = false
    let result = null

    while (retryCount <= policy.maxRetries && !success) {
      const { id, controller } = addFetch(signal)
      const fetchSignal = controller.signal

      const abortHandler = () => controller.abort(new Error('AbortError'))
      if (signal && !signal.aborted) {
        signal.addEventListener('abort', abortHandler, { once: true })
      }

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

        if (error.name === 'AbortError') {
          throw new AIServiceError('Request dibatalkan', {
            provider: activeProvider, model, originalError: error
          })
        }

        // Network error → try next model
        console.warn(`[FetchAI] Network error on ${model}: ${error.message}`)
        lastError = new AIServiceError(`Network error: ${error.message}`, {
          provider: activeProvider, model, originalError: error,
          suggestion: 'Cek apakah server AI running'
        })
        break  // Break retry loop → next model
      }

      activeFetches.delete(id)
      if (signal && !signal.aborted) signal.removeEventListener('abort', abortHandler)

      const latencyMs = Date.now() - startTime

      // ========== HTTP ERROR HANDLING ==========
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')

        // Rate limit / server busy → retry with backoff
        if ([429, 500, 503].includes(response.status) && retryCount < policy.maxRetries) {
          const delay = policy.backoff === 'exponential'
            ? policy.baseDelay * Math.pow(2, retryCount)
            : policy.baseDelay * (retryCount + 1)
          console.warn(`[FetchAI] HTTP ${response.status} on ${model}, retry ${retryCount + 1}/${policy.maxRetries} in ${delay}ms`)
          if (onStatus) onStatus(`Server sibuk, retry ${retryCount + 1} dalam ${Math.round(delay / 1000)}s...`)
          await sleep(delay)
          retryCount++
          continue
        }

        // Non-retryable error → next model
        lastError = new AIServiceError(`HTTP ${response.status}: ${errorText.slice(0, 200)}`, {
          provider: activeProvider, model, httpStatus: response.status,
          suggestion: response.status === 401 ? 'Check API key' :
                      response.status === 404 ? 'Check endpoint URL' : null
        })
        console.warn(`[FetchAI] Model ${model} failed: ${lastError.message}`)
        break  // Next model
      }

      // ========== PARSE RESPONSE ==========
      const rawText = await response.text()

      // Brace extraction — strip router garbage
      let cleanText = rawText.trim()
      const firstBrace = cleanText.indexOf('{')
      const lastBrace = cleanText.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
        cleanText = cleanText.substring(firstBrace, lastBrace + 1)
      }

      console.log(`[FetchAI] Raw Response (${model}, ${cleanText.length} chars):`, cleanText.slice(0, 500))

      const parsed = cleanAndParse(cleanText)
      if (parsed === null) {
        lastError = new AIServiceError('Response bukan JSON valid', {
          provider: activeProvider, model,
          suggestion: 'Model mungkin tidak support JSON mode'
        })
        console.warn(`[FetchAI] Model ${model}: invalid JSON, trying next`)
        break  // Next model
      }

      // ========== EXTRACT CONTENT (handles reasoning models) ==========
      const content = extractAIContent(parsed)
      const finishReason = parsed.choices?.[0]?.finish_reason

      // Validate response
      if (!content || content.trim() === '') {
        lastError = new AIServiceError('Model mengembalikan response kosong (content: null)', {
          provider: activeProvider, model,
          suggestion: 'Model mungkin reasoning model yang butuh handling khusus'
        })
        console.warn(`[FetchAI] Model ${model}: empty content, trying next`)
        break  // Next model
      }

      if (finishReason === 'length') {
        console.warn(`[FetchAI] ⚠ Model ${model}: response truncated (finish_reason: length)`)
      }

      // SUCCESS
      result = { content }
      success = true

      // RSI Observation Log
      const observation = createObservation({
        provider: activeProvider,
        model,
        endpoint: endpointForLog,
        latencyMs,
        httpStatus: response.status,
        finishReason,
        hasReasoning: !!parsed.choices?.[0]?.message?.reasoning,
        contentLength: content.length,
        retryCount,
        success: true,
      })
      console.log('[OBSERVATION]', JSON.stringify(observation))
    }

    // Model succeeded → return
    if (result) return result

    // All retries exhausted for this model → try next
    if (modelIdx < modelChain.length - 1) {
      console.log(`[FetchAI] Switching to next model...`)
    }
  }

  // All models exhausted
  throw lastError || new AIServiceError('Semua model gagal merespons', {
    provider: activeProvider, model: modelChain.join(','),
    suggestion: 'Cek server AI dan config'
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
    console.error('Gagal Parse JSON:', error.message)
    try {
      const match = rawResponse.trim().replace(/^\xEF\xBB\xBF/, '').match(/\{[\s\S]*\}/)
      return match ? JSON.parse(match[0]) : null
    } catch {
      return null
    }
  }
}
