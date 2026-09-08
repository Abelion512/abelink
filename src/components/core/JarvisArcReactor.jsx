import React from 'react'

/**
 * Jarvis Arc Reactor Cybernetic Visualizer
 * Dual telemetry rings, gyroscopic gyro, glowing plasma core,
 * and audio-reactive 9-band frequency equalizer bars.
 */
export const JarvisArcReactor = ({
  status = 'idle',
  isActive = true,
  intensity = 0,
  glowColor = null,
  size = 'lg'
}) => {
  const isSpeaking = status === 'speaking'
  const isListening = status === 'listening'
  const isThinking = status === 'thinking'

  const scaleMultiplier = size === 'sm' ? 'scale-75' : size === 'md' ? 'scale-90' : 'scale-100'

  return (
    <div className={`relative flex items-center justify-center select-none ${scaleMultiplier}`}>
      {/* Outer Telemetry Arc Reactor HUD (SVG) */}
      <div className="relative w-80 h-80 flex items-center justify-center">
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 320 320">
          {/* Outer Orbit Track */}
          <circle
            cx="160"
            cy="160"
            r="152"
            fill="none"
            stroke="currentColor"
            className={`transition-colors duration-700 ${
              isSpeaking
                ? 'text-cyan-400/40'
                : isListening
                  ? 'text-emerald-400/40'
                  : isThinking
                    ? 'text-amber-400/40'
                    : 'text-cyan-600/20'
            }`}
            strokeWidth="1"
            strokeDasharray="4 8"
          />

          {/* Rotating Segmented Ring 1 (Clockwise) */}
          <g className={isActive ? 'animate-[spin_30s_linear_infinite] origin-center' : 'origin-center'}>
            <circle
              cx="160"
              cy="160"
              r="140"
              fill="none"
              stroke="currentColor"
              className={`transition-colors duration-700 ${
                isSpeaking
                  ? 'text-cyan-400/60'
                  : isListening
                    ? 'text-emerald-400/60'
                    : isThinking
                      ? 'text-purple-400/60'
                      : 'text-cyan-500/20'
              }`}
              strokeWidth="1.5"
              strokeDasharray="60 30 15 30 90 20"
            />
            {/* Arc Reactor Ticks */}
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <line
                key={deg}
                x1="160"
                y1="16"
                x2="160"
                y2="24"
                stroke="currentColor"
                className={isActive ? 'text-cyan-400/70' : 'text-white/20'}
                strokeWidth="2"
                transform={`rotate(${deg} 160 160)`}
              />
            ))}
          </g>

          {/* Counter-Rotating Segmented Ring 2 */}
          <g className={isActive ? 'animate-[spin_20s_linear_infinite_reverse] origin-center' : 'origin-center'}>
            <circle
              cx="160"
              cy="160"
              r="124"
              fill="none"
              stroke="currentColor"
              className={`transition-colors duration-700 ${
                isSpeaking
                  ? 'text-teal-300/60'
                  : isListening
                    ? 'text-emerald-300/60'
                    : isThinking
                      ? 'text-amber-300/60'
                      : 'text-cyan-400/20'
              }`}
              strokeWidth="2"
              strokeDasharray="40 40 80 20"
            />
          </g>

          {/* Inner Gyroscopic Gyro Ring (Fast Spin when thinking) */}
          <g
            className={
              isThinking
                ? 'animate-[spin_4s_linear_infinite] origin-center'
                : isActive
                  ? 'animate-[spin_12s_linear_infinite] origin-center'
                  : 'origin-center'
            }
          >
            <circle
              cx="160"
              cy="160"
              r="108"
              fill="none"
              stroke="currentColor"
              className={`transition-colors duration-700 ${
                isSpeaking
                  ? 'text-cyan-300'
                  : isListening
                    ? 'text-emerald-400'
                    : isThinking
                      ? 'text-amber-400'
                      : 'text-cyan-500/30'
              }`}
              strokeWidth="1"
              strokeDasharray="8 6"
            />
          </g>
        </svg>

        {/* Dynamic Audio Ripple Waves */}
        {isActive && (
          <>
            <div
              className={`absolute rounded-full pointer-events-none transition-all duration-300 ${
                isSpeaking
                  ? 'border border-cyan-400/30 shadow-[0_0_30px_rgba(34,211,238,0.2)]'
                  : isListening
                    ? 'border border-emerald-400/30 shadow-[0_0_30px_rgba(52,211,153,0.2)]'
                    : 'border border-amber-400/30 shadow-[0_0_30px_rgba(251,191,36,0.2)]'
              }`}
              style={{
                width: `${190 + intensity * 80}px`,
                height: `${190 + intensity * 80}px`,
                opacity: Math.max(0.2, intensity * 0.8)
              }}
            />
            <div
              className="absolute rounded-full border border-white/10 pointer-events-none transition-all duration-500"
              style={{
                width: `${210 + intensity * 100}px`,
                height: `${210 + intensity * 100}px`,
                opacity: Math.max(0.1, intensity * 0.5)
              }}
            />
          </>
        )}

        {/* Glowing Arc Reactor Plasma Sphere */}
        <div
          className={`relative w-44 h-44 rounded-full flex items-center justify-center backdrop-blur-md transition-all duration-300 shadow-2xl ${
            isSpeaking
              ? 'bg-radial from-cyan-400/30 via-sky-600/20 to-teal-950/80 border-2 border-cyan-300/80 shadow-[0_0_50px_rgba(34,211,238,0.5)]'
              : isListening
                ? 'bg-radial from-emerald-400/30 via-teal-600/20 to-slate-950/80 border-2 border-emerald-400/80 shadow-[0_0_50px_rgba(52,211,153,0.5)]'
                : isThinking
                  ? 'bg-radial from-amber-400/30 via-purple-700/30 to-slate-950/80 border-2 border-amber-400/80 shadow-[0_0_50px_rgba(251,191,36,0.5)]'
                  : 'bg-radial from-cyan-900/20 via-slate-900/40 to-slate-950/80 border border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.15)]'
          }`}
          style={{
            transform: `scale(${1 + intensity * 0.22})`
          }}
        >
          {/* Center Core Reactor Eye */}
          <div
            className={`w-28 h-28 rounded-full flex items-center justify-center border transition-all duration-500 ${
              isSpeaking
                ? 'border-cyan-300/50 bg-cyan-500/20 shadow-[inset_0_0_25px_rgba(34,211,238,0.6)]'
                : isListening
                  ? 'border-emerald-300/50 bg-emerald-500/20 shadow-[inset_0_0_25px_rgba(52,211,153,0.6)]'
                  : isThinking
                    ? 'border-amber-300/50 bg-amber-500/20 shadow-[inset_0_0_25px_rgba(251,191,36,0.6)]'
                    : 'border-cyan-500/20 bg-cyan-950/30 shadow-[inset_0_0_15px_rgba(6,182,212,0.2)]'
            }`}
          >
            {/* Jarvis Audio Frequency Equalizer Waves */}
            <div className="flex items-center gap-1.5 h-14">
              {[0.4, 0.7, 1.0, 0.8, 1.2, 0.9, 0.6, 1.1, 0.5].map((factor, idx) => {
                const barHeight = isActive
                  ? Math.max(8, Math.min(48, Math.round(12 + intensity * 36 * factor)))
                  : 6
                return (
                  <div
                    key={idx}
                    className={`w-1 rounded-full transition-all duration-75 ${
                      isSpeaking
                        ? 'bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.8)]'
                        : isListening
                          ? 'bg-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                          : isThinking
                            ? 'bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                            : 'bg-cyan-500/40'
                    }`}
                    style={{ height: `${barHeight}px` }}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default JarvisArcReactor
