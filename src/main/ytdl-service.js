/**
 * yt-dlp metadata service — extract audio info from YouTube, TikTok, SoundCloud, etc.
 * Uses youtube-dl-exec (yt-dlp wrapper) already in dependencies.
 *
 * Instead of embedding a webview, this gives us:
 * - Proper title, artist, thumbnail
 * - Audio stream URL (playable via HTML5 audio)
 * - No ads, no zoom issues, no fullscreen problems
 * - Cross-platform: YouTube, TikTok, SoundCloud, etc.
 */
import { execFile } from 'child_process'
import path from 'path'

// Resolve yt-dlp binary path
let ytdlBin = null
function getYtdlPath() {
  if (ytdlBin) return ytdlBin
  try {
    const ffmpegStatic = require.resolve('ffmpeg-static')
    const unpacked = ffmpegStatic.replace('app.asar', 'app.asar.unpacked')
    ytdlBin = unpacked.replace(/ffmpeg-static[\\/]ffmpeg/i, 'youtube-dl-exec/bin/yt-dlp')
  } catch {
    // Fallback: try global yt-dlp
    ytdlBin = 'yt-dlp'
  }
  return ytdlBin
}

const CACHE_TTL = 10 * 60 * 1000
const cache = new Map()

/**
 * Extract metadata from URL using yt-dlp.
 * Supports: YouTube, TikTok, SoundCloud, etc.
 */
export async function getMediaInfo(url) {
  if (!url) return null
  const cached = cache.get(url)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  try {
    const data = await runYtdl(['--dump-json', '--no-playlist', url])
    if (!data) return null

    let parsed
    try { parsed = JSON.parse(data) } catch { return null }

    const result = {
      title: parsed.title || 'Unknown',
      artist: parsed.artist || parsed.uploader || parsed.creator || 'Unknown',
      thumbnail: parsed.thumbnail || parsed.thumbnails?.[0]?.url || null,
      duration: parsed.duration || 0,
      webpageUrl: parsed.webpage_url || url,
      platform: extractPlatform(url),
      uploader: parsed.uploader || null,
      album: parsed.album || null,
      track: parsed.track || null,
      audioUrl: null
    }

    cache.set(url, { data: result, ts: Date.now() })
    return result
  } catch (e) {
    console.error('[yt-dlp] Failed:', e.message)
    return null
  }
}

/**
 * Get best audio stream URL for direct playback.
 */
export async function getAudioStreamUrl(url) {
  try {
    const data = await runYtdl([
      '--get-url', '--format', 'bestaudio[ext=m4a]/bestaudio/best',
      '--no-playlist', url
    ])
    return data?.trim() || null
  } catch (e) {
    console.error('[yt-dlp] Audio URL failed:', e.message)
    return null
  }
}

/**
 * Get metadata + audio URL in one call.
 */
export async function getMediaWithAudio(url) {
  const info = await getMediaInfo(url)
  if (!info) return null
  const audioUrl = await getAudioStreamUrl(url)
  return { ...info, audioUrl }
}

/**
 * Search YouTube via yt-dlp.
 */
export async function searchMedia(query, limit = 5) {
  try {
    const data = await runYtdl([
      '--dump-json', '--no-playlist', '--flat-playlist',
      `ytsearch${limit}:${query}`
    ])
    if (!data) return []
    const lines = data.trim().split('\n').filter(Boolean)
    return lines.map(line => {
      try {
        const item = JSON.parse(line)
        return {
          title: item.title || 'Unknown',
          artist: item.artist || item.uploader || 'Unknown',
          thumbnail: item.thumbnail || null,
          duration: item.duration || 0,
          url: item.webpage_url || item.url
        }
      } catch { return null }
    }).filter(Boolean).slice(0, limit)
  } catch (e) {
    console.error('[yt-dlp] Search failed:', e.message)
    return []
  }
}

async function runYtdl(args) {
  return new Promise((resolve, reject) => {
    execFile(getYtdlPath(), args, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000
    }, (err, stdout, stderr) => {
      if (err) {
        if (stderr && !stdout) reject(new Error(stderr.trim()))
        else resolve(stdout)
      } else {
        resolve(stdout)
      }
    })
  })
}

function extractPlatform(url) {
  if (!url) return 'unknown'
  if (url.includes('tiktok.com')) return 'TikTok'
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube'
  if (url.includes('soundcloud.com')) return 'SoundCloud'
  if (url.includes('twitter.com') || url.includes('x.com')) return 'Twitter/X'
  if (url.includes('instagram.com')) return 'Instagram'
  if (url.includes('spotify.com')) return 'Spotify'
  return 'web'
}
