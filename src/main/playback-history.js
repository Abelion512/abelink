// src/main/playback-history.js — local playback history (source-first: local record guaranteed, last.fm optional)
import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 hari: <7d strong / 7-30 medium / >30 weak (decay kontinu)

function getFile () {
  const dir = join(app.getPath('userData'), 'history')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'playback.jsonl')
}

export function recordPlayback (title, artist) {
  try {
    const line = JSON.stringify({ ts: Date.now(), title: String(title || ''), artist: String(artist || 'Unknown') })
    appendFileSync(getFile(), line + '\n', 'utf8')
    return true
  } catch (e) {
    console.error('[playback-history] record failed', e.message)
    return false
  }
}

export function getRecentPlayback (limit = 30) {
  try {
    const file = getFile()
    if (!existsSync(file)) return []
    const now = Date.now()
    const rows = readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line) } catch { return null }
      })
      .filter(Boolean)
      .filter((r) => now - (r.ts || 0) <= MAX_AGE_MS)
    return rows.sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, limit)
  } catch (e) {
    console.error('[playback] read failed', e.message)
    return []
  }
}