// Eksekutor tool domain MEDIA (dipindah murni dari useAbelinkPlan.executeSingleTool):
// YouTube search/summary, music control, TTS speak, screenshot-to-Telegram.
import { getYoutubeSummary } from '../../../api/ai/tools'
import { playVoice } from '../../../api/ai/utils'
import { parseChoiceQuery, requestChoice, dropChoice } from '../../../api/choiceBus.ts'
import { buildDirectTrack } from '../musicQuery.js'

// Race helper (cermin toolDispatcher agar media mandiri tanpa import silang).
const raceWithAbort = <T,>(promise: Promise<T>, currentSignal: AbortSignal | null | undefined) => {
  let onAbort: (() => void) | null = null
  const abortPromise = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Error('AbortError'))
    if (currentSignal?.aborted) return onAbort()
    currentSignal?.addEventListener('abort', onAbort)
  })
  return { race: Promise.race([promise, abortPromise]), onAbort }
}

interface MusicCandidate {
  id?: string
  videoId?: string
  title?: string
  name?: string
  artist?: string
  duration?: string | number
  thumbnail?: string
  url?: string
  isPlaylistOption?: boolean
  label?: string
}

interface MediaToolCtx {
  targetSetChatData?: (updater: (prev: never[]) => unknown[]) => void
  currentSignal?: AbortSignal | null
  tgContext?: { chatId?: unknown } | null
  getYoutubeData?: (query: string) => Promise<{ judul?: string; author?: string }>
  handleMusic?: (tool: string, query: string, setChatData: unknown) => Promise<unknown>
  youtubeMusicTools?: {
    enqueuePlaylist?: (tracks: unknown[], autoPlay?: boolean) => boolean
    playTrack?: (track: unknown) => boolean
    playUrl?: (url: string, track: unknown) => boolean
  } | null
  [key: string]: unknown
}

interface SetChatDataLike {
  (updater: (prev: MediaChatMsg[]) => MediaChatMsg[]): void
}

interface MediaChatMsg {
  role?: string
  content?: unknown
  isThinking?: boolean
  isSummarizing?: boolean
  youtubeLink?: string
  choice?: { id?: string; options?: unknown[]; rawOptions?: unknown[]; type?: string; selected?: unknown }
  isIntermediate?: boolean
  timestamp?: string
  created_at?: number
  [key: string]: unknown
}

const musicLabel = (m: MusicCandidate | string) => {
  const t = typeof m === 'string' ? m : m?.title || m?.id || ''
  const a = typeof m === 'string' ? '' : m?.artist || ''
  return `${t}${a ? ` — ${a}` : ''}`.slice(0, 120)
}

// Tawarkan kandidat lagu via tombol inline (format ask-choice, maks 4).
// Kembalikan item kandidat terpilih atau null (batal/abort).
const offerMusicChoice = async (
  candidates: MusicCandidate[],
  question: string | undefined,
  ctx: MediaToolCtx | undefined
): Promise<MusicCandidate | { isPlaylist: boolean; allTracks: MusicCandidate[] } | null> => {
  const { targetSetChatData, currentSignal } = ctx || {}
  const opts = Array.isArray(candidates) ? candidates.slice(0, 4) : []
  const hasPlaylistOption = Array.isArray(candidates) && candidates.length > 1
  const playlistOptionLabel = 'Putar Seluruh Playlist ke Antrean'
  const displayOpts = hasPlaylistOption ? [...opts, { isPlaylistOption: true, title: playlistOptionLabel, label: playlistOptionLabel }] : opts

  const choicePayload = {
    question: question || 'Lagu mana yang dimaksud?',
    type: 'music_preview',
    options: displayOpts.map((m) => ({
      label: m.isPlaylistOption ? m.label : musicLabel(m),
      title: m.title || m.name,
      artist: m.artist || '',
      duration: m.duration || '',
      thumbnail: m.thumbnail || '',
      id: m.id || m.videoId
    }))
  }
  const parsed = parseChoiceQuery(choicePayload) as {
    question?: string
    options?: string[]
    rawOptions?: unknown[]
  } | null
  const setChat = targetSetChatData as unknown as SetChatDataLike | undefined
  if (!parsed || typeof setChat !== 'function') return null
  const choiceId = `choice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const choiceTimestamp = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  setChat((prev) => [
    ...prev.filter((item: MediaChatMsg) => !item.isThinking),
    {
      role: 'ai',
      content: parsed.question,
      choice: {
        id: choiceId,
        options: parsed.options,
        rawOptions: parsed.rawOptions,
        type: 'music_preview',
        selected: null
      },
      isIntermediate: true,
      timestamp: choiceTimestamp,
      created_at: Date.now()
    }
  ])
  let selected = null
  const { race, onAbort } = raceWithAbort(requestChoice(choiceId) as Promise<string>, currentSignal)
  try {
    selected = await race
  } catch {
    selected = null
  } finally {
    if (onAbort) currentSignal?.removeEventListener('abort', onAbort)
    dropChoice(choiceId)
  }
  if (selected == null) return null
  const idx = (parsed.options || []).indexOf(selected as string)
  setChat((prev) => [
    ...prev
      .filter((item: MediaChatMsg) => !item.isThinking)
      .map((m: MediaChatMsg) => (m.choice?.id === choiceId ? { ...m, choice: { ...m.choice, selected } } : m)),
    { role: 'user', content: selected, timestamp: choiceTimestamp, created_at: Date.now() }
  ])

  const picked = displayOpts[idx >= 0 ? idx : 0]
  if (picked?.isPlaylistOption) {
    return { isPlaylist: true, allTracks: candidates }
  }
  return picked ?? null
}

/**
 * @returns {string|undefined} resultString bila tool milik domain ini.
 */
export const runMediaTool = async (
  tool: string,
  query: string,
  ctx: MediaToolCtx
): Promise<string | undefined> => {
  const { targetSetChatData, tgContext, getYoutubeData, handleMusic } = ctx
  const setChat = targetSetChatData as unknown as SetChatDataLike
  // 1. YouTube Search
  if (tool === 'yt-search') {
    const ytResults = await window.api.searchYoutube(query)
    return JSON.stringify(ytResults)
  }
  // 2. YouTube Summary
  if (tool === 'yt-summary') {
    setChat((prev) => [
      ...prev,
      {
        role: 'ai',
        content: 'Menonton video youtube...',
        isSummarizing: true,
        youtubeLink: query
      }
    ])
    const yData = await getYoutubeData!(query)
    const out = await getYoutubeSummary(query, yData, ctx.currentSignal ?? null)
    setChat((prev) => prev.filter((item: MediaChatMsg) => !item.isSummarizing))
    return out
  }
  // 3. Music Control
  if (tool.startsWith('music')) {
    const out = (await handleMusic?.(tool, query, targetSetChatData)) as
      | { candidates?: MusicCandidate[]; question?: string }
      | string
      | object
      | null
      | undefined
    // Kandidat ambigu -> tawarkan tombol inline (ask-choice), bukan autoplay buta.
    // Kontrak: handleMusic kembalikan { candidates } bila tak yakin.
    if (out && typeof out === 'object' && Array.isArray((out as { candidates?: unknown }).candidates) && (out as { candidates: unknown[] }).candidates.length > 0) {
      const o = out as { candidates: MusicCandidate[]; question?: string }
      const picked = await offerMusicChoice(o.candidates, o.question, ctx)
      if (!picked) return '[DIBATALKAN] User tidak memilih lagu. Minta query lebih spesifik bila masih dibutuhkan.'
      if ('isPlaylist' in picked && picked.isPlaylist && Array.isArray(picked.allTracks)) {
        if (ctx.youtubeMusicTools?.enqueuePlaylist) {
          ctx.youtubeMusicTools.enqueuePlaylist(picked.allTracks, true)
          return `Berhasil memasukkan ${picked.allTracks.length} lagu playlist/OST ke dalam antrean dan memutar lagu pertama.`
        }
      }
      const pickedId = (picked as MusicCandidate).id || (picked as MusicCandidate).videoId || null
      if (pickedId) {
        // Direct-play: user sudah memilih — mainkan ID-nya TANPA search ulang.
        const track = buildDirectTrack(String(pickedId), picked as MusicCandidate)
        const tools = ctx.youtubeMusicTools || {}
        const direct = typeof tools.playTrack === 'function' ? tools.playTrack(track) : false
        const viaUrl = !direct && typeof tools.playUrl === 'function'
          ? tools.playUrl(`https://music.youtube.com/watch?v=${pickedId}`, track)
          : false
        if (direct || viaUrl) return `[SYSTEM LOG] Berhasil memutar lagu: ${track.title} oleh ${track.artist}`
        return '[SYSTEM LOG] GAGAL memutar lagu: engine pemutar musik belum siap. Laporkan ke user bahwa musik tidak bisa diputar saat ini.'
      }
      return String(await handleMusic?.('music-play', String((picked as MusicCandidate).url || (picked as MusicCandidate).title || ''), targetSetChatData))
    }
    return typeof out === 'string' ? out : JSON.stringify(out)
  }
  // 5. Speak (TTS)
  if (tool === 'speak') {
    if (query && query.trim() !== '') {
      setChat((prev: MediaChatMsg[]) => {
        const filtered = prev.filter((item: MediaChatMsg) => !item.isThinking)
        return [
          ...filtered,
          { role: 'ai', content: `(Sedang berbicara) ${query}`, isThinking: true }
        ]
      })
      await playVoice(query)
      return `Berhasil berbicara secara lisan: "${query}"`
    }
    return 'Gagal: teks yang mau diucapkan kosong.'
  }
  // 6. Screenshot ke Telegram (native: misc_take_screenshot + telegram_send_photo)
  if (tool === 'screenshot-to-tg') {
    if (window.api && window.api.tgTakeScreenshot) {
      const targetChatId = tgContext?.chatId || null
      try {
        const res = (await window.api.tgTakeScreenshot(targetChatId)) as { sent?: number; skipped?: boolean; error?: string } | null | undefined
        if (res && Number(res.sent) > 0) {
          return `Screenshot layar PC terkirim ke ${res.sent} penerima Telegram.`
        }
        if (res && res.skipped) {
          return 'Gagal: bot Telegram tidak sedang terhubung.'
        }
        return `Gagal mengirim screenshot: ${(res && res.error) || 'tidak diketahui'}`
      } catch (e) {
        return `Gagal: ${(e && (e as Error).message) || 'error screenshot Telegram'}`
      }
    }
    return 'Gagal: Fitur Telegram Bot belum tersedia.'
  }
  return undefined
}
