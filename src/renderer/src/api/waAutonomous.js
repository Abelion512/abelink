import { getPlan, getTaskAction, getTaskSummary, getPlanConclusion } from './ai/planning'
import { getAnswer } from './ai/chat'
import { getRelevantMemory } from './vectorMemory'
import { getAllMemory } from './db'
import { scrapeGoogle, deepSearch } from './scraping'
import { formatForWhatsApp } from './ai/utils'

const performWebSearch = async (query) => {
  console.log('WA Web Search Requested (Local):', query)
  const webview = document.getElementById('global-ai-search-webview')
  if (!webview) return null
  
  try {
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`
    webview.src = googleUrl
    
    await new Promise((resolve) => {
      let timeoutId
      const loadStop = () => {
        clearTimeout(timeoutId)
        webview.removeEventListener('dom-ready', loadStop)
        resolve()
      }
      timeoutId = setTimeout(loadStop, 10000)
      webview.addEventListener('dom-ready', loadStop)
    })

    const waitForLoad = (wv) => {
      return new Promise((resolve) => {
        let tId
        const onDone = () => {
          clearTimeout(tId)
          wv.removeEventListener('dom-ready', onDone)
          resolve()
        }
        tId = setTimeout(onDone, 10000)
        wv.addEventListener('dom-ready', onDone)
      })
    }

    const source = await scrapeGoogle(webview, googleUrl, (isCaptcha) => {
      if(isCaptcha) console.log('WA Web Search: Captcha Detected!')
    })

    const links = []
    // Batasi maksimal 2 link saja yang di deep-search untuk menghemat token TPM Groq
    const maxLinks = 3
    for (let i = 0; i < Math.min(source.length, maxLinks); i++) {
      const urlItem = source[i]
      let link = null
      if (urlItem.title === 'AI Google Summary') {
        link = { source: urlItem.title, url: urlItem.link, text: urlItem.snippet }
      } else {
        webview.src = urlItem.link
        await waitForLoad(webview)
        link = await deepSearch(webview, urlItem)
      }
      if (link) links.push(link)
    }

    console.log('WA Web Search Result:', links)
    // Bersihkan webview agar tidak memakan RAM/CPU dari script background website yang berat
    webview.src = 'about:blank'
    return links
  } catch (e) {
    console.error('WA Web Search Error:', e)
    webview.src = 'about:blank'
    return null
  }
}

export const runWhatsappAgent = async (userInput, isAdmin, senderName, jid, isGroup, msgId, chatSessionHistory = []) => {
  try {
    console.log('[waAutonomous] Starting runWhatsappAgent for user:', senderName)
    const plugins = await window.api.getPlugins()
    console.log('[waAutonomous] Plugins loaded')

    // 1. Dapatkan Context / Memory (simulasi)
    console.log('[waAutonomous] Getting memory list...')
    const memoryList = await getAllMemory()
    console.log('[waAutonomous] Getting relevant memory...')
    const memory = await getRelevantMemory(userInput, memoryList)

    // 2. Buat Planning
    const waPersonality = `\n\nWHATSAPP SPECIFIC PERSONA RULES:\n1. Act like a normal human friend, NOT an AI, NOT a virtual assistant, and NOT a rigid robot.\n2. Respond as casually, naturally, and coolly as possible, like hanging out with friends.\n3. STRICTLY PROHIBITED from offering help (e.g., "Is there anything I can help you with?", "What can I do for you?"). Just reply casually and only as necessary.`
    const contextMsg = (isGroup ? `Kamu di grup WA. Pengirim: ${senderName}.` : `Kamu di chat pribadi dengan ${senderName}.`) + waPersonality + `\n\nFITUR KHUSUS WA: Kamu punya tambahan action "screenshot" (tanpa parameter query) untuk mengambil tangkapan layar monitor PC/laptop jika user memintanya. Gunakan action "screenshot" dan BUKAN "system-command" jika user meminta screenshot.`
    console.log('[waAutonomous] Calling getPlan...')
    const planResult = await getPlan(userInput, true, null, chatSessionHistory, memory, contextMsg)
    console.log('[waAutonomous] getPlan finished:', planResult)
    let planArray = planResult?.plan || []

    // Pencegahan Fast Bypass untuk perintah yang butuh balasan data (misal: search, baca dokumen, dll)
    const dataFetchingActions = ['search', 'summary', 'yt-summary', 'yt-search', 'read_file']
    if (planArray.length === 0 && planResult?.command && dataFetchingActions.includes(planResult.command.action)) {
      console.log('[waAutonomous] Data-fetching command detected in Fast Bypass. Converting to Multi-Step Plan.')
      planArray.push({
        task: `Execute ${planResult.command.action} for "${planResult.command.query}"`,
        action: planResult.command.action,
        query: planResult.command.query,
        is_dynamic: false
      })
      planResult.direct_answer = null // Batalin Fast Bypass agar hasil search dirangkum oleh getAnswer
    }

    // Optimisasi Jalur Cepat (Direct Answer)
    if (planArray.length === 0 && planResult?.direct_answer) {
      console.log('[waAutonomous] Entering Fast Bypass!')
      let executedTools = []
      let finalCommand = { action: 'none', query: '' }

      // Jika menggunakan Fast Bypass untuk 1 tool
      if (planResult.command && planResult.command.action && planResult.command.action !== 'none') {
        const cmdAction = planResult.command.action
        const qry = planResult.command.query || ''
        finalCommand = planResult.command

        // Eksekusi khusus WA (mirip dengan block eksekusi utama)
        if (cmdAction === 'screenshot') {
          if (isAdmin) {
            window.api.sendWaMessage(jid, "📸 _Siap bos, lagi motret layar laptop..._")
            window.api.waTakeScreenshot(jid, msgId)
            executedTools.push(cmdAction)
          }
        } else if (cmdAction.startsWith('music-')) {
          if (cmdAction === 'music-play' && qry) {
            if (isAdmin) {
              window.api.waPlayMusicUi('play', qry)
            } else {
              window.api.sendWaMessage(jid, "_(⏳ MP3 lagunya lagi didownload ya, tunggu bentar...)_")
              window.api.waDownloadMusic(jid, msgId, qry)
            }
          } else if (isAdmin) {
            const c = cmdAction.replace('music-', '')
            window.api.waPlayMusicUi(c, qry)
          }
          executedTools.push(qry ? `${cmdAction} ("${qry}")` : cmdAction)
        } else if (cmdAction === 'search' || cmdAction === 'yt-summary' || cmdAction === 'yt-search') {
          if (cmdAction === 'search') {
            window.api.sendWaMessage(jid, `🔍 _Sedang mencari "${qry}" di web..._\n_Tunggu sebentar ya..._`)
            performWebSearch(qry).catch(console.error)
            executedTools.push(`${cmdAction} ("${qry}")`)
          }
        } else if (isAdmin) {
          try {
            await window.api.executePlugin(cmdAction, qry)
            executedTools.push(qry ? `${cmdAction} ("${qry}")` : cmdAction)
          } catch (e) {
            console.error("WA Plugin Execution Error (Fast Bypass):", e)
          }
        }
      }

      console.log('[waAutonomous] Fast Bypass returning')
      return {
        answer: planResult.direct_answer,
        command: finalCommand,
        toolsUsed: executedTools
      }
    }
    console.log('[waAutonomous] Fast Bypass skipped, executing plan array of length:', planArray.length)

    // 3. Eksekusi Plan (jika ada)
    const executionResults = []

    for (let i = 0; i < planArray.length; i++) {
      const step = planArray[i]
      let queryToExecute = step.query

      // Dynamic task
      if (step.is_dynamic && i > 0) {
        queryToExecute = await getTaskAction(
          step.task,
          [{ role: 'user', content: userInput }],
          executionResults[i - 1]?.result || ''
        )
      }

      // Execute based on Action
      let stepResult = ''
      
      // Kirim progress update ke WA via IPC (opsional)
      // window.api.sendWaProgress({ jid, message: `⏳ ${step.task}...` })

      if (step.action === 'search') {
        window.api.sendWaMessage(jid, `🔍 _Sedang mencari "${queryToExecute}" di web..._\n_Tunggu sebentar ya..._`)
        try {
          const result = await performWebSearch(queryToExecute)
          stepResult = JSON.stringify(result)
        } catch (e) {
          stepResult = `Error pencarian: ${e.message}`
        }
      } else if (step.action === 'summary') {
        stepResult = await getTaskSummary(
          step.task,
          [{ role: 'user', content: userInput }],
          executionResults[i - 1]?.result || ''
        )
      } else if (step.action !== 'none') {
        if (step.action === 'screenshot') {
          if (isAdmin) {
            window.api.sendWaMessage(jid, "📸 _Siap bos, lagi motret layar laptop..._")
            window.api.waTakeScreenshot(jid, msgId)
            stepResult = `Aksi screenshot dijalankan dan akan dikirim ke WA.`
          } else {
            stepResult = `Aksi screenshot ditolak karena privasi (bukan admin).`
          }
        } else if (step.action.startsWith('music-')) {
          if (step.action === 'music-play' && queryToExecute) {
            if (isAdmin) {
              window.api.waPlayMusicUi('play', queryToExecute)
              stepResult = `Lagu "${queryToExecute}" diputar di UI laptop.`
            } else {
              window.api.sendWaMessage(jid, "_(⏳ MP3 lagunya lagi didownload ya, tunggu bentar...)_")
              window.api.waDownloadMusic(jid, msgId, queryToExecute)
              stepResult = `Lagu "${queryToExecute}" sedang didownload sebagai MP3.`
            }
          } else if (isAdmin) {
            const cmd = step.action.replace('music-', '')
            window.api.waPlayMusicUi(cmd, queryToExecute)
            stepResult = `Perintah kontrol musik "${cmd}" dikirim.`
          } else {
            stepResult = `Perintah musik "${step.action}" ditolak karena bukan admin.`
          }
        } else {
          // Plugin eksekusi via IPC
          try {
            const res = await window.api.executePlugin(step.action, queryToExecute)
            stepResult = res.success ? `Plugin dijalankan: ${JSON.stringify(res.data)}` : `Gagal eksekusi plugin: ${res.error}`
          } catch (err) {
            stepResult = `Error eksekusi plugin: ${err.message}`
          }
        }
      }

      executionResults.push({ task: step.task, result: stepResult })
    }

    // 4. Generate Final Answer
    let chatSession = []
    
    if (planArray.length === 0) {
      chatSession = [...chatSessionHistory]
    } else {
      const synthesisData = executionResults.map((r, idx) => `[Task ${idx + 1}: ${r.task}]\nResult: ${r.result}`).join('\n\n')
      chatSession = [
        ...chatSessionHistory,
        { role: 'assistant', content: `[SYSTEM LOG] Menjalankan perintah dan berikut hasilnya:\n${synthesisData}` },
        { role: 'user', content: "Berdasarkan hasil di atas, tolong berikan balasan akhirnya ke saya." }
      ]
    }
    
    // 5. Generate Jawaban Akhir (Fallback chat.js)
    console.log('[waAutonomous] Executing Fallback getAnswer...')
    let finalAnswerObj = null
    try {
      finalAnswerObj = await getAnswer(userInput, [], chatSession, false, false, false, contextMsg)
      console.log('[waAutonomous] Fallback getAnswer finished:', finalAnswerObj)
    } catch (e) {
      console.error('[waAutonomous] Fallback getAnswer error:', e)
      if (planArray.length > 0) {
        const executedNames = planArray.map(p => p.action).join(', ')
        finalAnswerObj = {
          answer: `✅ Siap! Perintah (${executedNames}) udah gue eksekusi ya.\n_(Btw ini balasan otomatis karena server AI utama lagi delay/sibuk)_`,
          command: null
        }
      } else {
        throw e
      }
    }
    // Handle memory updates from getAnswer
    if (finalAnswerObj?.memory) {
      const { insertMemory, updateMemory, deleteMemory } = await import('./db')
      const actions = { insert: insertMemory, update: updateMemory, delete: deleteMemory }
      if (actions[finalAnswerObj.memory.action]) {
        try {
          const memoryData = { ...finalAnswerObj.memory }
          memoryData.memory = memoryData.memory.trim().replace(/^[\\"]+|[\\"]+$/g, '').replace(/\\n/g, '\n')
          await actions[finalAnswerObj.memory.action](memoryData)
        } catch (e) {
          console.error("WA Memory Save Error:", e)
        }
      }
    }

    // Handle single-action commands from getAnswer (when plan array is empty)
    if (finalAnswerObj?.command && finalAnswerObj.command.action !== 'none') {
      const cmdAction = finalAnswerObj.command.action
      const qry = finalAnswerObj.command.query

      if (cmdAction === 'screenshot') {
        if (isAdmin) {
          window.api.sendWaMessage(jid, "📸 _Siap bos, lagi motret layar laptop..._")
          window.api.waTakeScreenshot(jid, msgId)
        }
      } else if (cmdAction.startsWith('music-')) {
        if (cmdAction === 'music-play' && qry) {
          if (isAdmin) {
            window.api.waPlayMusicUi('play', qry)
          } else {
            window.api.sendWaMessage(jid, "_(⏳ MP3 lagunya lagi didownload ya, tunggu bentar...)_")
            window.api.waDownloadMusic(jid, msgId, qry)
          }
        } else if (isAdmin) {
          const c = cmdAction.replace('music-', '')
          window.api.waPlayMusicUi(c, qry)
        }
      } else if (cmdAction === 'search' || cmdAction === 'yt-summary' || cmdAction === 'yt-search') {
        // Asynchronous tasks requiring feedback are better handled by Planner.
        // However, if getAnswer outputs this, we can optionally trigger them.
        if (cmdAction === 'search') {
          window.api.sendWaMessage(jid, `🔍 _Sedang mencari "${qry}" di web..._\n_Tunggu sebentar ya..._`)
          performWebSearch(qry).catch(console.error)
        }
      } else if (isAdmin) {
        // Execute plugin
        try {
          await window.api.executePlugin(cmdAction, qry)
        } catch (e) {
          console.error("WA Plugin Execution Error:", e)
        }
      }
    }
    
    const executedTools = planArray
      .filter(p => p.action !== 'none')
      .map(p => p.query ? `${p.action} ("${p.query}")` : p.action)

    if (finalAnswerObj?.command && finalAnswerObj.command.action !== 'none') {
      const c = finalAnswerObj.command
      executedTools.push(c.query ? `${c.action} ("${c.query}")` : c.action)
    }

    return {
      answer: formatForWhatsApp(finalAnswerObj?.answer || "Selesai diproses."),
      toolsUsed: executedTools
    }

  } catch (err) {
    console.error('WA Autonomous Error:', err.stack || err)
    return { answer: 'Terjadi kesalahan saat memproses rencana: ' + err.message + '\n\nStack: ' + (err.stack || 'No stack trace') }
  }
}
