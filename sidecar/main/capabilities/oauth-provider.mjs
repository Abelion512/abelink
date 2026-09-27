// OAuth Provider terstandarisasi untuk Model Context Protocol (MCP) & Capability System.
// Mengelola token OAuth 2.0 per-provider (Google, dsb.) dengan refresh token otomatis.
// Zero-leak: token hanya diakses in-memory dan disimpan di berkas XDG 0600.

import { getTokens as getGoogleTokens, getValidGoogleToken } from '../google/google-service.js'

/**
 * Memeriksa apakah provider OAuth tertentu sudah memiliki token tersimpan.
 * @param {string} provider Nama provider, misal 'google'
 * @returns {Promise<boolean>}
 */
export async function isProviderAuthorized(provider) {
  const norm = String(provider || '').toLowerCase().trim()
  if (norm === 'google') {
    const tokens = await getGoogleTokens()
    return !!(tokens && tokens.access_token)
  }
  return false
}

/**
 * Mengambil access token valid untuk provider, melakukan refresh otomatis bila kedaluwarsa.
 * @param {string} provider Nama provider, misal 'google'
 * @param {object} [opts]
 * @param {boolean} [opts.forceRefresh=false] Paksa refresh token baru dari refresh_token
 * @returns {Promise<string|null>}
 */
export async function getValidToken(provider, { forceRefresh = false } = {}) {
  const norm = String(provider || '').toLowerCase().trim()
  if (norm === 'google') {
    return getValidGoogleToken({ forceRefresh })
  }
  return null
}
