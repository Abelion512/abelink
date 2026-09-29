import { useState, useCallback } from 'react'

export function useControllableState<T>({
  prop,
  defaultProp,
  onChange
}: {
  prop?: T
  defaultProp?: T
  onChange?: (value: T) => void
}): [T | undefined, (next: T | ((prev: T | undefined) => T)) => void] {
  const controlled = prop !== undefined
  const [internal, setInternal] = useState<T | undefined>(defaultProp)
  const value = controlled ? prop : internal
  const setValue = useCallback(
    (next: T | ((prev: T | undefined) => T)) => {
      const resolved =
        typeof next === 'function' ? (next as (prev: T | undefined) => T)(value) : next
      if (!controlled) setInternal(resolved)
      onChange?.(resolved)
    },
    [controlled, onChange, value]
  )
  return [value, setValue]
}
