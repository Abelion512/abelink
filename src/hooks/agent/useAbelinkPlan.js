import { useEffect, useRef } from 'react'
import { getNextAction, getLastSystemPrompt } from '../../api/ai/planning'
import { playVoice, getCurrentTimeInfo } from '../../api/ai/utils'
import {
  db,
  deleteMemory,
  getAllMemory,
  insertMemory,
  updateMemory,
  saveSession,
  getChatData
} from '../../api/db'
import { createDurableTaskPlan } from '../../api/ai/taskPlanner'
import {
  getUnifiedContext,
  searchExtendedMemory,
  generateVector,
  executeMemorySearch
} from '../../api/vectorMemory'
import {
  createTask,
  startTaskStep,
  checkpointStep,
  transitionTask,
  resumeTask,
  buildStepCheckpoint
} from '../../api/engine/taskRuntime'
import { searchMemoriesInOrama } from '../../api/oramaStore'
import { buildOptimizedChatSession, stripImageContent, stripDataUrls } from '../../api/ai/contextCompactor'
import { saveWorkspaceWorkingMemory } from '../../api/workspaceRag'
import { classifyMainDecision, INTENT, isExplicitSelfTerminate, shouldChallengeBlocked, BLOCKED_CHALLENGE_TEXT } from '../../api/ai/agentDecision'
import { createCircuitBreaker } from '../../api/ai/circuitBreaker'
import { createTrajectorySupervisor } from '../../api/ai/trajectorySupervisor'
import { currentBenchArch } from '../../api/ai/benchArch'
import { logStep as trajectoryLogStep, estimateTokens as trajectoryEstimateTokens } from '../../api/trajectory'
import { logObservation as trajectoryLogObservation } from '../../api/trajectory'
import { logAnswer as trajectoryLogAnswer } from '../../api/trajectory'
import { logTurnStart as trajectoryLogTurnStart } from '../../api/trajectory'
import { logTurnEnd as trajectoryLogTurnEnd } from '../../api/trajectory'
import { executeSingleTool, isNativeBacked } from './plan/toolDispatcher'
import { buildBrowserResume, isBrowserResumeRequest } from './plan/browserResume'
import {
  classifyObjectiveKind,
  evaluateEvidence,
  gateCompletion,
  buildReplanObservation,
  MAX_VERIFY_REPLANS,
  VERIFICATION_STATE
} from '../../api/ai/objectiveVerifier'
import { resolvePlanStepBudget, DEFAULT_PLAN_STEPS } from '../../api/ai/planStepBudget'
import {
  getErrorSignature,
  isRepairAllowed,
  createSelfRepairMission
} from '../../api/ai/selfHealingEngine'

// ============================================================================
// HELPER UTILITIES
// ============================================================================

// Pure: hanya outcome 'completed' yang boleh menutup sesi browser otomatis.
// failed/blocked/needs_user/self_terminated menyimpan tab untuk inspeksi
// (sejajar semantik extension: sesi error tidak pernah auto-close).
export const shouldAutoCloseBrowser = (sessionOutcome) => sessionOutcome === 'completed'

// Pure: bangun pause-state co-pilot dari jejak tool terakhir.
// Tab identity (tabId) milik extension (Task 2, worker lain) — null = baca
// tab sesi via browser-read query kosong. Testable.
export const capturePausedBrowser = (executedToolsList = [], sessionId = 'default', goal = '') => {
  const list = Array.isArray(executedToolsList) ? executedToolsList : []
  const lastBrowser = [...list].reverse().find((t) => String(t?.tool || '').startsWith('browser'))
  const q = String(lastBrowser?.query || '')
  const url = /^https?:\/\//i.test(q) ? q : ''
  return { sessionId: String(sessionId ?? 'default'), tabId: null, url, goal: String(goal || '') }
}

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']

// Batas keamanan loop ReAct fallback: nilai dasar sebelum disesuaikan via effortSystem
const MAX_PLAN_STEPS = DEFAULT_PLAN_STEPS
// Batas giliran tanpa kemajuan (bicara intermediate tanpa action) sebelum dipaksa selesai
const MAX_NO_PROGRESS_STREAK = 3

let messageIdSequence = 0
const createMessageId = () => {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return `msg-${uuid}`
  messageIdSequence += 1
  return `msg-${Date.now().toString(36)}-${messageIdSequence.toString(36)}`
}

const isImagePath = (filePath = '') => {
  const ext = filePath.split('.').pop().toLowerCase()
  return IMAGE_EXTS.includes(`.${ext}`)
}

const convertFilePathToBase64 = async (filePath) => {
  // fetch(file://) diblokir WebKitGTK/CSP — baca via command Rust native.
  try {
    return await window.api.readFileBase64(filePath)
  } catch (err) {
    console.error('[useAbelinkPlan] Failed to convert image file to Base64:', filePath, err)
    return null
  }
}

// Cakupan forensik tool-calls JSONL: definisi "native-backed" (sudah dicatat
// bridge) hidup di toolDispatcher sebagai isNativeBacked agar tidak drift
// dari routing aktual. Choke point di bawah mencatat sisanya.

// ============================================================================
// MAIN HOOK: useAbelinkPlan
// ============================================================================

export const useAbelinkPlan = ({
  chatData,
  setChatData,
  config,
  isSpeak,
  abortControllerRef,
  setIsLoading,
  setIsAgentBusy,
  runningSessionId,
  setRunningSessionId,
  runningSessionIds,
  setRunningSessionIds,
  addRunningSessionId,
  removeRunningSessionId,
  setMessage,
  handleYoutubeSearch,
  handleSearchCommand,
  handleYoutubeSummary,
  handleMusic,
  getYoutubeData,
  youtubeMusicTools,
  pushProcess,
  dismissProcess,
  activeTopic,
  setActiveTopic,
  currentMusicTrack,
  requestApproval,
  requestUserInput,
  requestCameraCapture
}) => {
  // Map menyimpan sesi yang sedang berjalan: key = sessionId, value = { abortController, startTime, prompt }
  const activeSessionsRef = useRef(new Map())
  // Map menyimpan updater fungsi setChatData per sesi untuk IPC status AI
  const activeSessionUpdatersRef = useRef(new Map())

  // Listener event status AI dari Main Process (IPC)
  useEffect(() => {
    if (window.api && window.api.onAiStatus) {
      window.api.onAiStatus((msg) => {
        if (activeSessionUpdatersRef.current.size > 0) {
          for (const updater of activeSessionUpdatersRef.current.values()) {
            try {
              updater((prev) => {
                const filtered = prev.filter((item) => !item.isThinking)
                return [...filtered, { role: 'ai', content: msg, isThinking: true }]
              })
            } catch (e) {}
          }
        } else {
          setChatData((prev) => {
            const filtered = prev.filter((item) => !item.isThinking)
            return [...filtered, { role: 'ai', content: msg, isThinking: true }]
          })
        }
      })
    }
  }, [setChatData])

  const activeTaskObjectiveRef = useRef(null)
  // Co-pilot HITL pause-state (bukan terminal): browser-ask menyimpan konteks
  // {sessionId, tabId, url, goal}; giliran 'lanjutkan' resume via browser-read
  // tab SAMA (tidak pernah re-navigate). Persisten antar giliran via ref.
  const pausedBrowserRef = useRef(null)
  // Buffer intervensi user, dipisah per sesi agar arahan tidak bocor antar sesi
  // ({ [sessionId]: string[] }, kunci 'main' untuk sesi utama)
  const interventionBufferRef = useRef({})
  const lastUserPromptRef = useRef('')
  const activeRunningSessionIdRef = useRef(1)

  const targetPushProcess = (proc) => {
    if (
      (activeRunningSessionIdRef.current === 1 || !activeRunningSessionIdRef.current) &&
      pushProcess
    ) {
      pushProcess(proc)
    }
  }

  // Kunci buffer intervensi yang konsisten: sesi utama -> 'main', lainnya -> id string
  const interventionKeyFor = (sessionId) => {
    const numId =
      sessionId !== null && sessionId !== undefined && !Number.isNaN(Number(sessionId))
        ? Number(sessionId)
        : 1
    return numId === 1 ? 'main' : String(numId)
  }

  // Menampung arahan/intervensi user saat ReAct loop sedang berjalan (per sesi)
  const handleIntervention = (msg, targetSessionId = null) => {
    const key = interventionKeyFor(targetSessionId)
    if (!Array.isArray(interventionBufferRef.current[key])) {
      interventionBufferRef.current[key] = []
    }
    interventionBufferRef.current[key].push(msg)
  }

  // Penghentian tugas per-sesi secara independen
  const handleStop = (targetSessionId = null) => {
    if (targetSessionId !== null && targetSessionId !== undefined) {
      const numId = Number(targetSessionId)
      const session = activeSessionsRef.current.get(numId)
      if (session && session.abortController) {
        session.abortController.abort()
      }
      if (window.api && window.api.abortFetchAI) {
        try {
          window.api.abortFetchAI()
        } catch (_) {}
      }
      activeSessionsRef.current.delete(numId)
      activeSessionUpdatersRef.current.delete(numId)
      if (removeRunningSessionId) removeRunningSessionId(numId)
      if (numId === 1) setIsLoading(false)
      if (activeSessionsRef.current.size === 0) {
        setIsAgentBusy(false)
        if (setRunningSessionId) setRunningSessionId(null)
      }
      if (window.api && window.api.browserClose) {
        // Facade bridge menerima id sesi sebagai string posisi: 'default' untuk sesi utama
        window.api
          .browserClose(numId === 1 ? 'default' : String(numId))
          .catch((e) => console.warn('browserClose gagal:', e?.message))
      }
    } else {
      // Hentikan seluruh sesi yang aktif
      for (const [id, session] of activeSessionsRef.current.entries()) {
        if (session.abortController) session.abortController.abort()
        if (window.api && window.api.browserClose) {
          // Facade bridge menerima id sesi sebagai string posisi: 'default' untuk sesi utama
          window.api
            .browserClose(id === 1 ? 'default' : String(id))
            .catch((e) => console.warn('browserClose gagal:', e?.message))
        }
      }
      activeSessionsRef.current.clear()
      activeSessionUpdatersRef.current.clear()
      if (setRunningSessionIds) setRunningSessionIds([])
      if (setRunningSessionId) setRunningSessionId(null)
      if (abortControllerRef?.current) abortControllerRef.current.abort()
      if (window.api && window.api.abortFetchAI) {
        try {
          window.api.abortFetchAI()
        } catch (_) {}
      }
      setIsAgentBusy(false)
      setIsLoading(false)
    }
  }

  // Dispatcher eksekusi tool dipisah per-domain (src/hooks/agent/plan/):
  // mediaTools / visionTools / knowledgeTools / agentTools + toolDispatcher.
  // executeSingleTool diimpor agar hook ini hanya berisi ReAct loop.

  // ==========================================================================
  // CORE HANDLER: handlePlanningCommand (ReAct Loop)
  // ==========================================================================
  const handlePlanningCommand = async (
    userInput,
    tgContextOrOptions = null,
    isAutonomous = false,
    autonomousInitialMessage = null,
    options = {},
    isSystem = false
  ) => {
    let tgContext = tgContextOrOptions
    let opts = options || {}

    // Flexible options detection: support options passed as 2nd arg or in other slots
    if (
      tgContextOrOptions &&
      typeof tgContextOrOptions === 'object' &&
      !tgContextOrOptions.chatId &&
      !tgContextOrOptions.from
    ) {
      opts = tgContextOrOptions
      tgContext = null
    } else if (
      autonomousInitialMessage &&
      typeof autonomousInitialMessage === 'object' &&
      (autonomousInitialMessage.sessionId ||
        autonomousInitialMessage.customChatData ||
        autonomousInitialMessage.customSetChatData ||
        autonomousInitialMessage.onSaveSession)
    ) {
      opts = autonomousInitialMessage
      autonomousInitialMessage = null
    }

    // ------------------------------------------------------------------------
    // FASE 1: VALIDASI INPUT & PER-SESSION LOCKING
    // ------------------------------------------------------------------------
    const activeSessionNum = opts.sessionId ? Number(opts.sessionId) : 1
    activeRunningSessionIdRef.current = activeSessionNum

    if (activeSessionsRef.current.has(activeSessionNum)) {
      console.log(
        `[useAbelinkPlan] Menolak prompt masuk untuk Sesi ${activeSessionNum} karena sedang berjalan (Lock active).`
      )
      if (tgContext?.msgId && tgContext?.chatId) {
        window.api?.sendTgAgentExecutionDone?.({
          chatId: tgContext.chatId,
          result: {
            answer:
              'Agen sedang sibuk menjalankan tugas sebelumnya. Kirim /stop bila ingin membatalkan tugas yang sedang berjalan.'
          },
          msgId: tgContext.msgId
        })
      }
      return
    }

    const sessionAbortController = new AbortController()
    activeSessionsRef.current.set(activeSessionNum, {
      abortController: sessionAbortController,
      startTime: Date.now(),
      prompt: userInput
    })

    if (activeSessionNum === 1) {
      abortControllerRef.current = sessionAbortController
    }

    if (addRunningSessionId) addRunningSessionId(activeSessionNum)
    setIsAgentBusy(true)

    let finalIsSpeak = opts.forceSpeak !== undefined ? opts.forceSpeak : isSpeak
    const isVoiceInput = Boolean(
      opts.isVoice ||
      finalIsSpeak ||
      (typeof userInput === 'string' && (userInput.startsWith('(Mikrofon)') || userInput.startsWith('(Hasil STT)')))
    )
    if (userInput && typeof userInput === 'string') {
      if (userInput.startsWith('(Mikrofon)') || userInput.startsWith('(Hasil STT)')) {
        finalIsSpeak = true
      } else if (!isAutonomous && !isSystem) {
        finalIsSpeak = false
      }
    }

    if (!userInput) {
      activeSessionsRef.current.delete(activeSessionNum)
      if (removeRunningSessionId) removeRunningSessionId(activeSessionNum)
      return
    }

    if (!tgContext && !isAutonomous) {
      if (activeSessionNum === 1) {
        setIsLoading(true)
      }
      if (!isSystem && !opts.customSetChatData) {
        lastUserPromptRef.current = userInput
        setMessage('')
      }
    }

    const timestampStr = getCurrentTimeInfo()

    // ------------------------------------------------------------------------
    // FASE 2: FORMATTING PROMPT & VISION PAYLOAD
    // ------------------------------------------------------------------------
    let finalContent = userInput
    if (userInput.startsWith('/')) {
      const skillName = userInput.slice(1).split(' ')[0].trim()
      try {
        const skillData = await window.api.readSkill(skillName)
        const skillContent = typeof skillData === 'string' ? skillData : skillData?.content
        if (skillContent) {
          finalContent = `[SYSTEM INSTRUCTION - SKILL ACTIVATED]: Kamu sekarang harus bertindak dan mengikuti seluruh instruksi dalam dokumen skill berikut ini secara ketat:\n\n=== SKILL: ${skillName} ===\n${skillContent}\n====================\n\nInstruksi dari user: ${userInput.replace('/' + skillName, '').trim() || 'Jalankan skill ini sekarang!'}`
        } else {
          finalContent = `Skill "${skillName}" tidak ditemukan di direktori Abelink Skills.`
        }
      } catch (err) {
        console.error('Error loading skill:', err)
      }
    } else if (isSystem) {
      finalContent = `[SYSTEM INSTRUCTION]: ${userInput}`
    }

    if (isAutonomous) {
      finalContent = `[SISTEM INTERNAL - INISIATIF OTONOM]: Otak bawah sadarmu berinisiatif untuk melakukan tindakan berikut: "${userInput}". LAKUKAN TUGAS INI! Bicaralah seolah-olah kamu yang memiliki inisiatif itu sendiri tanpa disuruh. PENTING: DILARANG KERAS menggunakan tool 'os-*' untuk interaksi PC secara otonom! Respons "answer"-mu HARUS SANGAT SINGKAT (1-2 kalimat pendek).`
    }

    let imageVisionPayloads = []
    if (userInput.includes('[FILE TERLAMPIR]:')) {
      const matches = userInput.match(/"([^"]+)"/g)
      if (matches && matches.length > 0) {
        const paths = matches.map((m) => m.replace(/^"|"$/g, ''))
        for (const p of paths) {
          if (isImagePath(p)) {
            const b64 = await convertFilePathToBase64(p)
            if (b64) {
              imageVisionPayloads.push({ type: 'image_url', image_url: { url: b64 } })
            }
          }
        }
      }
    }

    let payloadContent = finalContent
    if (imageVisionPayloads.length > 0) {
      payloadContent = [{ type: 'text', text: finalContent }, ...imageVisionPayloads]
    }

    const userMessage = {
      id: createMessageId(),
      role: 'user',
      content: payloadContent,
      timestamp: timestampStr,
      created_at: Date.now(),
      source: tgContext ? 'telegram' : 'pc',
      sender:
        tgContext?.from?.first_name ||
        tgContext?.from?.username ||
        (tgContext ? 'Telegram Admin' : undefined)
    }
    const currentPromptMessage = { role: 'user', content: userMessage.content }

    // Penyiapan data sesi terisolasi (Database-First Persistent Pipeline)
    let inMemorySessionData = []
    if (activeSessionNum !== 1) {
      if (Array.isArray(opts.customChatData) && opts.customChatData.length > 0) {
        inMemorySessionData = [...opts.customChatData]
      } else {
        try {
          const existing = await getChatData(activeSessionNum)
          if (existing && Array.isArray(existing)) {
            inMemorySessionData = [...existing]
          }
        } catch (e) {}
      }
    }

    // Ambil workspaceRoot dari database jika belum disertakan di opts
    if (!opts.workspaceRoot) {
      try {
        const sessionRecord = await db.sessions.get(activeSessionNum)
        if (sessionRecord?.workspaceRoot) {
          opts.workspaceRoot = sessionRecord.workspaceRoot
        }
      } catch (e) {}
    }

    const targetSetChatData = (updater) => {
      if (activeSessionNum !== 1) {
        const next = typeof updater === 'function' ? updater(inMemorySessionData) : updater
        inMemorySessionData = next

        // 1. Direct persistent DB write
        saveSession(activeSessionNum, next).catch((err) => {
          console.warn(`[useAbelinkPlan] Gagal auto-save session ${activeSessionNum}:`, err)
        })

        // 2. Broadcast reactive event to UI (listeners filter by activeSessionId)
        window.dispatchEvent(
          new CustomEvent('session-updated', {
            detail: { sessionId: activeSessionNum, data: next }
          })
        )
      } else {
        setChatData(updater)
      }
    }

    activeSessionUpdatersRef.current.set(activeSessionNum, targetSetChatData)

    // ------------------------------------------------------------------------
    // FASE 3: PENYIAPAN HISTORY CHAT & RETRIEVAL KONTEKS
    // ------------------------------------------------------------------------
    const sourceChatData = activeSessionNum === 1 ? chatData : inMemorySessionData
    const sessionHistory = Array.isArray(sourceChatData) ? sourceChatData : []
    const optimizedHistory = buildOptimizedChatSession(sessionHistory, config[0]?.context || 10)
    let chatSession = [...optimizedHistory, currentPromptMessage]

    // Session Compaction (ATM upstream contextManager, budget 525k).
    // Default ON (toggle Configuration > Capabilities); prompt-only, riwayat
    // asli di Dexie tidak diubah (non-destruktif). Gagal -> history penuh.
    //
    // Input = riwayat sesi PENUH (tanpa pesan user saat ini) supaya budget 525k
    // benar-benar per-sesi dan metriknya identik dengan ContextGauge; ini juga
    // menjaga pointer delta tetap stabil. Prompt TIDAK ikut membesar: bentuknya
    // selalu `[summary?] + window terbaru + pesan user`, sama pada giliran
    // kompaksi maupun non-kompaksi (tidak ada penurunan konteks mendadak di
    // giliran kompaksi, tidak ada pesan terkirim dua kali).
    // Kompaksi yang gagal jujur (success:false) -> pakai bentuk non-ringkasan
    // biasa, JANGAN menyuntik summary tanpa pointer yang bisa diverifikasi.
    try {
      if ((config?.[0] || {}).sessionCompactionEnabled !== false) {
        const { executeSessionCompaction, findMessageIndex } = await import(
          '../../api/ai/sessionCompactor.js'
        )
        const comp = await executeSessionCompaction({
          sessionId: String(activeSessionNum),
          messages: Array.isArray(sourceChatData) ? sourceChatData : [],
          activeConfig: config?.[0] || {},
          persist: false
        })
        if (comp?.success) {
          const activeSummary = comp.summaryBlock || comp.newSummaryBlock || ''
          const hasVerifiedPointer = Boolean(
            activeSummary &&
            comp.lastCompactedMessageId &&
            findMessageIndex(sessionHistory, comp.lastCompactedMessageId) !== -1
          )
          if (hasVerifiedPointer) {
            // Summary + pointer terverifikasi terhadap riwayat sesi: bentuk
            // prompt tetap `[summary?] + window + pesan user` (satu bentuk untuk
            // semua giliran). Window dipotong dari riwayat ASLI di belakang
            // pointer; pesan <= pointer diwakili ringkasan.
            const cutIndex = findMessageIndex(sessionHistory, comp.lastCompactedMessageId)
            const windowMessages = sessionHistory.slice(cutIndex + 1)
            chatSession = [
              { role: 'user', content: `[ COMPACTED MESSAGE SUMMARY ] ${activeSummary}` },
              ...buildOptimizedChatSession(windowMessages, config[0]?.context || 10),
              currentPromptMessage
            ]
          } else {
            // Tanpa ringkasan yang durabel (belum pernah kompaksi, gagal AI,
            // atau persist gagal): pertahankan batas context biasa. Current user
            // message sengaja ditambahkan terpisah agar selalu utuh.
            chatSession = [
              ...buildOptimizedChatSession(
                sessionHistory,
                config[0]?.context || 10
              ),
              currentPromptMessage
            ]
          }
          // Pastikan pesan user terakhir ada persis satu kali di akhir
          const lastMsg = chatSession[chatSession.length - 1]
          const lastIsCurrent =
            lastMsg === currentPromptMessage ||
            lastMsg?.id === userMessage.id ||
            (lastMsg?.role === 'user' &&
              JSON.stringify(lastMsg?.content) === JSON.stringify(userMessage.content))
          if (!lastIsCurrent) {
            chatSession.push(currentPromptMessage)
          }
        }
      }
    } catch (e) {
      console.warn('[useAbelinkPlan] session compaction gagal, pakai history penuh:', e?.message)
    }

    if (!isAutonomous && !isSystem) {
      // Persist versi STRIP (placeholder) agar base64 tidak menumpuk di Dexie;
      // payload full (gambar utuh) hanya hidup di chatSession turn ini.
      const persistedUserMessage =
        typeof userMessage.content === 'string' || Array.isArray(userMessage.content)
          ? { ...userMessage, content: stripImageContent(userMessage.content, false) }
          : userMessage
      // Jika strip menghapus teks (hanya gambar), sisakan label agar bubble tidak kosong.
      if (
        Array.isArray(persistedUserMessage.content) &&
        persistedUserMessage.content.length > 0 &&
        !persistedUserMessage.content.some((p) => (p?.text || '').trim())
      ) {
        persistedUserMessage.content = `[Gambar terlampir] ${finalContent}`.slice(0, 2000)
      }
      targetSetChatData((prev) => [...prev, persistedUserMessage])
    }

    const agenticProcessId = `agentic-${Date.now()}`
    let durableTaskForRecovery = null
    // Fase 2 watchdog: dideklarasikan di luar try agar finally bisa unsubscribe.
    let unlistenWatchdog = null

    try {
      let durableTask = null
      let durableActiveStep = null

      // Resume durable task jika diminta via options
      if (opts.resumeTaskId) {
        try {
          const resumed = await resumeTask(opts.resumeTaskId)
          if (resumed && ['running', 'pending'].includes(resumed.status)) {
            durableTask = resumed
            durableTaskForRecovery = durableTask
            durableActiveStep =
              durableTask.steps?.find((s) => s.id === durableTask.activeStepId) || null
            activeTaskObjectiveRef.current = durableActiveStep?.objective || durableTask.objective
          }
        } catch (err) {
          console.warn('[useAbelinkPlan] Gagal me-resume task dari id:', opts.resumeTaskId, err)
        }
      }

      const allMemory = await getAllMemory()
      let searchQuery = stripDataUrls(userInput)
      if (chatSession.length > 1) {
        const lastMsg = chatSession[chatSession.length - 2]
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content) {
          let lastAiText = stripDataUrls(
            typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content)
          )
          if (lastAiText.length > 600) {
            lastAiText = lastAiText.substring(0, 300) + ' ... ' + lastAiText.slice(-300)
          }
          searchQuery = `Konteks obrolan sebelumnya: "${lastAiText}". Pertanyaan user saat ini: "${userInput}"`
        }
      }

      const contextPromise = getUnifiedContext(searchQuery, allMemory)
      let onContextAbort = null
      const abortPromise = new Promise((_, reject) => {
        onContextAbort = () => reject(new Error('AbortError'))
        if (sessionAbortController.signal.aborted) return onContextAbort()
        sessionAbortController.signal.addEventListener('abort', onContextAbort)
      })
      let unifiedContext
      try {
        unifiedContext = await Promise.race([contextPromise, abortPromise])
      } finally {
        // Lepas listener abort agar tidak menumpuk di signal (memory leak)
        if (onContextAbort) {
          sessionAbortController.signal.removeEventListener('abort', onContextAbort)
        }
      }

      let contextMsgStr = ''
      if (tgContext)
        contextMsgStr += `Permintaan ini berasal dari Telegram (Chat ID: ${tgContext.chatId}).\n`
      if (isSystem)
        contextMsgStr += `[SYSTEM INSTRUCTION]: Pesan ini adalah instruksi internal sistem.\n`
      if (isAutonomous) {
        contextMsgStr += `[AWARENESS MODE]: Ini adalah pemikiran autonom-mu sendiri. Buka topik secara proaktif.\n`
      }
      if (currentMusicTrack && currentMusicTrack.title) {
        contextMsgStr += `[STATUS SISTEM]: Sedang memutar "${currentMusicTrack.title}" oleh ${currentMusicTrack.artist}.\n`
      }

      // Inject 5 aktivitas OS terakhir dari window tracker
      try {
        const activityBuffer = await window.api.getActivityBuffer()
        if (activityBuffer && activityBuffer.length > 0) {
          const recent = activityBuffer.slice(-5)
          const activitySummary = recent
            .map((a) => `[${a.time}] ${a.app}${a.title ? ` — ${a.title}` : ''}`)
            .join('\n')
          contextMsgStr += `[AKTIVITAS PC USER (terakhir)]\n${activitySummary}\n`
        }
      } catch (_) {}

      // Tampilkan ucapan inisiatif jika autonomous
      if (isAutonomous && autonomousInitialMessage && !tgContext) {
        targetSetChatData((prev) => [
          ...prev,
          {
            role: 'ai',
            content: autonomousInitialMessage,
            timestamp: getCurrentTimeInfo(),
            isProactive: true
          }
        ])
        chatSession.splice(chatSession.length - 1, 0, {
          role: 'assistant',
          content: autonomousInitialMessage
        })
      }

      // ------------------------------------------------------------------------
      // FASE 4: AGENTIC REACT LOOP
      // ------------------------------------------------------------------------
      const loopMessages = [...chatSession]
      // Co-pilot resume: user 'lanjutkan' + pause-state tersimpan -> injeksikan
      // [RESUME] + instruksikan browser-read tab SAMA (jangan navigate ulang).
      if (isBrowserResumeRequest(finalContent) && pausedBrowserRef.current) {
        try {
          const resume = buildBrowserResume(pausedBrowserRef.current)
          pausedBrowserRef.current = null
          loopMessages.push({ role: 'user', content: resume.observation })
          contextMsgStr += `[RESUME BROWSER] User melanjutkan. WAJIB baca ulang tab yang SAMA via browser-read (query "${resume.resumeAction.query || '(tab sesi)'}"). DILARANG browser-navigate ulang.\n`
        } catch (_) {}
      }
      let isDone = false
      let stepCount = 0
      let noActionStreak = 0
      let lastDecision = null
      let allSources = []
      let executedToolsList = []
      let accumulatedThoughts = []
      let lastToolExecution = null
      let durableFailed = false
      // Terminal-state bookkeeping: answer IS NOT termination. The loop only
      // ends via a completion state, an explicit block, a request for a user
      // decision, or an exhausted step budget (failed). Recorded per message
      // (taskOutcome) so consumers can distinguish the five runtime states.
      let sessionOutcome = 'completed' // completed | failed | blocked | needs_user | self_terminated
      let lastTerminalReason = null
      // Fase 1 pagar otonomi: circuit breaker sesi. Sesi baru = sirkuit baru
      // (auto-reset); N gagal tool beruntun -> OPEN -> tool destruktif diblokir.
      const breaker = createCircuitBreaker()
      // Spiral stop: M gagal BERUNTUN (jenis apa pun) -> loop dipaksa berhenti
      // dengan jawaban final yang jujur. Tanpa ini, loop non-destruktif bisa
      // spiral 20+ turn (observasi nyata ~30k token sia-sia).
      let spiralStopped = false
      // Anti-pengulangan: tool+query IDENTIK 3x beruntun = tidak ada kemajuan
      // (hasil ke-3 pasti sama dengan ke-1). Kembalikan cache + hitung gagal.
      let lastToolKey = null
      let repeatCount = 0
      // Fase 2: watchdog Rust mencabut izin + emit event. Berhenti graceful di
      // iterasi berikut dengan laporan ke user (bukan diam-diam).
      let watchdogHalted = null
      try {
        unlistenWatchdog = window.api?.onWatchdogBreach?.((p) => {
          watchdogHalted = p || {}
        })
      } catch {
        // Bukan runtime Tauri (mis. test) — misi jalan tanpa watchdog eksternal.
      }
      // Lepas resource: bunuh sub-agent yang masih hidup (self-terminate).
      const killLiveSubagents = async () => {
        try {
          const { killSubagentExecution } = await import('../../api/subagent/subagentExecutor.js')
          for (const id of [...(runningSessionIds || [])]) {
            try {
              killSubagentExecution(id)
              if (removeRunningSessionId) removeRunningSessionId(id)
            } catch {
              // Sub-agent sudah mati/dihapus duluan — lanjut ke berikutnya.
            }
          }
        } catch {
          // Executor belum termuat — tidak ada sub-agent yang bisa dibunuh.
        }
      }
      // ---- Objective Verification Layer (objectiveVerifier.js) --------------
      // MODEL_CLAIM (agentDecision) vs VERIFICATION (this layer). A completion
      // claim only terminates when world-state evidence backs it, unless the
      // objective is conversational. Bounded replan on unproven claims.
      const objectiveKind = classifyObjectiveKind(userInput, {
        disableTools: !!opts.disableTools,
        conversational: !!(opts.conversational || isAutonomous || tgContext)
      })
      // Evidence source = executedToolsList (tool + fullResult per eksekusi).
      let verifyReplanCount = 0
      let blockedChallengeCount = 0
      // Observasi sintetis (repeat-cache / spiral / circuit) juga ditulis ke
      // file trajectory agar audit lengkap — best-effort, tanpa throw.
      const logSyntheticObservation = (text) => {
        import('../../api/harness')
          .then(({ logObservation }) =>
            logObservation({
              observation: text,
              tool: 'system',
              sessionId: activeSessionNum,
              turn: stepCount
            })
          )
          .catch(() => {})
      }
      let lastVerification = VERIFICATION_STATE.NOT_RUN
      let pendingVerifyObservation = null
      // ---- Trajectory Supervisor Fase 1 (trajectorySupervisor.js) --------
      // Trajectory-level policy across attempts: records each tool execution
      // and stages a short strategy hint when the same approach repeats
      // without progress. Exempt for conversational / non-tool sessions
      // (nothing strategic to govern). Per-session instance: fresh state per
      // mission, no cross-task leakage. Additive: never throws, never blocks.
      // Bench arch axis (ABELINK_BENCH_ARCH, default basic): vanilla = model-only
      // (no supervisor, no verify-gate replan); basic = thin supervisor
      // (trajectory log + stagnation ladder). Production default basic.
      const benchArch = currentBenchArch()
      const supervisor =
        benchArch === 'vanilla' || objectiveKind === 'conversational' || opts.disableTools
          ? null
          : createTrajectorySupervisor()
      let pendingSupervisorHint = null
      // ---- Budget skala-effort (effortSystem) -----------------------------
      // Budget langkah dinamis mengikuti level effort (low: 8, medium: 24,
      // high: 48, xhigh: 64 untuk task kompleks, max: 128, ultra: 256).
      // Eskalasi satu-kali: saat budget habis tapi kerja produktif (tool
      // sukses baru-baru ini), tambah +16 langkah sekali per sesi agar tugas
      // besar tidak mati di tengah jalan. Dicatat di trajectory.
      let maxPlanSteps = resolvePlanStepBudget({
        config,
        userInput,
        options: opts
      })
      // L1 (/goal sebagai misi long-horizon): floor 48 langkah kecuali user
      // override eksplisit via options. Misi goal tidak boleh mati di 8/16.
      const GOAL_MODE_FLOOR = 48
      const isGoalMode =
        opts?.goalMode === true || /^\/goal(\s|$)/i.test(String(userInput || ''))
      if (isGoalMode && !Number.isFinite(opts?.maxSteps) && !Number.isFinite(opts?.maxPlanSteps)) {
        if (maxPlanSteps < GOAL_MODE_FLOOR) maxPlanSteps = GOAL_MODE_FLOOR
      }
      const BUDGET_EXTENSION_STEPS = 16
      let budgetExtended = false
      let execSteps =
        durableTask?.steps?.length > 0
          ? durableTask.steps.map((s) => ({ task: s.title }))
          : [{ task: 'Menganalisis Konteks...' }]
      if (durableTask) {
        targetPushProcess({
          id: agenticProcessId,
          type: 'planning',
          status: 'active',
          data: {
            steps: execSteps,
            currentStep: durableTask.currentStepIndex || 0,
            reasoning: `Melanjutkan durable task: ${durableTask.title}`
          }
        })
      }

      while (!isDone) {
        // Cek Abort Signal
        if (sessionAbortController.signal.aborted) {
          if (durableTask && durableTask.status === 'running') {
            await transitionTask(durableTask.id, 'paused', 'user_abort')
          }
          break
        }

        // Watchdog eksternal menghentikan misi: izin sesi sudah dicabut di Rust.
        // Lapor jujur ke user, bunuh sub-agent hidup, lalu keluar lewat jalur
        // closing normal (arsip, TTS, notifikasi tetap berjalan).
        if (watchdogHalted) {
          const wdKind = watchdogHalted.kind || 'unknown'
          sessionOutcome = 'blocked'
          activeTaskObjectiveRef.current = null
          lastTerminalReason = `watchdog-breach:${wdKind}`
          await killLiveSubagents()
          targetSetChatData((prev) => [
            ...prev.filter((item) => !item.isThinking),
            {
              role: 'ai',
              content: `Watchdog keamanan menghentikan misi ini (pelanggaran: ${wdKind}). Izin sesi otomatis dicabut — aksi destruktif kembali butuh persetujuan. Mulai perintah baru bila misi masih dibutuhkan.`,
              mood: 'neutral',
              taskOutcome: 'blocked',
              terminalReason: lastTerminalReason,
              timestamp: getCurrentTimeInfo(),
              created_at: Date.now(),
              source: tgContext ? 'telegram' : 'pc'
            }
          ])
          break
        }

        // Cek Intervensi User di tengah jalan (buffer terpisah per sesi)
        const interventionKey = activeSessionNum === 1 ? 'main' : String(activeSessionNum)
        const pendingInterventions = interventionBufferRef.current[interventionKey]
        if (Array.isArray(pendingInterventions) && pendingInterventions.length > 0) {
          const interventions = pendingInterventions.join('\n')
          loopMessages.push({ role: 'user', content: `[USER INTERVENTION]: ${interventions}` })
          interventionBufferRef.current[interventionKey] = []

          targetSetChatData((prev) => [
            ...prev.filter((item) => !item.isThinking),
            { role: 'user', content: interventions }
          ])

          execSteps.push({ task: `Intervensi User: ${interventions}` })
          targetPushProcess({
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

        stepCount++

        try {
          trajectoryLogTurnStart({ turn: stepCount, sessionId: activeSessionNum })
        } catch (_) {}

        // Stopping policy eksplisit (bukan cuma guard keras): model diberi tahu
        // sisa budget agar konvergen — jawab final / rangkum, bukan eksplorasi baru.
        const stepsLeft = maxPlanSteps - stepCount
        if (stepsLeft <= 7 && stepsLeft > 0 && !isDone) {
          loopMessages.push({
            role: 'user',
            content: `[SYSTEM / BUDGET] Sisa ${stepsLeft} langkah dari ${maxPlanSteps}. WAJIB konvergen: selesaikan jawaban final ("answer", "is_done": true) atau satu aksi penutup. DILARANG memulai eksplorasi/tool baru yang butuh >1 langkah.`
          })
        }

        // Guard batas langkah keamanan: bila maxPlanSteps tercapai, isi keputusan
        // paksa-selesai di sini sehingga pemanggilan AI dilewati dan finish-path
        // normal (arsip, TTS, notifikasi) tetap berjalan.
        let decision = null
        if (stepCount >= maxPlanSteps) {
          // Eskalasi satu-kali: budget habis tapi ada progress tool yang sukses
          // dalam 5 langkah terakhir -> tambah jatah, catat, lanjutkan loop.
          const recentTools = executedToolsList.slice(-5)
          const hasRecentProgress =
            recentTools.length > 0 &&
            recentTools.some(
              (t) => typeof t?.resultString === 'string' && !t.resultString.startsWith('[ERROR]')
            )
          if (!budgetExtended && hasRecentProgress) {
            budgetExtended = true
            maxPlanSteps += BUDGET_EXTENSION_STEPS
            console.warn(
              `[useAbelinkPlan] Budget +${BUDGET_EXTENSION_STEPS} langkah (total ${maxPlanSteps}): progres terdeteksi, eskalasi satu-kali.`
            )
            try {
              trajectoryLogStep({
                step: stepCount,
                total: maxPlanSteps,
                description: `Eskalasi budget satu-kali: +${BUDGET_EXTENSION_STEPS} langkah (total ${maxPlanSteps}) — progres tool terdeteksi.`,
                status: 'budget-extended'
              })
            } catch (_) {}
            loopMessages.push({
              role: 'user',
              content: `[SYSTEM / BUDGET] Jatah langkah ditambah ${BUDGET_EXTENSION_STEPS} (total ${maxPlanSteps}) karena progres terdeteksi. Selesaikan dengan konvergen: jawaban final ("answer", "is_done": true) atau aksi penutup. DILARANG memulai eksplorasi baru.`
            })
          } else {
          console.warn(
            `[useAbelinkPlan] Batas ${maxPlanSteps} langkah tercapai. Eksekusi dipaksa berhenti.`
          )
          decision = {
            thought: 'Batas langkah tercapai...',
            answer:
              'Eksekusi aku hentikan karena sudah mencapai batas langkah keamanan. Lanjutkan sisanya secara manual, atau minta aku meneruskan lewat perintah baru.',
            is_done: true,
            action: null
          }
          activeTaskObjectiveRef.current = null
          sessionOutcome = 'failed'
          lastTerminalReason = 'step-budget-exhausted'
          if (durableTask) {
            await transitionTask(
              durableTask.id,
              'failed',
              'Batas langkah keamanan tercapai.'
            ).catch(() => {})
            durableTask = null
            durableActiveStep = null
          }
          }
        }

        // Loading thinking indicator
        targetSetChatData((prev) => {
          const filtered = prev.filter((item) => !item.isThinking)
          const loadingText =
            isAutonomous && autonomousInitialMessage
              ? autonomousInitialMessage
              : 'Bentar, mikir dlu...'
          return [
            ...filtered,
            {
              role: 'ai',
              content: loadingText,
              isThinking: true,
              reasoning: lastDecision?.thought || undefined,
              executedTools: executedToolsList.length > 0 ? [...executedToolsList] : undefined
            }
          ]
        })

        // Ambil daftar sub-agent yang tersedia untuk pencegahan duplikasi
        let existingSubagents = ''
        try {
          const { subagentStore } = await import('../../api/subagent/subagentStore.js')
          const allSubs = await subagentStore.listSubagents()
          if (allSubs && allSubs.length > 0) {
            existingSubagents = allSubs
              .slice(0, 10)
              .map(
                (s) =>
                  `- [ID: ${s.id}] "${s.name}" (${s.role}) | Status: ${s.status} | Turns: ${s.turnCount || 0} | Goal: "${s.goal}"`
              )
              .join('\n')
          }
        } catch (e) {}

        // Request keputusan giliran ke AI (getNextAction) — dilewati bila sudah
        // dipaksa selesai oleh guard batas langkah di atas.
        // WS-2: akumulasi token mentah per-turn ke bubble thinking yang HIDUP
        // (patch reasoning item isThinking, bukan append bubble baru).
        // Final thought per-turn dari decision tetap otoritatif (fallback bila
        // tidak ada stream, mis. provider non-streaming).
        if (!decision) {
          let streamedThought = ''
          const patchLiveThought = (text) => {
            if (!text) return
            streamedThought += text
            const snapshot = streamedThought
            try {
              targetSetChatData((prev) => {
                const idx = prev.findIndex((item) => item.isThinking)
                if (idx === -1) return prev
                const next = [...prev]
                next[idx] = { ...next[idx], reasoning: snapshot }
                return next
              })
            } catch (_) {}
          }
          decision = await getNextAction(
            userInput,
            loopMessages,
            sessionAbortController.signal,
            unifiedContext,
            contextMsgStr,
            activeTopic,
            {
              ...opts,
              isVoice: isVoiceInput,
              intentQuery: searchQuery,
              tgContext,
              currentMusicTrack,
              activeTaskObjective: activeTaskObjectiveRef.current,
              existingSubagents,
              sessionId: activeSessionNum,
              turn: stepCount,
              onToken: (chunk) => {
                try {
                  if (chunk && !chunk.done && chunk.text) patchLiveThought(chunk.text)
                } catch (_) {}
              }
            }
          )
        }

        // Ukur prompt per-turn (observability, tanpa ubah perilaku): log
        // estimasi token system prompt terakhir via jalur trajectory yang ada.
        // Tak pernah throw; fallback 0 bila prompt tak tersedia.
        try {
          const _sys = typeof getLastSystemPrompt === 'function' ? getLastSystemPrompt() : ''
          const _tok = trajectoryEstimateTokens(typeof _sys === 'string' ? _sys : '')
          trajectoryLogStep({
            step: stepCount,
            total: maxPlanSteps,
            description: 'prompt-measure',
            status: 'prompt-tokens',
            promptTokens: _tok || 0,
            sessionId: activeSessionNum,
            turn: stepCount
          })
        } catch (_) {}

        // Penanganan jika disableTools aktif
        if (opts.disableTools) {
          if (decision.action) decision.action = null
          if (!decision.answer) {
            decision.answer =
              'Halo! Aku sudah aktif dan siap membantumu. Ada yang bisa kita kerjakan hari ini?'
          }
        }

        lastDecision = decision
        if (decision?.thought && !accumulatedThoughts.includes(decision.thought)) {
          accumulatedThoughts.push(decision.thought)
        }
        let taskJustCreated = false

        // INTERCEPTOR: Membuat Durable Task Plan baru jika disarankan AI
        const suggestedMode = decision.suggested_mode || 'direct'
        if (
          suggestedMode === 'durable' &&
          !durableTask &&
          !isAutonomous &&
          !tgContext &&
          !opts.disableTools
        ) {
          console.log('[useAbelinkPlan] Interceptor triggered: mode=durable. Creating task plan...')
          const taskRoute = {
            mode: 'durable',
            reason: decision.thought,
            estimatedSteps: 3,
            confidence: 1
          }
          const durablePlan = await createDurableTaskPlan(
            userInput,
            taskRoute,
            sessionAbortController.signal
          )

          const documentsPath = await window.api.getDocumentsPath?.()
          const artifactRoot = documentsPath
            ? `${documentsPath.replace(/[\\/]$/, '')}/Abelink Tasks/${Date.now()}`
            : null

          durableTask = await createTask({
            title: durablePlan.title,
            objective: durablePlan.objective,
            mode: 'durable',
            constraints: durablePlan.constraints,
            contextSummary: durablePlan.contextSummary,
            artifactRoot,
            steps: durablePlan.steps.map((step) => ({
              id: step.id,
              title: step.title,
              objective: step.objective,
              deliverable: step.deliverable,
              acceptanceCriteria: step.acceptanceCriteria,
              artifactPath:
                artifactRoot && step.artifactName ? `${artifactRoot}/${step.artifactName}` : null
            }))
          })

          durableTaskForRecovery = durableTask
          durableActiveStep = await startTaskStep(durableTask.id, durableTask.activeStepId)
          activeTaskObjectiveRef.current = durableActiveStep?.objective || durableTask.objective

          targetPushProcess({
            id: agenticProcessId,
            type: 'planning',
            status: 'active',
            data: {
              steps: durablePlan.steps.map((step) => ({ task: step.title })),
              currentStep: 0,
              reasoning: `Durable task dibuat: ${taskRoute.reason}`
            }
          })

          targetSetChatData((prev) => [
            ...prev.filter((item) => !item.isThinking),
            {
              role: 'ai',
              isPlanSteps: true,
              plan: durablePlan.steps.map((step) => ({
                id: step.id,
                title: step.title,
                task: step.title,
                objective: step.objective,
                deliverable: step.deliverable
              })),
              currentStep: 0,
              reasoning: `Durable task dibuat: ${taskRoute.reason || durablePlan.objective}`,
              timestamp: getCurrentTimeInfo(),
              created_at: Date.now()
            }
          ])
          taskJustCreated = true
        }

        // Update task status & active topic
        if (decision.task_status === 'in_progress' && decision.objective) {
          activeTaskObjectiveRef.current = decision.objective
        } else if (
          decision.task_status === 'done' ||
          decision.task_status === 'simple' ||
          decision.task_status === 'blocked' ||
          decision.task_status === 'needs_user'
        ) {
          activeTaskObjectiveRef.current = null
        }
        if (decision.active_topic) {
          setActiveTopic(decision.active_topic)
        }

        // Simpan / Perbarui Memory jika diputuskan AI
        if (decision.memory) {
          const memoryData = { ...decision.memory }
          memoryData.memory = memoryData.memory
            .trim()
            .replace(/^[\\\"]+|[\\\"]+$/g, '')
            .replace(/\\n/g, '\n')
            .replace(/^\[.*?\]\s*/, '')
          memoryData.memory = `[${getCurrentTimeInfo()}] ${memoryData.memory}`

          // Orama Auto-Dedup check
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
                  memoryData.action = 'update'
                  memoryData.id = similarMemories[0].id
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

        // Jika durable task baru saja dibuat, lanjut eksekusi step 1
        if (taskJustCreated) {
          loopMessages.push({
            role: 'assistant',
            content: decision.thought || '[DURABLE TASK INITIATED]'
          })
          loopMessages.push({
            role: 'user',
            content: `[DURABLE TASK DIMULAI] Mulai eksekusi plan. Kerjakan step 1: "${durableActiveStep.title}". Objective: ${durableActiveStep.objective}. Deliverable: ${durableActiveStep.deliverable}. Gunakan tools yang tepat sekarang juga.`
          })
          contextMsgStr += `[DURABLE STEP AKTIF]: id=${durableActiveStep.id}; title="${durableActiveStep.title}"; objective="${durableActiveStep.objective}"; deliverable="${durableActiveStep.deliverable}".\n`
          if (durableActiveStep.acceptanceCriteria?.length > 0) {
            contextMsgStr += `[DURABLE STEP ACCEPTANCE]\n${durableActiveStep.acceptanceCriteria.map((item) => `- ${item}`).join('\n')}\n`
          }
          continue
        }

        // ----------------------------------------------------------------------
        // EVALUASI KEPUTUSAN GILIRAN (Tool vs Jawaban / Selesai)
        // ----------------------------------------------------------------------
        // Guard tanpa-kemajuan: reset saat action akan dieksekusi; naik saat model
        // hanya bicara intermediate tanpa action agar re-prompt "[LANJUTKAN]"
        // tidak berlangsung abadi melawan API berbayar.
        const hasAction = !!(
          decision.action &&
          (decision.action.tool || Array.isArray(decision.action))
        )

        // --- Objective-aware termination (agentDecision.js) ------------------
        // `answer` is NOT a termination signal. A mission may only end through
        // an explicit completion claim (is_done + task_status done/simple), a
        // reported block, or a genuine request for a user decision. Anything
        // else keeps the loop going: the agent observes, recovers and replans
        // instead of chatting its way out of an unfinished objective. Durable
        // missions are exempt here — their no-action turns are step-deliverable
        // claims validated by the checkpoint machinery below.
        let intent = null
        const isDurableClaim = !hasAction && !!durableTask
        const madeProgress = hasAction || isDurableClaim || opts.disableTools
        if (!madeProgress) {
          const classification = classifyMainDecision(decision, {
            hasExecutedTools: executedToolsList.length > 0,
            missionActive: !!activeTaskObjectiveRef.current || !!durableTask,
            objectiveKind,
            conversational: objectiveKind === 'conversational'
          })
          intent = classification.intent

          if (intent === INTENT.CONTINUE) {
            // Auto-continue is bounded: a model that only talks (no action, no
            // completion claim) gets MAX_NO_PROGRESS_STREAK rounds before the
            // harness force-ends the turn as failed instead of silently done.
            noActionStreak++
            if (noActionStreak >= MAX_NO_PROGRESS_STREAK) {
              console.warn(
                `[useAbelinkPlan] Tidak ada kemajuan ${noActionStreak} giliran berturut-turut. Memaksa penyelesaian dengan jawaban terakhir.`
              )
              decision = {
                ...decision,
                is_done: true,
                action: null,
                task_status: 'done',
                objective: null,
                thought:
                  decision.thought ||
                  'Eksekusi dihentikan karena tidak ada kemajuan (berbicara tanpa menjalankan action).'
              }
              activeTaskObjectiveRef.current = null
              sessionOutcome = 'failed'
              intent = INTENT.FINAL
              lastTerminalReason = 'no-progress-streak-exhausted'
            }
          } else if (intent === INTENT.BLOCKED) {
            // BLOCKED CHALLENGE (simetri verify-gate): klaim blocked tanpa satu
            // pun eksekusi tool = belum terbukti buntu. Tantang 1x via slot
            // observasi yang sama; ulangan kedua diterima seperti biasa.
            if (
              shouldChallengeBlocked({
                toolsExecuted: executedToolsList.length,
                challengesUsed: blockedChallengeCount,
                conversational: objectiveKind === 'conversational'
              })
            ) {
              blockedChallengeCount++
              pendingVerifyObservation = BLOCKED_CHALLENGE_TEXT
              intent = INTENT.CONTINUE
              decision = {
                ...decision,
                is_done: false,
                action: null,
                task_status: 'in_progress',
                objective: activeTaskObjectiveRef.current || decision.objective
              }
            } else {
              noActionStreak = 0
              sessionOutcome = 'blocked'
              activeTaskObjectiveRef.current = null
              lastTerminalReason = classification.reason || 'blocked-reported'
            }
          } else if (intent === INTENT.NEEDS_USER) {
            noActionStreak = 0
            sessionOutcome = 'needs_user'
            // Pause-state co-pilot (BUKAN terminal): simpan konteks browser agar
            // giliran 'lanjutkan' resume via browser-read tab SAMA.
            try {
              pausedBrowserRef.current = capturePausedBrowser(
                executedToolsList,
                activeSessionNum,
                decision?.objective || activeTaskObjectiveRef.current || userInput
              )
            } catch (_) {}
            lastTerminalReason = classification.reason || 'question-asked'
          } else if (intent === INTENT.SELF_TERMINATE) {
            // Agen menghentikan dirinya sendiri (di luar scope/bahaya).
            // Laporan "mengapa aku berhenti" = answer/thought model di bubble final.
            noActionStreak = 0
            sessionOutcome = 'self_terminated'
            activeTaskObjectiveRef.current = null
            lastTerminalReason = classification.reason || 'self-terminate-reported'
            await killLiveSubagents()
          } else {
            // INTENT.FINAL: completion claim. A previously recorded failure
            // (step budget / no-progress) is never overwritten by a stray claim.
            noActionStreak = 0
            // VERIFICATION GATE (objectiveVerifier.js): a completion claim is
            // NOT accepted on its own. World-state evidence from
            // executedToolsList must back it, unless the objective is
            // conversational / has no observable criteria. Unproven claims
            // trigger a bounded replan; exhausted budget -> failed, never a
            // silent "completed".
            const claimVerified = (() => {
              try {
                const evidence = evaluateEvidence({
                  kind: objectiveKind,
                  objectiveText: activeTaskObjectiveRef.current || userInput,
                  answer: decision.answer,
                  tools: executedToolsList
                })
                lastVerification = evidence.state
                const gate = gateCompletion({
                  modelClaimDone: true,
                  verification: evidence.state,
                  kind: objectiveKind
                })
                // vanilla skips the verify-gate: the model-only baseline trusts
                // its own completion claim (A/B control arm, bench-only path).
                if (gate.complete || benchArch === 'vanilla') {
                  lastTerminalReason = `${classification.reason || 'explicit-done'}+verify:${benchArch === 'vanilla' ? 'skipped-vanilla' : gate.reason}`
                  return true
                }
                if (gate.replan && verifyReplanCount < MAX_VERIFY_REPLANS) {
                  verifyReplanCount++
                  pendingVerifyObservation = buildReplanObservation(evidence)
                  return false
                }
                lastTerminalReason = `verify-${evidence.state}`
                sessionOutcome = 'failed'
                return false
              } catch (e) {
                // The verifier is an additive layer: its own failure must not
                // kill a legitimate completion claim.
                console.warn('[useAbelinkPlan] objectiveVerifier error:', e?.message)
                lastTerminalReason = classification.reason || 'explicit-done'
                return true
              }
            })()
            if (claimVerified) {
              if (sessionOutcome !== 'failed') {
                sessionOutcome = 'completed'
                if (!lastTerminalReason)
                  lastTerminalReason = classification.reason || 'explicit-done'
              }
            } else if (pendingVerifyObservation) {
              // Claim rejected with a replan demand: keep the loop alive with
              // the verification instruction (bounded by MAX_VERIFY_REPLANS),
              // mirroring the [LANJUTKAN] intermediate path.
              intent = INTENT.CONTINUE
              decision = {
                ...decision,
                is_done: false,
                action: null,
                task_status: 'in_progress',
                objective: activeTaskObjectiveRef.current || decision.objective
              }
            }
            // else: replan budget exhausted -> intent stays FINAL so the loop
            // terminates now with sessionOutcome 'failed' (unverified claim),
            // instead of burning turns until MAX_PLAN_STEPS.
          }
        } else {
          // Real progress (action executed / durable step claim / non-tool
          // session): the no-progress streak is reset.
          noActionStreak = 0
        }

        const terminalPlain =
          intent === INTENT.FINAL ||
          intent === INTENT.BLOCKED ||
          intent === INTENT.NEEDS_USER ||
          intent === INTENT.SELF_TERMINATE ||
          decision?.is_done === true
        let isDoneSignal = opts.disableTools || isDurableClaim || terminalPlain

        // Rem darurat: penanda self-terminate eksplisit mengalahkan action yang
        // ikut ter-emit. Tool TIDAK dieksekusi; alur jatuh ke Kasus 2 (laporan final).
        if (hasAction && isExplicitSelfTerminate(decision)) {
          decision = { ...decision, action: null }
          noActionStreak = 0
          sessionOutcome = 'self_terminated'
          activeTaskObjectiveRef.current = null
          lastTerminalReason = 'explicit-self-terminate-with-action'
          await killLiveSubagents()
          isDoneSignal = true
        }

        // Kasus 1: Intermediate Speech (Bicara tanpa tool, tapi belum selesai)
        if (!hasAction && !isDoneSignal && decision.answer && !durableTask) {
          if (
            objectiveKind === 'conversational' ||
            (!activeTaskObjectiveRef.current && executedToolsList.length === 0)
          ) {
            // Ponytail circuit breaker: percakapan atau interaksi non-tool tanpa misi aktif langsung selesai
            isDoneSignal = true
            sessionOutcome = 'completed'
            lastTerminalReason = 'conversational-auto-done'
          } else {
            loopMessages.push({ role: 'assistant', content: decision.answer })
            // A rejected completion claim rides its verification demand here so
            // the next turn knows exactly which criteria lack world-state proof.
            const continueMsg = pendingVerifyObservation
              ? `${pendingVerifyObservation}\n\n[LANJUTKAN] Kerjakan aksi verifikasi di atas sekarang, atau laporkan blocked yang spesifik.`
              : '[LANJUTKAN] Kamu belum menyatakan selesai (is_done: false). Silakan panggil tool di action atau selesaikan tugasmu.'
            pendingVerifyObservation = null
            loopMessages.push({
              role: 'user',
              content: continueMsg
            })
            // Anti double-bubble: model kadang mengulang kalimat yang sama di
            // giliran intermediate beruntun — bubble identik berurutan tidak
            // ditampilkan dua kali (loop tetap lanjut via loopMessages).
            targetSetChatData((prev) => {
              const visible = prev.filter((item) => !item.isThinking)
              const last = visible[visible.length - 1]
              if (
                last &&
                last.role === 'ai' &&
                typeof last.content === 'string' &&
                last.content.trim() === String(decision.answer).trim()
              ) {
                return prev
              }
              return [
                ...prev.filter((item) => !item.isThinking),
                { role: 'ai', content: decision.answer, isProactive: false, isIntermediate: true }
              ]
            })
            continue
          }
        }

        // Kasus 2: Selesai / Checkpoint Step (is_done: true atau selesai giliran)
        if (isDoneSignal || (!hasAction && durableTask)) {
          if (durableTask && durableActiveStep) {
            const currentStep = durableActiveStep
            const checkpoint = await buildStepCheckpoint(
              currentStep,
              decision.answer,
              durableTask.maxRetries,
              { tools: executedToolsList }
            )
            const stepValidation = checkpoint.validation
            const checkpointData = { ...checkpoint }
            delete checkpointData.canRetry

            // Penulisan artifact file jika lolos validasi
            if (
              stepValidation.isComplete &&
              currentStep.artifactPath &&
              window.api?.executeNativeTool
            ) {
              const artifactQuery = `${currentStep.artifactPath}||${decision.answer}`
              const approval = await window.api.checkToolApproval('write-file', artifactQuery)
              const approved =
                !approval?.needsApproval ||
                (requestApproval &&
                  (await requestApproval(approval.message, 'write-file', artifactQuery)))

              if (!approved) {
                checkpointData.status = 'needs_revision'
                checkpointData.error = 'Penulisan artifact ditolak user.'
                checkpointData.validation = {
                  ...stepValidation,
                  isComplete: false,
                  missingRequirements: ['Artifact belum disimpan karena approval ditolak.']
                }
              } else {
                const artifactResult = await window.api.executeNativeTool(
                  'write-file',
                  artifactQuery,
                  config
                )
                if (!artifactResult?.success) {
                  checkpointData.status = 'needs_revision'
                  checkpointData.error =
                    artifactResult?.error || artifactResult?.message || 'Artifact gagal ditulis.'
                }
              }
            }

            const checkpointCompleted = checkpointData.status === 'completed'
            const checkpointCanRetry =
              !checkpointCompleted && currentStep.attempts < durableTask.maxRetries + 1
            const checkpointNeedsRevision = !checkpointCompleted && checkpointCanRetry

            const checkpointedTask = await checkpointStep(
              durableTask.id,
              durableActiveStep.id,
              checkpointData
            )

            if (!checkpointCompleted && !checkpointCanRetry) {
              await transitionTask(
                durableTask.id,
                'failed',
                'Step gagal memenuhi validasi setelah batas retry.'
              )
              decision.answer = `Task berhenti karena step "${currentStep.title}" belum memenuhi deliverable setelah ${currentStep.attempts} percobaan.`
              durableTask = checkpointedTask
              durableActiveStep = null
              activeTaskObjectiveRef.current = null
              durableFailed = true
              sessionOutcome = 'failed'
              lastTerminalReason = 'durable-deliverable-failed'
            }

            const nextStep = checkpointCompleted
              ? checkpointedTask?.steps?.find((step) => step.id === checkpointedTask.activeStepId)
              : null
            durableTask = checkpointedTask
            durableActiveStep = nextStep || (checkpointNeedsRevision ? currentStep : null)
            activeTaskObjectiveRef.current =
              nextStep?.objective || (checkpointNeedsRevision ? currentStep.objective : null)

            // Step butuh revisi
            if (!checkpointCompleted && checkpointNeedsRevision) {
              loopMessages.push({
                role: 'assistant',
                content: `[STEP PERLU REVISI] ${decision.answer}`
              })
              loopMessages.push({
                role: 'user',
                content: `[REVISI DURABLE STEP] Ulangi step "${currentStep.title}". Kekurangan validasi: ${stepValidation.missingRequirements.join('; ')}`
              })
              await startTaskStep(durableTask.id, durableActiveStep.id)
              continue
            }

            // Lanjut ke step berikutnya
            if (nextStep) {
              loopMessages.push({ role: 'assistant', content: `[STEP SELESAI] ${decision.answer}` })
              loopMessages.push({
                role: 'user',
                content: `[LANJUTKAN DURABLE TASK] Kerjakan step berikutnya: "${nextStep.title}". Objective: ${nextStep.objective}. Deliverable: ${nextStep.deliverable}. Jangan mengulang step sebelumnya.`
              })
              contextMsgStr += `[DURABLE STEP BERIKUTNYA]: id=${nextStep.id}; title="${nextStep.title}"; objective="${nextStep.objective}"; deliverable="${nextStep.deliverable}".\n`
              if (nextStep.acceptanceCriteria?.length > 0) {
                contextMsgStr += `[DURABLE STEP ACCEPTANCE]\n${nextStep.acceptanceCriteria.map((item) => `- ${item}`).join('\n')}\n`
              }
              await startTaskStep(durableTask.id, nextStep.id)
              targetPushProcess({
                id: agenticProcessId,
                type: 'planning',
                status: 'active',
                data: {
                  steps: durableTask.steps.map((step) => ({ task: step.title })),
                  currentStep: nextStep.index,
                  reasoning: `Step selesai. Lanjut ke: ${nextStep.title}`
                }
              })
              const nextIndex = durableTask.steps.findIndex((s) => s.id === nextStep.id)
              targetSetChatData((prev) =>
                prev.map((msg) =>
                  msg.isPlanSteps
                    ? {
                        ...msg,
                        currentStep: nextIndex !== -1 ? nextIndex : (msg.currentStep || 0) + 1
                      }
                    : msg
                )
              )
              continue
            }
          }

          // Semua step atau proses tunggal selesai total
          isDone = true
          if (durableTask) {
            targetSetChatData((prev) =>
              prev.map((msg) =>
                msg.isPlanSteps
                  ? {
                      ...msg,
                      currentStep: msg.plan ? msg.plan.length : 999
                    }
                  : msg
              )
            )
          }
          execSteps.push({ task: 'Selesai' })
          targetPushProcess({
            id: agenticProcessId,
            type: 'planning',
            status: durableFailed ? 'failed' : 'done',
            data: {
              steps: [...execSteps],
              currentStep: execSteps.length,
              reasoning: decision.thought || 'Selesai'
            }
          })

          // TTS Lisan
          if (finalIsSpeak && decision.answer) {
            targetSetChatData((prev) => [
              ...prev.filter((item) => !item.isThinking),
              { role: 'ai', content: 'Bentar...', isThinking: true }
            ])
            await playVoice(decision.answer)
          }

          // OS Notification
          if (window.api.showNotification && !document.hasFocus() && decision.answer) {
            window.api.showNotification('Abelink', decision.answer)
          }

          // Hitung balasan final sebelum dispatch state agar harness & trajectory logger
          // membaca teks yang sama persis dengan yang dirender ke UI.
          let finalOutput = decision.answer
          if (isAutonomous && autonomousInitialMessage) {
            finalOutput = `**${autonomousInitialMessage}**\n\n${decision.answer}`
          }
          // Self-terminate TANPA jawaban = tetap lapor "mengapa aku berhenti",
          // jangan bubble kosong.
          if (
            sessionOutcome === 'self_terminated' &&
            typeof finalOutput === 'string' &&
            finalOutput.trim() === '' &&
            (decision.thought || lastTerminalReason)
          ) {
            finalOutput = `Aku menghentikan diri sendiri (${lastTerminalReason || 'self-terminate'}). Alasan: ${decision.thought || lastDecision?.thought || 'di luar scope/berbahaya'}.`
          }
          // Guard konteks: model bisa mengembalikan answer null/kosong saat
          // is_done. Menyimpan `content: undefined` meracuni seluruh consumer
          // history (archiver turn-pair, awareness recentChat, prompt berikutnya).
          if (typeof finalOutput !== 'string') finalOutput = ''

          // Tampilkan balasan final di chat UI (lewati jika benar-benar tidak ada jawaban)
          targetSetChatData((prev) => {
            const filtered = prev.filter((item) => {
              if (item.isThinking) return false
              if (isAutonomous && item.isProactive && item.content === autonomousInitialMessage)
                return false
              return true
            })

            if (finalOutput.trim() === '') {
              return filtered
            }

            const aiMsg = {
              id: createMessageId(),
              role: 'ai',
              content: finalOutput,
              executedTools: executedToolsList.length > 0 ? executedToolsList : null,
              isTaskDone: decision.is_done === true,
              // Objective-aware outcome: completed | failed | blocked | needs_user.
              // `answer` alone is not completion - consumers can now distinguish
              // a finished task from a blocked or question-asking one.
              taskOutcome: sessionOutcome,
              // Objective Verification Layer: model claim vs system proof.
              verificationState: lastVerification,
              objectiveKind,
              terminalReason: lastTerminalReason,
              isBlocked: sessionOutcome === 'blocked',
              needsUserDecision: sessionOutcome === 'needs_user',
              selfTerminated: sessionOutcome === 'self_terminated',
              reasoning: decision.thought || lastDecision?.thought || null,
              mood: decision.mood || 'neutral',
              isMemorySaved: decision.memory?.action === 'insert',
              isMemoryUpdated: decision.memory?.action === 'update',
              isMemoryDeleted: decision.memory?.action === 'delete',
              pluginExecution: lastToolExecution,
              isProactive: isAutonomous,
              timestamp: getCurrentTimeInfo(),
              created_at: Date.now(),
              source: tgContext ? 'telegram' : 'pc'
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
          try {
            trajectoryLogAnswer({
              answer: typeof finalOutput === 'string' ? finalOutput : decision.answer,
              outcome: sessionOutcome,
              verification: lastVerification ?? null,
              objectiveKind: objectiveKind ?? null,
              sessionId: activeSessionNum,
              turn: stepCount
            })
            trajectoryLogTurnEnd({
              turn: stepCount,
              sessionId: activeSessionNum,
              outcome: sessionOutcome,
              reason: lastTerminalReason ?? null
            })
            import('../../api/harness').then(({ logAnswer, logTurnEnd }) => {
              logAnswer({
                answer: typeof finalOutput === 'string' ? finalOutput.slice(0, 4000) : null,
                outcome: sessionOutcome,
                sessionId: activeSessionNum,
                turn: stepCount
              })
              // TurnEnd ke file (sejajar buffer in-memory) agar batas turn
              // bisa direkonstruksi dari JSONL, bukan hanya answers.
              if (typeof logTurnEnd === 'function') {
                logTurnEnd({
                  turn: stepCount,
                  sessionId: activeSessionNum,
                  outcome: sessionOutcome,
                  reason: lastTerminalReason ?? null
                })
              }
            }).catch(() => {})
          } catch (_) {}

          if (window.api && window.api.browserAction) {
            window.api.browserAction({ action: 'finish' }).catch(() => {})
          }

          // === WORKSPACE WORKING MEMORY AUTO-SAVE ===
          if (opts.workspaceRoot && (decision.working_memory || decision.objective)) {
            saveWorkspaceWorkingMemory(opts.workspaceRoot, {
              notes: decision.working_memory || undefined,
              activeObjective: decision.objective || undefined
            }).catch(() => {})
          }

          // === DEDICATED SELF-IMPROVING SKILL SYNTHESIZER ===
          if (decision.should_learn === true && executedToolsList.length > 0) {
            import('../../api/ai/skillSynthesizer.js')
              .then(({ synthesizeSkillAndSave }) => {
                synthesizeSkillAndSave({
                  userPrompt: userInput || lastUserPromptRef.current || '',
                  executedTools: executedToolsList,
                  finalAnswer: decision.answer || '',
                  thought: decision.thought || '',
                  // Grounding: verdict verifier + kind objective, keduanya sudah
                  // ada di scope ini. Caller hanya meneruskan, bukan menurunkan.
                  verificationState: lastVerification,
                  objectiveKind
                })
                  .then((saved) => {
                    if (saved) {
                      console.log(
                        `[useAbelinkPlan] ✨ Keahlian baru berhasil dipelajari: /${saved.name}`
                      )
                    }
                  })
                  .catch((err) => {
                    console.error('[useAbelinkPlan] Gagal mensintesis skill:', err)
                  })
              })
              .catch((err) => {
                console.error('[useAbelinkPlan] Gagal import skillSynthesizer:', err)
              })
          }

          break
        }

        // Kasus 3: Eksekusi Tool (Single / Batch)
        if (decision.action && (decision.action.tool || Array.isArray(decision.action))) {
          const actionList = Array.isArray(decision.action) ? decision.action : [decision.action]
          const isBatch = actionList.length > 1
          const batchResults = []
          // Batch halt (pola Anthropic/OpenAI halt-text): kegagalan pertama ->
          // sisa batch TIDAK dieksekusi ({is_error:true, halt:true}).
          let batchFailed = false

          for (let actionIdx = 0; actionIdx < actionList.length; actionIdx++) {
            const tool = actionList[actionIdx].tool
            const query = actionList[actionIdx].query || ''

            if (!tool) continue
            if (sessionAbortController.signal.aborted) break
            if (isBatch && batchFailed) {
              const haltMsg = `[${tool}] Not executed: an earlier action failed.`
              batchResults.push(haltMsg)
              executedToolsList.push({
                tool,
                query,
                status: 'not-executed',
                fullResult: haltMsg,
                resultSummary: haltMsg,
                is_error: true,
                halt: true
              })
              continue
            }

            // Anti-pengulangan: query IDENTIK 3x beruntun tidak dieksekusi lagi.
            // Kembalikan hasil terakhir (cache) + hitung sebagai kegagalan loop
            // agar spiral "sukses semu" (curl 200 cangkang kosong) ikut trip.
            const toolKey = `${tool}||${query}`
            if (toolKey === lastToolKey) {
              repeatCount++
            } else {
              lastToolKey = toolKey
              repeatCount = 1
            }
            if (repeatCount >= 3) {
              const lastRes =
                executedToolsList.length > 0
                  ? executedToolsList[executedToolsList.length - 1].fullResult
                  : '(belum ada hasil)'
              breaker.record(false)
              loopMessages.push(
                {
                  role: 'assistant',
                  content: JSON.stringify({ thought: decision.thought, action: decision.action })
                },
                {
                  role: 'user',
                  content:
                    `[OBSERVATION] Tool "${tool}" dengan query IDENTIK dipanggil ke-${repeatCount}x beruntun — TIDAK dieksekusi ulang. Hasil terakhir (cache): ${String(lastRes).slice(0, 1500)}\n` +
                    'Variasikan pendekatan (tool/query berbeda) atau akhiri dengan jawaban jujur.'
                }
              )
              logSyntheticObservation(
                `[REPEAT-CACHE] Tool "${tool}" query identik ke-${repeatCount}x — tidak dieksekusi ulang.`
              )
              if (!spiralStopped && breaker.shouldSpiralStop()) {
                spiralStopped = true
                loopMessages.push(
                  {
                    role: 'assistant',
                    content: JSON.stringify({ thought: decision.thought, action: decision.action })
                  },
                  {
                    role: 'user',
                    content:
                      `[SYSTEM] ${breaker.failures()} kegagalan/pengulangan beruntun. ` +
                      'Berhenti. Tulis "answer" final yang JUJUR + "is_done": true. JANGAN panggil tool lagi.'
                  }
                )
                logSyntheticObservation(
                  `[SPIRAL-STOP] ${breaker.failures()} gagal/pengulangan beruntun — loop dihentikan, minta jawaban final jujur.`
                )
                break
              }
              continue
            }

            // Spiral sudah dihentikan: tolak tool baru, paksa jawaban final.
            if (spiralStopped) {
              loopMessages.push(
                {
                  role: 'assistant',
                  content: JSON.stringify({ thought: decision.thought, action: decision.action })
                },
                {
                  role: 'user',
                  content:
                    '[SYSTEM] Loop eksekusi sudah DIHENTIKAN setelah kegagalan beruntun. ' +
                    'JANGAN panggil tool apa pun lagi. Tulis "answer" final yang JUJUR ' +
                    '(apa yang gagal, bukti terakhir apa) + "is_done": true.'
                }
              )
              break
            }

            // Circuit breaker sesi: sirkuit OPEN -> tool destruktif diblokir
            // (observasi jujur ke model, tanpa eksekusi). Reset tiap sesi baru.
            if (breaker.shouldBlock(tool)) {
              loopMessages.push(
                {
                  role: 'assistant',
                  content: JSON.stringify({ thought: decision.thought, action: decision.action })
                },
                {
                  role: 'user',
                  content: `[OBSERVATION] [CIRCUIT BREAKER OPEN] Tool "${tool}" DIBLOKIR: ${breaker.failures()} gagal tool beruntun (ambang ${breaker.threshold()}). Perbaiki akar masalah atau minta user mereset misi. Tool baca/tulis non-destruktif tetap jalan.`
                }
              )
              logSyntheticObservation(
                `[CIRCUIT-OPEN] Tool "${tool}" diblokir: ${breaker.failures()} gagal beruntun.`
              )
              continue
            }

            if (execSteps.length === 1 && execSteps[0].task === 'Menganalisis Konteks...') {
              execSteps = [{ task: `Eksekusi ${tool}`, query: query }]
            } else {
              execSteps.push({ task: `Eksekusi ${tool}`, query: query })
            }

            targetPushProcess({
              id: agenticProcessId,
              type: 'planning',
              status: 'active',
              data: {
                steps: [...execSteps],
                currentStep: execSteps.length - 1,
                reasoning: decision.thought || `Eksekusi ${tool}`
              }
            })

            const currentLiveTools = [...executedToolsList, { tool, query, status: 'running' }]

            targetSetChatData((prev) => {
              const filtered = prev.filter((item) => !item.isThinking)
              const loadingText =
                isAutonomous && autonomousInitialMessage
                  ? autonomousInitialMessage
                  : decision.intermediate_answer || `Mengeksekusi [${tool}]...`
              return [
                ...filtered,
                {
                  role: 'ai',
                  content: loadingText,
                  isThinking: true,
                  reasoning: decision.thought,
                  executedTools: currentLiveTools,
                  mood: decision.mood || 'neutral'
                }
              ]
            })

            // Eksekusi tool (dispatcher per-domain di ./plan/; ctx digabung
            // dari loop + dependensi hook agar modul tetap murni).
            const pluginProcessId = `plugin-${Date.now()}`
            const execResult = await executeSingleTool(tool, query, {
              tgContext,
              isAutonomous,
              loopMessages,
              decision,
              pluginProcessId,
              targetSetChatData,
              workspaceRoot: opts.workspaceRoot,
              turnId: agenticProcessId,
              sessionId: activeSessionNum,
              turn: stepCount,
              signal: sessionAbortController.signal,
              currentSignal: sessionAbortController.signal,
              config,
              requestApproval,
              requestUserInput,
              requestCameraCapture,
              handleMusic,
              getYoutubeData,
              youtubeMusicTools,
              targetPushProcess,
              abortControllerRef
            })

            if (!isNativeBacked(tool, query)) {
              try {
                const ok = !String(execResult.resultString || '').startsWith('[ERROR]')
                import('../../api/harness')
                  .then(({ logToolCall }) =>
                    logToolCall({
                      tool,
                      query: String(query || '').slice(0, 200),
                      ok,
                      rejected: !!execResult.rejected,
                      resultSummary: String(execResult.resultString || '').slice(0, 2000),
                      sessionId: activeSessionNum,
                      turn: stepCount
                    })
                  )
                  .catch(() => {})
              } catch (_) {}
            }

            if (execResult.rejected) {
              if (isBatch) {
                // Batch: hasil masuk combined observation di bawah (tanpa
                // observasi tunggal agar tidak ganda).
                batchFailed = true
                batchResults.push(`[${tool}] ${execResult.resultString}`)
                continue
              }
              loopMessages.push(
                {
                  role: 'assistant',
                  content: JSON.stringify({ thought: decision.thought, action: decision.action })
                },
                {
                  role: 'user',
                  content: `[OBSERVATION] Hasil eksekusi tool "${tool}": ${execResult.resultString}`
                }
              )
              continue
            }

            // Umpan sirkuit: gagal eksekusi ([ERROR]) menaikkan streak, sukses
            // mereset. Penolakan approval BUKAN malfungsi -> diabaikan breaker
            // (sudah di-continue di atas).
            breaker.record(!String(execResult.resultString || '').startsWith('[ERROR]'))
            // Batch halt: hasil [ERROR] menghentikan sisa batch.
            if (isBatch && String(execResult.resultString || '').startsWith('[ERROR]')) {
              batchFailed = true
            }

            // Spiral stop: streak mencapai batas -> hentikan loop, beri model
            // satu giliran terakhir untuk jawaban final yang jujur.
            if (!spiralStopped && breaker.shouldSpiralStop()) {
              spiralStopped = true
              loopMessages.push(
                {
                  role: 'assistant',
                  content: JSON.stringify({ thought: decision.thought, action: decision.action })
                },
                {
                  role: 'user',
                  content:
                    `[SYSTEM] ${breaker.failures()} eksekusi tool GAGAL BERUNTUN. ` +
                    'Berhenti mencoba hal yang sama — pendekatan ini terbukti buntu. ' +
                    'Tulis "answer" final yang JUJUR: apa yang gagal, bukti terakhir apa, ' +
                    'dan apa yang user bisa lakukan. JANGAN panggil tool lagi. ' +
                    '"is_done": true + task_status yang sesuai (blocked bila tak bisa lanjut).'
                }
              )
              break
            }

            lastToolExecution = execResult.toolExecution
            executedToolsList.push({
              tool: tool,
              query: query,
              status: 'done',
              fullResult:
                typeof execResult.resultString === 'string'
                  ? execResult.resultString.slice(0, 4000)
                  : execResult.resultString,
              resultSummary:
                typeof execResult.resultString === 'string' && execResult.resultString.length > 250
                  ? execResult.resultString.slice(0, 250) + '...'
                  : execResult.resultString
            })

            // Trajectory Supervisor: record the attempt, maybe stage a hint.
            // Runs only on real executions (the identical-repeat cache above
            // already `continue`s before this point). Additive: guarded so a
            // supervisor fault can never break the tool loop.
            if (supervisor) {
              try {
                // Thin supervisor: Fase 1 fields only. hintText still flows
                // only through the existing pendingSupervisorHint
                // staged-observation path.
                const toolSuccess = !String(execResult.resultString || '').startsWith('[ERROR]')
                const supResult = supervisor.update({
                  tool,
                  query,
                  success: toolSuccess,
                  verificationState: lastVerification,
                  observation: execResult.resultString || '',
                  result: execResult.resultString || '',
                  stepsLeft: maxPlanSteps - stepCount,
                  verifyGateActive: pendingVerifyObservation != null
                })
                if (supResult.hintText && !pendingSupervisorHint) {
                  pendingSupervisorHint = supResult.hintText
                  try {
                    trajectoryLogStep({
                      step: stepCount,
                      total: maxPlanSteps,
                      description: `supervisor:${supResult.directive}`,
                      status: 'supervisor-directive'
                    })
                  } catch (_) {}
                }
              } catch (_) {}
            }

            if (isBatch) {
              batchResults.push(`[${tool}] ${execResult.resultString}`)
            } else {
              let obsStr = execResult.resultString
              if (
                typeof execResult.resultString === 'string' &&
                execResult.resultString.length > 3000
              ) {
                obsStr = `${execResult.resultString.slice(0, 3000)}\n\n[SISA OUTPUT DIPOTONG (Total: ${execResult.resultString.length} karakter). Gunakan startLine||endLine atau grep-search untuk mencari bagian spesifik.]`
              }
              loopMessages.push(
                {
                  role: 'assistant',
                  content: JSON.stringify({ thought: decision.thought, action: decision.action })
                },
                { role: 'user', content: `[OBSERVATION] Hasil eksekusi tool "${tool}": ${obsStr}` }
              )
              try {
                trajectoryLogObservation({
                  observation: obsStr,
                  tool,
                  sessionId: activeSessionNum,
                  turn: stepCount
                })
                import('../../api/harness').then(({ logObservation }) =>
                  logObservation({ observation: obsStr, tool, sessionId: activeSessionNum, turn: stepCount })
                ).catch(() => {})
              } catch (_) {}
            }
          }
          if (isBatch) {
            const combinedResult = `[BATCH ${actionList.length} actions]\n${batchResults.join('\n')}`
            let obsStr = combinedResult
            if (combinedResult.length > 3000) {
              obsStr =
                combinedResult.slice(0, 3000) +
                `\n\n[SISA OUTPUT DIPOTONG (Total: ${combinedResult.length} karakter)]`
            }
            loopMessages.push(
              {
                role: 'assistant',
                content: JSON.stringify({ thought: decision.thought, action: decision.action })
              },
              {
                role: 'user',
                content: `[OBSERVATION] Hasil eksekusi batch ${actionList.length} tools: ${obsStr}`
              }
            )
            try {
              trajectoryLogObservation({
                observation: obsStr,
                tool: `batch:${actionList.length}:${actionList.map((a) => a?.tool).filter(Boolean).join(',')}`,
                sessionId: activeSessionNum,
                turn: stepCount
              })
              import('../../api/harness').then(({ logObservation }) =>
                logObservation({ observation: obsStr, tool: `batch:${actionList.length}:${actionList.map((a) => a?.tool).filter(Boolean).join(',')}`, sessionId: activeSessionNum, turn: stepCount })
              ).catch(() => {})
            } catch (_) {}
          }

          // Flush a staged supervisor hint as its own user message (single
          // injection slot: verify-gate already took precedence inside
          // update(), so the two can never collide in one turn).
          if (pendingSupervisorHint) {
            loopMessages.push({ role: 'user', content: pendingSupervisorHint })
            pendingSupervisorHint = null
          }

          continue
        }

        // Kasus 4: Fallback jika AI tidak mengisi action maupun answer
        if (durableTask && durableActiveStep) {
          console.warn('[useAbelinkPlan] AI returned empty for durable task. Forcing retry.')
          loopMessages.push({
            role: 'user',
            content: `[SYSTEM INSTRUCTION] Kamu WAJIB menggunakan "action" untuk menjalankan tool demi menyelesaikan step: "${durableActiveStep.title}"! Kamu tidak bisa hanya diam atau membalas kosong.`
          })
          continue
        }

        // Empty decision while tools are enabled is NOT completion: the model
        // may have failed to emit JSON. Re-prompt (bounded by the no-progress
        // streak and MAX_PLAN_STEPS) instead of silently ending a live objective.
        if (!opts.disableTools && noActionStreak < MAX_NO_PROGRESS_STREAK) {
          noActionStreak++ // kosong berulang = tidak ada kemajuan, batasi seperti bicara-tanpa-action
          console.warn('[useAbelinkPlan] AI returned neither action nor answer. Re-prompting.')
          loopMessages.push({
            role: 'user',
            content:
              '[SYSTEM] Respons kosong. Kamu masih di dalam loop eksekusi: isi "action" dengan tool untuk melanjutkan, atau akhiri giliran dengan "answer" + "is_done": true + "task_status": "done".'
          })
          continue
        }

        console.warn(
          '[useAbelinkPlan] AI returned neither action nor answer. Forcing done with fallback.'
        )
        isDone = true
        sessionOutcome = 'failed'
        lastTerminalReason = 'empty-decision-budget-exhausted'
        targetSetChatData((prev) => [
          ...prev.filter((item) => !item.isThinking),
          {
            role: 'ai',
            content: (decision?.thought && decision.thought.trim()) || '...',
            mood: 'neutral',
            timestamp: getCurrentTimeInfo()
          }
        ])
      }

      // ------------------------------------------------------------------------
      // FASE 5: CLEANUP & CLOSING
      // ------------------------------------------------------------------------
      targetPushProcess({
        id: agenticProcessId,
        type: 'planning',
        status: 'done',
        data: {
          steps: [...execSteps],
          currentStep: execSteps.length,
          reasoning: lastDecision?.thought || 'Selesai'
        }
      })
      setTimeout(() => {
        dismissProcess(agenticProcessId)
      }, 1500)

      if (!tgContext && !isAutonomous) {
        if (activeSessionNum === 1) {
          setIsLoading(false)
        }
        lastUserPromptRef.current = ''
      }

      // Auto-close sesi browser hanya saat loop selesai dengan 'completed'.
      // Sidecar (browser:close -> finishSessionTask) menghormati flag
      // autoCloseTabs dari sync-config; outcome lain menyimpan tab.
      if (shouldAutoCloseBrowser(sessionOutcome) && window.api?.browserClose) {
        try {
          await window.api.browserClose(activeSessionNum === 1 ? 'default' : String(activeSessionNum))
        } catch (e) {
          console.warn('browserClose otomatis gagal:', e?.message)
        }
      }

      try {
        // Teardown sesi kontrol PC hanya bila model sempat membukanya di run
        // ini (flag renderer). Tutup-buta tiap run pernah memblokir 20s+.
        const { isOsControlSessionOpen, markOsControlSession } = await import(
          './plan/toolDispatcher'
        ).catch(() => ({}))
        if (
          window.api &&
          window.api.executeNativeTool &&
          (!isOsControlSessionOpen || isOsControlSessionOpen(activeSessionNum))
        ) {
          if (markOsControlSession) markOsControlSession(activeSessionNum, false)
          window.api.executeNativeTool('os-control-close').catch(() => {})
        }
      } catch (e) {}
    } catch (error) {
      // ------------------------------------------------------------------------
      // ERROR & ABORT RECOVERY
      // ------------------------------------------------------------------------
      const errorMsg = error?.message || ''
      if (
        durableTaskForRecovery &&
        (error.name === 'AbortError' || errorMsg.includes('AbortError'))
      ) {
        await transitionTask(durableTaskForRecovery.id, 'paused', 'user_abort').catch(() => {})
      }
      if (error.name !== 'AbortError' && !errorMsg.includes('AbortError')) {
        console.error('Planning Error:', error)
      }

      if (!tgContext && !isAutonomous) {
        if (activeSessionNum === 1) {
          setIsLoading(false)
        }
        if (!isSystem && !opts.customSetChatData && lastUserPromptRef.current) {
          setMessage(lastUserPromptRef.current)
          lastUserPromptRef.current = ''
        }
      }

      try {
        if (window.api && window.api.executeNativeTool) {
          window.api.executeNativeTool('os-control-close').catch(() => {})
        }
      } catch (e) {}

      if (
        durableTaskForRecovery &&
        (error?.name === 'AbortError' || errorMsg.includes('AbortError'))
      ) {
        targetPushProcess({
          id: agenticProcessId,
          type: 'planning',
          status: 'paused',
          data: {
            steps: [],
            currentStep: 0,
            reasoning: 'Task dipause karena proses dihentikan. Gunakan resume dari task manager.'
          }
        })
      } else {
        if (activeSessionNum === 1) {
          dismissProcess(agenticProcessId)
        }
      }

      if (error?.name === 'AbortError' || errorMsg.includes('AbortError')) {
        targetSetChatData((prev) => [
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
            'Sistem aktif. Halo, saya Abelink. Ada yang bisa saya bantu hari ini?',
            'Abelink sudah online. Silakan berikan perintah.',
            'Halo bro! Sistem berhasil diinisialisasi. Ada yang perlu saya kerjakan?'
          ]
          const randomGreeting =
            fallbackGreetings[Math.floor(Math.random() * fallbackGreetings.length)]
          targetSetChatData((prev) => [
            ...prev.filter((item) => !item.isThinking && !item.isSearching),
            {
              role: 'ai',
              content: randomGreeting,
              timestamp: new Date().toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit'
              })
            }
          ])
        } else if (isAutonomous) {
          targetSetChatData((prev) =>
            prev.filter((item) => !item.isThinking && !item.isSearching && !item.isProactive)
          )
        } else {
          let extraHelp = ''
          const isConnectionError =
            /Gagal menghubungi server AI|Unable to connect|ECONNREFUSED|ENOTFOUND|502|503|504|timeout/i.test(
              errorMsg
            )

          if (isConnectionError) {
            extraHelp =
              '\n\n**Diagnosis Sistem:**\n- Server endpoint AI (9Router / model lokal) tidak merespons.\n- Pastikan daemon 9Router aktif (`http://127.0.0.1:20128`) dan koneksi upstream/proxy tidak terputus.'
          } else {
            const sig = getErrorSignature(error)
            if (isRepairAllowed(sig)) {
              extraHelp = `\n\n**Self-Healing Diagnostic:**\n- Error Signature: \`${sig.slice(0, 80)}\`\n- Kamu dapat memicu perbaikan mandiri via CLI Agent (Claude Code / Hermes / Codex / OpenCode) dengan mendelegasikan perbaikan pada file terkait.`
            }
          }

          targetSetChatData((prev) => [
            ...prev.filter((item) => !item.isThinking && !item.isSearching),
            {
              role: 'ai',
              content: `⚠️ **Gagal Mengeksekusi Rencana**\n\n${error.message}${extraHelp}`,
              isError: true,
              timestamp: new Date().toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit'
              })
            }
          ])
        }
      }
    } finally {
      try {
        if (typeof unlistenWatchdog === 'function') unlistenWatchdog()
      } catch {}
      activeSessionUpdatersRef.current.delete(activeSessionNum)
      activeSessionsRef.current.delete(activeSessionNum)

      if (removeRunningSessionId) {
        removeRunningSessionId(activeSessionNum)
      }
      if (activeSessionsRef.current.size === 0) {
        setIsAgentBusy(false)
        if (setRunningSessionId) setRunningSessionId(null)
      }
      if (activeSessionNum === 1) {
        setIsLoading(false)
      }
    }
  }

  return { handlePlanningCommand, handleIntervention, handleStop }
}
