import React, { useState, useEffect } from 'react';

const CubeVisualizer = ({ status = 'idle', intensity = 0, mood = 'neutral' }) => {
  // Single state object — 1 setState per mood/status change, bukan 3 (hemat re-render)
  const [theme, setTheme] = useState({ glass: 'from-white/40 to-white/5', glow: 'bg-white/40', border: 'border-white/30' });

  useEffect(() => {
    if (status === 'error') {
      setTheme({ glass: 'from-red-500/40 to-red-600/10', glow: 'bg-red-500/50', border: 'border-red-400/50' });
    } else if (status === 'playing') {
      setTheme({ glass: 'from-purple-500/40 to-violet-600/10', glow: 'bg-purple-500/50', border: 'border-purple-400/50' });
    } else {
      switch (mood) {
        case 'joy':
          setTheme({ glass: 'from-yellow-300/40 to-yellow-500/10', glow: 'bg-yellow-400/50', border: 'border-yellow-400/50' });
          break;
        case 'sadness':
          setTheme({ glass: 'from-blue-500/40 to-blue-700/10', glow: 'bg-blue-500/50', border: 'border-blue-400/50' });
          break;
        case 'fear':
          setTheme({ glass: 'from-purple-500/40 to-purple-700/10', glow: 'bg-purple-500/50', border: 'border-purple-400/50' });
          break;
        case 'anger':
          setTheme({ glass: 'from-red-500/40 to-red-700/10', glow: 'bg-red-500/50', border: 'border-red-400/50' });
          break;
        case 'disgust':
          setTheme({ glass: 'from-teal-400/30 to-cyan-600/10', glow: 'bg-teal-500/40', border: 'border-teal-400/40' });
          break;
        case 'anxiety':
          setTheme({ glass: 'from-orange-400/40 to-orange-600/10', glow: 'bg-orange-500/50', border: 'border-orange-500/50' });
          break;
        case 'envy':
          setTheme({ glass: 'from-teal-400/40 to-teal-600/10', glow: 'bg-teal-500/50', border: 'border-teal-400/50' });
          break;
        case 'embarrassment':
          setTheme({ glass: 'from-pink-400/40 to-pink-600/10', glow: 'bg-pink-500/50', border: 'border-pink-400/50' });
          break;
        case 'ennui':
          setTheme({ glass: 'from-gray-400/40 to-gray-600/10', glow: 'bg-gray-500/50', border: 'border-gray-400/50' });
          break;
        default: // neutral — default stays neutral (not green)
          setTheme({ glass: 'from-white/40 to-white/5', glow: 'bg-white/40', border: 'border-white/30' });
          break;
      }
    }
  }, [mood, status]);

  // Calculate dynamic scale based on state
  let targetScale = 1;
  if (status === 'thinking') targetScale = 1.15;
  else if (status === 'nudge') targetScale = 1.05;
  else if (status === 'speaking') targetScale = 1 + intensity * 0.4;
  // playing: no scale change (default 1)
  else targetScale = 1;

  // 24 = 6rem = 96px, so translateZ is 48px
  const faceClass = `absolute inset-0 m-auto w-24 h-24 rounded-2xl border ${theme.border} bg-gradient-to-br ${theme.glass} shadow-[inset_0_0_20px_rgba(255,255,255,0.2)] flex items-center justify-center`;
  const innerFaceClass = `absolute inset-0 m-auto w-10 h-10 bg-white shadow-[0_0_15px_rgba(255,255,255,0.9)]`;

  return (
    <>
      <style>
        {`
          @keyframes cube-spin {
            0% { transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg); }
            100% { transform: rotateX(360deg) rotateY(720deg) rotateZ(360deg); }
          }
          @keyframes cube-spin-reverse {
            0% { transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg); }
            100% { transform: rotateX(-360deg) rotateY(-720deg) rotateZ(-360deg); }
          }
        `}
      </style>
      <div className={`relative shrink-0 w-36 h-36 flex items-center justify-center my-8 [perspective:1000px]`}>
        
        {/* Layer 1: Constant Breathing Wrapper - NEVER swapped out so it never snaps */}
        <div className="relative w-full h-full flex items-center justify-center animate-[orb-breathe_5s_ease-in-out_infinite] will-change-transform">
          
          {/* Layer 2: State & Audio Scaler - Smooth transition speed based on state */}
          <div 
            className="relative w-full h-full flex items-center justify-center ease-out will-change-transform"
            style={{ 
              transitionProperty: 'transform',
              transitionDuration: status === 'speaking' ? '75ms' : '500ms',
              transform: `scale(${targetScale})` 
            }}
          >
            {/* Background Aura */}
            <div className={`absolute inset-0 m-auto w-24 h-24 rounded-full ${theme.glow} blur-[40px] will-change-transform`} />

            {/* Layer 3: Outer Cube Container - Constant rotation speed to prevent CSS reset snapping */}
            <div className="relative w-24 h-24 [transform-style:preserve-3d] will-change-transform animate-[cube-spin_12s_linear_infinite]">
              
              {/* Outer Glass Faces */}
              <div className={`${faceClass} [transform:translateZ(48px)]`} />
              <div className={`${faceClass} [transform:rotateY(180deg)_translateZ(48px)]`} />
              <div className={`${faceClass} [transform:rotateY(90deg)_translateZ(48px)]`} />
              <div className={`${faceClass} [transform:rotateY(-90deg)_translateZ(48px)]`} />
              <div className={`${faceClass} [transform:rotateX(90deg)_translateZ(48px)]`} />
              <div className={`${faceClass} [transform:rotateX(-90deg)_translateZ(48px)]`} />

              {/* Layer 4: Sentient Inner Core (Tesseract) - Centered symmetrically */}
              <div className="absolute inset-0 m-auto w-10 h-10 [transform-style:preserve-3d] animate-[cube-spin-reverse_8s_linear_infinite]">
                 <div className={`${innerFaceClass} [transform:translateZ(20px)]`} />
                 <div className={`${innerFaceClass} [transform:rotateY(180deg)_translateZ(20px)]`} />
                 <div className={`${innerFaceClass} [transform:rotateY(90deg)_translateZ(20px)]`} />
                 <div className={`${innerFaceClass} [transform:rotateY(-90deg)_translateZ(20px)]`} />
                 <div className={`${innerFaceClass} [transform:rotateX(90deg)_translateZ(20px)]`} />
                 <div className={`${innerFaceClass} [transform:rotateX(-90deg)_translateZ(20px)]`} />
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
};

export default React.memo(CubeVisualizer);
