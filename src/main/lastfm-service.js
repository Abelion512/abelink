/**
 * Last.fm API integration — fetch listening history for music recommendations.
 * Replaces need for YouTube login/analytics.
 *
 * API: https://www.last.fm/api/show/user.getRecentTracks
 * Set via config UI, env LASTFM_API_KEY, or setApiKey().
 */
const API_BASE = 'https://ws.audioscrobbler.com/2.0/'
let API_KEY = process.env.LASTFM_API_KEY || null

export function setApiKey(key) { API_KEY = key }

const CACHE_TTL = 5 * 60 * 1000
const cache = new Map()

/**
 * Fetch recent tracks from Last.fm.
 * @param {string} user - Last.fm username (default: 'abelionz')
 * @param {number} limit - max tracks (default: 50)
 * @returns {Array<{title, artist, url, date, nowPlaying}>}
 */
export async function getRecentTracks(user = 'abelionz', limit = 50) {
  const now = Date.now()
  const cached = cache.get(user)
  if (cached && now - cached.ts < CACHE_TTL) return cached.data

  try {
    const params = new URLSearchParams({
      method: 'user.getRecentTracks',
      user,
      api_key: API_KEY,
      format: 'json',
      limit: String(limit)
    })

    const response = await fetch(`${API_BASE}?${params}`)
    if (!response.ok) throw new Error(`Last.fm API: ${response.status}`)

    const data = await response.json()
    const tracks = (data?.recenttracks?.track || []).map(t => ({
      title: t.name,
      artist: t.artist?.['#text'] || 'Unknown',
      album: t.album?.['#text'] || '',
      url: t.url,
      date: t.date?.['#text'] || null,
      nowPlaying: t['@attr']?.nowplaying === 'true'
    }))

    cache.set(user, { data: tracks, ts: now })
    return tracks
  } catch (e) {
    console.error('[Last.fm] Failed to fetch:', e.message)
    return []
  }
}

/**
 * Get top tracks (overall stats).
 */
export async function getTopTracks(user = 'abelionz', limit = 20) {
  try {
    const params = new URLSearchParams({
      method: 'user.getTopTracks',
      user,
      api_key: API_KEY,
      format: 'json',
      limit: String(limit),
      period: 'overall'
    })
    const response = await fetch(`${API_BASE}?${params}`)
    if (!response.ok) throw new Error(`Last.fm API: ${response.status}`)
    const data = await response.json()
    return (data?.toptracks?.track || []).map(t => ({
      title: t.name,
      artist: t.artist?.name || 'Unknown',
      playcount: t.playcount,
      url: t.url
    }))
  } catch (e) {
    console.error('[Last.fm] Failed to fetch top tracks:', e.message)
    return []
  }
}

/**
 * Format tracks for AI context injection.
 */
export function formatTracksForAI(tracks, label = 'Recent listens') {
  if (!tracks || tracks.length === 0) return ''
  const lines = tracks.slice(0, 10).map((t, i) =>
    `${i + 1}. "${t.title}" by ${t.artist}${t.nowPlaying ? ' (NOW PLAYING)' : ''}`
  )
  return `\n[LAST.FM ${label}]:\n${lines.join('\n')}\n`
}

// ============== WRITE OPERATIONS (Scrobbling) ==============
// Memerlukan: API_KEY + SESSION_KEY (bukan hanya API key)
// Session key didapat via auth.getMobileSession(username, password)
import { createHash } from 'node:crypto'

let SESSION_KEY = process.env.LASTFM_SESSION_KEY || null

export function setSessionKey(key) { SESSION_KEY = key }

/**
 * Generate API signature untuk Last.fm write calls.
 * MD5(api_keyXapi_keymethodXmethodparamXparam...shared_secret)
 */
function signCall(params) {
  const sorted = Object.keys(params).sort().map(k => `${k}${params[k]}`).join('')
  return createHash('md5').update(sorted + (process.env.LASTFM_SHARED_SECRET || '')).digest('hex')
}

/**
 * Panggil Last.fm write API (POST).
 * @param {string} method - API method (e.g., 'track.updateNowPlaying')
 * @param {Object} params - method params (tanpa api_key, sk, api_sig, format)
 * @returns {Object|null} response data atau null jika gagal
 */
async function callWrite(method, params) {
  if (!API_KEY || !SESSION_KEY) {
    console.warn('[Last.fm] Write skipped — missing API_KEY or SESSION_KEY')
    return null
  }
  const fullParams = { ...params, method, api_key: API_KEY, sk: SESSION_KEY }
  fullParams.api_sig = signCall(fullParams)
  fullParams.format = 'json'

  try {
    const body = new URLSearchParams(fullParams).toString()
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
    const data = await response.json()
    if (data.error) {
      console.warn(`[Last.fm] ${method} error ${data.error}: ${data.message}`)
      return null
    }
    return data
  } catch (e) {
    console.error(`[Last.fm] ${method} failed:`, e.message)
    return null
  }
}

/**
 * Update now playing status di Last.fm.
 * Dipanggil setiap kali lagu baru mulai diputar.
 * @param {string} track - judul lagu
 * @param {string} artist - nama artis
 * @param {string} [album] - nama album (opsional)
 */
export async function updateNowPlaying(track, artist, album = '') {
  return callWrite('track.updateNowPlaying', { track, artist, ...(album && { album }) })
}

/**
 * Scrobble lagu ke Last.fm.
 * Dipanggil setelah lagu diputar >= 4 menit atau >= 50% durasi.
 * @param {string} track - judul lagu
 * @param {string} artist - nama artis
 * @param {number} [timestamp] - Unix timestamp (default: now)
 * @param {string} [album] - nama album (opsional)
 */
export async function scrobble(track, artist, timestamp = Math.floor(Date.now() / 1000), album = '') {
  return callWrite('track.scrobble', { track, artist, timestamp: String(timestamp), ...(album && { album }) })
}
