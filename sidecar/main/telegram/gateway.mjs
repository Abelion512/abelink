// Fase 3 — minimal Telegram gateway di atas telegram-service.js yang ada.
//
// Adapter: update Bot API -> MessageEvent -> session key
// `agent:abelink:telegram:{private|group}:{chatId}` -> allowlist (deny
// default; TELEGRAM_ALLOW_ALL=1 opsional) -> guard per-sesi -> runAgent ->
// reply via sendTelegramMessage; approval via keyboard + waitForAskUserAnswer.
//
// Batasan kontrak: tanpa DM pairing (pending hanya ditolak eksplisit, reuse
// pendingChatIdsSet nanti), tanpa multi-target fan-out (direct reply saja).
// Deps di-inject (runAgent/sender/asker) agar offline-testable; default
// di-lazy-import dari telegram-service.js (tanpa side-effect saat import).

const SESSION_PREFIX = 'agent:abelink:telegram'
const MAX_SEEN = 500
const DEFAULT_QUEUE_CAP = 3
const DEFAULT_OFFLINE_CAP = 50

const lazyService = () => import('./telegram-service.js')

const defaultSender = async (chatId, text) => {
  const m = await lazyService()
  return m.sendTelegramMessage(chatId, text)
}

const defaultAsker = async (chatId, question, options, timeoutMs) => {
  const m = await lazyService()
  const sent = await m.sendInlineKeyboard(chatId, question, options)
  if (!sent?.success) return null
  return m.waitForAskUserAnswer(chatId, timeoutMs)
}

// Update Bot API -> MessageEvent; non-message (callback_query dsb) -> null.
export const normalizeTelegramUpdate = (update) => {
  const msg = update?.message
  if (!msg) return null
  const chat = msg.chat || {}
  const from = msg.from || {}
  const chatId = String(chat.id ?? from.id ?? '')
  if (!chatId) return null
  const doc = msg.document || null
  const photoArr = Array.isArray(msg.photo) ? msg.photo : []
  const file = doc
    ? { kind: 'document', fileId: doc.file_id, name: doc.file_name || '' }
    : photoArr.length > 0
      ? { kind: 'photo', fileId: photoArr[photoArr.length - 1].file_id }
      : null
  return {
    platform: 'telegram',
    chatKind: chat.type === 'private' ? 'private' : 'group',
    chatId,
    userId: String(from.id ?? chatId),
    username: String(from.username || '').toLowerCase().replace(/^@/, ''),
    messageId: String(msg.message_id ?? ''),
    text: typeof msg.text === 'string' ? msg.text : '',
    caption: typeof msg.caption === 'string' ? msg.caption : '',
    file,
    ts: typeof msg.date === 'number' ? msg.date * 1000 : Date.now(),
  }
}

export const sessionKeyForEvent = (evt) =>
  `${SESSION_PREFIX}:${evt.chatKind}:${evt.chatId}`

// '111, @bosz;333' -> ['111','bosz','333'] (mirip splitTgAdminIds renderer).
export const parseAdminList = (raw) =>
  String(raw ?? '')
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)

export const isAllowed = (evt, { adminSet, pendingSet, allowAll } = {}) => {
  if (allowAll) return { allowed: true, reason: 'allow-all' }
  const uid = String(evt?.userId || '').toLowerCase()
  const uname = String(evt?.username || '').toLowerCase().replace(/^@/, '')
  const cid = String(evt?.chatId || '').toLowerCase()
  if (pendingSet?.has(uid) || pendingSet?.has(cid)) return { allowed: false, reason: 'pending' }
  if (adminSet?.has(uid) || adminSet?.has(cid) || (uname && adminSet?.has(uname))) {
    return { allowed: true, reason: 'allowlist' }
  }
  return { allowed: false, reason: 'unknown' }
}

const envAllowAll = () => {
  const v = String(process.env.TELEGRAM_ALLOW_ALL || '').toLowerCase()
  return v === '1' || v === 'true'
}

export const createTelegramGateway = (opts = {}) => {
  const {
    tgAdminIds = '',
    allowAll = envAllowAll(),
    pendingIds = [],
    queueCap = DEFAULT_QUEUE_CAP,
    offlineCap = DEFAULT_OFFLINE_CAP,
    runAgent = async () => ({ answer: '[SKIP]: agent loop belum terhubung ke gateway.' }),
    sender = defaultSender,
    asker = defaultAsker,
  } = opts

  const adminSet = new Set(parseAdminList(tgAdminIds))
  const pendingSet = new Set(
    (Array.isArray(pendingIds) ? pendingIds : [pendingIds]).map((v) => String(v).toLowerCase()),
  )
  const seen = new Set()
  const running = new Map()
  const queues = new Map()
  const offlineQueue = []
  let droppedOffline = 0

  const markSeen = (key) => {
    if (seen.has(key)) return false
    seen.add(key)
    if (seen.size > MAX_SEEN) seen.delete(seen.values().next().value)
    return true
  }

  // Gagal kirim (offline/belum connected) -> antre jujur, buang terlama bila penuh.
  const deliver = async (chatId, text) => {
    const res = await sender(chatId, text)
    if (res?.success) return res
    offlineQueue.push({ chatId, text })
    if (offlineQueue.length > offlineCap) {
      const excess = offlineQueue.length - offlineCap
      offlineQueue.splice(0, excess)
      droppedOffline += excess
    }
    return { success: false, queued: true }
  }

  const requestApproval = (chatId, question, options, timeoutMs) =>
    asker(chatId, question, options, timeoutMs)

  const processEvent = async (evt) => {
    const answer = await runAgent(evt)
    await deliver(evt.chatId, answer?.answer ?? 'Selesai diproses.')
  }

  const pump = async (sessionKey) => {
    for (;;) {
      const q = queues.get(sessionKey)
      const next = q?.shift()
      if (!next) {
        queues.delete(sessionKey)
        running.set(sessionKey, false)
        return
      }
      await processEvent(next)
    }
  }

  const handleMessageEvent = async (evt) => {
    if (!evt) return { status: 'ignored' }
    if (!markSeen(`${evt.chatId}:${evt.messageId}`)) return { status: 'duplicate' }
    const auth = isAllowed(evt, { adminSet, pendingSet, allowAll })
    if (!auth.allowed) return { status: 'denied', reason: auth.reason }
    const sessionKey = sessionKeyForEvent(evt)
    if (running.get(sessionKey)) {
      const q = queues.get(sessionKey) || []
      if (q.length >= queueCap) {
        await deliver(evt.chatId, '[INFO]: masih memproses pesan sebelumnya, coba lagi sesaat.')
        return { status: 'busy', sessionKey }
      }
      q.push(evt)
      queues.set(sessionKey, q)
      return { status: 'queued', sessionKey }
    }
    running.set(sessionKey, true)
    try {
      await processEvent(evt)
    } finally {
      await pump(sessionKey)
    }
    return { status: 'replied', sessionKey }
  }

  const handleUpdate = (update) => handleMessageEvent(normalizeTelegramUpdate(update))

  const flushOffline = async () => {
    const batch = offlineQueue.splice(0, offlineQueue.length)
    let sent = 0
    for (const item of batch) {
      const res = await sender(item.chatId, item.text)
      if (res?.success) sent += 1
      else offlineQueue.push(item)
    }
    return { sent, pending: offlineQueue.length, dropped: droppedOffline }
  }

  return {
    handleUpdate,
    handleMessageEvent,
    requestApproval,
    flushOffline,
    _state: { seen, running, queues, offlineQueue },
  }
}
