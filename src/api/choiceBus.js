// choiceBus.js — janji pilihan inline satu-kali untuk tool ask-choice.
//
// Tool ask-choice mem-push pesan berisi tombol opsi ke chat lalu menunggu
// klik user. Bus ini menghubungkan klik di bubble (renderer) dengan promise
// yang ditunggu dispatcher — tanpa lewat sesi baru atau input bar.
// Murni & unit-testable (tanpa window/db/network imports).

const pending = new Map()

export const MAX_CHOICE_OPTIONS = 4
export const MAX_OPTION_LENGTH = 120

// Format query:
// 1. String flat konvensional: "pertanyaan||opsi1;opsi2[;opsi3;opsi4]".
// 2. JSON terstruktur / Multimodal cards:
//    { "question": "...", "type": "music_preview" | "general", "options": [ "...", { "label": "...", "title": "...", "artist": "...", "thumbnail": "...", "duration": "...", "id": "..." } ] }
// Kembalikan { question, options, rawOptions, type } atau null bila format tak valid.
export function parseChoiceQuery(query = '') {
  if (!query) return null

  // Dukung input objek langsung atau string JSON
  if (typeof query === 'object' && query !== null) {
    const q = (query.question || '').trim()
    const opts = Array.isArray(query.options) ? query.options : []
    if (!q || opts.length === 0) return null
    const sliced = opts.slice(0, MAX_CHOICE_OPTIONS)
    const options = sliced.map((opt) => {
      if (typeof opt === 'string') return opt.trim().slice(0, MAX_OPTION_LENGTH)
      return (opt.label || opt.title || opt.name || String(opt)).trim().slice(0, MAX_OPTION_LENGTH)
    }).filter(Boolean)
    if (options.length === 0) return null
    return {
      question: q,
      options,
      rawOptions: sliced,
      type: query.type || 'text'
    }
  }

  const str = String(query).trim()
  if (str.startsWith('{') && str.endsWith('}')) {
    try {
      const parsedJson = JSON.parse(str)
      if (parsedJson && (parsedJson.question || parsedJson.options)) {
        return parseChoiceQuery(parsedJson)
      }
    } catch {
      /* bukan JSON valid, lanjut parsing pipa */
    }
  }

  const [questionRaw, optionsRaw] = str.split('||')
  const question = (questionRaw || '').trim()
  if (!question || optionsRaw === undefined) return null
  const options = optionsRaw
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_CHOICE_OPTIONS)
    .map((s) => s.slice(0, MAX_OPTION_LENGTH))
  if (options.length === 0) return null
  return { question, options, rawOptions: options, type: 'text' }
}

// Daftarkan janji yang resolve saat tombol diklik. Resolve-once: klik
// kedua untuk id yang sama diabaikan (di sisi tombol via resolveChoice).
export const requestChoice = (choiceId) => {
  if (!choiceId) return Promise.resolve(null)
  return new Promise((resolve) => {
    pending.set(choiceId, resolve)
  })
}

// Resolve janji milik choiceId. Kembalikan false bila id tak dikenal
// (sudah ter-resolve / dibatalkan) agar klik ganda jadi no-op.
export const resolveChoice = (choiceId, value) => {
  const resolve = pending.get(choiceId)
  if (!resolve) return false
  pending.delete(choiceId)
  resolve(value ?? null)
  return true
}

// Batalkan tanpa nilai (abort sesi): dispatcher menerima null.
export const dropChoice = (choiceId) => {
  pending.delete(choiceId)
}

export const pendingChoiceCount = () => pending.size

// Mapper murni chat item -> response home. WAJIB meneruskan `choice` agar
// tombol opsi selamat sampai ResponseArea (regresi tombol hilang di home).
export const mapChatItemToResponse = (lastItem) => {
  if (!lastItem || lastItem.role !== 'ai') return null
  if (lastItem.isThinking || lastItem.isSearching) {
    return {
      text: lastItem.content || 'Memproses instruksi...',
      type: 'short',
      isThinking: true,
      mood: lastItem.mood || 'neutral',
      choice: null
    }
  }
  return {
    text: lastItem.content,
    type:
      lastItem.content?.length > 200 || lastItem.content?.includes('\n')
        ? 'long'
        : 'short',
    sources: lastItem.sources || [],
    youtubeData: lastItem.youtubeData,
    youtubeSummary: lastItem.youtubeLink,
    pluginResult: lastItem.pluginExecution,
    isProactive: lastItem.isProactive,
    mood: lastItem.mood || 'neutral',
    choice: lastItem.choice ?? null
  }
}

export default { parseChoiceQuery, requestChoice, resolveChoice, dropChoice, pendingChoiceCount }
