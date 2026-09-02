import { useEffect, useRef } from 'react'
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'

/**
 * Kartu "Now Playing" — pengganti panel <webview> Electron.
 * Audio dimainkan oleh IFrame Player API tersembunyi (lihat Context);
 * kartu ini murni tampilan metadata + kontrol antrean milik kita.
 */
export const YoutubeMusicPlayer = () => {
  const {
    isPlayerOpen,
    setIsPlayerOpen,
    togglePlayer,
    isPlaying,
    currentTrack,
    nextTrack,
    prevTrack,
    playUrl,
    playPause
  } = useYoutubeMusic()

  // Ref agar listener IPC selalu memanggil versi fungsi terbaru
  const playUrlRef = useRef(playUrl)
  const nextTrackRef = useRef(nextTrack)
  const prevTrackRef = useRef(prevTrack)
  const playPauseRef = useRef(playPause)

  useEffect(() => {
    playUrlRef.current = playUrl
    nextTrackRef.current = nextTrack
    prevTrackRef.current = prevTrack
    playPauseRef.current = playPause
  }, [playUrl, nextTrack, prevTrack, playPause])

  useEffect(() => {
    if (window.api?.onExecuteMusicCommand) {
      window.api.onExecuteMusicCommand((command, payload) => {
        if (command === 'play' && payload) {
          // Payload kompatibel dua bentuk: url string ATAU item ternormalisasi.
          if (typeof payload === 'string') playUrlRef.current(payload)
          else playUrlRef.current(`https://music.youtube.com/watch?v=${payload.id}`, payload)
        } else if (command === 'next') nextTrackRef.current()
        else if (command === 'prev') prevTrackRef.current()
        else if (command === 'toggle') playPauseRef.current()
      })
    }
    if (window.api?.onExecuteMusicCommandWa) {
      window.api.onExecuteMusicCommandWa((command, payload) => {
        if (command === 'play' && payload) {
          // Payload WA berupa string query — cari lalu mainkan teratas.
          window.api.searchMusic(payload).then((music) => {
            const top = music && music.length > 0 ? music[0] : null
            if (top) playUrlRef.current(`https://music.youtube.com/watch?v=${top.id}`, top)
          })
        } else if (command === 'next') nextTrackRef.current()
        else if (command === 'prev') prevTrackRef.current()
        else if (command === 'toggle') playPauseRef.current()
      })
    }
  }, [])

  return (
    <div className="fixed bottom-6 right-6 z-[120] flex flex-col items-end gap-3 pointer-events-none">
      {/* Panel Now Playing */}
      <div
        className={`
          transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] origin-bottom-right
          ${
            isPlayerOpen
              ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
              : 'opacity-0 scale-75 translate-y-4 pointer-events-none'
          }
        `}
      >
        <div className="w-[300px] rounded-2xl overflow-hidden shadow-2xl shadow-black/40 border border-white/10 bg-base-300">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 bg-base-200/80 backdrop-blur-sm border-b border-white/5">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${isPlaying ? 'bg-red-500 animate-pulse' : 'bg-white/30'}`}></div>
              <span className="text-xs font-medium text-white/60 select-none">
                {isPlaying ? 'Sedang Memutar' : 'YouTube Music'}
              </span>
            </div>
            <button
              onClick={() => setIsPlayerOpen(false)}
              className="btn btn-ghost btn-xs btn-circle text-white/40 hover:text-white/80"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </div>

          {/* Metadata + kontrol */}
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              {currentTrack.thumbnail ? (
                <img src={currentTrack.thumbnail} alt="" className="w-14 h-14 rounded-lg object-cover border border-white/10" />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-base-200 border border-white/5 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="white" className="opacity-40">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                  </svg>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate" title={currentTrack.title}>
                  {currentTrack.title || 'Belum ada lagu'}
                </p>
                <p className="text-xs text-white/50 truncate">{currentTrack.artist || 'Pilih lagu lewat chat'}</p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 pt-1">
              <button onClick={prevTrack} className="btn btn-ghost btn-sm btn-circle text-white/70 hover:text-white" title="Sebelumnya">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
              </button>
              <button onClick={playPause} className="btn btn-circle bg-red-600 hover:bg-red-700 border-none text-white shadow-lg shadow-red-500/20" title={isPlaying ? 'Jeda' : 'Putar'}>
                {isPlaying ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>
              <button onClick={nextTrack} className="btn btn-ghost btn-sm btn-circle text-white/70 hover:text-white" title="Selanjutnya">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z" /></svg>
              </button>
            </div>

            {currentTrack.id && (
              <a
                href={`https://music.youtube.com/watch?v=${currentTrack.id}`}
                target="_blank"
                rel="noreferrer"
                className="block text-center text-[11px] text-white/40 hover:text-primary transition-colors"
              >
                Buka di YouTube Music ↗
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Floating Action Button */}
      <button
        onClick={togglePlayer}
        className={`
          group relative w-14 h-14 rounded-full flex items-center justify-center pointer-events-auto
          shadow-lg shadow-black/30 border border-white/10
          transition-all duration-300 ease-out
          hover:scale-110 hover:shadow-xl hover:shadow-red-500/20
          active:scale-95
          ${
            isPlayerOpen
              ? 'bg-red-600 hover:bg-red-700 rotate-0'
              : 'bg-linear-to-br from-red-600 to-red-800 hover:from-red-500 hover:to-red-700'
          }
        `}
        title={isPlayerOpen ? 'Tutup Player' : 'Buka YouTube Music'}
      >
        {!isPlayerOpen && (
          <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping pointer-events-none" />
        )}

        {isPlayerOpen ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" className="transition-transform duration-300 group-hover:scale-110">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
        )}
      </button>
    </div>
  )
}
