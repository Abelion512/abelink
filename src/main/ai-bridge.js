import { app } from 'electron'
// ponytail: lazy import so missing dep doesn't crash module at eval time
let jsonrepair = null
try { jsonrepair = (await import('jsonrepair')).jsonrepair || null } catch {}

const createLMStudioOfflineError = (cause, endpoint = 'localhost:1234') => {
  const error = new Error(`Server AI (${endpoint}) tidak merespons. Pastikan server berjalan.`)
  error.code = 'LM_STUDIO_OFFLINE'
  if (cause) error.cause = cause
  return error
}

const defaultConfig = {
  activeProvider: process.env.DEFAULT_AI_PROVIDER || 'lmstudio',
  customEndpoint: process.env.CUSTOM_AI_ENDPOINT || '',
  customModel: process.env.CUSTOM_AI_MODEL || '',
  customApiKey: process.env.CUSTOM_AI_API_KEY || ''
}

let globalConfig = { ...defaultConfig }

export const setGlobalConfig = (config) => {
  globalConfig = { ...defaultConfig, ...config }
}

/**
 * AbortControllers disimpan di MAP biar bisa dibatalin semua dari luar.
 */
const activeFetches = new Map()
let fetchCounter = 0

export const abortAllFetches = () => {
  activeFetches.forEach((controller, _key) => {
    try { controller.abort() } catch { /* ignore */ }
  })
  activeFetches.clear()
  fetchCounter = 0
}

const removeFetch = (id) => {
  activeFetches.delete(id)
}

const addFetch = (signal) => {
  fetchCounter++
  const id = fetchCounter
  const controller = new AbortController()
  activeFetches.set(id, controller)
  signal?.addEventListener('abort', () => removeFetch(id))
  return { id, controller }
}

/**
 * Unit-test friendly fetchAI.
 * Wraps the full fetch lifecycle: config resolution, router dispatch,
 * streaming, abort, retry, error transformation.
 */
export const fetchAI = async (
  messages,
  config,
  signal,
  isSmallTask = false,
  jsonSchema = null,
  onStream = null
) => {
  // ========== RESOLVE CONFIG ==========
  const conf = config || globalConfig
  const activeProvider = conf.activeProvider || 'lmstudio'
  const customEndpoint = conf.customEndpoint?.replace(/\/+$/, '') || 'http://localhost:1234'
  const customModel = conf.customModel || 'gemma-3-12b-it'
  const customApiKey = conf.customApiKey || ''
  const maxTokens = isSmallTask ? (conf.smallMaxTokens || 256) : (conf.maxTokens || 1024)
  const temperature = isSmallTask ? (conf.smallTemperature ?? 0.3) : (conf.temperature ?? 0.7)

  // ========== BUILD REQUEST BODY ==========
  const requestBody = {
    messages,
    max_tokens: maxTokens,
    temperature,
    stream: (onStream !== null),
    model: customModel
  }
  if (jsonSchema && activeProvider !== 'lmstudio') {
    requestBody.response_format = { type: 'json_object' }
  }

  // ========== RESOLVE ENDPOINT ==========
  let url, headers
  if (activeProvider === 'custom' && customEndpoint) {
    url = `${customEndpoint.replace(/\/+$/, '')}/v1/chat/completions`
    headers = {
      'Content-Type': 'application/json',
      'Authorization': customApiKey ? `Bearer ${customApiKey}` : undefined
    }
    if (customApiKey) {
      // Some providers need extra headers based on endpoint
      if (customEndpoint.includes('openai.com')) {
        headers['Authorization'] = `Bearer ${customApiKey}`
      } else if (customEndpoint.includes('anthropic.com')) {
        headers['x-api-key'] = customApiKey
        headers['anthropic-version'] = '2023-06-01'
      } else if (customEndpoint.includes('googleapis.com')) {
        headers['Authorization'] = `Bearer ${customApiKey}`
      } else {
        headers['Authorization'] = `Bearer ${customApiKey}`
      }
    }
  } else {
    url = `http://localhost:1234/v1/chat/completions`
    headers = { 'Content-Type': 'application/json' }
  }

  const endpoint = customEndpoint || 'localhost:1234'
  console.log(`[FetchAI] ${isSmallTask ? '(Small) ' : ''}POST ${url}`)
  console.log('[FetchAI] Messages:', messages.map(m => `${m.role}: ${m.content?.slice?.(0, 80) || '(no content)'}`).join(' | '))
  if (jsonSchema) {
    console.log('[FetchAI] JSON Schema:', JSON.stringify(jsonSchema).slice(0, 100))
  }
  if (requestBody.response_format) {
    console.log('[FetchAI] Response format:', JSON.stringify(requestBody.response_format))
  }

  // ========== FETCH WITH RETRY ==========
  const executeFetch = async (retryBody, isRetry = false, trafficRetryCount = 0) => {
    const { id, controller } = addFetch(signal)
    const fetchSignal = controller.signal

    // Cleanup parent abort listener to avoid leak
    const abortHandler = () => controller.abort(new Error('AbortError'))
    if (signal && !signal.aborted) {
      signal.addEventListener('abort', abortHandler, { once: true })
    }

    let response
    try {
      response = await fetch(new Request(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(retryBody || requestBody),
        signal: fetchSignal
      }))
    } catch (error) {
      if (error.name === 'AbortError') {
        throw createLMStudioOfflineError(error, endpoint)
      }
      throw error
    } finally {
      if (signal && !signal.aborted) {
        signal.removeEventListener('abort', abortHandler)
      }
      removeFetch(id)
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')

      // Auto-retry fallback untuk High Traffic / Rate Limits (503, 429, 500)
      if ((response.status === 503 || response.status === 429 || response.status === 500) && trafficRetryCount < 3) {
        console.warn(`[FetchAI] Server sibuk (${response.status}), retry ke-${trafficRetryCount + 1} dalam 2 detik...`)
        await new Promise(r => setTimeout(r, 2000))
        return executeFetch(retryBody, isRetry, trafficRetryCount + 1)
      }

      throw createLMStudioOfflineError(
        new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`),
        endpoint
      )
    }

    // ========== STREAMING ==========
    if (onStream && response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n').filter(l => l.startsWith('data: '))
          for (const line of lines) {
            const data = line.replace(/^data: /, '').trim()
            if (!data || data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              const content = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.text || ''
              if (content) {
                fullText += content
                onStream(content)
              }
            } catch { /* skip malformed SSE */ }
          }
        }
      } catch (error) {
        console.warn('[FetchAI] Stream error:', error.message)
        if (fullText) {
          try { return { content: [{ text: fullText }] } } catch { /* ignore */ }
        }
        throw error
      }

      // Streaming selesai — kembalikan teks sebagai response
      return { content: [{ text: fullText }] }
    }

    // ========== NON-STREAMING ==========
    const cleanText = await response.text()
    const isDev = !app || !app.isPackaged
    console.log(`[FetchAI] Raw Response${isDev ? '' : ' (length: ' + cleanText.length + ')'}:`, isDev ? cleanText : '[redacted in production]')

    const parsed = cleanAndParse(cleanText)
    if (parsed !== null) return parsed
    throw new Error(`API mengembalikan JSON tidak valid.\nRaw Text: ${cleanText.slice(0, 100)}...`)
  }

  return executeFetch(requestBody)
}

export const cleanAndParse = (rawResponse) => {
  try {
    if (!rawResponse) return null
    // ponytail: jsonrepair handles fences, trailing commas, control chars, broken escapes
    const cleaned = rawResponse.replace(/```[\s\S]*?```/g, '').replace(/^\xEF\xBB\xBF/, '').trim()
    return JSON.parse(jsonrepair(cleaned))
  } catch (error) {
    console.error('Gagal Parse JSON:', error)
    try {
      const match = rawResponse.trim().replace(/^\xEF\xBB\xBF/, '').match(/\{[\s\S]*\}/)
      return match ? JSON.parse(match[0]) : null
    } catch {
      return null
    }
  }
}
