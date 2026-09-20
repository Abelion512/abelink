// Kebijakan veil co-pilot, dipakai test + dokumentasi kontrak.
// background.js (service worker klasik MV3, tanpa import) menyalin logika
// ini inline di runCommand/ensureOverlay.
export function shouldOverlay({ awaitingUser, overlayStopped } = {}) {
  if (overlayStopped) return false
  if (awaitingUser) return false
  return true
}
