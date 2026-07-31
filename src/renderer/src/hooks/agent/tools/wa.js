// Tool: wa-send, screenshot-to-wa
export async function executeWaTool(ctx) {
  const { tool, query, waContext } = ctx
  if (tool === 'wa-send') {
    const [targetJid, targetText] = (query || '').split('|')
    if (targetJid && targetText) {
      const res = await window.api.sendWaMessage(targetJid.trim(), targetText.trim())
      return res?.success
        ? `Berhasil mengirim pesan WhatsApp ke ${targetJid}`
        : `Gagal: ${res?.error || 'Unknown'}`
    }
    return `Gagal: format query salah (harus "JID|pesan"): ${query}`
  }
  // screenshot-to-wa
  if (waContext) {
    window.api.waTakeScreenshot(waContext.jid, waContext.msgId)
    return 'Screenshot berhasil diambil dan dikirimkan ke WhatsApp user.'
  }
  return 'Tool screenshot-to-wa HANYA tersedia jika user sedang chat dari WhatsApp.'
}
