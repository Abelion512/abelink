// Status popup jujur: pill hijau HANYA bila loop aktif (running===true).
// Probe/port hidup bukan bukti sambungan. Murni, dipakai test; popup.js
// (pokok UI, milik UI worker) tetap pemilik render — modul ini hanya reducer.
export function popupStatus({ running, lastError, pairing } = {}) {
  const pin = pairing ? ` [${pairing.flavor} :${pairing.port} terpin]` : ' [belum pilih flavor]'
  if (running === true) return { pill: 'tersambung', text: `Menunggu perintah...${pin}` }
  if (lastError) return { pill: 'terputus', text: String(lastError) }
  return { pill: 'menunggu', text: `Menunggu sidecar Abelink...${pin}` }
}
