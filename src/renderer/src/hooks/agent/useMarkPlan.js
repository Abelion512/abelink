import { useEffect, useRef } from 'react'
import { getNextAction } from '../../api/ai/planning'
import { getYoutubeSummary } from '../../api/ai/tools'
import { fetchAI } from '../../api/ai/core'
import { analyzeScreen, analyzeCamera } from '../../api/ai/vision-service'
import { playVoice, getCurrentTimeInfo } from '../../api/ai/utils'
import { insertMemory, updateMemory, deleteMemory, getAllMemory, insertAuditLog } from '../../api/db'
import { getUnifiedContext, searchExtendedMemory, generateVector, cosineSimilarity } from '../../api/vectorMemory'
import { sanitizeToolOutput } from '../../api/ai/output-sanitizer'
import { getGuardGate } from '../../api/ai/guard-gate'
import { searchMemoriesInOrama } from '../../api/oramaStore'
import { checkApprovalByMode } from '../../api/ai/approval-modes'

export const useMarkPlan = ({
  chatData,
  setChatData,
  config,
  isSpeak,
  abortControllerRef,
  setIsLoading,
  setIsAgentBusy,
  setMessage,
  handleMusic,
  getYoutubeData,
  pushProcess,
  dismissProcess,
  activeTopic,
  setActiveTopic,
  currentMusicTrack,
  currentPlaybackError,
  requestApproval,
  requestCameraCapture
}) => {
  const thinkingRafRef = useRef(null)
  const lastThinkingTextRef = useRef('')
  const guardRef = useRef(null)
  if (!guardRef.current) guardRef.current = getGuardGate()
  const guard = guardRef.current
  // Listener for 'ai-status' events from Main Process (via IPC)
  useEffect(() => {
    if (window.api && window.api.onAiStatus) {
      window.api.onAiStatus((msg) => {
        flushThinkingUpdate(msg)
      })
    }
  }, [setChatData])

  const scheduleThinkingUpdate = (text) => {
    lastThinkingTextRef.current = text
    if (thinkingRafRef.current) return
    thinkingRafRef.current = requestAnimationFrame(() => {
      thinkingRafRef.current = null
      setChatData((prev) => {
        const filtered = prev.filter((item) => !item.isThinking)
        return [...filtered, { role: 'ai', content: lastThinkingTextRef.current, isThinking: true }]
      })
    })
  }

  const flushThinkingUpdate = (text) => {
    if (thinkingRafRef.current) cancelAnimationFrame(thinkingRafRef.current)
    thinkingRafRef.current = null
    lastThinkingTextRef.current = text
    setChatData((prev) => {
      const filtered = prev.filter((item) => !item.isThinking)
      return [...filtered, { role: 'ai', content: text, isThinking: true }]
    })
  }

  const isExecutingRef = useRef(false)
  const interventionBufferRef = useRef([])
  const steerTypes = ['redirect', 'prioritize', 'cancel', 'modify', 'resume']

  const handleIntervention = (msg) => {
    // Classify steer type
    const lower = msg.trim().toLowerCase()
    let type = 'steer'
    let priority = ''
    if (/batal|berhenti|stop|cancel|skip/.test(lower)) { type = 'cancel'; priority = '[PRIORITAS TINGGI]' }
    else if (/ke|ganti|ubah arah|redirect/.test(lower)) { type = 'redirect'; priority = '' }
    else if (/dulu|prioritas|tunda/.test(lower)) { type = 'prioritize'; priority = '[PRIORITAS]' }
    else if (/detail|jelaskan|lebih|lanjut/.test(lower)) { type = 'modify'; priority = '' }
    
    interventionBufferRef.current.push({ text: msg.trim(), type, timestamp: Date.now() })
    
    // Audit log for steer action
    insertAuditLog({
      type: 'steer',
      taskId: agenticProcessId || 'unknown',
      data: { steerType: type, message: msg.trim().substring(0, 200) }
    }).catch(() => {})
  }

  const handlePlanningCommand = async (
    userInput,
    waContext = null,
    isAutonomous = false,
    autonomousInitialMessage = null,
    options = {},
    isSystem = false
  ) => {
    if (!waContext && isExecutingRef.current) {
      console.log('[useMarkPlan] Menolak prompt masuk karena proses lain sedang berjalan (Lock active).')
      return
    }
    if (!waContext) {
      isExecutingRef.current = true
      interventionBufferRef.current = [] // Bersihkan sisa intervensi lama
    }
    const finalIsSpeak = options.forceSpeak !== undefined ? options.forceSpeak : isSpeak
    if (!userInput) {
      if (!waContext) isExecutingRef.current = false
      return
    }

    // ========== VOICE FAST PATH (Security-Gated) ==========
    // Check if voice command matches a fast-path tool
    // SECURITY: Risk assessment applied — GREEN auto-execute, YELLOW audit, ORANGE approval, RED block
    if (options.isVoice) {
      try {
        const fastMatch = await window.api.matchVoiceCommand(userInput)
        if (fastMatch && !fastMatch.blocked) {
          console.log(`[Voice Fast Path] Matched: ${fastMatch.tool} (${fastMatch.risk})`)

          // GREEN: auto-execute
          if (fastMatch.risk === 'green') {
            scheduleThinkingUpdate(`Executing: ${fastMatch.tool}...`)
            // Execute via tool dispatch (same as normal flow)
            const fakeDecision = { action: { tool: fastMatch.tool, query: fastMatch.query }, thought: 'Voice fast path' }
            // Fall through to normal tool execution below
          }
          // YELLOW: execute + audit (will be logged by tool dispatch)
          else if (fastMatch.risk === 'yellow') {
            scheduleThinkingUpdate(`Executing: ${fastMatch.tool} (logged)...`)
          }
          // ORANGE: approval required — fall through to normal flow with approval
          else if (fastMatch.risk === 'orange') {
            console.log(`[Voice Fast Path] ${fastMatch.tool} needs approval — using normal flow`)
            // Don't use fast path, go through normal planning with approval
          }
        }
      } catch (e) {
        console.warn('[Voice Fast Path] Error:', e.message)
        // Fall through to normal planning
      }
    }

    // Jangan blokir UI Desktop jika perintah datang dari background/WhatsApp
    if (!waContext && !isAutonomous) {
      setIsLoading(true)
      setMessage('') // Clear input box instantly upon sending
    }
    setIsAgentBusy(true)

    const timestampStr = getCurrentTimeInfo()

    let finalContent = userInput
    if (isSystem) finalContent = `[SYSTEM INSTRUCTION]: ${userInput}`
    if (isAutonomous) finalContent = `[SISTEM INTERNAL - INISIATIF OTONOM]: Otak bawah sadarmu berinisiatif untuk melakukan tindakan berikut: "${userInput}". LAKUKAN TUGAS INI! Bicaralah seolah-olah kamu yang memiliki inisiatif itu sendiri tanpa disuruh. PENTING: DILARANG KERAS menggunakan tool 'os-*' (seperti os-control-open, os-click, os-type, dll) untuk interaksi PC secara otonom! Respons "answer"-mu HARUS SANGAT SINGKAT, santai, dan cuek (Maks 1-2 kalimat pendek). DILARANG KERAS menggunakan sapaan kaku (seperti "Yoi Mada") ATAU menawarkan bantuan di akhir kalimat! Boleh kosongkan (null) jika tidak perlu bicara.`

    const userMessage = {
      role: 'user',
      content: finalContent,
      timestamp: timestampStr
    }

    // ========== STEP 1: PERSIAPAN CHAT SESSION ==========
    const rawSession = [
      ...chatData
        .filter(
          (item) =>
            item.role !== 'command' && !item.isThinking && !item.isSearching && !item.isSummarizing
        )
        .map((item) => ({
          role: item.role === 'ai' ? 'assistant' : 'user',
          content: item.content,
          mood: item.mood,
          isProactive: item.isProactive,
          timestamp: item.timestamp
        }))
    ]
    let chatSession = []
    rawSession.forEach((item, index) => {
      if (index > 0 && item.role === chatSession[chatSession.length - 1].role) {
        chatSession[chatSession.length - 1].content += `\n ${item.content}`
      } else {
        chatSession.push(item)
      }
    })
    chatSession = [...chatSession].slice(-1 * (config[0]?.context || 10))
    chatSession = [...chatSession, userMessage]

    if (!isAutonomous && !isSystem) {
      setChatData((prev) => [...prev, userMessage])
    }
    abortControllerRef.current = new AbortController()
    const agenticProcessId = `agentic-${Date.now()}`

    try {
      // ========== STEP 2: AMBIL MEMORI & KONTEKS ==========

      const allMemory = await getAllMemory()
      let searchQuery = userInput
      if (chatSession.length > 0) {
        const lastMsg = chatSession[chatSession.length - 2]
        if (lastMsg.role === 'assistant' && lastMsg.content) {
          let lastAiText = lastMsg.content
          // Jika teks terlalu panjang, ambil awal dan akhirnya saja biar konteks awal (seperti judul lagu) gak hilang
          if (lastAiText.length > 600) {
            lastAiText = lastAiText.substring(0, 300) + ' ... ' + lastAiText.slice(-300)
          }
          searchQuery = `Konteks obrolan sebelumnya: "${lastAiText}". Pertanyaan user saat ini: "${userInput}"`
          console.log(searchQuery)
        }
      }
      const contextPromise = getUnifiedContext(searchQuery, allMemory)
      const abortPromise = new Promise((_, reject) => {
        const onAbort = () => reject(new Error('AbortError'))
        if (abortControllerRef.current.signal.aborted) return onAbort()
        abortControllerRef.current.signal.addEventListener('abort', onAbort, { once: true })
      })
      const unifiedContext = await Promise.race([contextPromise, abortPromise])

      let contextMsgStr = ''

      if (waContext)
        contextMsgStr += `Permintaan ini berasal dari WhatsApp (JID: ${waContext.jid}).\n`
      if (isSystem)
        contextMsgStr += `[SYSTEM INSTRUCTION]: Pesan ini adalah instruksi internal dari sistem, bukan dari user.\n`
      if (isAutonomous)
        contextMsgStr += `[AWARENESS MODE]: Ini adalah pemikiran autonom-mu sendiri. Pesan terakhir di sesi ini BUKAN dari user, melainkan inisiatifmu sendiri. Saat memberikan 'answer' akhir ke user, berlakulah seolah-olah KAMU yang pertama kali membuka topik secara proaktif (misal: 'Eh, tadi gue iseng nyari info...'). JANGAN bertingkah seolah user yang menyuruhmu!\n`
      if (currentMusicTrack && currentMusicTrack.title) {
        contextMsgStr += `[STATUS SISTEM]: Sedang memutar "${currentMusicTrack.title}" oleh ${currentMusicTrack.artist}.\n`
      }

      // Inject window tracker — biar AI tau user lagi ngapain di PC
      try {
        const activityBuffer = await window.api.getActivityBuffer()
        if (activityBuffer && activityBuffer.length > 0) {
          const recent = activityBuffer.slice(-5) // Ambil 5 aktivitas terakhir saja biar hemat token
          const activitySummary = recent
            .map((a) => `[${a.time}] ${a.app}${a.title ? ` — ${a.title}` : ''}`)
            .join('\n')
          contextMsgStr += `[AKTIVITAS PC USER (terakhir)]\n${activitySummary}\n`
        }
      } catch (_) {
        /* Silent fail — jika API tidak tersedia */
      }

      // Jika AI memiliki inisiatif (autonomous), tampilkan pesannya sebagai chat permanen sebelum masuk loop mikir
      if (isAutonomous && autonomousInitialMessage && !waContext) {
        const initMsg = {
          role: 'ai',
          content: autonomousInitialMessage,
          timestamp: getCurrentTimeInfo(),
          isProactive: true
        }
        // Tampilkan langsung di layar obrolan
        setChatData((prev) => [...prev, initMsg])
        
        // Simpan ke memori sesi agar AI sadar dia baru saja mengucapkan ini
        // WAJIB ditaruh SEBELUM 'userMessage' (elemen terakhir) agar API tidak menolak request karena berakhiran 'assistant'
        chatSession.splice(chatSession.length - 1, 0, {
          role: 'assistant',
          content: autonomousInitialMessage
        })
	}

// ========== STEP 3: AGENTIC LOOP ==========
const loopMessages = [...chatSession]
	const MAX_TURNS = config[0]?.maxTurns || 20
	const PER_TURN_TIMEOUT_MS = config[0]?.perTurnTimeout || 90000 // default 90s

// Hermes-style granular guardrails
const GUARDRAIL_WARN =  { exact_failure: 2, same_tool_failure: 3, idempotent_no_progress: 2 }
const GUARDRAIL_STOP = { exact_failure: 5, same_tool_failure: 8, idempotent_no_progress: 5 }

let isDone = false
let stepCount = 0
let decision = null
let lastDecision = null
let allSources = []
let lastToolExecution = null
// ponytail: per-tool failure counters complement guard-gate's aggregate circuit breaker
let failureCounters = { exact_failure: 0, same_tool_failure: {}, idempotent_no_progress: 0 }
let hardStopped = false

      let execSteps = [{ task: 'Menganalisis Konteks...' }] // Initial node for hologram

      while (!isDone) {
        // --- Safety: Cek abort ---
        if (abortControllerRef.current.signal.aborted) break

        // --- Cek Steer/Intervensi User ---
        if (interventionBufferRef.current.length > 0) {
          const steer = interventionBufferRef.current[0]
          const interventions = steer.text
          const steerTag = steer.type === 'steer' ? 'INTERVENSI' : `${steer.type.toUpperCase()} STEER`
          loopMessages.push({
            role: 'user',
            content: `[USER ${steerTag}]: ${interventions}`
          })
          interventionBufferRef.current = [] // Kosongkan buffer
          
          flushThinkingUpdate(`Intervensi User: ${interventions}`, true)
          
          execSteps.push({ task: `Intervensi User: ${interventions}` })
          pushProcess({
            id: agenticProcessId,
            type: 'planning',
            status: 'active',
            data: {
              steps: [...execSteps],
              currentStep: execSteps.length - 1,
              reasoning: 'Menerima arahan baru dari user di tengah proses.'
            }
          })
        }

        // --- Turn Governor: Max Turn Check ---
        if (stepCount >= MAX_TURNS) {
          console.warn(`[Turn Governor] Hit max turns (${MAX_TURNS}). Forcing answer.`)
          decision = { thought: 'Turn limit reached.', action: null, answer: 'Maaf, udah mentok batas turn nih. Coba ulang dengan perintah yang lebih spesifik ya.', mood: 'ennui', active_topic: activeTopic, memory: null }
          isDone = true
          break
        }

        stepCount++

        // --- Hermes-style Guardrail: Inject warnings ---
        let guardrailMsgs = []
        for (const [tool, count] of Object.entries(failureCounters.same_tool_failure)) {
          if (count >= GUARDRAIL_WARN.same_tool_failure && count < GUARDRAIL_STOP.same_tool_failure) {
            guardrailMsgs.push(`[WARN] Tool "${tool}" gagal ${count}x. Ganti pendekatan!`)
          }
          if (count >= GUARDRAIL_STOP.same_tool_failure && !hardStopped) {
            guardrailMsgs.push(`[HARD STOP] Tool "${tool}" gagal ${count}x. Tool ini dilarang dipakai lagi di sesi ini!`)
            hardStopped = true
          }
        }
        if (failureCounters.idempotent_no_progress >= GUARDRAIL_WARN.idempotent_no_progress &&
            failureCounters.idempotent_no_progress < GUARDRAIL_STOP.idempotent_no_progress) {
          guardrailMsgs.push(`[WARN] ${failureCounters.idempotent_no_progress}x berturut tidak ada progress. Coba strategi yang berbeda total!`)
        }
        if (failureCounters.idempotent_no_progress >= GUARDRAIL_STOP.idempotent_no_progress) {
          guardrailMsgs.push(`[HARD STOP] ${failureCounters.idempotent_no_progress}x tanpa progress. AKHIRI workflow dengan answer!`)
          if (!guardrailMsgs.some(m => m.includes('HARD STOP'))) {
            isDone = true
            decision = { thought: 'No progress after many retries.', action: null, answer: 'Gagal terus nih, coba dengan perintah yang lebih sederhana ya.', mood: 'ennui', active_topic: activeTopic, memory: null }
            break
          }
        }
        if (guardrailMsgs.length > 0) {
          loopMessages.push({ role: 'user', content: guardrailMsgs.join('\n') })
        }

        // HARD STOP — a tool exceeded the per-tool failure limit, end the loop
        if (hardStopped) {
          decision = { thought: 'Hard stopped — tool failure limit exceeded.', action: null, answer: 'Tool bermasalah, gue stop dulu ya. Coba perintah lain.', mood: 'ennui', active_topic: activeTopic, memory: null }
          isDone = true
          break
        }

        // --- Update UI: Tampilkan step ke berapa ---
        scheduleThinkingUpdate((isAutonomous && autonomousInitialMessage) ? autonomousInitialMessage : 'Bentar, mikir dlu...')

        // --- Fetch Last.fm listening history untuk konteks AI ---
        let lastfmContext = ''
        try {
          if (typeof window.api?.getRecentTracks === 'function') {
            const fmTracks = await window.api.getRecentTracks('abelionz')
            if (fmTracks && fmTracks.length > 0) {
              const top = fmTracks.slice(0, 8).map(t =>
                `"${t.title}" by ${t.artist}${t.nowPlaying ? ' (NOW)' : ''}`
              ).join(', ')
              lastfmContext = `\n[LISTENING HISTORY (Last.fm)]: ${fmTracks.filter(t => t.nowPlaying).length > 0 ? `NOW PLAYING: "${fmTracks.find(t => t.nowPlaying).title}" by ${fmTracks.find(t => t.nowPlaying).artist}.` : `Recent: ${top}`}`
            }
          }
        } catch {}

        // --- Panggil AI: getNextAction (with per-turn timeout) ---
        const guardStatus = guard.getStatus()
        try {
          const turnTimeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('TURN_TIMEOUT')), PER_TURN_TIMEOUT_MS)
          )
          decision = await Promise.race([
            getNextAction(
              userInput,
              loopMessages,
              abortControllerRef.current.signal,
              unifiedContext,
              contextMsgStr,
              activeTopic,
              { ...options, intentQuery: searchQuery, waContext, currentMusicTrack, playbackError: currentPlaybackError, degradedMode: guardStatus.state === 'open', lastfmTracks: lastfmContext }
            ),
            turnTimeoutPromise
          ])
        } catch (e) {
          if (e.message === 'TURN_TIMEOUT') {
            console.warn(`[Turn Governor] Turn #${stepCount} timed out (${PER_TURN_TIMEOUT_MS}ms). Injecting /s.`)
            loopMessages.push({
              role: 'user',
              content: `[SISTEM - TURN TIMEOUT] Turn ke-${stepCount} timeout. /s — GANTI STRATEGI! Jangan pakai tool/cara yang sama. Selesaikan dengan pendekatan berbeda atau langsung jawab user.`
            })
            continue
          }
          throw e
        }

        lastDecision = decision

        // --- Update active_topic jika ada ---
        if (decision.active_topic) {
          setActiveTopic(decision.active_topic)
        }

        // --- Handle memory jika ada ---
        if (decision.memory) {
          const memoryData = { ...decision.memory }
          memoryData.memory = memoryData.memory
            .trim()
            .replace(/^[\\\"]+|[\\\"]+$/g, '')
            .replace(/\\n/g, '\n')
          // Hapus prefix timestamp lama jika ada biar gak double pas update
          memoryData.memory = memoryData.memory.replace(/^\[.*?\]\s*/, '')
          const dateStr = getCurrentTimeInfo()
          memoryData.memory = `[${dateStr}] ${memoryData.memory}`

          // AUTO-DEDUP GUARD: Jika AI mencoba insert "profile" atau "preference", cek similarity dengan memory existing di Orama
          if (
            memoryData.action === 'insert' &&
            (memoryData.type === 'profile' || memoryData.type === 'preference')
          ) {
            try {
              const newVec = await generateVector(memoryData.memory)
              if (newVec) {
                const similarMemories = await searchMemoriesInOrama(
                  memoryData.memory,
                  newVec,
                  1,
                  memoryData.type
                )
                if (similarMemories.length > 0 && similarMemories[0].score > 0.82) {
                  const bestMatchId = similarMemories[0].id
                  console.log(
                    `🔄 [Orama Auto-Dedup] Mengalihkan insert -> update pada memori ID ${bestMatchId} (similarity: ${similarMemories[0].score.toFixed(2)})`
                  )
                  memoryData.action = 'update'
                  memoryData.id = bestMatchId
                }
              }
            } catch (err) {
              console.error('Error in Orama auto-dedup check:', err)
            }
          }

          const actions = { insert: insertMemory, update: updateMemory, delete: deleteMemory }
          if (actions[memoryData.action]) {
            await actions[memoryData.action](memoryData)
          }
        }

        // ========== CEK KEPUTUSAN AI ==========

        // --- OPSI A: AI mau JAWAB (answer ada, action null) → SELESAI ---
        if (decision.answer && !decision.action) {
          isDone = true

          // Autonomous answers akan langsung di-output-kan sebagai pesan proaktif.
          // Override autonomousInitialMessage dihapus agar LLM bisa bicara hasilnya.

          execSteps.push({ task: 'Selesai' })
          if (execSteps.length > 2) {
            pushProcess({
              id: agenticProcessId,
              type: 'planning',
              status: 'done',
              data: {
                steps: [...execSteps],
                currentStep: execSteps.length,
                reasoning: decision.thought || 'Selesai'
              }
            })
          }

          // TTS
          if (finalIsSpeak && decision.answer) {
            flushThinkingUpdate('Bentar...', true)
            await playVoice(decision.answer)
          }

          // Notification
          if (window.api.showNotification && !document.hasFocus() && decision.answer) {
            window.api.showNotification('Mark', decision.answer)
          }

          // Tampilkan jawaban akhir di UI
          setChatData((prev) => {
            const filtered = prev.filter((item) => {
              if (item.isThinking) return false;
              // Hapus pesan inisial yang berdiri sendiri agar tidak ganda di riwayat obrolan
              if (isAutonomous && item.isProactive && item.content === autonomousInitialMessage) return false;
              return true;
            })
            
            let finalContent = decision.answer
            if (isAutonomous && autonomousInitialMessage) {
              finalContent = `**${autonomousInitialMessage}**\n\n${decision.answer}`
            }

            const aiMsg = {
              role: 'ai',
              content: finalContent,
              reasoning: decision.thought,
              mood: decision.mood || 'neutral',
              isMemorySaved: decision.memory?.action === 'insert',
              isMemoryUpdated: decision.memory?.action === 'update',
              isMemoryDeleted: decision.memory?.action === 'delete',
              pluginExecution: lastToolExecution,
              isProactive: isAutonomous,
              timestamp: getCurrentTimeInfo()
            }
            if (allSources.length > 0) {
              const uniqueSources = []
              const seenLinks = new Set()
              allSources.forEach((source) => {
                const id = source.link || JSON.stringify(source)
                if (!seenLinks.has(id)) {
                  seenLinks.add(id)
                  uniqueSources.push(source)
                }
              })
              aiMsg.sources = uniqueSources
            }
            return [...filtered, aiMsg]
          })

          // Opsi: Jika loop berakhir, lepas kunci browser
          if (window.api && window.api.browserAction) {
            window.api.browserAction({ action: 'finish' }).catch(() => {})
          }
          break // EXIT LOOP
        }

        // --- OPSI B: AI mau EKSEKUSI TOOL (action ada) → LANJUT LOOP ---
        if (decision.action && decision.action.tool) {
          const tool = decision.action.tool
          const query = decision.action.query || ''

          // Add to hologram plan
          execSteps.push({ task: `Eksekusi ${tool}`, query: query })
          pushProcess({
            id: agenticProcessId,
            type: 'planning',
            status: 'active',
            data: {
              steps: [...execSteps],
              currentStep: execSteps.length - 1,
              reasoning: decision.thought || `Menjalankan ${tool}`
            }
          })

          // Update UI
          scheduleThinkingUpdate((isAutonomous && autonomousInitialMessage) ? autonomousInitialMessage : 'Bentar, mikir dlu...')

          // ========== EXECUTE TOOL ==========
          let resultString = 'Tidak ada hasil.'

          try {
            if (tool === 'yt-search') {
              // --- YOUTUBE SEARCH ---
              const ytResults = await window.api.searchYoutube(query)
              resultString = JSON.stringify(ytResults)
            } else if (tool === 'yt-summary') {
              // --- YOUTUBE SUMMARY ---
              setChatData((prev) => [
                ...prev,
                {
                  role: 'ai',
                  content: 'Menonton video youtube...',
                  isSummarizing: true,
                  youtubeLink: query
                }
              ])
              const yData = await getYoutubeData(query)
              resultString = await getYoutubeSummary(
                query,
                yData,
                abortControllerRef.current.signal
              )
              setChatData((prev) => prev.filter((item) => !item.isSummarizing))
            } else if (tool.startsWith('music')) {
              // --- MUSIC ---
              resultString = await handleMusic(tool, query)
            } else if (tool === 'wa-send') {
              // --- WHATSAPP SEND ---
              const [targetJid, targetText] = (query || '').split('|')
              if (targetJid && targetText) {
                const res = await window.api.sendWaMessage(targetJid.trim(), targetText.trim())
                resultString = res?.success
                  ? `Berhasil mengirim pesan WhatsApp ke ${targetJid}`
                  : `Gagal: ${res?.error || 'Unknown'}`
              } else {
                resultString = `Gagal: format query salah (harus "JID|pesan"): ${query}`
              }
            } else if (tool === 'tool-info') {
              // --- TOOL INFO (Progressive Disclosure L1) ---
              try {
                const detail = await window.api.getToolDetail(query)
                if (detail) {
                  resultString = detail.l1 || `Tool: ${detail.name}\n${detail.description}`
                } else {
                  resultString = `Tool "${query}" tidak ditemukan. Gunakan "tool-info" dengan nama tool yang ada di daftar.`
                }
              } catch (e) {
                resultString = `Gagal mengambil info tool: ${e.message}`
              }
            } else if (tool === 'memory-search') {
              // --- MEMORY SEARCH ---
              const results = await searchExtendedMemory(query)
              const formatted = results.length > 0
                ? results.map(m => `- [${m.type.toUpperCase()}] (ID:${m.id}, Score:${m.score.toFixed(2)}) ${m.memory}`).join('\n')
                : 'Tidak ditemukan memori yang relevan.'
              resultString = `[MEMORY SEARCH RESULTS]\n${formatted}`
            } else if (tool === 'speak') {
              // --- NATIVE TTS SPEAKER ---
              if (query && query.trim() !== '') {
                // Jangan pake wait karena kita mau chatnya tetap responsif, tapi kalau await dia nunggu selesai ngomong
                // Tampilkan pesan animasi "Berbicara..."
                scheduleThinkingUpdate(`(Sedang berbicara) ${query}`)
                await playVoice(query)
                resultString = `Berhasil berbicara secara lisan: "${query}"`
              } else {
                resultString = 'Gagal: teks yang mau diucapkan kosong.'
              }
            } else if (tool === 'screenshot-to-wa') {
              if (waContext) {
                window.api.waTakeScreenshot(waContext.jid, waContext.msgId)
                resultString = 'Screenshot berhasil diambil dan dikirimkan ke WhatsApp user.'
              } else {
                resultString =
                  'Tool screenshot-to-wa HANYA tersedia jika user sedang chat dari WhatsApp.'
              }
            } else if (tool === 'analyze-screen') {
              // --- SCREENSHOT FOR VISION (via vision-service: deep role = Mimo) ---
              try {
                const screens = await window.api.takeScreenshot()
                if (screens && screens.length > 0) {
                  scheduleThinkingUpdate('Memproses Vision AI...')
                  resultString = await analyzeScreen(screens, query || 'Jelaskan dengan detail apa yang terlihat di layar ini.')
                  console.log(`[Vision AI - analyze-screen] Hasil analisis:`, resultString)
                } else {
                  resultString = 'Gagal mengambil screenshot dari sistem operasi.'
                }
              } catch (e) {
                resultString = `Gagal memproses visual: ${e.message}`
              }
            } else if (tool === 'camera-look') {
              // --- CAMERA VISION (via vision-service: realtime role = Gemini) ---
              try {
                if (config[0]?.cameraEnabled === false) {
                  resultString = 'Fitur kamera dimatikan di pengaturan. Beri tahu user untuk mengaktifkannya.'
                } else if (!requestCameraCapture) {
                  resultString = 'Internal Error: Callback requestCameraCapture tidak tersedia.'
                } else {
                  flushThinkingUpdate('Mengakses kamera...', true)
                  const cameraFrame = await requestCameraCapture({
                    isAutonomous: isAutonomous,
                    deviceId: config[0]?.cameraDeviceId !== 'default' ? config[0]?.cameraDeviceId : null
                  })
                  if (cameraFrame) {
                    flushThinkingUpdate('Menganalisis hasil kamera...', true)
                    resultString = await analyzeCamera(cameraFrame, query || 'Jelaskan apa yang terlihat dari kamera ini.')
                    console.log(`[Vision AI - camera-look] Hasil analisis:`, resultString)
                  } else {
                    resultString = 'Gagal mengambil gambar dari kamera.'
                  }
                }
              } catch (e) {
                resultString = `Gagal memproses kamera: ${e.message}`
              }
            } else if (
              [
                'read-file',
                'write-file',
                'replace-lines',
                'delete-file',
                'list-dir',
                'grep-search',
                'run-shell',
                'run-cli',
                'browser-navigate',
                'browser-read',
                'browser-click',
                'browser-type',
                'browser-scroll',
                'browser-ask-user',
                'browser-close',
                'native-notify'
              ].includes(tool)
            ) {
              // --- GUARD: pre-flight check ---
              const preFlight = guard.preFlightCheck(tool, query)
              if (!preFlight.allowed) {
                if (preFlight.degrade) {
                  options.disableTools = true
                  resultString = `[DEGRADED] ${preFlight.reason}`
                } else {
                  resultString = `[ERROR] Guard rejected: ${preFlight.reason}`
                }
                loopMessages.push(
                  {
                    role: 'assistant',
                    content: JSON.stringify({ thought: decision.thought, action: decision.action })
                  },
                  {
                    role: 'user',
                    content: `[OBSERVATION] Hasil eksekusi tool "${tool}": ${resultString}`
                  }
                )
                continue
              }

	              // --- NATIVE TOOLS (Built-in) ---
	              const toolStartTime = Date.now()
	              const approvalCheck = await window.api.checkToolApproval(tool, query)

	              // Approval modes check (Claude Code-inspired)
	              // Source: https://code.claude.com/docs/en/agent-sdk/permissions
	              const approvalMode = (config[0]?.approvalMode || 'selective')
	              const modeResult = checkApprovalByMode(approvalMode, tool, !!isAutonomous)
	              
	              // Plan mode: block write tools outright
	              if (modeResult.blocked) {
	                resultString = `[DITOLAK] Plan mode: "${tool}" tidak diizinkan. Hanya tool read-only.`
	                const blockedResult = sanitizeToolOutput(tool, resultString)
	                loopMessages.push(
	                  { role: 'assistant', content: JSON.stringify({ thought: decision?.thought, action: decision?.action }) },
	                  { role: 'user', content: `[OBSERVATION] ${blockedResult}` }
	                )
	                continue
	              }
	              
	              // Bypass or low-risk: skip approval modal
	              if (!modeResult.needsApproval || approvalMode === 'bypass') {
	                // Still do existing IPC check for tool-level blocked commands (e.g. dangerous keywords)
	                if (approvalCheck.needsApproval && approvalCheck.needsApproval === 'hard_block') {
	                  resultString = `[ERROR] Tool "${tool}" diblokir oleh sistem.`
	                  guard.postFlightCheck(tool, resultString, Date.now() - toolStartTime)
	                  const blockedResult = sanitizeToolOutput(tool, resultString)
	                  loopMessages.push(
	                    { role: 'assistant', content: JSON.stringify({ thought: decision?.thought, action: decision?.action }) },
	                    { role: 'user', content: `[OBSERVATION] ${blockedResult}` }
	                  )
	                  continue
	                }
	                // Skip modal, execute directly
	              } else if (approvalCheck.needsApproval && requestApproval) {
                const userApproved = await requestApproval(approvalCheck.message, tool, query)
                if (!userApproved) {
                  resultString = `[DITOLAK] User menolak eksekusi "${tool}". Cari cara lain atau tanyakan user.`
                  guard.postFlightCheck(tool, resultString, Date.now() - toolStartTime)

                  // Granular failure tracking (Hermes-style)
                  failureCounters.exact_failure++
                  failureCounters.same_tool_failure[tool] = (failureCounters.same_tool_failure[tool] || 0) + 1
                  failureCounters.idempotent_no_progress++

                  const deniedResult = sanitizeToolOutput(tool, resultString)
                  loopMessages.push(
                    {
                      role: 'assistant',
                      content: JSON.stringify({
                        thought: decision.thought,
                        action: decision.action
                      })
                    },
                    {
                      role: 'user',
                      content: `[OBSERVATION] Hasil eksekusi tool "${tool}": ${deniedResult}`
                    }
                  )
                  continue
                }
              }

              const nativePromise = window.api.executeNativeTool(tool, query)
              const abortPromise = new Promise((_, reject) => {
                const onAbort = () => reject(new Error('AbortError'))
                if (abortControllerRef.current.signal.aborted) return onAbort()
                abortControllerRef.current.signal.addEventListener('abort', onAbort, { once: true })
              })

              const res = await Promise.race([nativePromise, abortPromise])
              const toolDuration = Date.now() - toolStartTime
              if (res.success) {
                resultString = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
              } else {
                resultString = `[ERROR] ${tool} gagal: ${res.error}`
              }
              guard.postFlightCheck(tool, resultString, toolDuration)

              // Granular failure tracking (Hermes-style)
              const isError = resultString && (resultString.startsWith('[ERROR]') || resultString.startsWith('[DITOLAK]'))
              if (isError) {
                failureCounters.exact_failure++
                failureCounters.same_tool_failure[tool] = (failureCounters.same_tool_failure[tool] || 0) + 1
                failureCounters.idempotent_no_progress++
              } else {
                failureCounters.same_tool_failure[tool] = 0
                failureCounters.idempotent_no_progress = 0
              }

              lastToolExecution = { action: tool, query, result: resultString }
            } else if (tool.startsWith('os-') || tool.startsWith('pc-')) {
              // --- LINUX PC AGENT (Desktop Automation) ---
              let pcResult = null
              try {
                switch (tool) {
                  case 'os-read':
                  case 'pc-control-read':
                    pcResult = await window.api.osRead(); break
                  case 'os-click':
                  case 'pc-control-click':
                    pcResult = await window.api.osClick(query); break
                  case 'os-type':
                  case 'pc-control-type':
                    pcResult = await window.api.osType(query); break
                  case 'os-key':
                  case 'pc-control-key':
                    pcResult = await window.api.osKey(query); break
                  case 'os-scroll':
                  case 'pc-control-scroll':
                    pcResult = await window.api.osScroll(query); break
                  case 'os-open':
                  case 'pc-control-open':
                    pcResult = await window.api.osOpen(query); break
                  case 'os-list-windows':
                  case 'pc-control-list-windows':
                    pcResult = await window.api.osListWindows(); break
                  case 'os-focus-window':
                  case 'pc-control-focus-window':
                    pcResult = await window.api.osFocusWindow(query); break
                  case 'os-screenshot':
                  case 'pc-screenshot':
                    pcResult = await window.api.osScreenshot(); break
                  case 'os-ask-user':
                  case 'os-ask':
                  case 'pc-control-ask':
                    pcResult = await window.api.osAskUser(query); break
                  case 'os-emergency-stop':
                    pcResult = await window.api.osEmergencyStop(); break
                  default:
                    pcResult = { error: `Unknown PC tool: ${tool}` }
                }
              } catch (e) {
                pcResult = { error: e.message }
              }
              resultString = typeof pcResult === 'string' ? pcResult : JSON.stringify(pcResult)
            } else {
              // --- PLUGIN FALLBACK ---
              const pluginProcessId = `plugin-${Date.now()}`
              pushProcess({
                id: pluginProcessId,
                type: 'plugin-execution',
                status: 'active',
                data: { action: tool, query }
              })

              const pluginPromise = window.api.executePlugin(tool, query)
              const abortPromise = new Promise((_, reject) => {
                const onAbort = () => reject(new Error('AbortError'))
                if (abortControllerRef.current.signal.aborted) return onAbort()
                abortControllerRef.current.signal.addEventListener('abort', onAbort, { once: true })
              })
              const res = await Promise.race([pluginPromise, abortPromise])
              if (res.success) {
                resultString = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
              } else {
                resultString = `[ERROR] Plugin ${tool} gagal: ${res.error}`
              }

              lastToolExecution = { action: tool, query, result: resultString }
              pushProcess({
                id: pluginProcessId,
                type: 'plugin-execution',
                status: 'done',
                data: { action: tool, query, result: resultString }
              })
            }
          } catch (toolError) {
            if (toolError.name === 'AbortError' || toolError.message.includes('AbortError')) {
              throw toolError
            }
            resultString = `[ERROR] Tool ${tool} crash: ${toolError.message}`
          }

          // --- FEED OBSERVATION BACK KE AI ---
          const sanitizedOutput = sanitizeToolOutput(tool, resultString)
          loopMessages.push(
            {
              role: 'assistant',
              content: JSON.stringify({ thought: decision.thought, action: decision.action })
            },
            {
              role: 'user',
              content: `[OBSERVATION] Hasil eksekusi tool "${tool}": ${sanitizedOutput}`
            }
          )

          continue
        }

        // --- FALLBACK: Jika AI tidak mengisi action maupun answer ---
        console.warn('[useMarkPlan] AI returned neither action nor answer. Forcing done.')
        isDone = true
        setChatData((prev) => [
          ...prev.filter((item) => !item.isThinking),
          {
            role: 'ai',
            content: 'Maaf terjadi kesalahan di proses berpikir.',
            mood: 'neutral',
            timestamp: getCurrentTimeInfo()
          }
        ])
      }

      // ========== CLEANUP ==========
      if (!lastDecision?.answer) {
        if (execSteps.length > 2) {
          pushProcess({
            id: agenticProcessId,
            type: 'planning',
            status: 'done',
            data: {
              steps: [...execSteps],
              currentStep: execSteps.length,
              reasoning: 'Loop Selesai'
            }
          })
        }
      }

      if (!waContext && !isAutonomous) {
        setIsLoading(false)
      }
      setIsAgentBusy(false)
    } catch (error) {
      if (error.name !== 'AbortError' && !error.message.includes('AbortError')) {
        console.error('Planning Error:', error)
      }

      if (!waContext && !isAutonomous) {
        setIsLoading(false)
      }
      setIsAgentBusy(false)

      dismissProcess(agenticProcessId)

      if (error.name === 'AbortError' || error.message.includes('AbortError')) {
        setChatData((prev) => [
          ...prev.filter((item) => !item.isThinking && !item.isSearching),
          {
            role: 'ai',
            content: 'Oke, proses gue batalin ya bro.',
            reasoning: 'Proses dibatalkan secara paksa.',
            mood: 'neutral',
            timestamp: new Date().toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit'
            })
          }
        ])
      } else {
        if (isSystem && !isAutonomous) {
          const fallbackGreetings = [
            "Sistem aktif. Halo, saya Mark. Ada yang bisa saya bantu hari ini?",
            "Mark sudah online. Silakan berikan perintah.",
            "Halo bro! Sistem berhasil diinisialisasi. Ada yang perlu saya kerjakan?",
            "Sistem Mark siap digunakan. Ada tugas untukku hari ini?",
            "Halo! Saya siap membantumu."
          ]
          const randomGreeting = fallbackGreetings[Math.floor(Math.random() * fallbackGreetings.length)]
          
          setChatData((prev) => [
            ...prev.filter((item) => !item.isThinking && !item.isSearching),
            { 
              role: 'ai', 
              content: randomGreeting,
              timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
            }
          ])
        } else if (isAutonomous) {
          // Gagal diam-diam (silent fail) kalau autonomous error (misal AI gagal ngeluarin format JSON)
          setChatData((prev) => prev.filter((item) => !item.isThinking && !item.isSearching && !item.isProactive))
        } else {
          setChatData((prev) => [
            ...prev.filter((item) => !item.isThinking && !item.isSearching),
            { role: 'ai', content: `Maaf, terjadi kesalahan: ${error.message}` }
          ])
        }
      }
    } finally {
      if (!waContext) {
        isExecutingRef.current = false
      }
    }
  }
  return { handlePlanningCommand, handleIntervention }
}
