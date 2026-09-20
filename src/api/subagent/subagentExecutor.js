import { fetchAI, cleanAndParse } from '../ai/core'
import { subagentStore } from './subagentStore'
import { buildSubagentSystemPrompt } from './subagentPrompt'
import { getBuiltinPluginsPrompt } from '../ai/builtinPlugins'
import { classifySubagentAnswer, isTruncatedOutput, shouldChallengeBlocked, BLOCKED_CHALLENGE_TEXT } from '../ai/agentDecision'
import {
  evaluateEvidence,
  gateCompletion,
  buildReplanObservation,
  MAX_VERIFY_REPLANS
} from '../ai/objectiveVerifier'
import { createTrajectorySupervisor } from '../ai/trajectorySupervisor'
import { currentBenchArch } from '../ai/benchArch'
import { getAllConfig } from '../db'
import { core_tools } from '../tools/core-tools'
import { GROUP_TOOLS_DEFINITION, loadGroupToolsText } from '../tools/group-tools'
import { executeMemorySearch } from '../vectorMemory.js'
import { executeMemoryTool } from '../ai/memoryTool.js'
import { LEAD_AGENT_TAG, CREATOR_TAG } from '../../utils/messageTags'

// Registry AbortController aktif per sub-agent
const subagentAbortControllers = new Map()

// Guard tanpa-kemajuan: batas balasan invalid (bukan action maupun answer)
// sebelum dikoreksi dan sebelum eksekusi dinyatakan gagal
const NO_PROGRESS_INJECT_LIMIT = 3
const NO_PROGRESS_FAIL_LIMIT = 6

// Batas injeksi korektif setelah error tool: setelah ini, jawaban yang meminta
// input padahal masih bisa pulih akan dianggap blocked, bukan loop abadi.
const MAX_AUTO_RECOVER = 2

/**
 * Menjalankan satu putaran eksekusi ReAct untuk sub-agent
 * @param {string} subagentId ID sub-agent
 * @param {string|null} incomingMessage Pesan baru dari Lead Agent (Abelink) atau User
 * @param {string} senderType 'abelink' | 'user'
 */
export async function runSubagentTurn(subagentId, incomingMessage = null, senderType = 'abelink') {
  const subagent = await subagentStore.getSubagent(subagentId)
  if (!subagent) {
    return { success: false, error: 'Sub-agent tidak ditemukan.' }
  }

  // Tolak permintaan ganda: bila masih ada eksekusi yang hidup untuk sub-agent ini,
  // controller lama tidak boleh ditimpa agar kill/abort tetap bisa bekerja.
  const existingController = subagentAbortControllers.get(subagentId)
  if (existingController && !existingController.signal.aborted) {
    console.warn(
      `[subagentExecutor] Eksekusi sudah berjalan; abaikan permintaan ganda. (${subagentId})`
    )
    await subagentStore.addMessage(subagentId, {
      sender: 'system',
      role: 'user',
      content: '[SYSTEM]: Eksekusi sudah berjalan; abaikan permintaan ganda.'
    })
    return {
      success: false,
      subagentId,
      error: 'Eksekusi sudah berjalan; abaikan permintaan ganda.'
    }
  }

  if (subagent.status === 'completed' || subagent.status === 'killed') {
    // Jika ada pesan baru ke subagent yang sudah selesai, hidupkan kembali (re-activate)
    await subagentStore.updateSubagent(subagentId, { status: 'running' })
  }

  // Rekam pesan masuk jika ada
  if (incomingMessage) {
    const isUser = senderType === 'user'
    const tag = isUser ? CREATOR_TAG : LEAD_AGENT_TAG
    await subagentStore.addMessage(subagentId, {
      sender: isUser ? 'user' : 'abelink',
      role: 'user',
      content: `${tag} ${incomingMessage}`
    })
  }

  // Siapkan AbortController
  const abortController = new AbortController()
  subagentAbortControllers.set(subagentId, abortController)
  await subagentStore.updateSubagent(subagentId, { status: 'running' })

  // Format tool bawaan (core) dan kelompok tool tambahan persis seperti Lead Agent (Abelink)
  const forbiddenTools = ['spawn_subagent', 'send_message', 'kill_subagent', 'wait_subagents']
  const specificAllowed =
    Array.isArray(subagent.allowedTools) &&
    subagent.allowedTools.length > 0 &&
    !subagent.allowedTools.includes('*') &&
    subagent.allowedTools.some((t) => t && t.trim() !== '')
      ? subagent.allowedTools.map((t) => t.trim())
      : null

  const coreToolsText = Object.entries(core_tools)
    .filter(([k]) => {
      if (forbiddenTools.includes(k)) return false
      if (specificAllowed) return specificAllowed.includes(k)
      return true
    })
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n')

  const groupToolsText = GROUP_TOOLS_DEFINITION
    ? Object.entries(GROUP_TOOLS_DEFINITION)
        .map(([k, v]) => `- ${k}: ${v.description}`)
        .join('\n')
    : ''

  // Toggle plugin built-in dibaca dari config (model-agnostic, layer aplikasi).
  const appConfig = (await getAllConfig().catch(() => []))?.[0] || null
  const systemPrompt = buildSubagentSystemPrompt({
    role: subagent.role,
    goal: subagent.goal,
    coreToolsText,
    groupToolsText,
    // Ponytail selalu aktif untuk sub-agent (hemat kode); caveman diadaptasi
    // untuk laporan teknis ringkas via getCavemanReportRules.
    builtinPluginsText: getBuiltinPluginsPrompt(appConfig)
  })

  let currentTurn = subagent.turnCount || 0
  let latestSubagentReply = ''
  let noProgress = 0
  // ---- Objective-aware run state (agentDecision.js) -----------------------
  // `answer` is NOT silently terminal for a sub-agent. Track what happened in
  // THIS run so a report after a recoverable tool error (or a question the
  // sub-agent could answer itself) keeps the mission going instead of pausing.
  let toolsExecutedThisRun = false
  let lastObservation = ''
  let autoRecoverUsed = 0
  // Verification gate: bounded replans demanded from completion claims that
  // lack world-state proof (objectiveVerifier.js).
  let verifyReplansUsed = 0
  // Blocked-challenge: one corrective round for untested `blocked` claims
  // (zero tools executed), symmetric to the verify-gate above.
  let blockedChallengeUsed = 0
  // Internal terminal classification of the pause: final | blocked | needs_input
  let terminalType = 'final'
  // ---- Thin trajectory supervisor (trajectorySupervisor.js) ---------------
  // Per-sub-agent stagnation policy. Mirrors the main-loop wiring in
  // useAbelinkPlan.js: Fase 1 fields only. Bench arch axis (ABELINK_BENCH_ARCH,
  // default basic): vanilla = no supervisor, no verify-gate replan.
  // Additive: faults stay silent, the ReAct loop below is untouched.
  const benchArch = currentBenchArch()
  const subSupervisor = benchArch === 'vanilla' ? null : createTrajectorySupervisor()
  let pendingSubHint = null

  try {
    while (!abortController.signal.aborted) {
      currentTurn++
      await subagentStore.updateSubagent(subagentId, { turnCount: currentTurn })

      if (abortController.signal.aborted) {
        break
      }

      // Ambil seluruh riwayat pesan sub-agent dari Dexie
      const history = await subagentStore.getMessages(subagentId)
      const messagesPayload = [
        { role: 'system', content: systemPrompt },
        ...history.map((m) => ({ role: m.role, content: m.content }))
      ]

      const aiResponseRaw = await fetchAI(messagesPayload, {
        signal: abortController.signal
      })

      if (aiResponseRaw && aiResponseRaw.error) {
        throw new Error(aiResponseRaw.error)
      }

      const rawContent =
        aiResponseRaw?.content !== undefined ? aiResponseRaw.content : aiResponseRaw
      const decision = cleanAndParse(rawContent)
      if (!decision) {
        throw new Error('Sub-Agent mengembalikan output yang tidak dapat diparse sebagai JSON.')
      }

      // Guard tanpa-kemajuan: balasan yang bukan action maupun answer (misal {} atau
      // thought saja) tidak menghasilkan apa pun. Koreksi dulu lewat observasi, lalu
      // gagalkan eksekusi bila tetap tidak kunjung valid.
      const hasAnswerBranch = !decision.action && decision.answer
      const hasActionBranch = !!decision.action
      if (!hasAnswerBranch && !hasActionBranch) {
        noProgress++
        if (noProgress >= NO_PROGRESS_FAIL_LIMIT) {
          throw new Error('loop tanpa kemajuan (format respons invalid)')
        }
        if (noProgress === NO_PROGRESS_INJECT_LIMIT) {
          // Suntik satu observasi korektif ke riwayat agar model memperbaiki formatnya
          await subagentStore.addMessage(subagentId, {
            sender: 'tool',
            role: 'user',
            content:
              '[OBSERVATION]: Format balasanmu tidak valid. Balas HANYA JSON {thought, action, answer}. Jika selesai, action=null beserta answer.'
          })
        }
      } else {
        noProgress = 0
      }

      // KONDISI 1: Sub-Agent Ingin Berbicara / Melapor ke Abelink (action null)
      if (!decision.action && decision.answer) {
        // Objective-aware classification: an answer produced right after a
        // recoverable tool error, or a question the sub-agent could answer by
        // itself, must NOT silently end the mission. Only a genuine terminal
        // report (final / blocked / needs explicit lead input) pauses the run.
        const pause = classifySubagentAnswer(decision, {
          hasExecutedTools: toolsExecutedThisRun,
          lastObservation,
          autoRecoverUsed,
          maxAutoRecover: MAX_AUTO_RECOVER
        })

        if (pause.type === 'continue') {
          if (pause.reason === 'recover-after-error') autoRecoverUsed++
          // Material terpotong: laporan di atas output yang dipotong tidak
          // boleh diam-diam menjadi final. Fail loudly memakai status store
          // yang sudah ada ('failed') + titip prompt pemulihan agar retry
          // Lead via send_message meminta bagian hilang dalam potongan kecil.
          if (pause.reason === 'truncated-subagent-output') {
            await subagentStore.addMessage(subagentId, {
              sender: 'tool',
              role: 'user',
              content:
                '[OBSERVATION]: Output tool terakhir TERPOTONG (SISA DATA/OUTPUT DIPOTONG) sehingga laporanmu belum lengkap dan TIDAK BOLEH dianggap selesai. Ambil bagian yang hilang dalam potongan yang lebih kecil: ulangi query terakhir dengan rentang lebih sempit (startLine||endLine, grep kata kunci spesifik, atau halaman/offset berikutnya), lalu laporkan HANYA setelah seluruh bagian terverifikasi oleh observasi tool.'
            })
            await subagentStore.updateSubagent(subagentId, {
              status: 'failed',
              finalAnswer: decision.answer
            })
            return {
              success: false,
              subagentId,
              error:
                'Output sub-agent terpotong (SISA DATA/OUTPUT DIPOTONG): laporan tidak lengkap. Minta bagian yang hilang dalam potongan lebih kecil via send_message.',
              turnCount: currentTurn,
              terminalReason: pause.reason
            }
          }
          const corrective =
            pause.reason === 'recover-after-error'
              ? '[OBSERVATION]: Tool terakhir GAGAL dan misi belum selesai. Jangan berhenti dan jangan bertanya dulu: analisis error di "thought", pilih strategi alternatif (tool atau argumen berbeda), lalu isi "action" untuk melanjutkan. Laporkan selesai HANYA setelah deliverable terverifikasi oleh observasi tool.'
              : '[OBSERVATION]: Kamu menjawab tanpa action padahal misi belum selesai. Lanjutkan eksekusi lewat "action". Jika memang tidak bisa maju karena izin/sumber eksternal, tulis laporan blokade yang spesifik di "answer".'
          await subagentStore.addMessage(subagentId, {
            sender: 'tool',
            role: 'user',
            content: corrective
          })
          continue
        }

        // VERIFICATION GATE (objectiveVerifier.js): a 'final' report is a
        // model claim, not proof. Before accepting the pause, check the
        // objective's world-state evidence; an unproven claim gets a bounded
        // replan observation instead of silently ending the mission.
        if (pause.type === 'final' && toolsExecutedThisRun) {
          try {
            const evidence = evaluateEvidence({
              objectiveText: subagent.goal,
              answer: decision.answer,
              observations: [lastObservation]
            })
            const gate = gateCompletion({
              modelClaimDone: true,
              verification: evidence.state,
              kind: evidence.kind
            })
            if (benchArch !== 'vanilla' && !gate.complete && verifyReplansUsed < MAX_VERIFY_REPLANS) {
              verifyReplansUsed++
              await subagentStore.addMessage(subagentId, {
                sender: 'tool',
                role: 'user',
                content: buildReplanObservation(evidence)
              })
              continue
            }
          } catch (e) {
            // Additive layer: verifier errors never block a legitimate report.
            console.warn('[subagentExecutor] objectiveVerifier error:', e?.message)
          }
        }

        // BLOCKED CHALLENGE (simetri verify-gate): klaim blocked tanpa satu
        // pun eksekusi tool = belum terbukti buntu. Tantang 1x; ulangan
        // kedua diterima seperti biasa.
        if (
          pause.type === 'blocked' &&
          shouldChallengeBlocked({
            toolsExecuted: toolsExecutedThisRun ? 1 : 0,
            challengesUsed: blockedChallengeUsed
          })
        ) {
          blockedChallengeUsed++
          await subagentStore.addMessage(subagentId, {
            sender: 'tool',
            role: 'user',
            content: `[OBSERVATION]: ${BLOCKED_CHALLENGE_TEXT}`
          })
          continue
        }

        terminalType =
          pause.type === 'blocked'
            ? 'blocked'
            : pause.type === 'needs_input'
              ? 'needs_input'
              : pause.type === 'self_terminated'
                ? 'self_terminated'
                : 'final'
        latestSubagentReply = decision.answer
        await subagentStore.addMessage(subagentId, {
          sender: 'subagent',
          role: 'assistant',
          content: JSON.stringify({ thought: decision.thought, answer: decision.answer }),
          thought: decision.thought
        })
        await subagentStore.updateSubagent(subagentId, {
          status: 'idle',
          finalAnswer: decision.answer
        })

        return {
          success: true,
          subagentId,
          reply: decision.answer,
          thought: decision.thought || '',
          turnCount: currentTurn,
          // Internal completion state (REPORT_FINAL / REPORT_BLOCKED /
          // REQUEST_DECISION) so the lead agent can tell "done" from
          // "blocked" and "needs a decision" without parsing prose.
          terminal: terminalType,
          terminalReason: pause.reason
        }
      }

      // KONDISI 2: Sub-Agent Ingin Mengeksekusi Tool
      if (decision.action) {
        await subagentStore.addMessage(subagentId, {
          sender: 'subagent',
          role: 'assistant',
          content: JSON.stringify({ thought: decision.thought, action: decision.action }),
          thought: decision.thought,
          action: decision.action
        })

        // Tangani Batch Actions vs Single Action
        const actionsToExecute = Array.isArray(decision.action)
          ? decision.action
          : [decision.action]
        const observations = []

        for (const act of actionsToExecute) {
          if (!act?.tool) continue
          if (abortController.signal.aborted) break

          try {
            let res
            if (act.tool === 'read-tools') {
              const groupName = (act.query || '').trim()
              if (!groupName) {
                res = {
                  success: false,
                  error: 'Harap sebutkan nama_grup (misal: "advanced_browser").'
                }
              } else {
                const text = await loadGroupToolsText(groupName)
                res = text
                  ? {
                      success: true,
                      data: `[PANDUAN TOOL ${groupName.toUpperCase()}]:\n${text}`
                    }
                  : { success: false, error: `Grup tool '${groupName}' tidak ditemukan.` }
              }
            } else if (act.tool === 'memory-search') {
              const formatted = await executeMemorySearch(act.query || '')
              res = { success: true, data: formatted }
            } else if (act.tool === 'memory') {
              const out = await executeMemoryTool(act.query || '', {
                turnId: subagentId,
                sessionId: subagentId
              })
              const isErr = out.startsWith('[MEMORY-ERROR]') || out.startsWith('[MEMORY-FAILURE-CAP]')
              res = { success: !isErr, data: out }
            } else if (window.api && window.api.executeNativeTool) {
              // workspaceRoot warisan sesi induk (disimpan di record) — plumbing
              // yang sama seperti loop utama, bukan root baru.
              res = await window.api.executeNativeTool(act.tool, act.query || '', {
                sessionId: subagentId,
                turnId: `${subagentId}-${Date.now()}`,
                workspaceRoot: subagent.workspaceRoot ?? null
              })
            } else {
              res = { success: false, error: 'IPC executeNativeTool tidak tersedia.' }
            }

            const resultStr = res.success
              ? typeof res.data === 'string'
                ? res.data
                : JSON.stringify(res.data)
              : `[ERROR] ${res.error}`

            if (act.tool === 'read-tools' || act.tool === 'memory-search' || act.tool === 'memory' || !window.api?.executeNativeTool) {
              try {
                import('../harness')
                  .then(({ logToolCall }) =>
                    logToolCall({
                      tool: act.tool,
                      query: String(act.query || '').slice(0, 200),
                      ok: res.success === true,
                      rejected: false,
                      resultSummary: String(resultStr || '').slice(0, 2000),
                      sessionId: subagentId,
                      turn: currentTurn
                    })
                  )
                  .catch(() => {})
              } catch (_) {}
            }

            observations.push(`[${act.tool}] ${resultStr}`)

            // Thin supervisor: Fase 1 fields only; vanilla has no
            // supervisor at all. Staged hintText flushes with the observation below.
            try {
              if (subSupervisor) {
                const attemptOk = res.success === true
                const subSupResult = subSupervisor.update({
                  tool: act.tool,
                  query: act.query || '',
                  success: attemptOk,
                  verificationState: attemptOk ? 'not_run' : 'failed'
                })
                if (subSupResult.hintText && !pendingSubHint) pendingSubHint = subSupResult.hintText
              }
            } catch (e) {
              console.warn('[subagentExecutor] trajectory supervisor error:', e?.message)
            }
          } catch (err) {
            observations.push(`[${act.tool} ERROR] ${err.message}`)
          }
        }

        toolsExecutedThisRun = true

        let combinedObservation = observations.join('\n\n')
        if (combinedObservation.length > 4000) {
          combinedObservation =
            combinedObservation.slice(0, 4000) +
            `\n\n[...SISA DATA DIPOTONG (Total: ${combinedObservation.length} karakter)...]`
        }
        lastObservation = combinedObservation

        await subagentStore.addMessage(subagentId, {
          sender: 'tool',
          role: 'user',
          content: `[OBSERVATION]:\n${combinedObservation}`
        })

        // Flush a staged supervisor hint as its own message (single slot,
        // mirrors the main loop; never collides with the verify-gate replan).
        if (pendingSubHint) {
          await subagentStore.addMessage(subagentId, {
            sender: 'tool',
            role: 'user',
            content: pendingSubHint
          })
          pendingSubHint = null
        }
      }
    }

    // Loop habis tanpa abort maupun laporan: hanya jawaban kosong tulen yang
    // boleh memakai fallback generik. Ekor terpotong gagal keras (status
    // 'failed' yang sudah ada) agar tidak diam-diam menjadi bahan sintesis.
    const truncatedTail = isTruncatedOutput(latestSubagentReply)
    await subagentStore.updateSubagent(subagentId, {
      status: truncatedTail ? 'failed' : 'idle',
      finalAnswer: latestSubagentReply || 'Misi sub-agent selesai.'
    })

    return {
      success: true,
      subagentId,
      reply: latestSubagentReply || 'Misi selesai.',
      turnCount: currentTurn,
      terminal: terminalType,
      terminalReason: truncatedTail ? 'truncated-subagent-output' : 'loop-exhausted'
    }
  } catch (err) {
    if (abortController.signal.aborted) {
      await subagentStore.updateSubagent(subagentId, { status: 'killed' })
      return { success: false, subagentId, error: 'Eksekusi dibatalkan oleh pengguna.' }
    }
    await subagentStore.updateSubagent(subagentId, { status: 'failed' })
    return { success: false, subagentId, error: err.message }
  } finally {
    // Hapus hanya bila yang terdaftar masih controller milik run ini,
    // supaya tidak menghapus controller run lain yang lebih baru.
    if (subagentAbortControllers.get(subagentId) === abortController) {
      subagentAbortControllers.delete(subagentId)
    }
    if (window.api && window.api.executeNativeTool) {
      window.api.executeNativeTool('browser-close', '', { sessionId: subagentId }).catch(() => {})
    }
  }
}

/**
 * Membatalkan paksa eksekusi sub-agent yang sedang berjalan
 */
export function killSubagentExecution(subagentId) {
  const ctrl = subagentAbortControllers.get(subagentId)
  if (ctrl) {
    ctrl.abort()
    subagentAbortControllers.delete(subagentId)
  }
  subagentStore.updateSubagent(subagentId, { status: 'killed' })
  if (window.api && window.api.executeNativeTool) {
    window.api.executeNativeTool('browser-close', '', { sessionId: subagentId }).catch(() => {})
  }
}
