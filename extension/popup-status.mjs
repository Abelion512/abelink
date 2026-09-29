// Kontrak status popup: pill hijau HANYA bila loop bridge jalan.
// Probe/port hidup bukan bukti sambungan. Murni + unit-testable.
// pairing = { flavor, port } | null.
// notice = status transien non-error (mis. "Menyambung ulang otomatis..."):
// dirender KUNING (warn), bukan merah — merah hanya untuk lastError nyata.
export const popupStatus = ({ running, lastError, notice, pairing } = {}) => {
  if (running === true) {
    const pin = pairing ? ` [${pairing.flavor} :${pairing.port} terpin]` : ' [belum pilih flavor]'
    return { pill: 'tersambung', kind: 'ok', text: `Tersambung${pin}. Menunggu perintah...` }
  }
  if (lastError) {
    return { pill: 'terputus', kind: 'err', text: `Terputus: ${String(lastError)}` }
  }
  if (notice) {
    return { pill: 'menyambung ulang…', kind: 'warn', text: String(notice) }
  }
  return { pill: 'menunggu', kind: 'warn', text: 'Menunggu sidecar Abelink...' }
}
