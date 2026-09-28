// choiceBus.ts — janji pilihan inline satu-kali untuk tool ask-choice.
//
// Tool ask-choice mem-push pesan berisi tombol opsi ke chat lalu menunggu
// klik user. Bus ini menghubungkan klik di bubble (renderer) dengan promise
// yang ditunggu dispatcher — tanpa lewat sesi baru atau input bar.
// Murni & unit-testable (tanpa window/db/network imports).

// ---- Kontrak tipe (W2-8a) ----
export interface ChoiceOptionObject {
  label?: string
  title?: string
  name?: string
  [key: string]: unknown
}

interface ParsedChoice {
  question: string
  options: string[]
  rawOptions: unknown[]
  type: string
}

type ChoiceValue = unknown

const pending = new Map<string, (v: ChoiceValue) => void>()

export const MAX_CHOICE_OPTIONS = 4
export const MAX_OPTION_LENGTH = 120

// Format query:
// 1. String flat konvensional: "pertanyaan||opsi1;opsi2[;opsi3;opsi4]".
// 2. JSON terstruktur / Multimodal cards:
//    { "question": "...", "type": "music_preview" | "general", "options": [ "...", { "label": "...", "title": "...", "artist": "...", "thumbnail": "...", "duration": "...", "id": "..." } ] }
// Kembalikan { question, options, rawOptions, type } atau null bila format tak valid.
export function parseChoiceQuery(query: unknown = ''): ParsedChoice | null {
  if (!query) return null

  // Dukung input objek langsung atau string JSON
  if (typeof query === 'object' && query !== null) {
    const qObj = query as { question?: unknown; options?: unknown; type?: unknown }
    const q = String(qObj.question || '').trim()
    const opts = Array.isArray(qObj.options) ? qObj.options : []
    if (!q || opts.length === 0) return null
    const sliced = opts.slice(0, MAX_CHOICE_OPTIONS)
    const options = sliced.map((opt: unknown): string => {
      if (typeof opt === 'string') return opt.trim().slice(0, MAX_OPTION_LENGTH)
      const o = (opt ?? {}) as ChoiceOptionObject
      return (o.label || o.title || o.name || String(opt)).trim().slice(0, MAX_OPTION_LENGTH)
    }).filter(Boolean) as string[]
    if (options.length === 0) return null
    return {
      question: q,
      options,
      rawOptions: sliced,
      type: (qObj.type as string) || 'text'
    }
  }

  const str = String(query).trim()
  if (str.startsWith('{') && str.endsWith('}')) {
    try {
      const parsedJson = JSON.parse(str) as unknown
      if (parsedJson && typeof parsedJson === 'object') {
        const p = parsedJson as { question?: unknown; options?: unknown }
        if (p.question || p.options) {
          return parseChoiceQuery(parsedJson)
        }
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
export const requestChoice = (choiceId: unknown): Promise<ChoiceValue> => {
  if (!choiceId) return Promise.resolve(null)
  return new Promise((resolve) => {
    pending.set(String(choiceId), resolve)
  })
}

// Resolve janji milik choiceId. Kembalikan false bila id tak dikenal
// (sudah ter-resolve / dibatalkan) agar klik ganda jadi no-op.
export const resolveChoice = (choiceId: unknown, value: ChoiceValue): boolean => {
  const key = String(choiceId)
  const resolve = pending.get(key)
  if (!resolve) return false
  pending.delete(key)
  resolve(value ?? null)
  return true
}

// Batalkan tanpa nilai (abort sesi): dispatcher menerima null.
export const dropChoice = (choiceId: unknown) => {
  pending.delete(String(choiceId))
}

export const pendingChoiceCount = (): number => pending.size

// Mapper murni chat item -> response home. WAJIB meneruskan `choice` agar
// tombol opsi selamat sampai ResponseArea (regresi tombol hilang di home).
export const mapChatItemToResponse = (lastItem: Record<string, unknown> | null | undefined) => {
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
  const content = lastItem.content as string | undefined
  return {
    text: content,
    type:
      (content?.length ?? 0) > 200 || content?.includes('\n')
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
