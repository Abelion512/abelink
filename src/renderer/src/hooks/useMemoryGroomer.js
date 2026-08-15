import { useEffect } from 'react'

/**
 * Hippocampus Engine - Memory Groomer
 * Stub hook untuk fork Linux (memory grooming dihandle di backend/DB layer)
 */
export const useMemoryGroomer = (enabled = true) => {
  useEffect(() => {
    if (!enabled) return
    // Memory grooming handled by Orama + Dexie in backend layer
    // This hook is a no-op in Linux fork — actual logic runs server-side
  }, [enabled])
}
