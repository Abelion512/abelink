import { useState, useContext, createContext, useRef, useCallback, useEffect } from 'react'
import { db, insertMemory, getAllConfig, saveConfiguration } from '../api/db'
import { nextPlaybackStep } from '../hooks/agent/musicQuery'

// 11-char video ID extractor (same space on youtube.com / music.youtube.com /
// youtu.be / shorts / embed / live). Engine-local copy (no hook import) so the
// provider never depends on agent-layer modules.
const VIDEO_ID = '([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])'
const extractEngineVideoId = (input) => {
  const s = String(input || '').trim()
  if (!s) return null
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s
  const patterns = [
    new RegExp('[?&]v=' + VIDEO_ID),
    new RegExp('youtu\\.be/' + VIDEO_ID),
    new RegExp('/(?:shorts|embed|live|v)/' + VIDEO_ID)
  ]
  for (const re of patterns) {
    const m = s.match(re)
    if (m) return m[1]
  }
  return null
}

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
  // Repeat contract (Stream A): 'off' | 'all' | 'one'. Persisted to db.config
  // (musicPlayback key); queue itself stays in-memory (track IDs go stale).
  const [repeatMode, setRepeatModeState] = useState('off')
  // oneLimit: null = infinite loop-one; number = remaining replays incl. current.
  const oneLimitRef = useRef(null)
  const repeatModeRef = useRef('off')
  const [lastMusicTrack, setLastMusicTrack] = useState(null)

  // Restore persisted repeatMode + lastTrack once on boot (fire-and-forget).
  useEffect(() => {
    getAllConfig()
      .then((cfg) => {
        const mp = cfg?.[0]?.musicPlayback
        if (mp && typeof mp === 'object') {
          if (mp.repeatMode === 'all' || mp.repeatMode === 'one' || mp.repeatMode === 'off') {
            setRepeatModeState(mp.repeatMode)
            repeatModeRef.current = mp.repeatMode
          }
          if (mp.lastTrack?.id) setLastMusicTrack(mp.lastTrack)
        }
      })
      .catch(() => {})
  }, [])

  const persistMusicPlayback = useCallback((patch) => {
    getAllConfig()
      .then((cfg) => {
        const prev = cfg?.[0]?.musicPlayback
        const merged = { ...(typeof prev === 'object' ? prev : {}), ...patch }
        saveConfiguration({ musicPlayback: merged }).catch(() => {})
      })
      .catch(() => {})
  }, [])

  const setRepeatMode = useCallback((mode, limit) => {
    const m = mode === 'one' || mode === 'all' || mode === 'off' ? mode : 'off'
    repeatModeRef.current = m
    setRepeatModeState(m)
    oneLimitRef.current = m === 'one' && Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null
    persistMusicPlayback({ repeatMode: m })
  }, [persistMusicPlayback])

  const cycleRepeatMode = useCallback(() => {
    const next = repeatModeRef.current === 'off' ? 'all' : repeatModeRef.current === 'all' ? 'one' : 'off'
    if (next === 'one') oneLimitRef.current = null // tombol = loop-one infinit
    repeatModeRef.current = next
    setRepeatModeState(next)
    persistMusicPlayback({ repeatMode: next })
    return next
  }, [persistMusicPlayback])

  const playerRef = useRef(null)
  const readyRef = useRef(false)
  const pendingPlayRef = useRef(null)
  const initFailedRef = useRef(false)
  const queueRef = useRef([])
  const currentRef = useRef(current)
  // Ref ke playTrack untuk onStateChange ENDED (callback YT dibuat sekali di
  // useEffect boot; tanpa ref ia menangkap closure basi).
  const playTrackRef = useRef(null)

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
              origin: window.location.origin || 'http://localhost:1420',
              iv_load_policy: 3, // Nonaktifkan anotasi video dan overlay sponsor/iklan
              modestbranding: 1, // Minimalisasi branding YouTube
              playsinline: 1,
              controls: 0,
              disablekb: 1,
              fs: 0
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

                // Auto-advance / repeat on track end (YT state 0). Pure decision
                // via nextPlaybackStep; execution below stays imperative.
                if (e.data === 0) {
                  try {
                    const q = queueRef.current
                    const step = nextPlaybackStep({
                      mode: repeatModeRef.current,
                      queue: q,
                      currentId: currentRef.current?.id || '',
                      oneLimit: oneLimitRef.current,
                      oneRemaining: oneLimitRef.current
                    })
                    // oneLimit bookkeeping: replay keeps it, advance/stop clears it.
                    if (step.oneRemaining !== undefined) oneLimitRef.current = step.oneRemaining
                    if (step.setMode) {
                      repeatModeRef.current = step.setMode
                      setRepeatModeState(step.setMode)
                    }
                    if (step.action === 'replay' || step.action === 'advance' || step.action === 'restart') {
                      if (Array.isArray(step.queue)) {
                        queueRef.current = step.queue
                        setQueue(step.queue)
                      }
                      // Placeholder Stream B ({id:'pending:Judul'}) tidak punya ID
                      // nyata — jangan pernah load ke player; lewati ke playable
                      // berikutnya, atau berhenti bila tidak ada.
                      const pool = Array.isArray(step.queue) ? step.queue : q
                      let target = pool.find((t) => t?.id === step.targetId) || null
                      if (target?.id && String(target.id).startsWith('pending:')) {
                        const from = pool.findIndex((t) => t?.id === step.targetId)
                        target = pool.slice(from + 1).find((t) => t?.id && !String(t.id).startsWith('pending:')) || null
                      }
                      if (target?.id) playTrackRef.current(target)
                      else setIsPlaying(false)
                    } else {
                      setIsPlaying(false)
                      if (Array.isArray(step.queue)) {
                        queueRef.current = step.queue
                        setQueue(step.queue)
                      }
                    }
                  } catch (_) {}
                  return
                }

                // Ad suppression: Jika mendeteksi durasi abnormal atau video ads di awal,
                // beberapa instansi iframe player memicu perubahan durasi / playback state.
                // Jika player menyediakan api getDuration atau video loaded berbeda, pastikan audio unmuted.
                try {
                  const target = e.target
                  if (e.data === 1 && typeof target.isMuted === 'function' && target.isMuted()) {
                    target.unMute()
                  }
                } catch (_) {}
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
      // Repeat contract: tiap item membawa repeat/repeatInit (default 1).
      const rep = Math.max(1, Number(item.repeat ?? 1) || 1)
      const withRepeat = { ...item, repeat: rep, repeatInit: Math.max(1, Number(item.repeatInit ?? rep) || 1) }
      currentRef.current = withRepeat
      setCurrent(withRepeat)
      setQueue((q) => (q.some((x) => x.id === withRepeat.id) ? q.map((x) => (x.id === withRepeat.id ? withRepeat : x)) : [...q, withRepeat]))
      loadIntoPlayer(withRepeat.id)
      setIsPlayerOpen(true)
      setPlayId((p) => p + 1)
      // Resume-last: catat track terakhir (persist, murah — satu key config).
      const last = { id: withRepeat.id, title: withRepeat.title || '', artist: withRepeat.artist || '', thumbnail: withRepeat.thumbnail || '' }
      setLastMusicTrack(last)
      persistMusicPlayback({ lastTrack: last })

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
    [loadIntoPlayer, persistMusicPlayback]
  )

  // Daftarkan playTrack ke ref SETELAH definisi (dipakai onStateChange ENDED).
  useEffect(() => {
    playTrackRef.current = playTrack
  }, [playTrack])

  const playUrl = useCallback(
    (url, initialTrack = null) => {
      // ID valid dari URL MENANG atas initialTrack (kontrak Stream B):
      // URL yang ditempel user adalah kebenaran, bukan tebakan search.
      const urlId = extractEngineVideoId(url)
      const id = urlId || initialTrack?.id || ''
      if (!id) {
        console.warn('[MusicEngine] playUrl tanpa video id:', url)
        return false
      }
      return playTrack({
        id,
        title: initialTrack?.title || 'Selected Song',
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
      // Placeholder Stream B ({id:'pending:Judul'}) tidak playable — lewati.
      const playable = q.filter((t) => t?.id && !String(t.id).startsWith('pending:'))
      if (playable.length === 0) return false
      let i = playable.findIndex((x) => x.id === cur?.id)
      i = i < 0 ? 0 : i + dir
      if (i >= playable.length) i = 0
      if (i < 0) i = playable.length - 1
      playTrack(playable[i])
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
    // Resume-last: engine siap tapi tidak ada track (mis. setelah reload) ->
    // muat lagu terakhir daripada no-op sunyi.
    if (!currentRef.current?.id && lastMusicTrack?.id && playerRef.current && readyRef.current) {
      playTrackRef.current?.(lastMusicTrack)
      return 'playing'
    }
    return withPlayer((p) => {
      const state = typeof p.getPlayerState === 'function' ? p.getPlayerState() : null
      if (state === 1) {
        p.pauseVideo()
        return 'paused'
      }
      p.playVideo()
      return 'playing'
    })
  }, [withPlayer, lastMusicTrack])

  const pauseTrack = useCallback(() => withPlayer((p) => (p.pauseVideo(), true)), [withPlayer])
  const resumeTrack = useCallback(() => withPlayer((p) => (p.playVideo(), true)), [withPlayer])

  const togglePlayer = useCallback(() => setIsPlayerOpen((prev) => !prev), [])

  const reorderQueue = useCallback((newQueue) => {
    if (Array.isArray(newQueue)) {
      setQueue(newQueue)
    }
  }, [])

  const removeFromQueue = useCallback((id) => {
    setQueue((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const enqueuePlaylist = useCallback((tracks = [], autoPlayFirst = true) => {
    if (!Array.isArray(tracks) || tracks.length === 0) return false
    const withRepeat = tracks
      .filter(Boolean)
      .map((t) => {
        // Pending track Stream B ({id:'pending:Judul'}) belum punya ID nyata:
        // simpan judul + repeat agar bisa di-resolve saat diputar.
        const rep = Math.max(1, Number(t.repeat ?? 1) || 1)
        return { ...t, repeat: rep, repeatInit: Math.max(1, Number(t.repeatInit ?? rep) || 1) }
      })
    setQueue((prev) => {
      const existingIds = new Set(prev.map((t) => t.id))
      const fresh = withRepeat.filter((t) => t && t.id && !existingIds.has(t.id))
      return [...prev, ...fresh]
    })
    if (autoPlayFirst && withRepeat[0]) {
      playTrack(withRepeat[0])
    }
    return true
  }, [playTrack])

  // Enqueue satu track dari agent (Stream B: music-queue-add).
  // Item boleh {title, repeat} tanpa id; id di-resolve saat diputar via search
  // oleh pemanggil (music-play saat antrean kosong) — di sini simpan apa adanya.
  const enqueueTrack = useCallback((track, autoPlayFirst = false) => {
    if (!track || (typeof track !== 'object')) return false
    return enqueuePlaylist([track], autoPlayFirst)
  }, [enqueuePlaylist])

  const previewSnippetTimeoutRef = useRef(null)
  const previewSnippet = useCallback((videoId, durationSec = 15) => {
    if (!videoId) return false
    loadIntoPlayer(videoId)
    setIsPlaying(true)
    if (previewSnippetTimeoutRef.current) {
      clearTimeout(previewSnippetTimeoutRef.current)
    }
    previewSnippetTimeoutRef.current = setTimeout(() => {
      pauseTrack()
    }, durationSec * 1000)
    return true
  }, [loadIntoPlayer, pauseTrack])

  const musicUrl = current.id ? `https://music.youtube.com/watch?v=${current.id}` : 'https://music.youtube.com'

  const value = {
    musicUrl,
    playUrl,
    playTrack,
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
    reorderQueue,
    removeFromQueue,
    enqueuePlaylist,
    enqueueTrack,
    repeatMode,
    setRepeatMode,
    cycleRepeatMode,
    lastMusicTrack,
    previewSnippet,
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
