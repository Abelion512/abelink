// Cache daftar skill di sisi renderer — prinsip load-when-needed.
// Tanpa ini, daftar skill di-scan filesystem sidecar SETIAP giliran agen
// (planning.js) dan setiap InputBar mount. Dengan cache: scan sekali, lalu
// hanya refresh saat event 'skills-updated' (save/delete/install skill)
// atau TTL habis. Halaman Skills tetap bisa force-refresh.
import { listen } from '@tauri-apps/api/event'

const TTL_MS = 5 * 60 * 1000

let cache: Array<{ name: string; description: string }> | null = null
let fetchedAt = 0
let listenerWired = false

export const invalidateSkillsCache = () => {
  cache = null
  fetchedAt = 0
}

// Bridge cast: augmentasi Window.api (tauri-bridge.ts) tidak terlihat di
// program node-zone — modul ini dibaca test node via import transitif.
const wireInvalidation = () => {
  const w = typeof window !== 'undefined' ? (window as unknown as { __TAURI_INTERNALS__?: unknown }) : null
  if (listenerWired || typeof window === 'undefined' || !w?.__TAURI_INTERNALS__) return
  listenerWired = true
  listen('skills-updated', () => {
    invalidateSkillsCache()
  }).catch(() => {})
}

/**
 * Ambil daftar skill dengan cache.
 * @param {{force?: boolean}} [opts] force=true melewati cache (halaman Skills).
 * @returns {Promise<Array>} daftar skill (array kosong bila API tak tersedia).
 */
export const getCachedSkills = async ({ force = false }: { force?: boolean } = {}): Promise<Array<{ name: string; description: string }>> => {
  wireInvalidation()
  const isFresh = cache && Date.now() - fetchedAt < TTL_MS
  if (!force && isFresh) return cache as Array<{ name: string; description: string }>
  const w = typeof window !== 'undefined' ? (window as unknown as { api?: { getSkills?: () => Promise<unknown> } }) : null
  if (typeof window === 'undefined' || !w?.api?.getSkills) return []
  const list = await w.api.getSkills()
  cache = Array.isArray(list) ? (list as Array<{ name: string; description: string }>) : []
  fetchedAt = Date.now()
  return cache
}
