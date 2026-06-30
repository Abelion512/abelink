import { getAllConfig } from '../db'

export const fetchAI = async (messages, signal, isSmallTask = false, jsonSchema = null) => {
  const currentConfig = await getAllConfig()
  const conf = currentConfig[0] || {}

  return new Promise((resolve, reject) => {
    let hasResolved = false;

    const onAbort = () => {
      if (hasResolved) return;
      hasResolved = true;
      if (window.api.abortFetchAI) window.api.abortFetchAI();
      const err = new Error('AbortError');
      err.name = 'AbortError';
      reject(err);
    }

    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort);
    }

    window.api.fetchAI({ messages, config: conf, isSmallTask, jsonSchema }).then(result => {
      if (hasResolved) return;
      hasResolved = true;
      if (signal) signal.removeEventListener('abort', onAbort);

      if (result && result.error) {
        const err = new Error(result.error.message)
        err.code = result.error.code
        reject(err)
        return
      }
      resolve(result);
    }).catch(e => {
      if (hasResolved) return;
      hasResolved = true;
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(e);
    })
  });
}

export const cleanAndParse = (rawResponse) => {
  try {
    if (!rawResponse) return null

    let text = rawResponse
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim()

    const firstBrace = text.indexOf('{')
    const lastBrace = text.lastIndexOf('}')
    const firstBracket = text.indexOf('[')
    const lastBracket = text.lastIndexOf(']')

    let firstIndex = -1
    let lastIndex = -1

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      firstIndex = firstBrace
    } else if (firstBracket !== -1) {
      firstIndex = firstBracket
    }

    if (lastBrace !== -1 && (lastBracket === -1 || lastBrace > lastBracket)) {
      lastIndex = lastBrace
    } else if (lastBracket !== -1) {
      lastIndex = lastBracket
    }

    if (firstIndex === -1 || lastIndex === -1) return null

    const jsonStr = text.substring(firstIndex, lastIndex + 1)

    try {
      return JSON.parse(jsonStr)
    } catch (_) {}

    let cleaned = jsonStr
      .replace(/\r?\n/g, ' ')
      .replace(/\t/g, ' ')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')

    try {
      return JSON.parse(cleaned)
    } catch (_) {}

    cleaned = cleaned.replace(/\\(?!(["\\\/bfnrt]|u[a-fA-F0-9]{4}))/g, '\\\\')

    try {
      return JSON.parse(cleaned)
    } catch (_) {}

    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1')

    return JSON.parse(cleaned)
  } catch (error) {
    console.error('Gagal Parse JSON:', error)
    try {
      const lastResort = rawResponse.trim().replace(/^\xEF\xBB\xBF/, '')
      const match = lastResort.match(/\{[\s\S]*\}/)
      return match ? JSON.parse(match[0]) : null
    } catch (e) {
      return null
    }
  }
}
