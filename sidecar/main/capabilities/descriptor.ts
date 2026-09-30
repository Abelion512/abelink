// Kontrak terpadu CapabilityDescriptor: connector|plugin|skill|native.
// Bentuk: { id, kind, version, description, inputSchema, scopes, guide, enabled, source }

const ID_RE = /^[a-z0-9][a-z0-9_-]*(:[a-z0-9][a-z0-9_-]*)*$/
const KINDS = ['connector', 'plugin', 'skill', 'native']

export interface CapabilityDescriptor {
  id: string
  kind: string
  version?: string
  description?: string
  inputSchema?: { type?: string; properties?: Record<string, unknown>; required?: unknown }
  scopes?: string[]
  guide?: { steps?: unknown[]; examples?: unknown[]; [key: string]: unknown }
  enabled?: boolean
  source?: string
  [key: string]: unknown
}

// Validasi deskriptor -> { ok, errors[] }.
export function validateDescriptor(d: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  const desc = d as CapabilityDescriptor | null
  if (!desc || typeof desc !== 'object') return { ok: false, errors: ['deskriptor harus objek'] }
  if (typeof desc.id !== 'string' || !ID_RE.test(desc.id)) errors.push('id tidak valid')
  if (!KINDS.includes(desc.kind)) errors.push('kind harus salah satu: connector|plugin|skill|native')
  if (!desc.inputSchema || typeof desc.inputSchema !== 'object' || desc.inputSchema.type !== 'object')
    errors.push('inputSchema harus objek dengan type === \'object\'')
  if (desc.scopes !== undefined && (!Array.isArray(desc.scopes) || desc.scopes.some((s: unknown) => typeof s !== 'string')))
    errors.push('scopes harus array string')
  if (desc.enabled !== undefined && typeof desc.enabled !== 'boolean')
    errors.push('enabled harus boolean')
  return { ok: errors.length === 0, errors }
}

// Isi nilai default yang hilang.
export function normalizeDescriptor(d: CapabilityDescriptor) {
  return {
    ...d,
    version: d?.version ?? '1',
    scopes: d?.scopes ?? [],
    guide: {
      steps: d?.guide?.steps ?? [],
      examples: d?.guide?.examples ?? []
    },
    enabled: d?.enabled ?? true
  }
}

// Satu baris `kind:id — description` untuk prompt registry.
export function toPromptLine(d: CapabilityDescriptor) {
  return `${d.kind}:${d.id} — ${d.description ?? ''}`
}

// Objek detail penuh (ternormalisasi) untuk panduan.
export function toGuide(d: CapabilityDescriptor) {
  return normalizeDescriptor(d)
}
