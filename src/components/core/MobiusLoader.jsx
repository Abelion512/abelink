import { motion, useReducedMotion } from 'motion/react'

const CIRCLE_1 = 'M12 4C16.42 4 20 7.58 20 12C20 16.42 16.42 20 12 20C7.58 20 4 16.42 4 12C4 7.58 7.58 4 12 4Z'
const INFINITY = 'M 6 16 C 11 16 13 8 18 8 C 23.333 8 23.333 16 18 16 C 13 16 11 8 6 8 C 0.667 8 0.667 16 6 16 Z'
const CIRCLE_2 = 'M12 20C16.42 20 20 16.42 20 12C20 7.58 16.42 4 12 4C7.58 4 4 7.58 4 12C4 16.42 7.58 20 12 20Z'

export function MobiusLoader({ size = 64, className = '' }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`text-primary ${className}`.trim()}
    >
      {reduceMotion ? (
        <path d={CIRCLE_1} />
      ) : (
        <motion.path
          d={CIRCLE_1}
          animate={{ d: [CIRCLE_1, INFINITY, CIRCLE_2, CIRCLE_1] }}
          transition={{ duration: 3, ease: 'easeInOut', repeat: Infinity }}
        />
      )}
    </motion.svg>
  )
}
