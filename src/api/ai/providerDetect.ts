// Deteksi provider dari URL endpoint — MURNI (tanpa I/O) agar bisa di-unit-test.
// Dipakai untuk auto-nama koneksi (chat Custom + STT) dan saran protokol.
// Prioritas: keyword di host/path dulu, lalu port lokal yang dikenal.
// Tak pernah throw: input aneh -> { id: 'custom', ... }.
type ProviderProtocol = 'openai' | 'anthropic' | 'auto'

interface DetectedProvider {
  id: string
  name: string
  protocol: ProviderProtocol
}

const KEYWORDS: Array<{ kw: string; id: string; name: string; protocol: ProviderProtocol }> = [
  { kw: '9router', id: '9router', name: '9Router', protocol: 'openai' as const },
  { kw: 'omniroute', id: 'omniroute', name: 'OmniRoute', protocol: 'openai' as const },
  { kw: 'lm-studio', id: 'lm-studio', name: 'LM Studio', protocol: 'openai' as const },
  { kw: 'lmstudio', id: 'lm-studio', name: 'LM Studio', protocol: 'openai' as const },
  { kw: 'ollama', id: 'ollama', name: 'Ollama', protocol: 'openai' as const },
  { kw: 'openrouter', id: 'openrouter', name: 'OpenRouter', protocol: 'openai' as const },
  { kw: 'anthropic', id: 'anthropic', name: 'Anthropic', protocol: 'anthropic' as const },
  { kw: 'groq', id: 'groq', name: 'Groq', protocol: 'openai' as const },
  { kw: 'deepseek', id: 'deepseek', name: 'DeepSeek', protocol: 'openai' as const },
  { kw: 'cerebras', id: 'cerebras', name: 'Cerebras', protocol: 'openai' as const },
  { kw: 'gemini', id: 'gemini', name: 'Gemini API', protocol: 'openai' as const },
]

// Port lokal yang lazim dipakai router/provider lokal. 20128 = gabungan
// router lokal (9Router/OmniRoute dan sejenisnya).
const KNOWN_PORTS: Record<number, DetectedProvider> = {
  20128: { id: 'local-router', name: 'Local Router', protocol: 'openai' },
  1234: { id: 'lm-studio', name: 'LM Studio', protocol: 'openai' },
  11434: { id: 'ollama', name: 'Ollama', protocol: 'openai' },
  11435: { id: 'ollama', name: 'Ollama', protocol: 'openai' },
}

export function detectProviderFromUrl(raw: unknown): DetectedProvider {
  const fallback: DetectedProvider = { id: 'custom', name: 'Custom', protocol: 'auto' }
  if (typeof raw !== 'string') return fallback
  const url = raw.trim()
  if (!url) return fallback
  const low = url.toLowerCase()
  for (const { kw, id, name, protocol } of KEYWORDS) {
    if (low.includes(kw)) return { id, name, protocol }
  }
  const portMatch = low.match(/:(\d{2,5})(?:\/|$)/)
  const portKey = portMatch ? Number(portMatch[1]) : null
  if (portKey !== null && KNOWN_PORTS[portKey]) {
    const { id, name, protocol } = KNOWN_PORTS[portKey]
    return { id, name, protocol }
  }
  return fallback
}
