import { getAllConfig } from '../db'
import { jsonrepair } from 'jsonrepair'

export const fetchAI = async (messages, signal, isSmallTask = false, jsonSchema = null, conf = null) => {
  if (!conf) {
    const currentConfig = await getAllConfig()
    conf = currentConfig[0] || {}
  }

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
      signal.addEventListener('abort', onAbort, { once: true });
    }

    // --- DEBUG LOG: Token Usage & Payload ---
    console.groupCollapsed(`[fetchAI] Request Payload (${isSmallTask ? 'Small Task' : 'Main Task'})`);
    console.log("Total Messages:", messages.length);
    let totalChars = 0;
    messages.forEach((m, i) => {
      const charLen = m.content?.length || 0;
      totalChars += charLen;
      console.log(`%c[Msg ${i} | ${m.role.toUpperCase()}]`, 'color: #3b82f6; font-weight: bold;', `${charLen} chars`);
      console.log(m.content);
    });
    console.log(`%c[ESTIMASI ESTIMATED TOKENS]`, 'color: #ef4444; font-weight: bold;', `~${Math.round(totalChars / 2.5)} tokens (Bahasa Indonesia & JSON overhead)`);
    console.groupEnd();
    // --- END DEBUG LOG ---

    window.api.fetchAI({ messages, config: conf, isSmallTask, jsonSchema }).then(result => {
      if (hasResolved) return;
      hasResolved = true;
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
      reject(e);
    })
  });
}

export const cleanAndParse = (rawResponse) => {
  try {
    if (!rawResponse) return null
    // Fast path: try raw parse first (avoids expensive jsonrepair on valid JSON)
    const trimmed = rawResponse.replace(/^\xEF\xBB\xBF/, '').trim()
    try { return JSON.parse(trimmed) } catch {}
    // Strip code fences then jsonrepair for broken LLM JSON
    const cleaned = trimmed.replace(/```[\s\S]*?```/g, '').trim()
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
