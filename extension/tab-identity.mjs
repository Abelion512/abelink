// Identitas tab sesi, dipakai test + dokumentasi kontrak.
// background.js (service worker klasik MV3, tanpa import) menyalin logika
// ini inline di targetTabForSession/getPrimaryTab.
export function isHttpUrl(url) {
  return typeof url === 'string' && url.startsWith('http')
}

export function samePage(a, b) {
  const strip = (u) => String(u || '').split('#')[0]
  return strip(a) === strip(b)
}

// Tab primer boleh dipakai sesi hanya bila http DAN (bila sesi pernah
// navigate) URL-nya masih sama dengan focusedUrl tercatat (abaikan hash
// agar SPA tidak false-positive). Sesi yang belum pernah navigate
// (focusedUrl null) tetap boleh memakai tab grupnya. URL berubah tanpa
// navigate tercatat = user menavigasi manual -> tolak agar caller
// recovery jujur.
export function resolveSessionTab({ tab, focusedUrl }) {
  if (!tab || !isHttpUrl(tab.url)) return { use: false, reason: 'tab bukan http' }
  if (focusedUrl != null && !samePage(tab.url, focusedUrl))
    return { use: false, reason: 'URL tab berubah dari focusedUrl sesi' }
  return { use: true, reason: null }
}
