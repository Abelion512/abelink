import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'

export const YoutubeMusicPlayer = () => {
  const {
    musicUrl, isPlayerOpen, togglePlayer,
    currentTrack, isPlaying, playbackError,
    prevTrack, nextTrack, playPause
  } = useYoutubeMusic()

  const isActive = isPlaying || currentTrack.title

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2 pointer-events-none">
      {/* YouTube icon button — always visible when playing */}
      {isActive && (
        <button
          onClick={togglePlayer}
          className={`w-11 h-11 rounded-full flex items-center justify-center pointer-events-auto transition-all duration-300
            shadow-lg shadow-black/30 border border-white/10
            ${isPlayerOpen
              ? 'bg-red-600 hover:bg-red-700 rotate-0'
              : 'bg-gradient-to-br from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 active:scale-90'}`}
          title={isPlayerOpen ? 'Tutup Player' : 'Buka YouTube'}
        >
          {/* YouTube play icon */}
          <svg viewBox="0 0 24 24" width="18" height="18" fill="white">
            <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0C.488 3.45.029 5.804 0 12c.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0C23.512 20.55 23.971 18.196 24 12c-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 4-8 4z"/>
          </svg>
        </button>
      )}

      {/* Hologram card — expands from bottom right */}
      <div className={`pointer-events-auto transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] origin-bottom-right
        ${isPlayerOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none h-0 overflow-hidden'}`}>
        <div className="rounded-2xl overflow-hidden shadow-2xl shadow-black/40 border border-white/10 bg-base-300/95 backdrop-blur-xl min-w-[280px] max-w-[320px]">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 glass glass-hover border-b border-[var(--glass-border)]">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
              <span className="text-[11px] font-medium text-white/50 uppercase tracking-wider">YouTube</span>
            </div>
            <div className="flex items-center gap-1">
              {playbackError && (
                <button onClick={() => { window.api.ytShow(); setTimeout(() => window.api.ytLoad(musicUrl || 'https://youtube.com'), 1000) }}
                  className="btn btn-ghost btn-xs text-red-400 hover:text-red-300" title="Login">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </button>
              )}
              <button onClick={() => { window.api.ytHide(); togglePlayer() }}
                className="text-white/30 hover:text-white/70 transition-colors p-0.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
              </button>
            </div>
          </div>

          {/* Now Playing */}
          <div className="px-3 py-2.5">
            <div className="flex items-center gap-3">
              {/* Thumbnail mini */}
              <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 glass">
                {currentTrack.thumbnail ? (
                  <img src={currentTrack.thumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/30">
                      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                    </svg>
                  </div>
                )}
              </div>
              {/* Track info */}
              <div className="min-w-0 flex-1">
                {currentTrack.title ? (
                  <>
                    <p className="text-white text-sm font-medium truncate">{currentTrack.title}</p>
                    <p className="text-white/40 text-xs truncate">{currentTrack.artist || 'Unknown'}</p>
                  </>
                ) : (
                  <p className="text-white/30 text-xs">No track playing</p>
                )}
              </div>
            </div>

            {/* Queue preview — muncul kalau ada queue */}
            {/* queue tracks akan di-render di sini nanti */}

            {/* Controls */}
            <div className="flex items-center justify-center gap-3 mt-3">
              <button onClick={prevTrack} className="text-white/50 hover:text-white transition-colors p-1" title="Previous">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
              </button>
              <button onClick={playPause} className="w-8 h-8 rounded-full glass glass-hover flex items-center justify-center transition-all" title="Play/Pause">
                {isPlaying ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                )}
              </button>
              <button onClick={nextTrack} className="text-white/50 hover:text-white transition-colors p-1" title="Next">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default YoutubeMusicPlayer
