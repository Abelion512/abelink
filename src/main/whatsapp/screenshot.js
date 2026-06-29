import { desktopCapturer, app } from 'electron'
import fs from 'fs'
import path from 'path'

/**
 * Mengambil tangkapan layar dari semua monitor.
 * Menyimpan gambar ke folder temp, mengirimkannya ke WA, lalu menghapus file temp.
 * @param {Object} sock Instance Baileys Socket
 * @param {String} jid Tujuan (JID)
 * @param {Object} msg Objek pesan asli untuk quoted reply
 * @returns {Promise<String>} Teks balasan status (berhasil/gagal)
 */
export const sendScreenshotToWA = async (sock, jid, msg) => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 }
    })

    if (sources.length > 0) {
      let sentCount = 0
      for (const [index, source] of sources.entries()) {
        const imageBuffer = source.thumbnail.toPNG()
        const tempPath = path.join(app.getPath('temp'), `screenshot-${Date.now()}-${index}.png`)
        fs.writeFileSync(tempPath, imageBuffer)

        await sock.sendMessage(
          jid,
          { image: { url: tempPath }, caption: `Layar ${index + 1} (${source.name})` },
          { quoted: msg }
        )
        // Hapus file sementara
        fs.unlink(tempPath, () => {})
        sentCount++
      }
      return `📸 ${sentCount} Screenshot dari semua monitor berhasil dikirim!`
    } else {
      return '❌ Gagal dapet akses layar, coba pastikan layar nyala.'
    }
  } catch (e) {
    console.error('[Baileys] Error taking screenshot:', e)
    return `❌ Wah error pas mau screenshot: ${e.message}`
  }
}
