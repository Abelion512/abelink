import { useState, useContext, createContext, useRef, useCallback, useEffect } from 'react'

/**
 * Mesin musik MARK Linux — pengganti total pendekatan <webview> Electron.
 *
 * Kenapa ditulis ulang: <webview> adalah elemen khusus Electron yang tidak
 * dikenal WebKitGTK (Tauri), sehingga seluruh kontrol (loadURL/
 * executeJavaScript) mati diam-diam. Sekarang: audio-only player resmi via
 * YouTube IFrame API + antrean milik kita; metadata lagu datang dari hasil
 * pencarian ternormalisasi (bukan scraping DOM halaman YouTube Music).
 *
 * Kontrak yang dipertahankan agar konsumen lama tak rusak:
 * - playUrl(watchUrl, initialTrack) — url tipe watch?v=ID
 * - nextTrack / prevTrack / playPause / pauseTrack / resumeTrack
 * - isPlaying, currentTrack {id,title,artist,duration,thumbnail}, playId,
 *   isPlayerOpen/setIsPlayerOpen/togglePlayer
 * - musicUrl (read-only compat: watch URL lagu terakhir)
 */

const YoutubeMusicContext = createContext()

// Muat IFrame API sekali untuk seluruh aplikasi (promise di-cache modul-level).
let ytApiPromise = null
function loadYTApi() {
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) return resolve(window.YT)
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev()
      resolve(window.YT)
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => reject(new Error('Gagal memuat YouTube IFrame API'))
    document.head.appendChild(script)
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

  // Mirror refs supaya fungsi kontrol stabil tanpa perlu re-create callback.
  useEffect(() => {
    queueRef.current = queue
  }, [queue])
  useEffect(() => {
    currentRef.current = current
  }, [current])

  // Boot player sekali (audio-only, disembunyikan dari layout).
  const hostRef = useRef(null)
  useEffect(() => {
    if (playerRef.current || !hostRef.current) return
    loadYTApi()
      .then((YT) => {
        if (!hostRef.current) return
        playerRef.current = new YT.Player(hostRef.current, {
          height: '90',
          width: '160',
          playerVars: { autoplay: 0, rel: 0 },
          events: {
            onReady: (e) => {
              readyRef.current = true
              if (pendingPlayRef.current) {
                e.target.loadVideoById(pendingPlayRef.current)
                pendingPlayRef.current = null
                setIsPlaying(true)
              }
            },
            onStateChange: (e) => setIsPlaying(e.data === 1)
          }
        })
      })
      .catch((err) => console.error('[MusicEngine]', err.message))
  }, [])

  const loadIntoPlayer = useCallback((videoId) => {
    if (playerRef.current && readyRef.current) {
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
      return true
    },
    [loadIntoPlayer]
  )

  /**
   * Kompatibel dgn pemanggil lama: url watch?v=ID + metadata opsional.
   * Dipakai handleMusic (useMarkMusic), listener WA, dan tombol UI.
   * Di Tauri, pakai iframe YouTube Music via window.open / browser.
   */
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
        title: initialTrack?.title || 'Lagu',
        artist: initialTrack?.artist || '',
        duration: initialTrack?.duration || '',
        thumbnail: initialTrack?.thumbnail || ''
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
      if (i >= q.length) i = 0 // wrap-around: cocok utk sesi chill
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

  // Compat: string watch URL lagu terakhir (ada konsumen lama yang membaca ini).
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
      {/* Host player audio-only: tetap hidup walau panel ditutup.
          allow attribute penting untuk autoplay + encrypted-media di WebKitGTK/Linux. */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          width: 1,
          height: 1,
          overflow: 'hidden',
          left: -9999,
          bottom: 0,
          pointerEvents: 'none',
          opacity: 0.01
        }}
        allow="autoplay; encrypted-media; fullscreen"
      >
        <div ref={hostRef} />
      </div>
    </YoutubeMusicContext.Provider>
  )
}

export const useYoutubeMusic = () => useContext(YoutubeMusicContext)
