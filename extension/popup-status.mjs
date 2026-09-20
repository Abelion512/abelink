// Kontrak status popup: pill hijau HANYA bila loop bridge jalan.
// Murni + unit-testable. pairing = { flavor, port } | null.
export const popupStatus = ({ running, lastError, pairing } = {}) => {
  if (running === true) {
    const pin = pairing ? ` [${pairing.flavor} :${pairing.port} terpin]` : ''
    return { pill: 'tersambung', kind: 'ok', text: `Tersambung${pin}. Menunggu perintah...` }
  }
  if (lastError) {
    return { pill: 'terputus', kind: 'err', text: `Terputus: ${lastError}` }
  }
  return { pill: 'menunggu', kind: 'warn', text: 'Menunggu sidecar Abelink...' }
}
