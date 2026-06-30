import React from 'react';
import { useYoutubeMusic } from '../../contexts/YoutubeMusicContext';
import { FaPlay, FaPause, FaStepForward, FaStepBackward, FaMusic } from 'react-icons/fa';

const NowPlayingWidget = () => {
  const { isPlaying, currentTrack, playPause, nextTrack, prevTrack, isPlayerOpen, togglePlayer } = useYoutubeMusic();

  if (!currentTrack || !currentTrack.title) return null;

  return (
    <div 
      className={`fixed bottom-8 left-8 z-40 transition-all duration-500 ease-out transform ${
        (isPlaying || isPlayerOpen) ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0 pointer-events-none'
      }`}
    >
      <div className="flex items-center gap-3 bg-[var(--glass-bg)] backdrop-blur-xl border border-[var(--glass-border)] rounded-2xl p-2.5 pr-4 shadow-[0_8px_32px_rgba(0,0,0,0.3)] hover:border-primary/30 transition-colors">
        
        {/* Album Art Placeholder / Icon */}
        <div 
          className="w-10 h-10 rounded-xl bg-base-300 flex items-center justify-center border border-white/5 cursor-pointer hover:bg-base-200 transition-colors"
          onClick={togglePlayer}
          title="Buka Player Utama"
        >
          {isPlaying ? (
            <div className="flex items-end gap-0.5 h-4">
              <span className="w-1 bg-success rounded-full animate-[music-bar_1s_ease-in-out_infinite]" style={{ animationDelay: '0.1s' }} />
              <span className="w-1 bg-success rounded-full animate-[music-bar_1.2s_ease-in-out_infinite]" style={{ animationDelay: '0.3s' }} />
              <span className="w-1 bg-success rounded-full animate-[music-bar_0.8s_ease-in-out_infinite]" style={{ animationDelay: '0.2s' }} />
            </div>
          ) : (
            <FaMusic className="text-white/40 text-sm" />
          )}
        </div>

        {/* Track Info */}
        <div className="flex flex-col justify-center max-w-[150px]">
          <span className="text-xs font-semibold text-white truncate w-full" title={currentTrack.title}>
            {currentTrack.title}
          </span>
          <span className="text-[10px] text-white/50 truncate w-full" title={currentTrack.artist}>
            {currentTrack.artist}
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 pl-2 border-l border-white/10 ml-1">
          <button 
            onClick={prevTrack}
            className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <FaStepBackward size={10} />
          </button>
          
          <button 
            onClick={playPause}
            className="p-2 bg-primary/20 text-primary hover:bg-primary/40 rounded-lg transition-colors"
          >
            {isPlaying ? <FaPause size={12} /> : <FaPlay size={12} className="ml-0.5" />}
          </button>

          <button 
            onClick={nextTrack}
            className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <FaStepForward size={10} />
          </button>
        </div>

      </div>
    </div>
  );
};

export default NowPlayingWidget;
