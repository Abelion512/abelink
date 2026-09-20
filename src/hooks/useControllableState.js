import { useState, useCallback } from 'react'

export function useControllableState({ prop, defaultProp, onChange }) {
  const controlled = prop !== undefined
  const [internal, setInternal] = useState(defaultProp)
  const value = controlled ? prop : internal
  const setValue = useCallback(
    (next) => {
      const resolved = typeof next === 'function' ? next(value) : next
      if (!controlled) setInternal(resolved)
      onChange?.(resolved)
    },
    [controlled, onChange, value]
  )
  return [value, setValue]
}
