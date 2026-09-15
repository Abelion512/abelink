// Channel: YouTube Music player bridge (Tauri), pencarian lagu, stub fase B/C.
// Modul ini hanya mendaftarkan handler; semua I/O via helper registry.
import { on, lazy } from '../registry.mjs'

const getYtm = lazy(async () => {
  const mod = await import('ytmusic-api')
  const YTMusic = mod.default ?? mod
  const inst = typeof YTMusic === 'function' ? new YTMusic() : YTMusic
  if (typeof inst.initialize === 'function') await inst.initialize()
  return inst
})

// ---------------------------------------------------- YouTube Music player bridge (Tauri)
// DIHAPUS: stub yt:load/show/hide/command/get-duration + native music window
// (cmd_music.rs). Pemutaran murni embed (YoutubeMusicContext); stub jujur-gagal
// dan window music_player hanya jadi sumber window hantu tak bertuan.

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
// browser:* -> engine/channels/browser.mjs (Fase C3 Jalur A).
// os:* (colon) -> engine/channels/os.mjs (Fase B6: alias ke NATIVE_TOOLS dash
// yang LIVE via pc-agent.js). JANGAN daftarkan stub di sini dua kali.

// ------------------------------------------------------- PC emergency stop
// Ctrl+Shift+S (global shortcut, Rust) -> renderer -> channel ini.
// Safety-stop: kill daemon/child aktif & tandai stop di pc-agent sampai
// di-reset lewat os-control-open/os-ask berikutnya. TIDAK approval-gated —
// justru jalur pemberhentian darurat, kebalikan dari aksi destruktif.
on('os:emergency-stop', async () => {
  const { triggerEmergencyStopExternal } = await import('../../main/pc-agent.js')
  const stopped = triggerEmergencyStopExternal()
  return { stopped, message: stopped ? 'Emergency stop dijalankan.' : 'Tidak ada sesi PC automation aktif.' }
})
