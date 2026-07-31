import { getAllConfig } from '../db'
import { cleanAndParse } from '../../../../shared/cleanAndParse.js'

export { cleanAndParse }

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

    // Debug log: metadata only (count + char lengths), never message content — privacy
    if (import.meta.env.DEV) {
      let totalChars = 0
      for (const m of messages) totalChars += m.content?.length || 0
      console.debug(`[fetchAI] ${messages.length} msgs, ~${Math.round(totalChars / 2.5)} est. tokens (${isSmallTask ? 'small' : 'main'})`)
    }

    window.api.fetchAI({ messages, config: conf, isSmallTask, jsonSchema }).then(result => {
      if (hasResolved) return;
      hasResolved = true;
      if (result && result.error) {
        const err = new Error(result.error?.message || result.error || 'Unknown AI error')
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
