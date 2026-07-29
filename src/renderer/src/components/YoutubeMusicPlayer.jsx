import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'

export const YoutubeMusicPlayer = () => {
  const {
    musicUrl, isPlayerOpen, togglePlayer,
    currentTrack, isPlaying, playbackError
  } = useYoutubeMusic()

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none max-w-[90vw]">
      <div className={`transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] origin-bottom-right w-full ${isPlayerOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        <div className="rounded-2xl overflow-hidden shadow-2xl shadow-black/40 border border-white/10 bg-base-300 max-w-[320px] min-w-0">
          <div className="flex items-center justify-between px-3 py-2 bg-base-200/80 backdrop-blur-sm border-b border-white/5">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></div>
              <span className="text-xs font-medium text-white/60 select-none">YouTube</span>
            </div>
            <div className="flex items-center gap-1">
              {playbackError && (
                <button
                  onClick={() => {
                    window.api.ytShow()
                    setTimeout(() => window.api.ytLoad(musicUrl || 'https://youtube.com'), 1000)
                  }}
                  className="btn btn-ghost btn-xs text-red-400 hover:text-red-300"
                  title="Login via browser"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <span className="text-[10px]">Login</span>
                </button>
              )}
              <button onClick={() => { window.api.ytHide(); togglePlayer() }} className="btn btn-ghost btn-xs btn-circle text-white/40 hover:text-white/80">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
              </button>
            </div>
          </div>
          <div className="px-3 py-2 bg-black/20">
            {currentTrack.title ? (
              <div className="text-white text-sm truncate font-medium">{currentTrack.title}</div>
            ) : (
              <div className="text-white/40 text-xs">No track playing</div>
            )}
            {currentTrack.artist && (
              <div className="text-white/50 text-xs truncate">{currentTrack.artist}</div>
            )}
          </div>
        </div>
      </div>
      <button
        onClick={togglePlayer}
        className={`group relative w-14 h-14 rounded-full flex items-center justify-center pointer-events-auto shadow-lg shadow-black/30 border border-white/10 transition-all duration-300 ease-out hover:scale-110 hover:shadow-xl hover:shadow-red-500/20 active:scale-95 ${isPlayerOpen ? 'bg-red-600 hover:bg-red-700 rotate-0' : 'bg-linear-to-br from-red-600 to-red-800 hover:from-red-500 hover:to-red-700'}`}
        title={isPlayerOpen ? 'Tutup Player' : 'Buka YouTube'}
      >
        {!isPlayerOpen && (
          <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping pointer-events-none" />
        )}
        {isPlayerOpen ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
        )}
      </button>
    </div>
  )
}