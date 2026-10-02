// Identitas tab sesi, dipakai test + dokumentasi kontrak.
// background.ts (service worker MV3) menyalin logika ini inline di
// targetTabForSession/getPrimaryTab — tidak mengimpor modul ini, karena service
// worker dibangun jadi script klasik tanpa modul.
export interface SessionTabLike {
  url?: string
  // Tab asli punya banyak field lain (id, windowId, title, ...). Index
  // signature menjaga fungsi ini tetap bisa dipakai dengan objek tab utuh
  // tanpa memaksa pemanggil deklarasi ulang setiap properti Chrome.
  [key: string]: unknown
}

export interface SessionTabInput {
  tab?: SessionTabLike | null
  focusedUrl?: string | null
}

export type SessionTabDecision =
  | { use: true; reason: null }
  | { use: false; reason: string }

export function isHttpUrl(url: unknown): boolean {
  return typeof url === 'string' && url.startsWith('http')
}

export function samePage(a: unknown, b: unknown): boolean {
  const strip = (u: unknown) => String(u || '').split('#')[0]
  return strip(a) === strip(b)
}

// Tab primer boleh dipakai sesi hanya bila http DAN (bila sesi pernah
// navigate) URL-nya masih sama dengan focusedUrl tercatat (abaikan hash
// agar SPA tidak false-positive). Sesi yang belum pernah navigate
// (focusedUrl null) tetap boleh memakai tab grupnya. URL berubah tanpa
// navigate tercatat = user menavigasi manual -> tolak agar caller
// recovery jujur.
export function resolveSessionTab({ tab, focusedUrl }: SessionTabInput): SessionTabDecision {
  if (!tab || !isHttpUrl(tab.url)) return { use: false, reason: 'tab bukan http' }
  if (focusedUrl != null && !samePage(tab.url, focusedUrl))
    return { use: false, reason: 'URL tab berubah dari focusedUrl sesi' }
  return { use: true, reason: null }
}
