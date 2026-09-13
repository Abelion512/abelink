// Deteksi provider dari URL endpoint — MURNI (tanpa I/O) agar bisa di-unit-test.
// Dipakai untuk auto-nama koneksi (chat Custom + STT) dan saran protokol.
// Prioritas: keyword di host/path dulu, lalu port lokal yang dikenal.
// Tak pernah throw: input aneh -> { id: 'custom', ... }.
const KEYWORDS = [
  { kw: '9router', id: '9router', name: '9Router', protocol: 'openai' },
  { kw: 'omniroute', id: 'omniroute', name: 'OmniRoute', protocol: 'openai' },
  { kw: 'lm-studio', id: 'lm-studio', name: 'LM Studio', protocol: 'openai' },
  { kw: 'lmstudio', id: 'lm-studio', name: 'LM Studio', protocol: 'openai' },
  { kw: 'ollama', id: 'ollama', name: 'Ollama', protocol: 'openai' },
  { kw: 'openrouter', id: 'openrouter', name: 'OpenRouter', protocol: 'openai' },
  { kw: 'anthropic', id: 'anthropic', name: 'Anthropic', protocol: 'anthropic' },
  { kw: 'groq', id: 'groq', name: 'Groq', protocol: 'openai' },
  { kw: 'deepseek', id: 'deepseek', name: 'DeepSeek', protocol: 'openai' },
  { kw: 'cerebras', id: 'cerebras', name: 'Cerebras', protocol: 'openai' },
  { kw: 'gemini', id: 'gemini', name: 'Gemini API', protocol: 'openai' },
]

// Port lokal yang lazim dipakai router/provider lokal. 20128 = gabungan
// router lokal (9Router/OmniRoute dan sejenisnya).
const KNOWN_PORTS = {
  20128: { id: 'local-router', name: 'Local Router', protocol: 'openai' },
  1234: { id: 'lm-studio', name: 'LM Studio', protocol: 'openai' },
  11434: { id: 'ollama', name: 'Ollama', protocol: 'openai' },
  11435: { id: 'ollama', name: 'Ollama', protocol: 'openai' },
}

export function detectProviderFromUrl(raw) {
  const fallback = { id: 'custom', name: 'Custom', protocol: 'auto' }
  if (typeof raw !== 'string') return fallback
  const url = raw.trim()
  if (!url) return fallback
  const low = url.toLowerCase()
  for (const { kw, id, name, protocol } of KEYWORDS) {
    if (low.includes(kw)) return { id, name, protocol }
  }
  const portMatch = low.match(/:(\d{2,5})(?:\/|$)/)
  if (portMatch && KNOWN_PORTS[Number(portMatch[1])]) {
    const { id, name, protocol } = KNOWN_PORTS[Number(portMatch[1])]
    return { id, name, protocol }
  }
  return fallback
}
