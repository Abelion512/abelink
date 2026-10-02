// Kontrak query browser-extract (murni, unit-testable).
// Kebijakan jujur: query kosong tanpa sesi extension dan tanpa URL terakhir
// = error eksplisit (bukan fetch buta yang berujung 403 + klaim halu).
import { extractUrl } from '../browser/bridge-core.ts'

// Discriminated union: `ok` jadi literal, bukan `boolean`, supaya call-site
// bisa menyempit ke cabang yang tepat tanpa cast.
// `error` ditandai `?: undefined` di cabang sukses supaya consumer boleh
// membaca `r.error` tanpa narrowing (dipakai test kontrak
// tests/browser-extract-contract.test.ts) TANPA kehilangan diskriminan `ok`.
export type ExtractQueryResult =
  | { ok: true; url: string; error?: undefined }
  | { ok: true; url: null; via: 'extension'; error?: undefined }
  | { ok: false; error: string }

export function resolveExtractQuery(
  query: unknown,
  { hasSession = false, lastUrl = null as string | null }: { hasSession?: boolean; lastUrl?: string | null } = {}
): ExtractQueryResult {
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