// Kontrak terpadu CapabilityDescriptor: connector|plugin|skill|native.
// Bentuk: { id, kind, version, description, inputSchema, scopes, guide, enabled, source }

const ID_RE = /^[a-z0-9][a-z0-9_-]*(:[a-z0-9][a-z0-9_-]*)*$/
const KINDS = ['connector', 'plugin', 'skill', 'native']

// Validasi deskriptor -> { ok, errors[] }.
export function validateDescriptor(d) {
  const errors = []
  if (!d || typeof d !== 'object') return { ok: false, errors: ['deskriptor harus objek'] }
  if (typeof d.id !== 'string' || !ID_RE.test(d.id)) errors.push('id tidak valid')
  if (!KINDS.includes(d.kind)) errors.push('kind harus salah satu: connector|plugin|skill|native')
  if (!d.inputSchema || typeof d.inputSchema !== 'object' || d.inputSchema.type !== 'object')
    errors.push('inputSchema harus objek dengan type === \'object\'')
  if (d.scopes !== undefined && (!Array.isArray(d.scopes) || d.scopes.some((s) => typeof s !== 'string')))
    errors.push('scopes harus array string')
  if (d.enabled !== undefined && typeof d.enabled !== 'boolean')
    errors.push('enabled harus boolean')
  return { ok: errors.length === 0, errors }
}

// Isi nilai default yang hilang.
export function normalizeDescriptor(d) {
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
export function toPromptLine(d) {
  return `${d.kind}:${d.id} — ${d.description ?? ''}`
}

// Objek detail penuh (ternormalisasi) untuk panduan.
export function toGuide(d) {
  return normalizeDescriptor(d)
}
