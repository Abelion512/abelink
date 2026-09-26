// Pure helpers Stream B (tanpa deps, unit-testable):
// ekstraksi ID video YouTube, parsing arg antrean, parsing mode loop, deteksi query kabur.
const VIDEO_ID = '([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])'

export function extractVideoId(input) {
  const s = String(input || '').trim()
  if (!s) return null
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s
  const patterns = [
    new RegExp('[?&]v=' + VIDEO_ID),
    new RegExp('youtu\\.be/' + VIDEO_ID),
    new RegExp('/(?:shorts|embed|live)/' + VIDEO_ID)
  ]
  for (const re of patterns) {
    const m = s.match(re)
    if (m) return m[1]
  }
  return null
}

export function parseQueueAdd(input) {
  const s = String(input || '').trim().replace(/^["']|["']$/g, '').trim()
  const m = s.match(/^(.*?)\s*x(\d+)\s*$/i)
  if (m && m[1].trim()) return { query: m[1].trim(), repeat: Math.max(1, parseInt(m[2], 10)) }
  return { query: s, repeat: 1 }
}

export function parseLoopMode(input) {
  const s = String(input || '').trim().toLowerCase()
  if (s === 'off') return { mode: 'off', limit: null }
  if (s === 'all') return { mode: 'all', limit: null }
  if (s === 'one') return { mode: 'one', limit: null }
  const m = s.match(/^one\s+(\d+)\s*x$/)
  if (m) return { mode: 'one', limit: Math.max(1, parseInt(m[1], 10)) }
  return null
}

const VAGUE_RE = /^(lagu favorit|musik favorit|lagu kesukaan|musik kesukaan|lagu santai|musik santai|lagu biasa|musik biasa|favorit|kesukaan|biasa|bebas|apa aja|lagu yang enak|lagu yang enak apa|terserah|acak|random|lagu acak|musik acak|putar sesuatu|play something|play anything|anything|something)$/i

export function isVagueMusicQuery(q) {
  return !q || VAGUE_RE.test(String(q).trim())
}

export function buildDirectTrack(id, meta) {
  return {
    id,
    title: meta?.title || meta?.label || meta?.name || 'Selected Song',
    artist: meta?.artist || 'YouTube Music',
    duration: meta?.duration || '',
    thumbnail: meta?.thumbnail || (id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '')
  }
}

// Pure ENDED-transition decision (unit-testable, no I/O).
// mode: 'off' | 'all' | 'one'. Item shape: {id, repeat, repeatInit}
// (repeat = plays remaining INCLUDING current; repeatInit = reset value for loop-all).
// Returns {action, targetId?, queue?, oneRemaining?, setMode?}:
//   replay  -> load targetId again (queue may carry decremented repeat)
//   advance -> play targetId (next item)
//   restart -> loop-all wrap: play targetId (head) with queue reset
//   stop    -> nothing left (queue possibly updated)
export function nextPlaybackStep({ mode = 'off', queue = [], currentId = '', oneLimit = null, oneRemaining = null } = {}) {
  const q = Array.isArray(queue) ? queue : []
  if (q.length === 0) return { action: 'stop', queue: q, oneRemaining }
  let idx = q.findIndex((t) => t && t.id === currentId)
  if (idx < 0) idx = 0
  const cur = q[idx]
  if (!cur?.id) return { action: 'stop', queue: q, oneRemaining }
  if (mode === 'one') {
    if (oneLimit == null) return { action: 'replay', targetId: cur.id, queue: q, oneRemaining }
    const rem = oneRemaining ?? oneLimit
    if (rem > 1) return { action: 'replay', targetId: cur.id, queue: q, oneRemaining: rem - 1 }
    const ni = idx + 1
    if (ni < q.length) return { action: 'advance', targetId: q[ni].id, queue: q, oneRemaining: null, setMode: 'off' }
    return { action: 'stop', queue: q, oneRemaining: null, setMode: 'off' }
  }
  const rep = Math.max(1, Number(cur.repeat ?? 1) || 1)
  if (rep > 1) {
    const nq = q.map((t, i) => (i === idx ? { ...t, repeat: rep - 1 } : t))
    return { action: 'replay', targetId: cur.id, queue: nq, oneRemaining }
  }
  const ni = idx + 1
  if (ni < q.length) return { action: 'advance', targetId: q[ni].id, queue: q, oneRemaining }
  if (mode === 'all') {
    const nq = q.map((t) => ({ ...t, repeat: Math.max(1, Number(t?.repeatInit ?? 1) || 1) }))
    return { action: 'restart', targetId: nq[0].id, queue: nq, oneRemaining }
  }
  return { action: 'stop', queue: q, oneRemaining }
}
