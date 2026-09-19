import { useRef, useState, useCallback } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useControllableState } from '../../hooks/useControllableState'

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

function stepDecimals(step) {
  const s = String(step)
  const i = s.indexOf('.')
  return i === -1 ? 0 : s.length - i - 1
}

export function ElasticSlider({
  label,
  value,
  defaultValue,
  onValueChange,
  min = 0,
  max = 1,
  step = 0.01,
  formatValue,
  className = '',
  'aria-label': ariaLabel
}) {
  const [val, setVal] = useControllableState({
    prop: value,
    defaultProp: defaultValue ?? min,
    onChange: onValueChange
  })
  const safeVal = val ?? min
  const reduceMotion = useReducedMotion()
  const trackRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [stretch, setStretch] = useState(0)

  const decimals = stepDecimals(step)
  const quantize = useCallback(
    (v) => Number((Math.round(v / step) * step).toFixed(decimals)),
    [step, decimals]
  )
  const range = max - min
  const t = range === 0 ? 0 : (safeVal - min) / range
  const text = formatValue ? formatValue(safeVal) : String(safeVal)

  const snapDecile = useCallback(
    (v) => {
      for (let i = 0; i <= 10; i++) {
        const d = quantize(min + (range * i) / 10)
        if (Math.abs(v - d) <= range * 0.025) return d
      }
      return v
    },
    [min, range, quantize]
  )

  const valueFromClientX = useCallback(
    (clientX) => {
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0) return null
      const ratio = (clientX - rect.left) / rect.width
      const raw = min + ratio * range
      const clamped = clamp(raw, min, max)
      const over = raw - clamped
      return { next: quantize(clamped), over }
    },
    [min, max, range, quantize]
  )

  const onPointerDown = useCallback(
    (e) => {
      if (e.button !== undefined && e.button !== 0) return
      e.currentTarget.setPointerCapture?.(e.pointerId)
      setDragging(true)
      const r = valueFromClientX(e.clientX)
      if (r) {
        setVal(r.next)
        setStretch(r.over === 0 ? 0 : clamp(Math.abs(r.over) / range, 0, 1))
      }
    },
    [valueFromClientX, setVal, range]
  )

  const onPointerMove = useCallback(
    (e) => {
      if (!dragging) return
      const r = valueFromClientX(e.clientX)
      if (r) {
        setVal(r.next)
        setStretch(r.over === 0 ? 0 : clamp(Math.abs(r.over) / range, 0, 1))
      }
    },
    [dragging, valueFromClientX, setVal, range]
  )

  const endDrag = useCallback(() => {
    if (!dragging) return
    setDragging(false)
    setStretch(0)
    setVal((prev) => snapDecile(prev ?? min))
  }, [dragging, setVal, snapDecile, min])

  const onKeyDown = useCallback(
    (e) => {
      const fast = e.shiftKey ? 10 : 1
      let next = null
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = safeVal + step * fast
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = safeVal - step * fast
      else if (e.key === 'Home') next = min
      else if (e.key === 'End') next = max
      else if (e.key === 'PageUp') next = safeVal + step * 10
      else if (e.key === 'PageDown') next = safeVal - step * 10
      if (next === null) return
      e.preventDefault()
      setVal(snapDecile(quantize(clamp(next, min, max))))
    },
    [safeVal, step, min, max, setVal, quantize, snapDecile]
  )

  const pct = clamp(t, -0.15, 1.15) * 100
  const fillPct = clamp(t, 0, 1) * 100
  const bubbleAnchor = t < 0.15 ? '0%' : t > 0.85 ? '-100%' : '-50%'
  const spring = reduceMotion ? { type: 'tween', duration: 0 } : { type: 'spring', stiffness: 200, damping: 18 }

  return (
    <div className={className}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white/70">{label}</span>
        <span className="font-mono text-xs text-primary font-semibold">{text}</span>
      </div>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel || (typeof label === 'string' ? label : undefined)}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={safeVal}
        aria-valuetext={text}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className="relative h-6 flex items-center cursor-pointer touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent rounded"
      >
        <div
          className="relative h-1.5 w-full rounded-full"
          style={{ background: 'var(--es-track, rgba(255,255,255,0.05))' }}
        >
          <div
            className="absolute left-0 top-0 h-full rounded-full"
            style={{ width: `${fillPct}%`, background: 'var(--es-fill, #0a84ff)' }}
          />
        </div>
        <div className="absolute top-1/2 -translate-y-1/2" style={{ left: `${pct}%` }}>
          <motion.div
            animate={
              reduceMotion
                ? { scaleX: 1, scaleY: 1 }
                : { scaleX: dragging ? 1 + stretch * 0.9 : 1, scaleY: dragging ? 1 : 1 }
            }
            transition={spring}
            className="h-4 w-4 -translate-x-1/2 rounded-full bg-white shadow"
          />
          {dragging && (
            <div
              className="absolute -top-7 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[11px] text-white/80 whitespace-nowrap"
              style={{ left: '0', transform: `translateX(${bubbleAnchor})` }}
            >
              {text}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
