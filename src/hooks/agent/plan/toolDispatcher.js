// Dispatcher eksekusi tool (dipindah dari useAbelinkPlan.executeSingleTool).
// Pola seam: domain media/vision/knowledge/agent dipisah per-modul; dispatcher
// ini hanya menangani ask-user, native-tool (+kasus khusus run-shell), dan
// fallback plugin — lalu formatting hasil TERPUSAT (satu bentuk return).
import { checkTools } from '../../../api/tools/index'
import {
  logToolCall as trajectoryLogTool,
  logReasoning
} from '../../../api/trajectory'
import { runMediaTool } from './mediaTools'
import { runVisionTool } from './visionTools'
import { runKnowledgeTool } from './knowledgeTools'
import { runAgentTool } from './agentTools'
import { parseChoiceQuery, requestChoice, dropChoice } from '../../../api/choiceBus.js'

// Indikator dinding-login untuk evidence gate browser-ask.
export const LOGIN_WALL_RE = /login|log in|masuk|captcha|cloudflare|verify.*human|human.*verif|two-factor|2fa|otp|verifikasi|sign ?in/i

// Cakupan forensik tool-calls JSONL: tauri-bridge hanya mencatat tool yang
// lewat executeNativeTool. Domain yang return lebih awal di bawah (media,
// vision, knowledge, ask, agent, fallback osOpen run-shell skema-URL, cabang
// plugin bila checkTools gagal) lolos tanpa jejak. Predikat ini tinggal di
// sini (bukan di caller) agar definisi "native-backed" tidak drift dari
// routing aktual saat tool baru ditambah.
const NON_NATIVE_TOOL_RE =
  /^(yt-search|yt-summary|speak|screenshot-to-tg|analyze-screen|camera-look|memory-search|memory|browser-ask-user|os-ask-user|os-ask|ask-user|user-ask|ask-choice|user-choice|spawn_subagent|wait_subagents|send_message|list_subagents|kill_subagent|read-tools|read-skill|delegate_coding)$/
const NON_NATIVE_TOOL_PREFIXES = ['music', 'connector-', 'trading-']
export const isNativeBacked = (tool, query) => {
  if (!checkTools(tool)) return false
  if (NON_NATIVE_TOOL_RE.test(tool)) return false
  if (NON_NATIVE_TOOL_PREFIXES.some((p) => String(tool).startsWith(p))) return false
  if (tool === 'run-shell' && /^(xdg-open|open)\s/i.test(String(query || '').trim())) return false
  return true
}

// True bila alasan query atau observasi terakhir mengandung bukti login wall.
export const hasLoginWallEvidence = (query, loopMessages) => {
  if (LOGIN_WALL_RE.test(String(query || ''))) return true
  if (Array.isArray(loopMessages)) {
    for (let i = loopMessages.length - 1; i >= 0; i--) {
      const c = loopMessages[i]?.content
      if (typeof c === 'string' && c.includes('[OBSERVATION]')) {
        return LOGIN_WALL_RE.test(c)
      }
    }
  }
  return false
}

// Sesi os-control yang dibuka model (per sesi chat). Dipakai agar
// teardown os-control-close hanya dipanggil bila sesi pernah dibuka —
// sebelumnya dipanggil buta tiap akhir run (bahkan sapaan), kadang blokir 20s+.
const osControlOpenSessions = new Set()
export const markOsControlSession = (sessionId, open) => {
  const key = String(sessionId ?? 'default')
  if (open) osControlOpenSessions.add(key)
  else osControlOpenSessions.delete(key)
}
export const isOsControlSessionOpen = (sessionId) =>
  osControlOpenSessions.has(String(sessionId ?? 'default'))

// STREAM D: tool results boleh membawa images[] (data URL). Cap jujur —
/// maks 4 gambar, 2MB per gambar. Murni & unit-testable.
export const MAX_TOOL_IMAGES = 4
export const MAX_TOOL_IMAGE_BYTES = 2 * 1024 * 1024

const estimateDataUrlBytes = (src = '') => {
  const comma = String(src).indexOf(',')
  const b64 = comma === -1 ? String(src) : String(src).slice(comma + 1)
  return Math.floor(b64.length * 3 / 4)
}

export const capToolImages = (images = []) => {
  const list = Array.isArray(images)
    ? images.filter((s) => typeof s === 'string' && s.length > 0)
    : []
  let oversized = 0
  const sized = list.filter((src) => {
    if (src.startsWith('data:') && estimateDataUrlBytes(src) > MAX_TOOL_IMAGE_BYTES) {
      oversized++
      return false
    }
    return true
  })
  const kept = sized.slice(0, MAX_TOOL_IMAGES)
  const notes = []
  if (oversized > 0) {
    notes.push(
      `[GAMBAR DITOLAK] ${oversized} gambar melebihi 2MB — tidak dilampirkan. Minta versi kecil/resolusi rendah bila gambar itu penting.`
    )
  }
  if (sized.length > kept.length) {
    notes.push(`[GAMBAR DIPOTONG] Hanya ${kept.length} gambar pertama dilampirkan (dari ${sized.length}).`)
  }
  return { images: kept, notice: notes.join('\n') }
}

export const formatRes = (tool, query, res, ctx = null) => {
  // Jejak trajectory tak pernah sessionId null ('system' bila tanpa konteks sesi).
  const sid = ctx?.sessionId ?? 'system'
  const turn = ctx?.turn ?? null
  let resultString
  let carriedImages = null
  if (res && res.success) {
    if (tool === 'os-control-open') markOsControlSession(ctx?.sessionId, true)
    if (tool === 'os-control-close') markOsControlSession(ctx?.sessionId, false)
    resultString =
      res.data !== undefined
        ? typeof res.data === 'string'
          ? res.data
          : JSON.stringify(res.data)
        : res.message || 'Success'

    // Pemotongan isi dokumen jika terlalu panjang
    if (tool === 'read-document') {
      const parts = query.split('||')
      const fullText =
        typeof res.data === 'object' && res.data !== null
          ? res.data.content || ''
          : String(res.data || '')
      if (fullText && fullText.length > 2500) {
        resultString = `${fullText.slice(0, 2500)}\n\n[DOKUMEN DIPOTONG (Total: ${fullText.length} karakter). Gunakan read-document dengan query "${parts[0]}||kata_kunci" untuk pencarian spesifik]`
      }
    }
    // Tool result boleh membawa images[] (data URL) — cap jujur maks 4 × 2MB.
    if (res.images !== undefined) {
      const capped = capToolImages(res.images)
      if (capped.images.length > 0) carriedImages = capped.images
      if (capped.notice) resultString += `\n\n${capped.notice}`
    }
    // Log tool call to trajectory buffer
    trajectoryLogTool({ tool, query, success: true, result: resultString, sessionId: sid, turn })
  } else {
    resultString = `[ERROR] ${tool} gagal: ${(res && (res.message || res.error)) || 'Unknown error'}`
    // Log failed tool call to trajectory buffer
    trajectoryLogTool({ tool, query, success: false, result: resultString, sessionId: sid, turn })
  }
  return {
    resultString,
    rejected: false,
    toolExecution: { action: tool, query, result: resultString },
    ...(carriedImages ? { images: carriedImages } : {})
  }
}

const raceWithAbort = (promise, currentSignal) => {  let onAbort = null
  const abortPromise = new Promise((_, reject) => {
    onAbort = () => reject(new Error('AbortError'))
    if (currentSignal?.aborted) return onAbort()
    currentSignal?.addEventListener('abort', onAbort)
  })
  return { race: Promise.race([promise, abortPromise]), onAbort }
}

/**
 * Eksekusi satu tool. ctx = {...callCtx(tgContext, workspaceRoot, turnId,
 * signal, ...), targetSetChatData, currentSignal, config, requestApproval,
 * requestUserInput, requestCameraCapture, handleMusic, getYoutubeData,
 * targetPushProcess, pluginProcessId }.
 */
export const executeSingleTool = async (tool, query, ctx) => {
  const {
    targetSetChatData,
    currentSignal,
    config,
    requestApproval,
    requestUserInput,
    targetPushProcess,
    pluginProcessId
  } = ctx
  let resultString = 'Tidak ada hasil.'

  try {
    // Domain media / vision / knowledge: resultString final langsung.
    const media = await runMediaTool(tool, query, ctx)
    if (media !== undefined) {
      return { resultString: media, rejected: false, toolExecution: { action: tool, query, result: media } }
    }
    const vision = await runVisionTool(tool, query, ctx)
    if (vision !== undefined) {
      // Hasil vision boleh objek { text, images[] } — gambar diteruskan
      // ke pesan via kontrak images (cap di bawah), teks jadi resultString.
      const vText = typeof vision === 'string' ? vision : vision?.text || ''
      const vImages = typeof vision === 'object' && vision !== null && Array.isArray(vision.images) ? vision.images : []
      const vCapped = capToolImages(vImages)
      return {
        resultString: vText + (vCapped.notice ? `\n\n${vCapped.notice}` : ''),
        rejected: false,
        toolExecution: { action: tool, query, result: vText },
        ...(vCapped.images.length > 0 ? { images: vCapped.images } : {})
      }
    }
    const knowledge = await runKnowledgeTool(tool, query, ctx)
    if (knowledge !== undefined) {
      return { resultString: knowledge, rejected: false, toolExecution: { action: tool, query, result: knowledge } }
    }
    // 3a. Interactive User Pause & Ask (Human-in-the-Loop)
    if (
      tool === 'browser-ask-user' ||
      tool === 'os-ask-user' ||
      tool === 'os-ask' ||
      tool === 'ask-user' ||
      tool === 'user-ask'
    ) {
      // Evidence gate (browser saja): browser-ask tanpa bukti login wall di
      // alasan atau observasi terakhir = DITOLAK + replan, bukan terminal.
      // Mencegah pola menyerah-setelah-baca (kasus debat ChatGPT).
      if (tool.startsWith('browser') && !hasLoginWallEvidence(query, ctx?.loopMessages)) {
        resultString =
          '[DITOLAK-HUMAN-LOOP] browser-ask-user ditolak: tidak ada bukti login wall (login/captcha/2FA) di alasan maupun observasi terakhir. Baca tab dulu (browser-read); bila butuh keputusan user pakai ask-choice; bila form login benar ada, panggil browser-ask-user lagi dengan alasan spesifik.'
        return { resultString, rejected: false, toolExecution: { action: tool, query, result: resultString } }
      }
      if (typeof requestUserInput === 'function') {
        const userResponse = await requestUserInput({
          title: tool.startsWith('browser') ? 'Browser Paused for Input' : 'Abelink Paused for Input',
          message: query || 'Abelink memerlukan tindakan atau informasi dari Anda sebelum melanjutkan tugas.',
          placeholder: 'Tambahkan komentar atau instruksi untuk Abelink (opsional)...'
        })
        if (userResponse?.confirmed) {
          resultString = `[LAPORAN USER]: ${userResponse.comment || 'User telah menyelesaikan tindakan manual dan meminta Anda melanjutkan.'}`
        } else {
          resultString = '[DIBATALKAN]: User membatalkan permintaan bantuan.'
        }
      } else {
        resultString = `[USER PROMPT]: ${query}. Menunggu intervensi user.`
      }
      return { resultString, rejected: false, toolExecution: { action: tool, query, result: resultString } }
    }
    // 3b. Inline Choice (tombol opsi di chat — loop lanjut otomatis setelah klik)
    if (tool === 'ask-choice' || tool === 'user-choice') {
      const parsed = parseChoiceQuery(query)
      if (!parsed) {
        resultString =
          '[FORMAT SALAH] Query ask-choice wajib "pertanyaan||opsi1;opsi2[;opsi3;opsi4]" (maks 4 opsi). Contoh: "Lanjut debat di history mana?||Percakapan A;Percakapan B". Perbaiki lalu panggil ulang.'
        return {
          resultString,
          rejected: false,
          toolExecution: { action: tool, query, result: resultString }
        }
      }
      const choiceId = `choice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const choiceTimestamp = new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
      })
      targetSetChatData((prev) => [
        ...prev.filter((item) => !item.isThinking),
        {
          role: 'ai',
          content: parsed.question,
          choice: { id: choiceId, options: parsed.options, selected: null },
          isIntermediate: true,
          timestamp: choiceTimestamp,
          created_at: Date.now()
        }
      ])
      let selected = null
      const { race, onAbort } = raceWithAbort(requestChoice(choiceId), currentSignal)
      try {
        selected = await race
      } catch (e) {
        // Abort (tombol stop): janji ditolak — anggap batal, bersihkan slot.
        selected = null
      } finally {
        if (onAbort) currentSignal?.removeEventListener('abort', onAbort)
        dropChoice(choiceId)
      }
      if (selected == null) {
        resultString =
          '[DIBATALKAN] User tidak memilih opsi. Lanjut dengan default terbaik atau laporkan blocked yang spesifik.'
      } else {
        targetSetChatData((prev) => [
          ...prev
            .filter((item) => !item.isThinking)
            .map((m) =>
              m.choice?.id === choiceId ? { ...m, choice: { ...m.choice, selected } } : m
            ),
          { role: 'user', content: selected, timestamp: choiceTimestamp, created_at: Date.now() }
        ])
        resultString = `[PILIHAN USER]: ${selected}`
      }
      return { resultString, rejected: false, toolExecution: { action: tool, query, result: resultString } }
    }
    // 9. Built-in Native Tools (+ sub-agent & skill tools via domain agent)
    if (checkTools(tool)) {
      // Domain multi-agent & delegation: tangani lebih awal dengan protokol internalnya
      const agentRes = await runAgentTool(tool, query, ctx)
      if (agentRes !== undefined) {
        return formatRes(tool, query, agentRes, ctx)
      }

      const approvalCheck = await window.api.checkToolApproval(tool, query)

      if (approvalCheck.needsApproval && requestApproval) {
        const userApproved = await requestApproval(approvalCheck.message, tool, query)
        if (!userApproved) {
          resultString = `[DITOLAK] User menolak eksekusi "${tool}". Cari cara lain atau tanyakan user.`
          return {
            resultString,
            rejected: true,
            toolExecution: { action: tool, query, result: resultString }
          }
        }
      }

      let res
      if (tool === 'run-shell') {
        // Fix: detect URL scheme commands (xdg-open "https://...") that fail in headless/Tauri env.
        // Fallback ke os-open (Tauri IPC) yang bisa buka URL di browser user's PC.
        const q = String(query || '').trim()
        if (/^xdg-open\s/.test(q) || /^open\s/.test(q)) {
          // Extract URL dari quotes/braces
          const urlMatch = q.match(/(?:xdg-open|open)\s+["']?([^"'\s]+)["']?/i)
          const url = urlMatch ? urlMatch[1] : q.replace(/^(xdg-open|open)\s+/i, '').trim()
          if (url) {
            try {
              const urlRes = await window.api.osOpen(url)
              resultString = typeof urlRes === 'string' ? urlRes : JSON.stringify(urlRes)
              logReasoning({ prompt: `Shell URL fallback ke os-open: ${url}`, sessionId: ctx?.sessionId ?? 'system' })
            } catch (e) {
              resultString = `[ERROR] Gagal buka URL: ${(e && e.message) || 'unknown'}`
              logReasoning({ prompt: `Shell URL gagal: ${url}`, suggested_mode: 'direct', sessionId: ctx?.sessionId ?? 'system' })
            }
            return {
              resultString,
              rejected: false,
              toolExecution: { action: tool, query, result: resultString }
            }
          }
        }
      }
      // Kalau bukan URL scheme, lanjut ke native tool handler biasa
      const activeConfig = {
        ...(Array.isArray(config) ? config[0] : config),
        sessionId: String(ctx?.sessionId ?? 'default'),
        workspaceRoot: ctx?.workspaceRoot,
        turnId: ctx?.turnId || ctx?.agenticProcessId
      }
      const nativePromise = window.api.executeNativeTool(tool, query, activeConfig)
      const { race, onAbort } = raceWithAbort(nativePromise, currentSignal)
      try {
        res = await race
      } finally {
        // Lepas listener abort agar tidak menumpuk di signal (memory leak)
        if (onAbort) currentSignal?.removeEventListener('abort', onAbort)
      }
      return formatRes(tool, query, res, ctx)
    }
    // 10. Plugin Execution
    targetPushProcess({
      id: pluginProcessId,
      type: 'plugin-execution',
      status: 'active',
      data: { action: tool, query }
    })

    // Tahap 4: fallback plugin lewat rute terpadu capabilities (policy +
    // audit di manager). tool = `<plugin>:<aksi>` atau bare `<aksi>`; query
    // string legacy = argumen {query}. Bentuk return SAMA seperti sebelumnya.
    const argsObj =
      query && typeof query === 'object' ? query : query != null && query !== '' ? { query } : {}
    const pluginPromise = window.api.executeCapability('plugin', tool, argsObj)
    const { race: pluginRace, onAbort: onPluginAbort } = raceWithAbort(pluginPromise, currentSignal)
    try {
      const pluginRes = await pluginRace
      resultString = typeof pluginRes === 'string' ? pluginRes : JSON.stringify(pluginRes)
    } catch (e) {
      const msg = typeof e === 'string' ? e : e?.message || String(e)
      if (e?.name === 'AbortError' || String(msg).includes('AbortError')) throw e
      resultString = `[ERROR] Plugin ${tool} gagal: ${msg}`
    } finally {
      // Lepas listener abort agar tidak menumpuk di signal (memory leak)
      if (onPluginAbort) currentSignal?.removeEventListener('abort', onPluginAbort)
    }

    targetPushProcess({
      id: pluginProcessId,
      type: 'plugin-execution',
      status: 'done',
      data: { action: tool, query, result: resultString }
    })

    return {
      resultString,
      rejected: false,
      toolExecution: { action: tool, query, result: resultString }
    }
  } catch (toolError) {
    // Error bisa berupa Error instance ATAU string mentah dari reject invoke
    // Tauri — jangan pernah asumsi selalu punya .message.
    const toolErrMsg =
      typeof toolError === 'string' ? toolError : toolError?.message || String(toolError)
    if (toolError?.name === 'AbortError' || toolErrMsg.includes('AbortError')) {
      throw toolError
    }
    resultString = `[ERROR] Tool ${tool} gagal: ${toolErrMsg}`
  }

  return {
    resultString,
    rejected: false,
    toolExecution: { action: tool, query, result: resultString }
  }
}
