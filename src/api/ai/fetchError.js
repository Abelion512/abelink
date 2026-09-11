// fetchError.js — pesan error AI yang ramah & informatif (renderer).
//
// Masalah yang diperbaiki: saat provider AI mati (mis. 9Router dimatikan),
// user hanya melihat "Maaf, terjadi kesalahan: AI fetch gagal" — tanpa sebab,
// tanpa aksi perbaikan. Modul murni ini memetakan hasil mentah bridge
// (NodeResponse { success, data, error }) menjadi pesan Indonesia yang
// menyebut kemungkinan penyebab + langkah konkret. Tanpa import window/db.
//
// Aturan:
// - Pesan asli yang sudah informatif (kalimat sidecar) diteruskan apa adanya.
// - Error teknis mentah yang pendek ("fetch failed", "401", ...) diterjemahkan.
// - Pesan kosong (kasus lama yang menelan sebab) diganti fallback beraksi.

const CONNECTION_HINT =
  'Kemungkinan penyebab: aplikasi server AI belum jalan (mis. 9Router/LM Studio di localhost:20128), koneksi internet putus, atau API key salah. Nyalakan dulu servernya, lalu coba lagi.'

const GENERIC_FALLBACK = `AI tidak merespons. ${CONNECTION_HINT}`

// Error teknis mentah (biasanya satu baris Inggris, <= 120 char) -> Indonesia.
const TRANSLATIONS = [
  { re: /ECONNREFUSED|Failed to fetch|fetch failed|NetworkError|network/i, id: 'tidak bisa terhubung ke server AI' },
  { re: /timed out|timeout/i, id: 'server AI kehabisan waktu merespons' },
  { re: /401|unauthorized|invalid api key|incorrect api key/i, id: 'API key ditolak server AI' },
  { re: /429|rate limit|too many requests/i, id: 'batas request server AI tercapai' },
  { re: /500|502|503|504|overloaded|high traffic|server error/i, id: 'server AI sedang bermasalah' }
]

/**
 * Bangun pesan error AI yang informatif dari respons bridge.
 * @param {object} res NodeResponse { success, data, error }
 * @returns {string} pesan siap tampil (tidak pernah kosong)
 */
export function friendlyAiFetchError(res) {
  const raw = typeof res?.error === 'string' ? res.error : res?.error?.message
  const text = String(raw ?? '').trim()
  if (!text) {
    const code = typeof res?.error === 'object' && res?.error !== null ? res.error.code : res?.code
    if (code) return `AI tidak merespons (kode: ${code}). ${CONNECTION_HINT}`
    return GENERIC_FALLBACK
  }
  if (text.length <= 120) {
    const hit = TRANSLATIONS.find((t) => t.re.test(text))
    if (hit) return `AI tidak merespons (${hit.id}). ${CONNECTION_HINT}`
  }
  return text
}

export default { friendlyAiFetchError }
