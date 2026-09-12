// Eksekutor tool domain MULTI-AGENT (dipindah murni dari useAbelinkPlan.executeSingleTool):
// spawn/wait/send/list/kill sub-agent, read-tools, read-skill.
//
// Kontrak: kembalikan objek `res` ({ success, data?, message?, error? ...})
// atau undefined bila tool bukan domain ini. Formatting resultString +
// trajectory log dilakukan TERPUSAT di toolDispatcher (sama seperti sebelumnya).
import { logSubAgentSpawn as trajectoryLogSub } from '../../../api/trajectory'
import { loadGroupToolsText } from '../../../api/tools/group-tools.js'
import { getLearnedSkill } from '../../../api/db.js'
import { NATIVE_SKILLS } from '../../../components/core/native-skills.js'

/**
 * @returns {object|undefined} res bila tool milik domain ini.
 */
export const runAgentTool = async (tool, query, ctx) => {
  const { targetSetChatData, currentSignal } = ctx
  if (tool === 'spawn_subagent') {
    const { subagentStore } = await import('../../../api/subagent/subagentStore.js')
    const { runSubagentTurn } = await import('../../../api/subagent/subagentExecutor.js')
    const parts = (query || '').split('||')
    const name = parts[0]?.trim() || 'Worker-Agent'
    const role = parts[1]?.trim() || 'Technical Specialist'
    const goal = parts[2]?.trim() || 'Selesaikan misi teknis'
    const initialMessage = parts[3]?.trim() || goal
    const tools = parts[4]
      ? parts[4]
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : ['*']

    const sub = await subagentStore.createSubagent({
      name,
      role,
      goal,
      allowedTools: tools,
      parentSessionId: 'main_chat'
    })

    // Log sub-agent spawn to trajectory buffer
    trajectoryLogSub({ name, parentAgentId: 'main_chat' })

    // Jalankan loop eksekusi ReAct secara paralel di background (non-blocking)
    runSubagentTurn(sub.id, initialMessage).catch((err) => {
      console.error(`[Sub-Agent ${sub.id}] Background error:`, err)
    })

    return {
      success: true,
      data: `[SUB-AGENT BERHASIL DIBUAT & BERJALAN DI BACKGROUND]\n- Nama: ${name}\n- ID: ${sub.id}\n- Role: ${role}\n- Goal: ${goal}\nSub-agent ini telah mulai bekerja secara paralel di background. Kamu bisa langsung membuat sub-agent lain (batch) atau gunakan tool 'wait_subagents' (query: 'all' atau ID-nya) untuk menunggu dan mengumpulkan hasil laporannya.`
    }
  }
  if (tool === 'wait_subagents') {
    const { subagentStore } = await import('../../../api/subagent/subagentStore.js')
    const parts = (query || '').split('||')
    const targetIdsRaw = parts[0]?.trim() || 'all'
    const maxWaitSeconds = parseInt(parts[1]?.trim() || '40', 10) || 40

    let targetIds = []
    if (targetIdsRaw === 'all' || !targetIdsRaw) {
      const running = await subagentStore.listSubagents('running')
      targetIds = running.map((s) => s.id)
    } else {
      targetIds = targetIdsRaw
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    }

    if (targetIds.length === 0) {
      const all = await subagentStore.listSubagents()
      const summary = all
        .slice(0, 5)
        .map(
          (s) =>
            `- [${s.name} (${s.id})]: Status=${s.status}\n  Hasil: ${s.finalAnswer || '(Belum ada laporan)'}`
        )
        .join('\n\n')
      return {
        success: true,
        data: `Tidak ada sub-agent yang sedang berjalan.\nRiwayat sub-agent:\n${summary || 'Kosong'}`
      }
    }
    const startTime = Date.now()
    let finalAgents = []

    while (Date.now() - startTime < maxWaitSeconds * 1000) {
      // Pakai signal sesi lokal (bukan abortControllerRef milik sesi 1) agar
      // sesi lain tidak ikut terpengaruh; fallback aman bila signal tak tersedia.
      if (currentSignal?.aborted ?? false) break
      const agents = await Promise.all(targetIds.map((id) => subagentStore.getSubagent(id)))
      finalAgents = agents.filter(Boolean)

      // Update status thinking secara live agar pengguna tahu sub-agent sedang bekerja
      targetSetChatData((prev) => {
        const filtered = prev.filter((item) => !item.isThinking)
        return [
          ...filtered,
          {
            role: 'ai',
            content: `Menunggu tim Sub-Agent bekerja...`,
            isThinking: true
          }
        ]
      })

      // Early-Fail Interrupt: Jika ada subagent yang gagal/error, langsung keluar dari loop tanpa menunggu yang lain
      const hasFailed = finalAgents.some(
        (a) => a.status === 'failed' || a.status === 'killed'
      )
      if (hasFailed) {
        break
      }

      const stillRunning = finalAgents.some((a) => a.status === 'running')
      if (!stillRunning) {
        break
      }
      await new Promise((r) => setTimeout(r, 1500))
    }

    const failedAgents = finalAgents.filter(
      (a) => a.status === 'failed' || a.status === 'killed'
    )
    const runningAgents = finalAgents.filter((a) => a.status === 'running')

    const reports = finalAgents
      .map((a) => {
        const isFailed = a.status === 'failed' || a.status === 'killed'
        const isRunning = a.status === 'running'
        const statusTag = isFailed
          ? `[PERHATIAN: STATUS ${a.status.toUpperCase()} - GAGAL/PERLU RETRY DENGAN send_message]`
          : isRunning
            ? `[STATUS: RUNNING - SEDANG BERJALAN DI BACKGROUND]`
            : `[STATUS: COMPLETED - SELESAI]`
        return `### LAPORAN ${a.name} (${a.role}) - ID: ${a.id}\nStatus: ${statusTag} (Total Turns: ${a.turnCount || 0})\nGoal: ${a.goal}\nHasil Akhir:\n${a.finalAnswer || (isFailed ? 'Eksekusi agen ini terhenti atau mengalami kegagalan sebelum mencapai goal.' : isRunning ? '(Sedang aktif memproses langkah di background secara paralel)' : '(Belum ada output)')}`
      })
      .join('\n\n---\n\n')

    let statusSummary = 'SEMUA SELESAI'
    if (failedAgents.length > 0 && runningAgents.length > 0) {
      statusSummary = `ADA AGEN GAGAL (${failedAgents.map((a) => a.id).join(', ')}), ${runningAgents.length} AGEN LAIN MASIH RUNNING`
    } else if (failedAgents.length > 0) {
      statusSummary = `ADA AGEN GAGAL (${failedAgents.map((a) => a.id).join(', ')})`
    } else if (runningAgents.length > 0) {
      statusSummary = `${runningAgents.length} AGEN MASIH RUNNING`
    }

    let failPrompt = ''
    if (failedAgents.length > 0) {
      const failedInfo = failedAgents.map((a) => `"${a.id}" (${a.name})`).join(', ')
      failPrompt = `\n\n[PENGINGAT ORCHESTRATOR - EARLY FAIL INTERRUPT]: Sub-agent ${failedInfo} GAGAL saat sub-agent lain masih bekerja! Kamu WAJIB SEGERA mengirim pesan instruksi perbaikan/query alternatif ke ID tersebut menggunakan 'send_message' (format: "ID||instruksi kamu"). Sub-agent lain yang berstatus RUNNING akan tetap bekerja di background.`
    } else if (runningAgents.length > 0) {
      failPrompt = `\n\n[PENGINGAT ORCHESTRATOR]: Masih ada ${runningAgents.length} sub-agent yang sedang bekerja di background. Jika kamu butuh menunggu mereka, panggil kembali 'wait_subagents'.`
    } else {
      failPrompt = `\n\n[PENGINGAT ORCHESTRATOR - PROTOKOL PEER-REVIEW & PIPELINE RELAY]: Sub-agent telah memberikan laporan. Sebagai Lead Orchestrator:\n1. RELAY DATA: Kamu BISA meneruskan/menyalurkan temuan dari satu agen ke agen lain yang membutuhkan via 'send_message' (misal: "id_agen_2||Temuan dari Agen 1: ... Tolong lanjutkan dengan menganalisis ...").\n2. REVIEW KRITIS: Evaluasi temuan agen secara mendalam sebelum menyusun kesimpulan akhir.`
    }

    return {
      success: true,
      data: `[STATUS SUB-AGENTS (${statusSummary})]:\n\n${reports}${failPrompt}`
    }
  }
  if (tool === 'send_message') {
    const { runSubagentTurn } = await import('../../../api/subagent/subagentExecutor.js')
    const parts = (query || '').split('||')
    const targetId = parts[0]?.trim()
    const msgText = parts[1]?.trim()

    if (!targetId || !msgText) {
      return {
        success: false,
        error: 'Format query send_message salah. Gunakan: subagent_id||pesan_instruksi'
      }
    }
    const runResult = await runSubagentTurn(targetId, msgText)
    if (runResult.success) {
      return {
        success: true,
        data: `[BALASAN EVALUASI DARI SUB-AGENT (${targetId})]:\n"${runResult.reply}"\n${runResult.thought ? `(Pemikiran: ${runResult.thought})\n` : ''}Evaluasi apakah hasil pendalaman ini sudah memenuhi standar kualitas tinggi. Jika sudah solid, susun jawaban komprehensif ke user. Jika masih butuh pengujian, kirimkan 'send_message' lanjutan.`
      }
    }
    return { success: false, error: `Sub-Agent error: ${runResult.error}` }
  }
  if (tool === 'list_subagents') {
    const { subagentStore } = await import('../../../api/subagent/subagentStore.js')
    const filter = query ? query.trim().toLowerCase() : null
    const list = await subagentStore.listSubagents(filter)
    if (!list || list.length === 0) {
      return { success: true, data: 'Tidak ada sub-agent yang aktif/tersedia saat ini.' }
    }
    const summary = list
      .map(
        (s) =>
          `- [${s.id}] ${s.name} (${s.role}): Status=${s.status}, Turns=${s.turnCount || 0}, Goal="${s.goal}"\n  Hasil: ${s.finalAnswer ? s.finalAnswer.slice(0, 150) + '...' : '(Belum ada)'}`
      )
      .join('\n\n')
    return { success: true, data: `Daftar Sub-Agent Terdaftar:\n${summary}` }
  }
  if (tool === 'kill_subagent') {
    const { killSubagentExecution } = await import('../../../api/subagent/subagentExecutor.js')
    const parts = (query || '').split('||')
    const targetId = parts[0]?.trim()
    if (!targetId) {
      return { success: false, error: 'Sebutkan subagent_id yang ingin dihentikan.' }
    }
    killSubagentExecution(targetId)
    return { success: true, data: `Sub-agent ${targetId} berhasil dihentikan paksa.` }
  }
  if (tool === 'read-tools') {
    const groupName = query.trim()
    if (!groupName) {
      return {
        success: false,
        message: 'Harap sebutkan nama_grup yang ingin dimuat (misal: "advanced_browser").'
      }
    }
    const text = await loadGroupToolsText(groupName)
    if (text) {
      return {
        success: true,
        loaded_group: groupName,
        message: `BERHASIL MEMUAT GRUP TOOL: ${groupName}.\nDokumentasi tool:\n${text}`
      }
    }
    return {
      success: false,
      message: `Grup tool "${groupName}" tidak ditemukan.`
    }
  }
  if (tool === 'read-skill') {
    const skillName = (query || '').trim()
    if (!skillName) {
      return { success: false, message: 'Harap sebutkan nama_skill yang ingin dibaca.' }
    }
    // 1. Cek Dexie learnedSkills (Self-Improved / Dynamic Native Skills)
    const learned = await getLearnedSkill(skillName)
    if (learned && learned.content) {
      return {
        success: true,
        data: `[PEDOMAN PROSEDUR KEAHLIAN (LEARNED/DEXIE): ${skillName.toUpperCase()}]\n${learned.content}`
      }
    }
    // 2. Cek NATIVE_SKILLS bawaan
    const native = NATIVE_SKILLS.find(
      (s) => s.name.toLowerCase() === skillName.toLowerCase()
    )
    if (native && native.content) {
      return {
        success: true,
        data: `[PEDOMAN SKILL BAWAAN: ${skillName.toUpperCase()}]\n${native.content}`
      }
    }
    if (window.api && window.api.readSkill) {
      // 3. Cek berkas disk di Documents/Abelink Skills
      const skillData = await window.api.readSkill(skillName)
      if (skillData) {
        const content = typeof skillData === 'string' ? skillData : skillData.content
        const basePath =
          typeof skillData === 'object' && skillData.basePath ? skillData.basePath : ''
        return {
          success: true,
          data: `[PEDOMAN SKILL (FILE): ${skillName.toUpperCase()}]\n${basePath ? `[BASE PATH: ${basePath}]\n` : ''}${content}`
        }
      }
      return {
        success: false,
        message: `Skill "${skillName}" tidak ditemukan di keahlian internal maupun folder Abelink Skills.`
      }
    }
    return {
      success: false,
      message: `Skill "${skillName}" tidak ditemukan.`
    }
  }
  if (tool === 'delegate_coding') {
    const { detectInstalledAgents, buildCodingCommand } = await import(
      '../../../api/ai/codingAgentBridge.js'
    )
    const parts = (query || '').split('||')
    const requestedAgent = parts[0]?.trim() || 'auto'
    const instruction = parts[1]?.trim() || ''
    const customBranch = parts[2]?.trim()

    if (!instruction) {
      return {
        success: false,
        error: 'Instruksi tugas coding tidak boleh kosong. Gunakan format: agent_name||instruksi||nama_branch'
      }
    }

    const availableAgents = await detectInstalledAgents()
    if (availableAgents.length === 0) {
      return {
        success: false,
        error: 'Tidak ditemukan CLI coding agent yang terpasang di sistem (Claude Code, Hermes, Codex, OpenCode). Mohon pasang minimal satu CLI agent terlebih dahulu.'
      }
    }

    let selectedAgent = null
    if (requestedAgent === 'auto') {
      selectedAgent = availableAgents[0]
    } else {
      selectedAgent = availableAgents.find(
        (a) =>
          a.id.toLowerCase() === requestedAgent.toLowerCase() ||
          a.name.toLowerCase().includes(requestedAgent.toLowerCase())
      )
      if (!selectedAgent) {
        selectedAgent = availableAgents[0]
      }
    }

    const branch = customBranch || `auto/delegate-${Date.now().toString(36)}`
    const taskId = `code-${Date.now().toString(36)}`
    const workspaceRoot = ctx?.workspaceRoot || '.'

    const { command, agent } = buildCodingCommand({
      agentId: selectedAgent.id,
      prompt: instruction,
      branch,
      workdir: workspaceRoot
    })

    if (ctx?.requestApproval) {
      const approved = await ctx.requestApproval(
        `Abelink ingin mendelegasikan tugas ke CLI Agent [${agent.name}] di branch [${branch}]:\n\n"${instruction}"\n\nCommand: ${command}`,
        'delegate_coding',
        query
      )
      if (!approved) {
        return {
          success: false,
          error: 'User menolak pendelegasian tugas coding ini.'
        }
      }
    }

    let spawnRes = null
    if (window.api && window.api.executeNativeTool) {
      try {
        spawnRes = await window.api.executeNativeTool('run-task', `${taskId}||${command}`)
      } catch (err) {
        spawnRes = { success: false, error: err.message }
      }
    }

    if (spawnRes && !spawnRes.success) {
      return {
        success: false,
        error: `Gagal meluncurkan background task koding: ${spawnRes.message || spawnRes.error}`
      }
    }

    return {
      success: true,
      data: `[TUGAS KODING BERHASIL DIDELEGASIKAN KE BACKGROUND]\n` +
        `- Agen Pelaksana: ${agent.name} (${selectedAgent.binaryPath})\n` +
        `- Task ID: ${taskId}\n` +
        `- Sandbox Git Branch: ${branch}\n` +
        `- Status: Berjalan di background (nice -n 10, non-blocking).\n` +
        `Petunjuk: Gunakan tool 'read-task-output' dengan query "${taskId}||30" untuk memeriksa status output kapan saja.`
    }
  }
  return undefined
}

