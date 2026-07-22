import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import yts from 'yt-search'
import { execFile } from 'child_process'
import ffmpeg from 'ffmpeg-static'

const IS_WIN = process.platform === 'win32'

/**
 * Resolve youtube-dl-exec binary path from ffmpeg-static path.
 * Both packages ship platform-specific binaries (ffmpeg, yt-dlp).
 */
function resolveYtdlPath(ffmpegPath) {
  const unpacked = ffmpegPath.replace('app.asar', 'app.asar.unpacked')
  if (IS_WIN) {
    return unpacked.replace(
      /ffmpeg-static[\\/]ffmpeg\.exe/i,
      'youtube-dl-exec\\bin\\yt-dlp.exe'
    )
  }
  return unpacked.replace(
    /ffmpeg-static[\\/]ffmpeg/i,
    'youtube-dl-exec/bin/yt-dlp'
  )
}

/**
 * Download lagu dari YouTube dan kirim mp3-nya ke WA secara asinkron.
 * @param {Object} sock Instance Baileys Socket
 * @param {String} jid Tujuan (JID)
 * @param {Object} msg Objek pesan asli untuk quoted reply
 * @param {String} query Judul lagu/query pencarian
 */
export const downloadAndSendMusicWA = async (sock, jid, msg, query) => {
  try {
    const searchResult = await yts(query)
    const video = searchResult.videos[0]
    if (!video) {
      await sock.sendMessage(jid, {
        text: `❌ Bro, lagu "${query}" nggak nemu nih di YouTube.`
      })
      return
    }
    const tempPath = path.join(app.getPath('temp'), `wa-audio-${Date.now()}.mp3`)
    const unpackFfmpeg = ffmpeg.replace('app.asar', 'app.asar.unpacked')
    const unpackYtdl = resolveYtdlPath(ffmpeg)

    await new Promise((resolve, reject) => {
      execFile(
        unpackYtdl,
        [
          video.url,
          '--extract-audio',
          '--audio-format',
          'mp3',
          '--ffmpeg-location',
          unpackFfmpeg,
          '--output',
          tempPath
        ],
        (err, stdout, stderr) => {
          if (err) {
            err.message += `\n${stderr}`
            reject(err)
          } else {
            resolve()
          }
        }
      )
    })

    await sock.sendMessage(
      jid,
      { audio: { url: tempPath }, mimetype: 'audio/mpeg', ptt: false },
      { quoted: msg }
    )
    fs.unlink(tempPath, () => {})
  } catch (e) {
    console.error('[Baileys] Error download lagu asinkron:', e)
    await sock.sendMessage(jid, {
      text: `❌ Wah error pas donlot lagunya: ${e.message}`
    })
  }
}
