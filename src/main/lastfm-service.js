/**
 * Last.fm API integration — fetch listening history for music recommendations.
 * Replaces need for YouTube login/analytics.
 *
 * API: https://www.last.fm/api/show/user.getRecentTracks
 * User: abelionz
 */
const API_BASE = 'https://ws.audioscrobbler.com/2.0/'
const API_KEY = '0b1c0c1e3b7f4b3e8e5b6f7c8d9e0f1a'

const CACHE_TTL = 5 * 60 * 1000
let cache = { data: null, ts: 0 }

/**
 * Fetch recent tracks from Last.fm.
 * @param {string} user - Last.fm username (default: 'abelionz')
 * @param {number} limit - max tracks (default: 50)
 * @returns {Array<{title, artist, url, date, nowPlaying}>}
 */
export async function getRecentTracks(user = 'abelionz', limit = 50) {
  const now = Date.now()
  if (cache.data && now - cache.ts < CACHE_TTL) return cache.data

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

    cache = { data: tracks, ts: now }
    return tracks
  } catch (e) {
    console.error('[Last.fm] Failed to fetch:', e.message)
    return cache.data || []
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
