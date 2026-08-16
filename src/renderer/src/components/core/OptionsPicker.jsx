import { useEffect, useRef, useState } from 'react'

const COUNTDOWN = 60

// Chips pilihan dari model — klik kirim "Pilih: <label>" ke loop.
// Timeout COUNTDOWN detik → auto-pick defaultIndex (fallback 0).
const OptionsPicker = ({ options, defaultIndex = 0, onPick }) => {
  const [secondsLeft, setSecondsLeft] = useState(null)
  const pickedRef = useRef(false)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  useEffect(() => {
    if (!Array.isArray(options) || options.length === 0 || !onPickRef.current) return
    pickedRef.current = false
    setSecondsLeft(COUNTDOWN)
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(interval)
    // deps options only — onPick identity churn must not reset countdown
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options])

  useEffect(() => {
    if (secondsLeft !== 0 || pickedRef.current || !onPickRef.current) return
    pickedRef.current = true
    const idx =
      typeof defaultIndex === 'number' && defaultIndex >= 0 && defaultIndex < options.length
        ? defaultIndex
        : 0
    onPickRef.current(options[idx]?.label)
  }, [secondsLeft, options, defaultIndex])

  const handlePick = (label) => {
    if (pickedRef.current) return
    pickedRef.current = true
    if (onPick) onPick(label)
  }

  if (!Array.isArray(options) || options.length === 0) return null

  return (
    <div className="mt-4 w-full flex flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {options.map((opt, i) => (
          <button
            key={i}
            onClick={() => handlePick(opt.label)}
            className="group relative flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-light glass glass-hover border border-[var(--glass-border)] transition-all duration-300 active:scale-95 shadow-[0_4px_30px_rgba(0,0,0,0.1)]"
          >
            {opt.label}
            {i === defaultIndex && (
              <span className="text-[10px] text-success opacity-60 group-hover:opacity-100 uppercase tracking-wider">
                otomatis
              </span>
            )}
          </button>
        ))}
      </div>
      {secondsLeft !== null && secondsLeft > 0 && (
        <p className="text-xs text-white/40 font-extralight">
          Pilih otomatis dalam {secondsLeft}s...
        </p>
      )}
    </div>
  )
}

export default OptionsPicker
