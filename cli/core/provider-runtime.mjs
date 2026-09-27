// cli/core/provider-runtime.mjs — Session-scoped provider runtime (Phase A1).
// Mengisolasi konfigurasi model dan transport fetch per sesi tanpa global mutable state.

import { fetchAI } from '../../src/api/ai/core.js'

export class ProviderRuntime {
  constructor({
    provider = null,
    model = null,
    customEndpoint = null,
    apiKey = null,
    fetchTransport = null
  } = {}) {
    this.provider = provider
    this.model = model
    this.customEndpoint = customEndpoint
    this.apiKey = apiKey
    this.fetchTransport = typeof fetchTransport === 'function' ? fetchTransport : null
  }

  // Session-scoped fetch execution yang tidak memutasi globalThis.__ABELINK_AI_FETCH__
  async fetchAI(messagesOrPayload, options = {}) {
    // Jika fetchTransport kustom disuntikkan langsung ke runtime ini, pakai langsung
    if (this.fetchTransport) {
      if (Array.isArray(messagesOrPayload)) {
        return this.fetchTransport({
          messages: messagesOrPayload,
          config: {
            aiProvider: this.provider,
            model: this.model,
            customEndpoint: this.customEndpoint,
            apiKey: this.apiKey,
            ...options.config
          },
          ...options
        })
      }
      return this.fetchTransport(messagesOrPayload, options)
    }

    // Default: teruskan ke core fetchAI dengan transport yang eksplisit
    const messages = Array.isArray(messagesOrPayload)
      ? messagesOrPayload
      : messagesOrPayload?.messages || []

    const configOverride = {
      ...(this.provider ? { aiProvider: this.provider } : {}),
      ...(this.model ? { model: this.model } : {}),
      ...(this.customEndpoint ? { customEndpoint: this.customEndpoint } : {}),
      ...(this.apiKey ? { apiKey: this.apiKey } : {}),
      ...(options.config || options.configOverride || {})
    }

    return fetchAI(messages, {
      ...options,
      configOverride,
      transport: this.fetchTransport
    })
  }
}

export function createProviderRuntime(config = {}) {
  return new ProviderRuntime(config)
}
