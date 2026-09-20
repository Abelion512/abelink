// Kontrak query browser-extract (murni, unit-testable).
// Kebijakan jujur: query kosong tanpa sesi extension dan tanpa URL terakhir
// = error eksplisit (bukan fetch buta yang berujung 403 + klaim halu).
import { extractUrl } from '../browser/bridge-core.mjs'

export function resolveExtractQuery(query, { hasSession = false, lastUrl = null } = {}) {
  const q = String(query ?? '').trim()
  const url = extractUrl(q)
  if (url) return { ok: true, url }
  if (hasSession) return { ok: true, url: null, via: 'extension' }
  if (lastUrl) return { ok: true, url: String(lastUrl) }
  return {
    ok: false,
    error:
      'browser-extract butuh URL penuh atau sesi extension aktif. ' +
      'Beri URL lengkap (https://...), sambungkan extension ABELINK BRIDGE lalu ulangi, ' +
      'atau panggil browser-navigate <url> dulu agar ada URL terakhir sesi.'
  }
}
