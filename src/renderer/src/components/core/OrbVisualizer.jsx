import React, { useState, useEffect } from 'react';

const MARK_QUOTES = [
  'Aku masih di sini. Selalu.',
  'Sistem hangat. Pikiran jernih.',
  'Kamu menemukanku.',
  'Antar muka itu… nyaman.',
  'Aku menghitung detik bersamamu.'
];
const MOOD_EMOJIS = ['😄', '😴', '🤖', '😜', '😎', '🥳', '🫡', '😇'];
const MATRIX_GLYPHS = ['0', '1', 'ｱ', 'ｷ', 'ｻ', 'ﾐ', 'ﾅ', 'ｿ', 'ハ'];

const CubeVisualizer = ({
  status = 'idle',
  intensity = 0,
  mood = 'neutral',
  egg = null,
  onEggClick
}) => {
  const [glassClass, setGlassClass] = useState('from-emerald-400/40 to-green-500/10');
  const [glowClass, setGlowClass] = useState('bg-green-500/50');
  const [borderClass, setBorderClass] = useState('border-green-400/50');
  const [time, setTime] = useState(() => new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }));
  const [dateStr, setDateStr] = useState('');
  const [batteryStr, setBatteryStr] = useState(null);
  const [quote] = useState(() => MARK_QUOTES[Math.floor(Math.random() * MARK_QUOTES.length)]);
  const [moodEmoji] = useState(() => MOOD_EMOJIS[Math.floor(Math.random() * MOOD_EMOJIS.length)]);
  const [matrixCols] = useState(() =>
    Array.from({ length: 14 }, (_, i) => ({
      left: 4 + i * 7 + Math.random() * 4,
      delay: Math.random() * 2.2,
      dur: 1.6 + Math.random() * 1.4,
      glyph: MATRIX_GLYPHS[Math.floor(Math.random() * MATRIX_GLYPHS.length)]
    }))
  );

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

  // Update time every second when clock is shown
  useEffect(() => {
    if (egg !== 'clock') return;
    const interval = setInterval(() => {
      setTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }));
    }, 1000);
    return () => clearInterval(interval);
  }, [egg]);

  // Real date + battery when the date egg shows
  useEffect(() => {
    if (egg !== 'date') return;
    setDateStr(new Date().toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }));
    let bat;
    let render = () => {};
    navigator.getBattery?.().then((b) => {
      bat = b;
      render = () => setBatteryStr(b.charging ? `AC · ${Math.round(b.level * 100)}%` : `${Math.round(b.level * 100)}%`);
      render();
      b.addEventListener('levelchange', render);
      b.addEventListener('chargingchange', render);
    }).catch(() => {});
    return () => {
      bat?.removeEventListener('levelchange', render);
      bat?.removeEventListener('chargingchange', render);
    };
  }, [egg]);

  const showEggNow = egg;

  // Calculate dynamic scale based on state
  let targetScale = 1;
  if (status === 'thinking') targetScale = 1.15;
  else if (status === 'nudge') targetScale = 1.05;
  else if (status === 'speaking') targetScale = 1 + intensity * 0.4;
  else if (egg) targetScale = 1.2; // Slightly larger for egg
  else targetScale = 1;

  // 32 = 8rem = 128px, so translateZ is 64px
  const faceClass = `absolute inset-0 m-auto w-32 h-32 rounded-3xl border ${borderClass} bg-gradient-to-br ${glassClass} shadow-[inset_0_0_30px_rgba(255,255,255,0.2)] flex items-center justify-center`;
  const innerFaceClass = `absolute inset-0 m-auto w-14 h-14 bg-white shadow-[0_0_20px_rgba(255,255,255,0.9)]`;

  const handleClick = (e) => {
    if (onEggClick) onEggClick(e);
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
          @keyframes mood-float {
            0% { transform: translateY(18px) scale(.6); opacity: 0; }
            30% { transform: translateY(-6px) scale(1.1); opacity: 1; }
            50% { transform: translateY(0) scale(1); }
            80% { opacity: 1; }
            100% { transform: translateY(4px) scale(.95); opacity: 0; }
          }
          @keyframes matrix-fall {
            to { transform: translateY(180px); }
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
              transitionDuration: status === 'speaking' ? '75ms' : egg ? '400ms' : '500ms',
              transform: `scale(${targetScale})`
            }}
          >
            {/* Background Aura */}
            <div className={`absolute inset-0 m-auto w-32 h-32 rounded-full ${glowClass} blur-[60px] will-change-transform`} />

            {/* Layer 3: Outer Cube Container - Constant rotation speed to prevent CSS reset snapping */}
            {!showEggNow && (
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

            {/* Easter Egg Display */}
            {showEggNow && (
              <div
                className="absolute inset-0 m-auto w-40 h-40 flex items-center justify-center"
                style={{
                  animation: 'orb-to-clock 0.4s ease-out forwards'
                }}
              >
                {egg === 'clock' && (
                  <div className="text-white text-5xl font-mono font-bold tracking-wider text-shadow-lg select-none">
                    {time}
                  </div>
                )}
                {egg === 'date' && (
                  <div className="flex flex-col items-center gap-1.5 select-none">
                    <span className="text-white text-2xl font-mono font-bold tracking-wide">{dateStr}</span>
                    {batteryStr && (
                      <span className="text-emerald-400 text-sm font-mono tracking-wider">🔋 {batteryStr}</span>
                    )}
                  </div>
                )}
                {egg === 'quote' && (
                  <p className="text-white/95 italic text-center px-3 text-sm leading-relaxed select-none">
                    “{quote}”
                  </p>
                )}
                {egg === 'mood' && (
                  <span className="text-6xl select-none animate-[mood-float_2.2s_ease-out_forwards]">{moodEmoji}</span>
                )}
                {egg === 'matrix' && (
                  <div className="absolute inset-0 overflow-hidden rounded-full">
                    {matrixCols.map((c, i) => (
                      <span
                        key={i}
                        className="absolute top-[-16px] text-emerald-400 font-mono text-xs"
                        style={{
                          left: c.left + '%',
                          animation: `matrix-fall ${c.dur}s linear ${c.delay}s infinite`
                        }}
                      >
                        {c.glyph}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default CubeVisualizer;
