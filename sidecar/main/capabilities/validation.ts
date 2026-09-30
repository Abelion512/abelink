// Validasi argumen capability terhadap inputSchema (Tahap 4 keamanan berlapis).
//
// Ringan + sinkron + TIDAK PERNAH melempar: kegagalan internal validator
// degrade ke fail-open {ok:true} agar jalur eksekusi tidak mati karena
// validatornya sendiri — penolakan hanya datang dari hasil validasi yang
// eksplisit (ok:false), bukan dari exception.
//
// Cakupan (cukup untuk skema katalog + deskriptor plugin + MCP):
// - type object: properties + required
// - string / number / integer / boolean / array
// - string enum
// - nested object SATU level (properties + required di dalamnya)
// - array items {type} (satu level)
// Skema tak dikenal (null/bukan-objek/tanpa properties/tipe asing) ->
// {ok:true} (fail-open untuk legacy tanpa tipe).

const KNOWN_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object'])

interface SchemaProp {
  type?: string
  enum?: unknown[]
  items?: SchemaProp
  properties?: Record<string, SchemaProp>
  required?: unknown
  [key: string]: unknown
}

type ValidationResult = { ok: boolean; errors: string[] }

/**
 * @param schema inputSchema aksi (boleh null/asing -> fail-open)
 * @param args argumen pemanggil (null/undefined = {} untuk skema object)
 * @returns errors berisi path ("a.b", "ids[1]")
 */
export function validateArgs(schema: unknown, args: unknown): ValidationResult {
  try {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
      return { ok: true, errors: [] }
    }
    const s = schema as SchemaProp
    if (s.type && s.type !== 'object') return { ok: true, errors: [] }
    const props = s.properties
    if (!props || typeof props !== 'object' || Array.isArray(props)) {
      return { ok: true, errors: [] }
    }
    const value = (args == null ? {} : args) as Record<string, unknown>
    if (typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, errors: ['$root: harus object'] }
    }
    const errors: string[] = []
    checkRequired(s.required, value, '', errors)
    for (const [key, prop] of Object.entries(props)) {
      if (value[key] === undefined) continue
      checkValue(prop, value[key], key, errors, 0)
    }
    return { ok: errors.length === 0, errors }
  } catch {
    return { ok: true, errors: [] }
  }
}

function checkRequired(required: unknown, value: Record<string, unknown>, prefix: string, errors: string[]) {
  if (!Array.isArray(required)) return
  for (const key of required) {
    if (value?.[String(key)] === undefined) errors.push(`${prefix}${String(key)}: wajib diisi`)
  }
}

function checkValue(prop: unknown, v: unknown, path: string, errors: string[], depth: number) {
  if (!prop || typeof prop !== 'object' || Array.isArray(prop)) return
  const p = prop as SchemaProp
  const t = p.type
  if (!t || !KNOWN_TYPES.has(t)) return // tipe asing -> fail-open, lewati
  switch (t) {
    case 'string':
      if (typeof v !== 'string') errors.push(`${path}: harus string`)
      else if (Array.isArray(p.enum) && !p.enum.includes(v)) {
        errors.push(`${path}: harus salah satu dari [${p.enum.join(', ')}]`)
      }
      break
    case 'number':
      if (typeof v !== 'number' || Number.isNaN(v)) errors.push(`${path}: harus number`)
      break
    case 'integer':
      if (typeof v !== 'number' || !Number.isInteger(v)) errors.push(`${path}: harus integer`)
      break
    case 'boolean':
      if (typeof v !== 'boolean') errors.push(`${path}: harus boolean`)
      break
    case 'array':
      if (!Array.isArray(v)) {
        errors.push(`${path}: harus array`)
      } else if (p.items && typeof p.items === 'object' && p.items.type) {
        v.forEach((item: unknown, i: number) => checkValue(p.items, item, `${path}[${i}]`, errors, depth + 1))
      }
      break
    case 'object': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) {
        errors.push(`${path}: harus object`)
      } else if (depth < 1 && p.properties && typeof p.properties === 'object') {
        // Nested SATU level: required + tipe propertinya; lebih dalam tidak
        // direkursi (cukup untuk skema katalog/MCP saat ini).
        const rec = v as Record<string, unknown>
        checkRequired(p.required, rec, `${path}.`, errors)
        for (const [k, sub] of Object.entries(p.properties)) {
          if (rec[k] === undefined) continue
          checkValue(sub, rec[k], `${path}.${k}`, errors, depth + 1)
        }
      }
      break
    }
  }
}
