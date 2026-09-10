import { useState, useContext, createContext, useRef, useCallback, useEffect } from 'react'
import { db, insertMemory, getAllConfig } from '../api/db'

/**
 * Mesin musik Abelink Linux — Embedded YouTube IFrame API Player.
 *
 * Murni embedded di dalam antarmuka aplikasi tanpa jendela popup OS eksternal:
 * - Audio dimainkan langsung via embedded YouTube Player API terisolasi.
 * - Riwayat pemutaran otomatis disinkronkan ke Last.fm & dipelajari ke Dexie db.memory.
 * - Kontrol playback lengkap (play, pause, next, prev, jump, volume).
 */

const YoutubeMusicContext = createContext()

let ytApiPromise = null
let ytApiLoadAttempts = 0
const MAX_YT_API_ATTEMPTS = 3
const YT_API_RETRY_DELAY = 2000
const YT_API_TIMEOUT = 5000

function loadYTApi() {
  if (ytApiPromise) return ytApiPromise

  ytApiPromise = new Promise((resolve, reject) => {
    const attemptLoad = (attempt) => {
      ytApiLoadAttempts = attempt
      if (window.YT && window.YT.Player) return resolve(window.YT)

      if (attempt >= MAX_YT_API_ATTEMPTS) {
        const timeoutId = setTimeout(() => {
          if (!window.YT || !window.YT.Player) {
            console.error('[YouTubeMusic] API load timeout')
            reject(new Error('YouTube IFrame API load timeout'))
          }
        }, YT_API_TIMEOUT)

        const prev = window.onYouTubeIframeAPIReady
        window.onYouTubeIframeAPIReady = () => {
          clearTimeout(timeoutId)
          if (typeof prev === 'function') prev()
          resolve(window.YT)
        }
        injectScript()
        return
      }

      setTimeout(() => attemptLoad(attempt + 1), YT_API_RETRY_DELAY)
    }

    const injectScript = () => {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true
      script.onerror = () => {}
      document.head.appendChild(script)
    }

    injectScript()
    attemptLoad(1)
  })
  return ytApiPromise
}

export const YoutubeMusicProvider = ({ children }) => {
  const [isPlayerOpen, setIsPlayerOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playId, setPlayId] = useState(0)
  const [current, setCurrent] = useState({ id: '', title: '', artist: '', duration: '', thumbnail: '' })
  const [queue, setQueue] = useState([])

  const playerRef = useRef(null)
  const readyRef = useRef(false)
  const pendingPlayRef = useRef(null)
  const queueRef = useRef([])
  const currentRef = useRef(current)

  useEffect(() => {
    queueRef.current = queue
  }, [queue])
  useEffect(() => {
    currentRef.current = current
  }, [current])

  const hostRef = useRef(null)
  useEffect(() => {
    if (playerRef.current || !hostRef.current) return
    loadYTApi()
      .then((YT) => {
        if (!hostRef.current) return
        playerRef.current = new YT.Player(hostRef.current, {
          height: '100',
          width: '160',
          playerVars: {
            autoplay: 1,
            rel: 0,
            origin: window.location.origin
          },
          events: {
            onReady: (e) => {
              readyRef.current = true
              if (pendingPlayRef.current) {
                e.target.loadVideoById(pendingPlayRef.current)
                pendingPlayRef.current = null
                setIsPlaying(true)
              }
            },
            onStateChange: (e) => {
              setIsPlaying(e.data === 1)
            }
          }
        })
      })
      .catch((err) => console.error('[MusicEngine] Gagal inisialisasi IFrame:', err.message))
  }, [])

  const loadIntoPlayer = useCallback((videoId) => {
    if (playerRef.current?.loadVideoById && readyRef.current) {
      playerRef.current.loadVideoById(videoId)
      setIsPlaying(true)
    } else {
      pendingPlayRef.current = videoId
    }
  }, [])

  const playTrack = useCallback(
    (item) => {
      if (!item?.id) return false
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
        getAllConfig().then((cfg) => {
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
      if (q.length === 0) return
      const cur = currentRef.current
      let i = q.findIndex((x) => x.id === cur?.id)
      i = i < 0 ? 0 : i + dir
      if (i >= q.length) i = 0
      if (i < 0) i = q.length - 1
      playTrack(q[i])
    },
    [playTrack]
  )

  const nextTrack = useCallback(() => jump(1), [jump])
  const prevTrack = useCallback(() => jump(-1), [jump])

  const playerCommand = useCallback((fn) => {
    const p = playerRef.current
    if (!p || !readyRef.current) return
    if (typeof p.playVideo !== 'function' || typeof p.pauseVideo !== 'function') return
    fn(p)
  }, [])

  const playPause = useCallback(() => {
    playerCommand((p) => {
      const state = typeof p.getPlayerState === 'function' ? p.getPlayerState() : null
      if (state === 1) p.pauseVideo()
      else p.playVideo()
    })
  }, [playerCommand])

  const pauseTrack = useCallback(() => playerCommand((p) => p.pauseVideo()), [playerCommand])
  const resumeTrack = useCallback(() => playerCommand((p) => p.playVideo()), [playerCommand])

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
    resumeTrack
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
