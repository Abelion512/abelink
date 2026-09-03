// Channel: YouTube Music player bridge (Tauri), pencarian lagu, stub fase B/C.
// Modul ini hanya mendaftarkan handler; semua I/O via helper registry.
import { on, handlers, lazy, unsupported } from '../registry.mjs'

const getYtm = lazy(async () => {
  const mod = await import('ytmusic-api')
  const YTMusic = mod.default ?? mod
  const inst = typeof YTMusic === 'function' ? new YTMusic() : YTMusic
  if (typeof inst.initialize === 'function') await inst.initialize()
  return inst
})

// ---------------------------------------------------- YouTube Music player bridge (Tauri)
// Stub handlers — Tauri belum punya window terpisah seperti Electron BrowserWindow.
// Rencanakan: multi-window Tauri WebviewWindow untuk load youtube.com.
// Untuk sekarang: return response yang aman supaya frontend ga crash.
on('yt:load', async (url) => {
  // Future: spawn Tauri WebviewWindow, load youtube.com/music
  // Emit event saat track berubah via yt:track-updated
  return { success: true, message: 'yt:load not yet implemented in Tauri (needs WebviewWindow)' }
})

on('yt:show', async () => {
  return { success: true, message: 'yt:show not yet implemented in Tauri' }
})

on('yt:hide', async () => {
  return { success: true, message: 'yt:hide not yet implemented in Tauri' }
})

on('yt:command', async (command) => {
  // Supported: next, prev, playPause, repeat, queue
  // Future: inject JS into YouTube WebviewWindow
  return { success: false, message: `yt:command '${command}' not yet implemented in Tauri` }
})

on('yt:get-duration', async () => {
  return { success: false, data: 0, message: 'yt:get-duration not yet implemented in Tauri' }
})

// Pencarian lagu via ytmusic-api (lazy; instance di-init sekali). Hasil
// DINORMALKAN ke kontrak lama yt-search ({id,title,artist,duration,url,...})
// karena konsumen (getBestMusicMatch, YoutubeMusicPlayer) bergantung padanya —
// tanpa ini field metadata jadi undefined.
on('search-music', async (query) => {
  const ytm = await getYtm()
  if (typeof ytm.search !== 'function') {
    throw new Error('ytmusic-api tidak menyediakan search()')
  }
  const res = await ytm.search(String(query))
  const items = Array.isArray(res) ? res : Array.isArray(res?.videos) ? res.videos : []
  const fmtDur = (d) => {
    if (d == null) return ''
    if (typeof d === 'string') return d
    const s = Number(d)
    if (!isFinite(s) || s <= 0) return ''
    const m = Math.floor(s / 60)
    const ss = String(Math.floor(s % 60)).padStart(2, '0')
    return `${m}:${ss}`
  }
  return items
    .slice(0, 8)
    .map((v) => {
      const id = v.videoId ?? v.id ?? ''
      const thumb =
        v.thumbnails?.at?.(-1)?.url ?? v.thumbnail ?? v.thumbnails?.[0]?.url ?? ''
      return {
        id,
        videoId: id,
        title: v.title ?? v.name ?? '',
        artist: v.artist?.name ?? v.author?.name ?? (typeof v.author === 'string' ? v.author : ''),
        duration: fmtDur(v.duration ?? v.durationText),
        url: `https://music.youtube.com/watch?v=${id}`,
        thumbnail: thumb
      }
    })
    .filter((x) => x.id)
})

// ------------------------------------------------------------- Lite & misc
// Fase B0 (2026-08-26): cluster lite & misc pindah ke Rust native
// (src-tauri/src/cmd_misc.rs): system:get-lite-mode, app:get-documents-path,
// save-temp-file, open-external, show-notification.
// `ping` TETAP di sini — semantiknya health-check proses sidecar itu sendiri.
on('ping', () => 'pong')

// ------------------------------------------- Dipindah ke fase B/C (Tauri native)
// dialog:open-file / dialog:open-directory -> Rust native `misc_open_*_dialog`
// take-screenshot                            -> Rust native `misc_take_screenshot`
// Sisanya masih stub fase B/C.
for (const ch of [
  'browser:navigate',
  'browser:read-dom',
  'browser:action',
  'browser:close',
  'browser:show',
  'os:read',
  'os:click',
  'os:type',
  'os:key',
  'os:scroll',
  'os:open',
  'os:list-windows',
  'os:focus-window',
  'os:ask-user'
]) {
  handlers[ch] = unsupported(ch.startsWith('browser:') ? 'Fase C3' : ch.startsWith('os:') ? 'Fase B6' : 'Fase B5')
}
