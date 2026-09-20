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

/**
 * @param {object} schema inputSchema aksi (boleh null/asing -> fail-open)
 * @param {object} args argumen pemanggil (null/undefined = {} untuk skema object)
 * @returns {{ok: boolean, errors: string[]}} errors berisi path ("a.b", "ids[1]")
 */
export function validateArgs(schema, args) {
  try {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
      return { ok: true, errors: [] }
    }
    if (schema.type && schema.type !== 'object') return { ok: true, errors: [] }
    const props = schema.properties
    if (!props || typeof props !== 'object' || Array.isArray(props)) {
      return { ok: true, errors: [] }
    }
    const value = args == null ? {} : args
    if (typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, errors: ['$root: harus object'] }
    }
    const errors = []
    checkRequired(schema.required, value, '', errors)
    for (const [key, prop] of Object.entries(props)) {
      if (value[key] === undefined) continue
      checkValue(prop, value[key], key, errors, 0)
    }
    return { ok: errors.length === 0, errors }
  } catch {
    return { ok: true, errors: [] }
  }
}

function checkRequired(required, value, prefix, errors) {
  if (!Array.isArray(required)) return
  for (const key of required) {
    if (value?.[key] === undefined) errors.push(`${prefix}${key}: wajib diisi`)
  }
}

function checkValue(prop, v, path, errors, depth) {
  if (!prop || typeof prop !== 'object' || Array.isArray(prop)) return
  const t = prop.type
  if (!t || !KNOWN_TYPES.has(t)) return // tipe asing -> fail-open, lewati
  switch (t) {
    case 'string':
      if (typeof v !== 'string') errors.push(`${path}: harus string`)
      else if (Array.isArray(prop.enum) && !prop.enum.includes(v)) {
        errors.push(`${path}: harus salah satu dari [${prop.enum.join(', ')}]`)
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
      } else if (prop.items && typeof prop.items === 'object' && prop.items.type) {
        v.forEach((item, i) => checkValue(prop.items, item, `${path}[${i}]`, errors, depth + 1))
      }
      break
    case 'object':
      if (!v || typeof v !== 'object' || Array.isArray(v)) {
        errors.push(`${path}: harus object`)
      } else if (depth < 1 && prop.properties && typeof prop.properties === 'object') {
        // Nested SATU level: required + tipe propertinya; lebih dalam tidak
        // direkursi (cukup untuk skema katalog/MCP saat ini).
        checkRequired(prop.required, v, `${path}.`, errors)
        for (const [k, sub] of Object.entries(prop.properties)) {
          if (v[k] === undefined) continue
          checkValue(sub, v[k], `${path}.${k}`, errors, depth + 1)
        }
      }
      break
  }
}
