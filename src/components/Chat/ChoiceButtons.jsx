import React, { useState, useRef } from 'react'
import { Check, Play, Pause, Music } from 'lucide-react'
import { resolveChoice } from '../../api/choiceBus'

// Tombol opsi ask-choice — satu-satunya sumber UI pilihan (dipakai
// MessageBubble di chat DAN ResponseArea di home). Klik me-resolve janji
// choiceBus sehingga loop agent lanjut otomatis, tanpa ketik.
// Mendukung rendering kartu multimodal/music preview jika rawOptions membawa metadata.
export const ChoiceButtons = React.memo(({ choice }) => {
  if (!choice || !Array.isArray(choice.options) || choice.options.length === 0) return null

  const isMusicChoice = choice.type === 'music_preview' || (Array.isArray(choice.rawOptions) && choice.rawOptions.some(o => o && typeof o === 'object' && (o.thumbnail || o.artist || o.duration)))
  const [playingAudio, setPlayingAudio] = useState(null)
  const audioRef = useRef(null)

  const togglePreview = (e, audioUrl) => {
    e.stopPropagation()
    if (!audioUrl) return
    if (playingAudio === audioUrl) {
      audioRef.current?.pause()
      setPlayingAudio(null)
    } else {
      if (audioRef.current) {
        audioRef.current.src = audioUrl
        audioRef.current.play().catch(() => {})
      }
      setPlayingAudio(audioUrl)
    }
  }

  return (
    <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-white/10 w-full">
      <audio
        ref={audioRef}
        onEnded={() => setPlayingAudio(null)}
        onError={() => setPlayingAudio(null)}
        className="hidden"
      />
      <span className="text-[10px] font-bold opacity-50 w-full uppercase tracking-wider">
        {choice.selected != null ? 'Pilihan Anda:' : isMusicChoice ? 'Pilih Track Musik:' : 'Pilih satu:'}
      </span>

      {isMusicChoice ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
          {choice.options.map((opt, i) => {
            const raw = choice.rawOptions?.[i] || {}
            const isSelected = choice.selected === opt
            const done = choice.selected != null
            const title = typeof raw === 'object' ? raw.title || opt : opt
            const artist = typeof raw === 'object' ? raw.artist : ''
            const duration = typeof raw === 'object' ? raw.duration : ''
            const thumb = typeof raw === 'object' ? raw.thumbnail : ''
            const previewUrl = typeof raw === 'object' ? raw.previewUrl || raw.preview_url || raw.audioUrl : null

            return (
              <div
                key={i}
                onClick={() => !done && resolveChoice(choice.id, opt)}
                className={`p-2.5 rounded-xl border flex items-center gap-3 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-primary/20 border-primary shadow-sm shadow-primary/20 ring-1 ring-primary'
                    : 'bg-white/5 border-white/10 hover:border-primary/40 hover:bg-white/10'
                } ${done && !isSelected ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt=""
                    className="w-11 h-11 rounded-lg object-cover border border-white/10 flex-shrink-0"
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                  />
                ) : (
                  <div className="w-11 h-11 rounded-lg bg-base-200 border border-white/5 flex items-center justify-center flex-shrink-0">
                    <Music className="w-5 h-5 text-white/40" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-semibold text-white truncate" title={title}>
                      {title}
                    </p>
                    {isSelected && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0 ml-auto" />}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-white/50">
                    {artist && <span className="truncate max-w-[120px]">{artist}</span>}
                    {duration && <span>• {duration}</span>}
                  </div>
                </div>

                {previewUrl && (
                  <button
                    type="button"
                    onClick={(e) => togglePreview(e, previewUrl)}
                    className="btn btn-ghost btn-xs btn-circle text-white/70 hover:text-white"
                    title={playingAudio === previewUrl ? 'Pause preview' : 'Play preview'}
                  >
                    {playingAudio === previewUrl ? (
                      <Pause className="w-3.5 h-3.5 text-primary" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {choice.options.map((opt, i) => {
            const isSelected = choice.selected === opt
            const done = choice.selected != null
            return (
              <button
                key={i}
                disabled={done}
                onClick={() => resolveChoice(choice.id, opt)}
                className={`btn btn-xs normal-case text-[11px] flex items-center gap-1.5 border transform transition hover:scale-105 ${
                  isSelected
                    ? 'btn-primary border-primary'
                    : 'btn-neutral bg-base-300 border-primary/20 hover:border-primary/50'
                } ${done && !isSelected ? 'opacity-40' : ''}`}
                title={opt}
              >
                {isSelected && <Check className="w-3 h-3" />}
                <span className="truncate max-w-[220px]">{opt}</span>
              </button>
            )
          })}
        </div>
      )}

      {choice.selected == null && (
        <div className="flex justify-end mt-1">
          <button
            onClick={() => resolveChoice(choice.id, null)}
            className="btn btn-xs btn-ghost normal-case text-[10px] text-white/50 hover:text-white"
          >
            Batal
          </button>
        </div>
      )}
    </div>
  )
})
