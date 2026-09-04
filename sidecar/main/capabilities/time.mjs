// Connector plugin: waktu & utilitas tanggal (100% offline).

import path from 'path'
import fs from 'fs'

const TZ = (() => {
  try {
    return fs
      .realpathSync('/etc/localtime')
      .split(path.sep + 'zoneinfo' + path.sep)
      .pop()
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  }
})()

export async function runTime(actionId, args) {
  if (actionId === 'now') {
    const d = new Date()
    return {
      iso: d.toISOString(),
      epoch_ms: d.getTime(),
      timezone: TZ,
      locale_id: new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'full',
        timeStyle: 'medium'
      }).format(d)
    }
  }
  if (actionId === 'diff') {
    const { from, to } = args || {}
    const a = new Date(parseFlexible(from))
    const b = new Date(parseFlexible(to))
    if (isNaN(a) || isNaN(b)) {
      throw new Error(
        "Format from/to tidak bisa diparse (contoh valid: '09:00', '2026-09-03T08:00:00Z')."
      )
    }
    let ms = b - a
    const sign = ms < 0 ? '-' : ''
    ms = Math.abs(ms)
    const hours = Math.floor(ms / 3600000)
    const minutes = Math.round((ms % 3600000) / 60000)
    return {
      from: String(from),
      to: String(to),
      duration: `${sign}${hours}h ${minutes}m`,
      total_minutes: Math.round((b - a) / 60000)
    }
  }
  throw new Error(`Aksi time tidak dikenal: ${actionId}`)
}

// 'HH:MM' dianggap hari ini (lokal); format lain diteruskan apa adanya ke Date.
function parseFlexible(v) {
  const s = String(v || '').trim()
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return s
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(Number(m[1]))}:${m[2]}:${m[3] || '00'}`
}
