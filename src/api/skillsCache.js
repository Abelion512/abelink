// Cache daftar skill di sisi renderer — prinsip load-when-needed.
// Tanpa ini, daftar skill di-scan filesystem sidecar SETIAP giliran agen
// (planning.js) dan setiap InputBar mount. Dengan cache: scan sekali, lalu
// hanya refresh saat event 'skills-updated' (save/delete/install skill)
// atau TTL habis. Halaman Skills tetap bisa force-refresh.
import { listen } from '@tauri-apps/api/event'

const TTL_MS = 5 * 60 * 1000

let cache = null
let fetchedAt = 0
let listenerWired = false

export const invalidateSkillsCache = () => {
  cache = null
  fetchedAt = 0
}

const wireInvalidation = () => {
  if (listenerWired || typeof window === 'undefined' || !window.__TAURI_INTERNALS__) return
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
export const getCachedSkills = async ({ force = false } = {}) => {
  wireInvalidation()
  const isFresh = cache && Date.now() - fetchedAt < TTL_MS
  if (!force && isFresh) return cache
  if (typeof window === 'undefined' || !window.api?.getSkills) return []
  const list = await window.api.getSkills()
  cache = Array.isArray(list) ? list : []
  fetchedAt = Date.now()
  return cache
}
