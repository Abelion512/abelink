import { useState, useContext, createContext, useRef, useCallback, useEffect } from 'react'
import { db, insertMemory, getAllConfig } from '../api/db'

/**
 * Mesin musik Abelink Linux — Embedded YouTube IFrame API Player.
 *
 * Murni embedded di dalam antarmuka aplikasi tanpa jendela popup OS eksternal:
 * - Audio dimainkan langsung via embedded YouTube Player API terisolasi.
 * - Riwayat pemutaran otomatis dipelajari ke Dexie db.memory.
 * - Kontrol playback lengkap (play, pause, next, prev, jump).
 *
 * Kontrak stabil untuk konsumen (useAbelinkMusic, YoutubeMusicPlayer, AbelinkHome):
 * - playUrl(watchUrl, initialTrack) -> boolean nyata (false = gagal, bukan no-op sunyi)
 * - nextTrack / prevTrack -> boolean
 * - playPause() -> 'playing' | 'paused' | null (null = engine tidak siap)
 * - pauseTrack / resumeTrack -> boolean
 * - playbackError: string|null — pesan error terakhir dari engine (mis. embed blocked)
 */

const YoutubeMusicContext = createContext()

// ---------------------------------------------------------------- YT IFrame API loader
// Deterministik: pasang window.onYouTubeIframeAPIReady SEBELUM inject script,
// inject sekali saja, dan resolve via polling window.YT (API boleh set window.YT
// tanpa memanggil callback kita jika callback dipasang terlambat).
let ytApiPromise = null

function loadYTApi() {
  if (ytApiPromise) return ytApiPromise

  ytApiPromise = new Promise((resolve, reject) => {
    const API_URL = 'https://www.youtube.com/iframe_api'
    const INJECT_TIMEOUT_MS = 15000
    const POLL_MS = 100

    // Guard dedup: retry lama meninggalkan banyak tag <script> iframe_api duplikat
    // saat attempt ladder; YouTube juga bisa resolve callback lama, bukan milik kita.
    let existing = document.querySelector(`script[src="${API_URL}"]`)
    if (existing && window.YT && window.YT.Player) {
      resolve(window.YT)
      return
    }
    if (!existing) {
      existing = document.createElement('script')
      existing.src = API_URL
      existing.async = true
      existing.onerror = () => {
        ytApiPromise = null // biarkan pemanggil berikutnya retry
        reject(new Error('YouTube IFrame API script gagal dimuat (network/CSP)'))
      }
      document.head.appendChild(existing)
    }

    // Pasang callback GLOBAL sebelum script selesai load. Jika API sudah load
    // tanpa memanggil callback (callback dipasang terlambat), polling menangkapnya.
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') {
        try {
          prev()
        } catch (_) {}
      }
      resolve(window.YT)
    }

    const startedAt = Date.now()
    const poll = setInterval(() => {
      if (window.YT && window.YT.Player) {
        clearInterval(poll)
        resolve(window.YT)
        return
      }
      if (Date.now() - startedAt > INJECT_TIMEOUT_MS) {
        clearInterval(poll)
        ytApiPromise = null
        reject(new Error('YouTube IFrame API load timeout (15s)'))
      }
    }, POLL_MS)
  })

  return ytApiPromise
}

export const YoutubeMusicProvider = ({ children }) => {
  const [isPlayerOpen, setIsPlayerOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playId, setPlayId] = useState(0)
  const [current, setCurrent] = useState({ id: '', title: '', artist: '', duration: '', thumbnail: '' })
  const [queue, setQueue] = useState([])
  const [playbackError, setPlaybackError] = useState(null)

  const playerRef = useRef(null)
  const readyRef = useRef(false)
  const pendingPlayRef = useRef(null)
  const initFailedRef = useRef(false)
  const queueRef = useRef([])
  const currentRef = useRef(current)

  useEffect(() => {
    queueRef.current = queue
  }, [queue])
  useEffect(() => {
    currentRef.current = current
  }, [current])

  const hostRef = useRef(null)
  // Boot player sekali. StrictMode double-mount aman: pemanggilan kedua loadYTApi()
  // reuse promise yang sama, dan instance player yang dibuat pada unmount pertama
  // DIBUANG (discard) agar tidak menimpa playerRef milik mount aktif.
  useEffect(() => {
    if (playerRef.current) return
    let cancelled = false
    const host = hostRef.current
    if (!host) return

    loadYTApi()
      .then((YT) => {
        if (cancelled || !hostRef.current || playerRef.current) return
        try {
          playerRef.current = new YT.Player(hostRef.current, {
            height: '100',
            width: '160',
            // TANPA autoplay: player boot kosong (belum ada videoId). autoplay:1
            // pada player kosong membuat YT menolaknya dengan onError(2)
            // "Video ID tidak valid" di log setiap boot. loadVideoById +
            // playVideo() eksplisit di loadIntoPlayer sudah memulai pemutaran.
            host: 'https://www.youtube-nocookie.com',
            playerVars: {
              rel: 0,
              enablejsapi: 1,
              origin: window.location.origin || 'http://localhost:1420'
            },
            events: {
              onReady: (e) => {
                if (cancelled) return
                readyRef.current = true
                if (pendingPlayRef.current) {
                  e.target.loadVideoById(pendingPlayRef.current)
                  pendingPlayRef.current = null
                }
              },
              onStateChange: (e) => {
                if (cancelled) return
                setIsPlaying(e.data === 1)
              },
              onError: (e) => {
                if (cancelled) return
                const REASONS = {
                  2: 'Video ID tidak valid.',
                  5: 'HTML5 player error.',
                  100: 'Video tidak ditemukan atau sudah dihapus.',
                  101: 'Video melarang pemutaran embedded — coba lagu lain.',
                  150: 'Video melarang pemutaran embedded — coba lagu lain.'
                }
                const msg = REASONS[e?.data] || `Player error ${e?.data ?? '?'}`
                console.error('[MusicEngine]', msg)
                setIsPlaying(false)
                setPlaybackError(msg)
              }
            }
          })
        } catch (err) {
          console.error('[MusicEngine] Gagal membuat player IFrame:', err?.message || err)
        }
      })
      .catch((err) => {
        initFailedRef.current = true
        if (!cancelled) console.error('[MusicEngine] Gagal inisialisasi IFrame:', err.message)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Renderer tidak memiliki cara patuh autoplay tanpa gesture di WebKitGTK;
  // playVideo() setelah loadVideoById cukup karena WebKitGTK di-set
  // media_playback_requires_user_gesture(false) di Rust shell (lib.rs).
  const loadIntoPlayer = useCallback((videoId) => {
    const p = playerRef.current
    if (p?.loadVideoById && readyRef.current) {
      setPlaybackError(null)
      p.loadVideoById(videoId)
      p.playVideo?.()
      setIsPlaying(true)
    } else {
      pendingPlayRef.current = videoId
      setPlaybackError(null)
    }
  }, [])

  const playTrack = useCallback(
    (item) => {
      if (!item?.id) return false
      // Engine mati total (API gagal dimuat) -> gagal eksplisit, JANGAN pura-pura
      // mengantrikan lagu yang tidak akan pernah diputar.
      if (initFailedRef.current) {
        console.error('[MusicEngine] playTrack ditolak: engine gagal inisialisasi.')
        return false
      }
      currentRef.current = item
      setCurrent(item)
      setQueue((q) => (q.some((x) => x.id === item.id) ? q : [...q, item]))
      loadIntoPlayer(item.id)
      setIsPlayerOpen(true)
      setPlayId((p) => p + 1)

      // Event Scrobbler untuk Last.fm & Web Scrobbler
      try {
        window.dispatchEvent(new CustomEvent('lastfm-track-playing', { detail: item }))
      } catch (_) {}

      // Auto-memory learning preferensi musik
      if (item.title) {
        getAllConfig()
          .then((cfg) => {
            if (cfg[0]?.aiAutoLearn !== false) {
              db.memory
                .where('type')
                .equals('preference')
                .filter((m) => m.summary === 'Music Preference' && m.memory.includes(item.title))
                .first()
                .then((existing) => {
                  if (!existing) {
                    insertMemory({
                      type: 'preference',
                      summary: 'Music Preference',
                      memory: `Pengguna mendengarkan musik: "${item.title}" oleh ${item.artist || 'Various Artists'}.`
                    }).catch(console.error)
                  }
                })
                .catch(console.error)
            }
          })
          .catch(console.error)
      }

      return true
    },
    [loadIntoPlayer]
  )

  const playUrl = useCallback(
    (url, initialTrack = null) => {
      const match = String(url || '').match(/[?&]v=([^&]+)/)
      const id = initialTrack?.id || match?.[1] || ''
      if (!id) {
        console.warn('[MusicEngine] playUrl tanpa video id:', url)
        return false
      }
      return playTrack({
        id,
        title: initialTrack?.title || 'Lagu Pilihan',
        artist: initialTrack?.artist || 'YouTube Music',
        duration: initialTrack?.duration || '',
        thumbnail: initialTrack?.thumbnail || (id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '')
      })
    },
    [playTrack]
  )

  const jump = useCallback(
    (dir) => {
      const q = queueRef.current
      if (q.length === 0) return false
      const cur = currentRef.current
      let i = q.findIndex((x) => x.id === cur?.id)
      i = i < 0 ? 0 : i + dir
      if (i >= q.length) i = 0
      if (i < 0) i = q.length - 1
      playTrack(q[i])
      return true
    },
    [playTrack]
  )

  const nextTrack = useCallback(() => jump(1), [jump])
  const prevTrack = useCallback(() => jump(-1), [jump])

  // Bukan no-op sunyi lagi: null berarti engine belum siap — konsumen bisa
  // melaporkan kegagalan ke user/AI alih-alih pura-pura sukses.
  const withPlayer = useCallback((fn) => {
    const p = playerRef.current
    if (!p || !readyRef.current) return null
    if (typeof p.playVideo !== 'function' || typeof p.pauseVideo !== 'function') return null
    return fn(p)
  }, [])

  const playPause = useCallback(() => {
    return withPlayer((p) => {
      const state = typeof p.getPlayerState === 'function' ? p.getPlayerState() : null
      if (state === 1) {
        p.pauseVideo()
        return 'paused'
      }
      p.playVideo()
      return 'playing'
    })
  }, [withPlayer])

  const pauseTrack = useCallback(() => withPlayer((p) => (p.pauseVideo(), true)), [withPlayer])
  const resumeTrack = useCallback(() => withPlayer((p) => (p.playVideo(), true)), [withPlayer])

  const togglePlayer = useCallback(() => setIsPlayerOpen((prev) => !prev), [])

  const musicUrl = current.id ? `https://music.youtube.com/watch?v=${current.id}` : 'https://music.youtube.com'

  const value = {
    musicUrl,
    playUrl,
    playId,
    isPlayerOpen,
    setIsPlayerOpen,
    togglePlayer,
    isPlaying,
    currentTrack: current,
    queue,
    nextTrack,
    prevTrack,
    playPause,
    pauseTrack,
    resumeTrack,
    playbackError
  }

  return (
    <YoutubeMusicContext.Provider value={value}>
      {children}
      {/* Host IFrame Embedded audio player: selalu aktif di background aplikasi tanpa popup OS */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
          left: '-9999px',
          bottom: '0',
          pointerEvents: 'none',
          opacity: 0.01
        }}
      >
        <div ref={hostRef} />
      </div>
    </YoutubeMusicContext.Provider>
  )
}

export const useYoutubeMusic = () => useContext(YoutubeMusicContext)
