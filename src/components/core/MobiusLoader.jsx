

/**
 * Apple 12-Spoke Activity Indicator (macOS / iOS native style)
 * Lightweight, hardware-accelerated, zero CPU overhead.
 */
export function MobiusLoader({ size = 20, className = '' }) {
  const spokes = Array.from({ length: 12 })
  return (
    <div
      className={`inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className="animate-[spin_1s_steps(12,end)_infinite]"
        aria-hidden="true"
      >
        {spokes.map((_, i) => (
          <rect
            key={i}
            x="11"
            y="2"
            width="2"
            height="5"
            rx="1"
            fill="currentColor"
            opacity={(i + 1) / 12}
            transform={`rotate(${i * 30} 12 12)`}
          />
        ))}
      </svg>
    </div>
  )
}

export default MobiusLoader

