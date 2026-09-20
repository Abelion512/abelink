// Parser query browser-navigate: URL + flag adoptUserTab eksplisit.
// Delimiter ganda `||` (konvensi NATIVE_TOOLS): `https://x.com||adoptUserTab`.
// Default: TIDAK pernah pakai tab milik user (adoptUserTab: false).
import { extractUrl } from './bridge-core.mjs'

export function parseNavigateQuery(query) {
  const raw = String(query ?? '')
  const adoptUserTab = /(?:^|\|\||\s)adoptUserTab\b/i.test(raw)
  // Kupas flag ||... sebelum ekstraksi URL agar token tak menempel di URL.
  const stripped = raw.replace(/\|\|\s*adoptUserTab\b/gi, ' ')
  return { url: extractUrl(stripped), adoptUserTab }
}
