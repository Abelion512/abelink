import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { cleanAndParse } from '../shared/cleanAndParse.js'
import { normalizeChatCompletionsUrl } from './modelDiscovery.js'
import { logModelCall } from './computer/audit-log.js'
import { generateGeminiResponse } from './services/gemini-web.js'

// ========== MODEL REGISTRY (Dynamic, Pluggable) ==========
const REGISTRY_PATH = join(__dirname, 'model-registry.json')

export function loadRegistry() {
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
  const trimmed = input.trim().toLowerCase()
  const registry = loadRegistry()

  // Check combo registry (case-insensitive)
  for (const [key, combo] of Object.entries(registry.combos)) {
    if (key.toLowerCase() === trimmed) {
      console.log(`[ModelRegistry] Resolved combo "${input.trim()}" → "${key}": ${combo.models.join(' → ')}`)
      return [...combo.models]
    }
  }

  // Comma-separated fallback
  const models = input.trim().split(',').map(m => m.trim()).filter(Boolean)
  return models.length > 0 ? models : ['gemma-3-12b-it']
}

export function resolveVisionModel(input) {
  const registry = loadRegistry()
  const trimmed = (input || '').trim()
  if (registry.combos[trimmed]?.vision) return registry.combos[trimmed].vision
  return null
}

// Track model analytics
function trackModelUsage(model, success, latencyMs, finishReason, learn = {}) {
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

  // ---- AUTO-LEARN Level 1 (passive observation, tidak menimpa metadata manual) ----
  // Dari riset: DeepSeek thinking mode temp di-ignore + JSON kadang kosong; V4 tool calls
  // bisa jatuh ke content; proxy OpenAI-compatible merusak JSON reliability (KVV). Catat
  // semua ini sebagai sinyal per-model, dipakai auto-tune di applyLearnedHints().
  const L = m.learned || { jsonOk: 0, jsonFail: 0, cotLeak: 0, thinkTagged: 0, emptyContent: 0, maxTurns: 0 }
  if (learn.jsonParsed !== undefined) {
    if (learn.jsonParsed) L.jsonOk++ ; else L.jsonFail++
    L.jsonReliability = +(L.jsonOk / (L.jsonOk + L.jsonFail)).toFixed(3)
  }
  if (learn.cotLeak) L.cotLeak++
  if (learn.thinkTagged) L.thinkTagged++
  if (learn.emptyContent) L.emptyContent++
  if (learn.maxTurns && learn.maxTurns > L.maxTurns) L.maxTurns = learn.maxTurns
  L.observedAt = new Date().toISOString()
  m.learned = L

  // Auto-tag
  if (!m.tags.includes('reasoning') && model.includes('deepseek')) m.tags.push('reasoning')
  if (!m.tags.includes('vision') && model.includes('gemini')) m.tags.push('vision')
  if (!m.tags.includes('fast') && (model.includes('nemotron') || model.includes('north-mini'))) m.tags.push('fast')

  registry.analytics.models[model] = m
  saveRegistry(registry)
}

// ---- AUTO-LEARN Level 2: hints yang diterapkan pada request berikutnya ----
// Prinsip (riset): jangan paksa harness mengatur yang model bisa atur sendiri; ubah hanya
// kalau ada bukti masalah. Thinking:Auto = default (Gemini), reasoning_effort opsional.
export function applyLearnedHints(model, hints = {}) {
  const registry = loadRegistry()
  const L = registry.analytics?.models?.[model]?.learned
  if (!L || (L.jsonOk + L.jsonFail) < 10) return hints // butuh >=10 sample sebelum mengubah apa pun

  const out = { ...hints }
  if (L.jsonReliability !== undefined && L.jsonReliability < 0.7 && !out.jsonInstruction) {
    out.jsonInstruction = true // minta format JSON ketat di prompt
  }
  if ((L.cotLeak || 0) >= 5 && !out.stripThink) {
    out.stripThink = true // CoT bocor berulang → sanitasi <think>
  }
  if (L.maxTurns && L.maxTurns >= 8 && !out.turnCap) {
    out.turnCap = Math.max(4, Math.ceil(L.maxTurns / 2)) // loop panjang → cap turns
  }
  return out
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
  if (ctx.cacheHit) {
    obs.cache = `${ctx.cacheHit}/${ctx.totalPrompt || '?'}`
    const hitRate = ctx.totalPrompt ? Math.round(ctx.cacheHit / ctx.totalPrompt * 100) : 0
    obs.cacheHitRate = `${hitRate}%`
  }
  if (ctx.error) obs.err = ctx.error
  if (ctx.finishReason) obs.finish = ctx.finishReason
  console.log('📊 [OBS]', JSON.stringify(obs))
  // RSI COLLECT: persist lossless feed (console line is transient, audit survives)
  logModelCall({
    model: ctx.model,
    ok: !!ctx.success,
    latencyMs: ctx.latencyMs,
    httpStatus: ctx.httpStatus || null,
    finishReason: ctx.finishReason || null,
    tokens: ctx.contentLength || 0,
    retryCount: ctx.retryCount || 0,
    provider: ctx.provider || null,
    cacheHit: ctx.cacheHit ?? null,
    cacheMiss: ctx.cacheMiss ?? null,
    totalPrompt: ctx.totalPrompt ?? null,
    err: ctx.error || null,
  })
}

// Pretty console helpers
const log = {
  info: (tag, msg) => console.log(`  ${tag} ${msg}`),
  warn: (tag, msg) => console.warn(`  ⚠️  ${tag} ${msg}`),
  err:  (tag, msg) => console.error(`  ❌ ${tag} ${msg}`),
  ok:   (tag, msg) => console.log(`  ✅ ${tag} ${msg}`),
  model: (tag, msg) => console.log(`  🤖 ${tag} ${msg}`),
}

// ========== ERROR TAXONOMY ==========
function classifyError(error, httpStatus, finishReason) {
  if (httpStatus === 429) return 'rate_limit'
  if (httpStatus >= 500) return 'server'
  if (error && !httpStatus) return 'network'
  if (finishReason === 'length') return 'truncated'
  return 'other'
}

const CIRCUIT_BREAKER_THRESHOLD = 3

// ========== CONFIG ==========
const defaultConfig = {
  aiProvider: process.env.DEFAULT_AI_PROVIDER || 'custom',
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
  const activeProvider = conf.aiProvider || conf.activeProvider || 'custom'
  const customEndpoint = conf.customEndpoint || ''
  const customApiKey = conf.customApiKey || ''
  const maxTokens = isSmallTask ? (conf.smallMaxTokens || 1536) : (conf.maxTokens || 8192)
  const temperature = isSmallTask ? (conf.smallTemperature ?? 0.3) : (conf.temperature ?? 0.7)

  const modelChain = resolveModelChain(conf.customModel)

  // ========== GEMINI WEB (FREE, NO API KEY) ==========
  if (activeProvider === 'gemini-web') {
    let workMessages = messages.map((m) => ({ ...m }))

    if (jsonSchema) {
      let sysIdx = workMessages.findIndex((m) => m.role === 'system')
      const instruction = `\n\n[CRITICAL] YOU MUST RETURN ONLY VALID JSON THAT STRICTLY MATCHES THIS EXACT SCHEMA:\n${JSON.stringify(jsonSchema)}\n`
      if (sysIdx >= 0) {
        workMessages[sysIdx].content += instruction
      } else {
        workMessages.unshift({ role: 'system', content: instruction })
      }
    }

    let fullPrompt = '[CRITICAL INSTRUCTION: DO NOT USE GOOGLE SEARCH. DO NOT USE ANY EXTENSIONS. ANSWER IMMEDIATELY FROM YOUR KNOWLEDGE BASE TO SAVE TIME.]\n\n'
    for (const m of workMessages) {
      if (Array.isArray(m.content)) {
        for (const part of m.content) {
          if (part.type === 'text') {
            fullPrompt += `[${m.role.toUpperCase()}]: ${part.text}\n`
          }
        }
      } else {
        fullPrompt += `[${m.role.toUpperCase()}]: ${m.content || ''}\n`
      }
    }
    fullPrompt += '\n[ASSISTANT]:'

    const modelName = conf.geminiWebModel || 'gemini-3.6-flash'

    try {
      console.log(`\n==================== [GEMINI WEB REQUEST] ====================`)
      console.log(`Model: ${modelName}`)
      console.log(`Prompt length: ${fullPrompt.length} chars`)
      console.log(`==============================================================\n`)

      let answer = await generateGeminiResponse(fullPrompt, modelName)

      let reasoning = null
      if (answer.includes('<think>')) {
        const match = answer.match(/<think>([\s\S]*?)<\/think>/)
        if (match) {
          reasoning = match[1].trim()
          answer = answer.replace(/<think>[\s\S]*?<\/think>/, '').trim()
        }
      }

      console.log(`[GEMINI WEB SUCCESS] Content length: ${answer.length}`)
      return { content: answer, reasoning }
    } catch (err) {
      console.error('[Gemini Web Error]', err)
      if (err.message?.includes('Session') || err.message?.includes('BardErrorInfo')) {
        onStatus?.('⚠️ Session Gemini Web bermasalah, mencoba fallback ke gemini-flash-lite...')
        let answer = await generateGeminiResponse(fullPrompt, 'gemini-flash-lite')
        return { content: answer, reasoning: null }
      }
      throw err
    }
  }

  // ========== ENDPOINT ==========
  let url, headers
  if (activeProvider === 'custom' && customEndpoint) {
    url = normalizeChatCompletionsUrl(customEndpoint)
    headers = { 'Content-Type': 'application/json' }
    if (customApiKey) {
      if (customEndpoint.includes('anthropic.com')) {
        headers['x-api-key'] = customApiKey
        headers['anthropic-version'] = '2023-06-01'
      } else {
        headers['Authorization'] = `Bearer ${customApiKey}`
      }
    }
  } else if (activeProvider === 'custom' && !customEndpoint) {
    // Configured custom tapi endpoint kosong — jangan tembak localhost:1234 mati.
    url = normalizeChatCompletionsUrl(customEndpoint)
    headers = { 'Content-Type': 'application/json' }
  } else {
    // LM Studio fallback tetap dipertahankan (nonaktif by default).
    url = `http://localhost:1234/v1/chat/completions`
    headers = { 'Content-Type': 'application/json' }
  }

  // ========== JSON SCHEMA ==========
  const baseBody = {
    messages: [...messages],
    max_tokens: maxTokens,
    temperature,
    stream: onStream !== null,
  }
  if (jsonSchema) {
    // Inject schema instruction into LAST user message (not system prompt)
    // to preserve system prefix stability for prompt caching.
    const schemaInstruction = `\n\n[CRITICAL] YOU MUST RETURN ONLY VALID JSON THAT STRICTLY MATCHES THIS EXACT SCHEMA:\n${JSON.stringify(jsonSchema)}\n`
    if (activeProvider === 'lmstudio') {
      // LM Studio: inject into system prompt (no native json_schema support)
      const sysIdx = baseBody.messages.findIndex((m) => m.role === 'system')
      if (sysIdx >= 0) {
        baseBody.messages[sysIdx] = { ...baseBody.messages[sysIdx], content: baseBody.messages[sysIdx].content + schemaInstruction }
      } else {
        baseBody.messages.unshift({ role: 'system', content: schemaInstruction })
      }
    } else {
      // Cloud providers: inject into last user message (preserves system prefix cache)
      const lastUserIdx = baseBody.messages.findLastIndex((m) => m.role === 'user')
      if (lastUserIdx >= 0) {
        const msg = baseBody.messages[lastUserIdx]
        baseBody.messages[lastUserIdx] = {
          ...msg,
          content: typeof msg.content === 'string'
            ? msg.content + schemaInstruction
            : [...(Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: msg.content }]),
               { type: 'text', text: schemaInstruction }]
        }
      } else {
        // Fallback: no user message, inject into system
        const sysIdx = baseBody.messages.findIndex((m) => m.role === 'system')
        if (sysIdx >= 0) {
          baseBody.messages[sysIdx] = { ...baseBody.messages[sysIdx], content: baseBody.messages[sysIdx].content + schemaInstruction }
        }
      }
      baseBody.response_format = { type: 'json_object' }
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
    // Pass-back reasoning_content: DeepSeek thinking mode wajib membawa reasoning_content
    // pada assistant message (terutama yang punya tool_calls) di turn berikutnya, atau API
    // mengembalikan HTTP 400. Baca dari m.reasoning (hasil capture fetchAI) / m.reasoning_content.
    for (const m of normalized) {
      if (m.role === 'assistant') {
        const r = m.reasoning || m.reasoning_content
        if (r && !m.reasoning_content) m.reasoning_content = r
        if (m.reasoning) delete m.reasoning
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

    log.model(`[${modelIdx + 1}/${modelChain.length}]`, model)

    let retryCount = 0
    let emptyRetryCount = 0
    let currentMaxTokens = maxTokens
    let adaptedRetryDone = false
    let consecutiveFailures = 0  // per-model circuit breaker
    const requestBody = { ...baseBody, model, max_tokens: currentMaxTokens }
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
        consecutiveFailures++
        if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
          log.warn('⚡', `Circuit breaker: ${model} gagal ${consecutiveFailures}x berturut → skip`)
          lastError = new AIServiceError(`Circuit breaker: ${consecutiveFailures} consecutive failures`, { provider: activeProvider, model, originalError: error })
          break
        }
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
        const errorType = classifyError(null, response.status, null)
        consecutiveFailures++
        if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
          log.warn('⚡', `Circuit breaker: ${model} gagal ${consecutiveFailures}x berturut → skip`)
          lastError = new AIServiceError(`Circuit breaker: ${consecutiveFailures} consecutive failures`, { provider: activeProvider, model, httpStatus: response.status })
          trackModelUsage(model, false, latencyMs, null)
          break
        }
        const isRetryable = [429, 500, 503].includes(response.status)

        if (isRetryable && retryCount < policy.maxRetries) {
          const baseRetryDelay = Math.min(policy.baseDelay * Math.pow(2, retryCount), policy.maxDelay)
          const retryAfter = response.headers?.get('retry-after')
          // rate_limit: hormati retry-after, fallback lebih panjang
          const actualDelay = retryAfter ? Math.ceil(parseFloat(retryAfter) * 1000)
            : errorType === 'rate_limit' ? Math.max(baseRetryDelay, 30000)
            : baseRetryDelay
          log.warn('⏳', `HTTP ${response.status} [${errorType}] → retry ${retryCount + 1}/${policy.maxRetries} in ${Math.round(actualDelay / 1000)}s`)
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

      // ========== STREAMING ==========
      if (onStream && requestBody.stream) {
        const reader = response.body?.getReader()
        if (!reader) {
          log.err(' stream', 'Response body not readable')
          lastError = new AIServiceError('Stream not readable', { provider: activeProvider, model })
          break
        }
        const decoder = new TextDecoder()
        let buffer = ''
        let accumulatedContent = ''
        let accumulatedReasoning = ''
        let finishReason = null
        let doneRead = false
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''
            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed || !trimmed.startsWith('data: ')) continue
              const data = trimmed.slice(6)
              if (data === '[DONE]') { doneRead = true; break }
              try {
                const chunk = JSON.parse(data)
                const delta = chunk.choices?.[0]?.delta
                if (delta?.content) {
                  accumulatedContent += delta.content
                  onStream(delta.content)
                }
                if (delta?.reasoning_content) {
                  accumulatedReasoning += delta.reasoning_content
                }
                if (chunk.choices?.[0]?.finish_reason) {
                  finishReason = chunk.choices[0].finish_reason
                }
              } catch { /* skip malformed SSE chunk */ }
            }
            if (doneRead) break
          }
        } catch (e) {
          // Timeout during stream — use what we got
        }
        if (accumulatedContent) {
          result = { content: accumulatedContent, reasoning: accumulatedReasoning || null }
          success = true
          trackModelUsage(model, true, latencyMs, finishReason)
          logObservation({
            provider: activeProvider, model, latencyMs,
            httpStatus: response.status, finishReason,
            contentLength: accumulatedContent.length, retryCount, success: true,
          })
        } else {
          consecutiveFailures++
          lastError = new AIServiceError('Stream returned no content', { provider: activeProvider, model })
          trackModelUsage(model, false, latencyMs, null)
          if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
            log.warn('⚡', `Circuit breaker: ${model} gagal ${consecutiveFailures}x berturut → skip`)
            break
          }
          if (emptyRetryCount < 2) {
            const jitter = Math.floor(Math.random() * 1000)
            const delay = Math.min(policy.baseDelay * Math.pow(2, emptyRetryCount), policy.maxDelay) + jitter
            log.warn('🌐', `Stream empty → retry ${emptyRetryCount + 1}/2 in ${Math.round(delay / 1000)}s`)
            if (onStatus) onStatus(`Stream kosong, retry ${emptyRetryCount + 1}...`)
            await sleep(delay)
            emptyRetryCount++
            continue
          }
          break
        }
      } else {
        // ========== NON-STREAMING PARSE ==========
        const rawText = await response.text()
        let cleanText = rawText.trim()
        const firstBrace = cleanText.indexOf('{')
        const lastBrace = cleanText.lastIndexOf('}')
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
          cleanText = cleanText.substring(firstBrace, lastBrace + 1)
        }

        const parsed = await cleanAndParse(cleanText)
        if (parsed === null) {
          log.err(' parse', 'Response bukan JSON valid → next model')
          consecutiveFailures++
          lastError = new AIServiceError('Response bukan JSON valid', { provider: activeProvider, model })
          trackModelUsage(model, false, latencyMs, null, { jsonParsed: false })
          break
        }

        const content = extractAIContent(parsed)
        const finishReason = parsed.choices?.[0]?.finish_reason
        const reasoningContent = parsed.choices?.[0]?.message?.reasoning_content || null

        if (!content || content.trim() === '') {
          consecutiveFailures++
          if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
            log.warn('⚡', `Circuit breaker: ${model} gagal ${consecutiveFailures}x berturut → skip`)
            lastError = new AIServiceError('Circuit breaker: empty content threshold', { provider: activeProvider, model })
            trackModelUsage(model, false, latencyMs, finishReason, { jsonParsed: true, emptyContent: true })
            break
          }
          // Jika finish_reason=length, double max_tokens dan retry
          if (finishReason === 'length') {
            log.warn('✂️', 'Empty content + finish_reason=length → retry dengan max_tokens doubled')
            currentMaxTokens = Math.min(currentMaxTokens * 2, 16384)
            requestBody.max_tokens = currentMaxTokens
            const jitter = Math.floor(Math.random() * 1000)
            const delay = Math.min(policy.baseDelay * Math.pow(2, emptyRetryCount), policy.maxDelay) + jitter
            if (emptyRetryCount < 2) {
              log.warn('🌐', `Truncated empty → retry ${emptyRetryCount + 1}/2 (max_tokens: ${currentMaxTokens}) in ${Math.round(delay / 1000)}s`)
              if (onStatus) onStatus(`Terpotong, retry ${emptyRetryCount + 1}...`)
              await sleep(delay)
              emptyRetryCount++
              continue
            }
            lastError = new AIServiceError('Truncated with empty content after retries', { provider: activeProvider, model })
            trackModelUsage(model, false, latencyMs, finishReason, { jsonParsed: true, emptyContent: true })
            break
          }
          log.warn(' empty', 'Content kosong (content: null)')
          lastError = new AIServiceError('Empty content returned', { provider: activeProvider, model })
          trackModelUsage(model, false, latencyMs, finishReason, { jsonParsed: true, emptyContent: true })
          if (emptyRetryCount < 2) {
            // Reasoning-only output → adapt prompt
            if (reasoningContent && !adaptedRetryDone) {
              const lastUserIdx = requestBody.messages.findLastIndex((m) => m.role === 'user')
              if (lastUserIdx >= 0) {
                requestBody.messages[lastUserIdx] = {
                  ...requestBody.messages[lastUserIdx],
                  content: requestBody.messages[lastUserIdx].content + '\n\nJangan output reasoning saja. Langsung output JSON final.'
                }
                adaptedRetryDone = true
                log.warn('🧠', 'Reasoning-only output → adapted prompt')
              }
            } else if (adaptedRetryDone) {
              // Sudah adapt sekali, fall through ke model berikutnya
              log.warn('🧠', 'Adapted retry sudah dicoba → next model')
              break
            }
            const jitter = Math.floor(Math.random() * 1000)
            const delay = Math.min(policy.baseDelay * Math.pow(2, emptyRetryCount), policy.maxDelay) + jitter
            log.warn('🌐', `Empty content → retry ${emptyRetryCount + 1}/2 in ${Math.round(delay / 1000)}s`)
            if (onStatus) onStatus(`Kosong, retry ${emptyRetryCount + 1}...`)
            await sleep(delay)
            emptyRetryCount++
            continue
          }
          break
        }

        if (finishReason === 'length' && content.trim() !== '') {
          // Retry with doubled max_tokens instead of returning truncated JSON
          if (emptyRetryCount < 2) {
            currentMaxTokens = Math.min(currentMaxTokens * 2, 16384)
            requestBody.max_tokens = currentMaxTokens
            const jitter = Math.floor(Math.random() * 1000)
            const delay = Math.min(policy.baseDelay * Math.pow(2, emptyRetryCount), policy.maxDelay) + jitter
            log.warn('✂️', `Truncated (finish_reason: length) → retry ${emptyRetryCount + 1}/2 (max_tokens: ${currentMaxTokens}) in ${Math.round(delay / 1000)}s`)
            if (onStatus) onStatus(`Terpotong, retry ${emptyRetryCount + 1}...`)
            await sleep(delay)
            emptyRetryCount++
            continue
          }
          log.warn('✂️', 'Truncated (finish_reason: length) — max retries exhausted')
        }

        // CoT leakage detection: content polos (bukan JSON) tapi ada reasoning → bocor
        const looksLikeCoT = !content.trim().startsWith('{') && reasoningContent
        // SUCCESS
        result = { content, reasoning: reasoningContent }
        success = true
        consecutiveFailures = 0  // reset circuit breaker
        trackModelUsage(model, true, latencyMs, finishReason, {
          jsonParsed: true, cotLeak: !!looksLikeCoT,
          thinkTagged: content.includes('<think>'),
        })
        // Cache hit monitoring (DeepSeek, OpenAI, etc.)
        const usage = parsed.usage || {}
        const cacheHit = usage.prompt_cache_hit_tokens || usage.cached_tokens || 0
        const cacheMiss = usage.prompt_cache_miss_tokens || 0
        const totalPrompt = usage.prompt_tokens || (cacheHit + cacheMiss) || 0
        logObservation({
          provider: activeProvider, model, latencyMs,
          httpStatus: response.status, finishReason,
          contentLength: content.length, retryCount, success: true,
          cacheHit, cacheMiss, totalPrompt,
        })
      }
    }

    if (result) return result
    if (modelIdx < modelChain.length - 1) log.info('🔄', 'Switching to next model...')
  }

  throw lastError || new AIServiceError('Semua model gagal', {
    provider: activeProvider, model: modelChain.join(','),
  })
}

// ========== JSON PARSER ==========
