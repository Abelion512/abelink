import React, { useState, useEffect } from 'react';

const CubeVisualizer = ({ status = 'idle', intensity = 0, mood = 'neutral' }) => {
  const [glassClass, setGlassClass] = useState('from-emerald-400/40 to-green-500/10');
  const [glowClass, setGlowClass] = useState('bg-green-500/50');
  const [borderClass, setBorderClass] = useState('border-green-400/50');

  useEffect(() => {
    if (status === 'error') {
      setGlassClass('from-red-500/40 to-red-600/10');
      setGlowClass('bg-red-500/50');
      setBorderClass('border-red-400/50');
    } else {
      if (mood === 'negative') {
        setGlassClass('from-red-500/40 to-red-600/10');
        setGlowClass('bg-red-500/50');
        setBorderClass('border-red-400/50');
      }
      else if (mood === 'annoyed') {
        setGlassClass('from-orange-400/40 to-amber-600/10');
        setGlowClass('bg-orange-500/50');
        setBorderClass('border-orange-400/50');
      }
      else if (mood === 'positive') {
        setGlassClass('from-yellow-300/40 to-amber-400/10');
        setGlowClass('bg-yellow-400/50');
        setBorderClass('border-yellow-400/50');
      }
      else {
        setGlassClass('from-emerald-400/40 to-green-500/10'); // Neutral
        setGlowClass('bg-green-500/50');
        setBorderClass('border-green-400/50');
      }
    }
  }, [mood, status]);

  // Calculate dynamic scale based on state
  let targetScale = 1;
  if (status === 'thinking') targetScale = 1.15;
  else if (status === 'nudge') targetScale = 1.05;
  else if (status === 'speaking') targetScale = 1 + intensity * 0.4;
  else targetScale = 1;

  // 24 = 6rem = 96px, so translateZ is 48px
  const faceClass = `absolute inset-0 m-auto w-24 h-24 rounded-2xl border ${borderClass} bg-gradient-to-br ${glassClass} shadow-[inset_0_0_20px_rgba(255,255,255,0.2)] flex items-center justify-center`;
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
            <div className={`absolute inset-0 m-auto w-24 h-24 rounded-full ${glowClass} blur-[40px] will-change-transform`} />

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

export default CubeVisualizer;
