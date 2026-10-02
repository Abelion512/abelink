// Kebijakan veil co-pilot, dipakai test + dokumentasi kontrak.
// background.ts (service worker MV3) menyalin logika ini inline di
// runCommand/ensureOverlay — tidak mengimpor modul ini, karena service worker
// dibangun jadi script klasik tanpa modul (lihat scripts/build-extension.ts).
export interface OverlayState {
  awaitingUser?: boolean
  overlayStopped?: boolean
}

export function shouldOverlay({ awaitingUser, overlayStopped }: OverlayState = {}): boolean {
  if (overlayStopped) return false
  if (awaitingUser) return false
  return true
}
