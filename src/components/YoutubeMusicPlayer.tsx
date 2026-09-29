import { useEffect, useRef, useState } from 'react'
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'
import { GripVertical, Trash2, ListMusic, Music2, Repeat, Repeat1 } from 'lucide-react'

/**
 * Kartu "Now Playing" — antarmuka musik gaya Apple Dark Glass minimalis.
 * Menampilkan kontrol lagu aktif dan antrean (Queue) yang mendukung drag-and-drop reorder.
 */
export const YoutubeMusicPlayer = () => {
  const {
    isPlayerOpen,
    setIsPlayerOpen,
    togglePlayer,
    isPlaying,
    currentTrack,
    queue,
    nextTrack,
    prevTrack,
    playUrl,
    playTrack,
    playPause,
    reorderQueue,
    removeFromQueue,
    repeatMode,
    cycleRepeatMode,
    playbackError
  } = useYoutubeMusic()

  const [draggedIndex, setDraggedIndex] = useState(null)
  const [showQueue, setShowQueue] = useState(false)

  // Thumbnail YT Music (lh3.googleusercontent) sering 429 (rate limit).
  // Gagal -> fallback ke thumbnail default img.youtube.com -> gagal lagi -> placeholder.
  // Reset-on-track-change via adjust-during-render (pola resmi React):
  // bandingkan key saat render, bukan setState di effect.
  const [thumbFailed, setThumbFailed] = useState(false)
  const [prevThumbKey, setPrevThumbKey] = useState(null)
  const thumbKey = `${currentTrack.id}::${currentTrack.thumbnail}`
  if (thumbKey !== prevThumbKey) {
    setPrevThumbKey(thumbKey)
    if (thumbFailed) setThumbFailed(false)
  }

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
                {isPlaying ? 'Now Playing' : 'YouTube Music'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowQueue(!showQueue)}
                className={`btn btn-ghost btn-xs btn-circle ${showQueue ? 'text-primary bg-primary/20' : 'text-white/60 hover:text-white'}`}
                title={showQueue ? 'Close Queue' : 'Open Song Queue'}
              >
                <ListMusic className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsPlayerOpen(false)}
                className="btn btn-ghost btn-xs btn-circle text-white/60 hover:text-white/80"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body: Mode Antrean atau Kontrol Utama */}
          {showQueue ? (
            <div className="p-3 max-h-[280px] overflow-y-auto space-y-2 select-none">
              <div className="flex items-center justify-between pb-1.5 border-b border-white/5">
                <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">Song Queue ({queue.length})</span>
                <span className="text-[10px] text-white/40">Drag to reorder</span>
              </div>
              {queue.length === 0 ? (
                <div className="py-6 text-center text-xs text-white/40">No songs in queue</div>
              ) : (
                queue.map((track, idx) => {
                  const isCur = track.id === currentTrack.id
                  return (
                    <div
                      key={track.id || idx}
                      draggable
                      onDragStart={() => setDraggedIndex(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault()
                        if (draggedIndex === null || draggedIndex === idx) return
                        const newQ = [...queue]
                        const [moved] = newQ.splice(draggedIndex, 1)
                        newQ.splice(idx, 0, moved)
                        reorderQueue(newQ)
                        setDraggedIndex(null)
                      }}
                      className={`group flex items-center gap-2 p-1.5 rounded-xl border transition-all ${
                        isCur
                          ? 'bg-primary/20 border-primary/40 text-white'
                          : 'bg-white/5 border-white/5 hover:bg-white/10 text-white/80'
                      }`}
                    >
                      <div className="cursor-grab active:cursor-grabbing text-white/30 hover:text-white/70">
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>
                      <div
                        onClick={() => playTrack(track)}
                        className="flex-1 min-w-0 cursor-pointer"
                      >
                        <p className="text-xs font-medium truncate">{track.title || 'Song'}</p>
                        <p className="text-[10px] text-white/50 truncate">{track.artist || 'Artist'}</p>
                      </div>
                      {isCur && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/30 text-primary font-semibold">
                          PLAYING
                        </span>
                      )}
                      {Number(track.repeat ?? 1) > 1 && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-white/70 font-semibold" title={`Repeats ${track.repeat}x`}>
                          x{track.repeat}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          removeFromQueue(track.id)
                        }}
                        className="opacity-0 group-hover:opacity-100 btn btn-ghost btn-xs btn-circle text-white/40 hover:text-red-400"
                        title="Remove from queue"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          ) : (
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                {currentTrack.thumbnail && !thumbFailed ? (
                  <img
                    src={currentTrack.thumbnail}
                    alt=""
                    onError={(e) => {
                      const img = e.currentTarget
                      const fallback = currentTrack.id ? `https://img.youtube.com/vi/${currentTrack.id}/hqdefault.jpg` : ''
                      if (fallback && !img.src.includes('img.youtube.com')) {
                        img.src = fallback
                      } else {
                        setThumbFailed(true)
                      }
                    }}
                    className="w-14 h-14 rounded-lg object-cover border border-white/10"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-base-200 border border-white/5 flex items-center justify-center">
                    <Music2 className="w-6 h-6 text-white/40" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate" title={currentTrack.title}>
                    {currentTrack.title || 'No song yet'}
                  </p>
                  <p className="text-xs text-white/60 truncate">{currentTrack.artist || 'Pick a song via chat'}</p>
                </div>
              </div>

              <div className="flex items-center justify-center gap-4 pt-1">
                <button onClick={prevTrack} className="btn btn-ghost btn-sm btn-circle text-white/70 hover:text-white" title="Previous">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
                </button>
                <button onClick={playPause} className="btn btn-circle bg-red-600 hover:bg-red-700 border-none text-white shadow-lg shadow-red-500/20" title={isPlaying ? 'Pause' : 'Play'}>
                  {isPlaying ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  )}
                </button>
                <button onClick={nextTrack} className="btn btn-ghost btn-sm btn-circle text-white/70 hover:text-white" title="Next">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z" /></svg>
                </button>
                {/* Repeat mode cycle: Off -> All -> One (icon Repeat / Repeat1) */}
                <button
                  onClick={cycleRepeatMode}
                  className={`btn btn-ghost btn-sm btn-circle relative ${repeatMode === 'off' ? 'text-white/30 hover:text-white/60' : 'text-primary'}`}
                  title={repeatMode === 'one' ? 'Repeat: this track (click for Off)' : repeatMode === 'all' ? 'Repeat: all (click for One)' : 'Repeat: off (click for All)'}
                >
                  {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
                  {repeatMode !== 'off' && (
                    <span className="absolute -top-0.5 -right-0.5 text-[8px] font-mono font-bold px-1 rounded-full bg-primary text-white leading-tight">
                      {repeatMode === 'one' ? '1' : 'A'}
                    </span>
                  )}
                </button>
              </div>

              {playbackError && (
                <p className="text-[11px] text-red-400/90 leading-snug bg-red-500/10 rounded-md px-2 py-1.5 border border-red-500/20">
                  {playbackError}
                </p>
              )}

              <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-white/60">
                <span className="truncate flex items-center gap-1">
                  <Music2 className="w-3 h-3 text-red-400" />
                  {queue.length > 0 ? `${queue.length} in queue` : 'Queue empty'}
                  {repeatMode !== 'off' && (
                    <span className="font-mono text-[10px] text-primary"> · {repeatMode === 'one' ? 'Repeat One' : 'Repeat All'}</span>
                  )}
                </span>
                <button
                  onClick={() => setShowQueue(true)}
                  className="text-primary hover:underline font-mono text-[10px]"
                >
                  Manage Queue
                </button>
              </div>
            </div>
          )}
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
        title={isPlayerOpen ? 'Close Player' : 'Open YouTube Music'}
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
