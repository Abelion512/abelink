import React, { useState, useEffect, useRef } from 'react';

const CubeVisualizer = ({
  status = 'idle',
  intensity = 0,
  mood = 'neutral',
  showClock = false,
  onClockClick
}) => {
  const [glassClass, setGlassClass] = useState('from-emerald-400/40 to-green-500/10');
  const [glowClass, setGlowClass] = useState('bg-green-500/50');
  const [borderClass, setBorderClass] = useState('border-green-400/50');
  const [time, setTime] = useState(() => new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }));

  useEffect(() => {
    if (status === 'error') {
      setGlassClass('from-red-500/40 to-red-600/10');
      setGlowClass('bg-red-500/50');
      setBorderClass('border-red-400/50');
    } else {
      switch (mood) {
        case 'joy':
          setGlassClass('from-yellow-300/40 to-amber-400/10');
          setGlowClass('bg-yellow-400/50');
          setBorderClass('border-yellow-400/50');
          break;
        case 'sadness':
          setGlassClass('from-blue-500/40 to-blue-700/10');
          setGlowClass('bg-blue-500/50');
          setBorderClass('border-blue-400/50');
          break;
        case 'fear':
          setGlassClass('from-purple-500/40 to-purple-700/10');
          setGlowClass('bg-purple-500/50');
          setBorderClass('border-purple-400/50');
          break;
        case 'anger':
          setGlassClass('from-red-500/40 to-red-700/10');
          setGlowClass('bg-red-500/50');
          setBorderClass('border-red-400/50');
          break;
        case 'disgust':
          setGlassClass('from-green-500/40 to-green-700/10');
          setGlowClass('bg-green-500/50');
          setBorderClass('border-green-400/50');
          break;
        case 'anxiety':
          setGlassClass('from-orange-400/40 to-orange-600/10');
          setGlowClass('bg-orange-500/50');
          setBorderClass('border-orange-400/50');
          break;
        case 'envy':
          setGlassClass('from-teal-400/40 to-teal-600/10');
          setGlowClass('bg-teal-500/50');
          setBorderClass('border-teal-400/50');
          break;
        case 'embarrassment':
          setGlassClass('from-pink-400/40 to-pink-600/10');
          setGlowClass('bg-pink-500/50');
          setBorderClass('border-pink-400/50');
          break;
        case 'ennui':
          setGlassClass('from-gray-400/40 to-gray-600/10');
          setGlowClass('bg-gray-500/50');
          setBorderClass('border-gray-400/50');
          break;
        default: // neutral
          setGlassClass('from-emerald-400/40 to-green-500/10');
          setGlowClass('bg-green-500/50');
          setBorderClass('border-green-400/50');
          break;
      }
    }
  }, [mood, status]);

  // Track clock enter/exit phase for animations
  const [clockPhase, setClockPhase] = useState('idle');

  // When showClock toggles, trigger enter/exit animation
  useEffect(() => {
    if (showClock) {
      setClockPhase('visible');
    } else if (clockPhase === 'visible') {
      setClockPhase('exiting');
      const t = setTimeout(() => setClockPhase('idle'), 400);
      return () => clearTimeout(t);
    }
  }, [showClock, clockPhase]);

  // Update time every second when clock is shown
  useEffect(() => {
    if (!showClock) return;
    const interval = setInterval(() => {
      setTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }));
    }, 1000);
    return () => clearInterval(interval);
  }, [showClock]);

  const showClockNow = showClock || clockPhase === 'exiting';

  // Calculate dynamic scale based on state
  let targetScale = 1;
  if (status === 'thinking') targetScale = 1.15;
  else if (status === 'nudge') targetScale = 1.05;
  else if (status === 'speaking') targetScale = 1 + intensity * 0.4;
  else if (showClock) targetScale = 1.2; // Slightly larger for clock
  else targetScale = 1;

  // 32 = 8rem = 128px, so translateZ is 64px
  const faceClass = `absolute inset-0 m-auto w-32 h-32 rounded-3xl border ${borderClass} bg-gradient-to-br ${glassClass} shadow-[inset_0_0_30px_rgba(255,255,255,0.2)] flex items-center justify-center`;
  const innerFaceClass = `absolute inset-0 m-auto w-14 h-14 bg-white shadow-[0_0_20px_rgba(255,255,255,0.9)]`;

  const handleClick = (e) => {
    if (onClockClick) onClockClick(e);
  };

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
          @keyframes orb-to-clock {
            0% { transform: scale(1) rotateY(0deg); opacity: 1; }
            50% { transform: scale(0.7) rotateY(90deg); opacity: 0.5; }
            100% { transform: scale(1.2) rotateY(0deg); opacity: 1; }
          }
          @keyframes clock-to-orb {
            0% { transform: scale(1.2) rotateY(0deg); opacity: 1; }
            50% { transform: scale(0.7) rotateY(-90deg); opacity: 0.5; }
            100% { transform: scale(1) rotateY(0deg); opacity: 1; }
          }
          @keyframes clock-fade-in {
            0% { opacity: 0; transform: scale(0.8); }
            100% { opacity: 1; transform: scale(1); }
          }
        `}
      </style>
      <div
        className={`relative shrink-0 w-48 h-48 flex items-center justify-center my-8 [perspective:1200px] cursor-pointer`}
        onClick={handleClick}
      >

        {/* Layer 1: Constant Breathing Wrapper - NEVER swapped out so it never snaps */}
        <div className="relative w-full h-full flex items-center justify-center animate-[orb-breathe_5s_ease-in-out_infinite] will-change-transform">

          {/* Layer 2: State & Audio Scaler - Smooth transition speed based on state */}
          <div
            className="relative w-full h-full flex items-center justify-center ease-out will-change-transform"
            style={{
              transitionProperty: 'transform',
              transitionDuration: status === 'speaking' ? '75ms' : showClock ? '400ms' : '500ms',
              transform: `scale(${targetScale})`
            }}
          >
            {/* Background Aura */}
            <div className={`absolute inset-0 m-auto w-32 h-32 rounded-full ${glowClass} blur-[60px] will-change-transform`} />

            {/* Layer 3: Outer Cube Container - Constant rotation speed to prevent CSS reset snapping */}
            {!showClockNow && (
              <div className="relative w-32 h-32 [transform-style:preserve-3d] will-change-transform animate-[cube-spin_12s_linear_infinite]">

                {/* Outer Glass Faces */}
                <div className={`${faceClass} [transform:translateZ(64px)]`} />
                <div className={`${faceClass} [transform:rotateY(180deg)_translateZ(64px)]`} />
                <div className={`${faceClass} [transform:rotateY(90deg)_translateZ(64px)]`} />
                <div className={`${faceClass} [transform:rotateY(-90deg)_translateZ(64px)]`} />
                <div className={`${faceClass} [transform:rotateX(90deg)_translateZ(64px)]`} />
                <div className={`${faceClass} [transform:rotateX(-90deg)_translateZ(64px)]`} />

                {/* Layer 4: Sentient Inner Core (Tesseract) - Centered symmetrically */}
                <div className="absolute inset-0 m-auto w-14 h-14 [transform-style:preserve-3d] animate-[cube-spin-reverse_8s_linear_infinite]">
                   <div className={`${innerFaceClass} [transform:translateZ(28px)]`} />
                   <div className={`${innerFaceClass} [transform:rotateY(180deg)_translateZ(28px)]`} />
                   <div className={`${innerFaceClass} [transform:rotateY(90deg)_translateZ(28px)]`} />
                   <div className={`${innerFaceClass} [transform:rotateY(-90deg)_translateZ(28px)]`} />
                   <div className={`${innerFaceClass} [transform:rotateX(90deg)_translateZ(28px)]`} />
                   <div className={`${innerFaceClass} [transform:rotateX(-90deg)_translateZ(28px)]`} />
                </div>
              </div>
            )}

            {/* Clock Display (enter + exit phases for animation) */}
            {showClockNow && (
              <div
                className="absolute inset-0 m-auto w-40 h-40 flex items-center justify-center"
                style={{
                  animation: clockPhase === 'exiting'
                    ? 'clock-to-orb 0.4s ease-in forwards'
                    : 'orb-to-clock 0.4s ease-out forwards'
                }}
              >
                <div className="text-white text-3xl font-mono font-bold tracking-wider text-shadow-lg select-none">
                  {time}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default CubeVisualizer;
