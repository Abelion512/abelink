// Pemecah daftar ID admin Telegram — satu sumber kebenaran agar bridge
// (broadcast) dan tool AI (screenshot-to-tg fallback) setuju soal format.
// Menerima pemisah spasi/koma/titik-koma/baris baru; string & number lolos,
// sisanya (null/undefined/object) dibuang. Duplikat dipertahankan (urutan stabil).
export const splitTgAdminIds = (raw) =>
  String(raw ?? '')
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
