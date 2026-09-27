// agentRunner.js — Pure, framework-agnostic ReAct autonomous agent loop.
//
// Extracted seam from useAbelinkPlan.js:
// - Zero UI or React dependencies (no hooks, no DOM, no audio/speech).
// - Directly reuses existing authoritative modules:
//     * planning.js (getNextAction — prompt assembly, persona, JSON schema)
//     * objectiveVerifier.js (evaluateEvidence, gateCompletion, buildReplanObservation)
//     * trajectorySupervisor.js (createTrajectorySupervisor, stagnation ladder)
//     * progressEvaluator.js (evaluateProgress, deterministic state comparison)
//     * agentDecision.js (classifyMainDecision, shouldChallengeBlocked)
//     * planStepBudget.js (resolvePlanStepBudget, budget resolution & escalation)
//     * benchArch.js (currentBenchArch)
// - Tool execution and environment concerns are owned by the passed `environment` adapter:
//     { fetchAI, executeTool, onStep, onThought }

import { getNextAction } from './planning.js'
import {
  classifyObjectiveKind,
  evaluateEvidence,
  gateCompletion,
  buildReplanObservation,
  MAX_VERIFY_REPLANS,
  canAttemptEvidenceRecovery,
  VERIFICATION_STATE
} from './objectiveVerifier.js'
import { createTrajectorySupervisor } from './trajectorySupervisor.js'
import { evaluateProgress, PROGRESS_OUTCOME } from './progressEvaluator.js'
import { resolveStagnationRung } from './strategyLib.js'
import {
  classifyMainDecision,
  INTENT,
  isExplicitSelfTerminate,
  shouldChallengeBlocked,
  BLOCKED_CHALLENGE_TEXT
} from './agentDecision.js'
import {
  resolvePlanStepBudget,
  shouldRenewBudget,
  renewBudgetWindow
} from './planStepBudget.js'
import { currentBenchArch } from './benchArch.js'

export const MAX_NO_PROGRESS_STREAK = 3
export const MAX_NO_ACTION_TERMINAL_STREAK = 8
export const MAX_PROGRESSIVE_NO_ACTION_LIMIT = 12
export const SYSTEM_ABSOLUTE_HARD_CEILING = 512

/**
 * Execute the autonomous ReAct agent loop in a framework-agnostic environment.
 *
 * @param {Object} params
 * @param {string} params.prompt - The initial user prompt or task instruction.
 * @param {Object} [params.options] - Configuration options (maxTurns, effort, provider, model, workspaceRoot, signal, etc.)
 * @param {Array} [params.options.initialHistory] - Fase 1 resume seed: [{role:'user'|'assistant',content:string}]
 *   disaring ketat (role + string content saja) sebelum masuk loopMessages.
 * @param {Object} params.environment - The runtime adapter: { fetchAI, executeTool, onStep, onThought }
 * @returns {Promise<Object>} Execution result { success, outcome, terminalReason, reply, thought, stepCount, toolCallsCount, executedTools, trace }
 */
export async function runAgentLoop({ prompt, options = {}, environment }) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('runAgentLoop: prompt wajib berupa string non-kosong.')
  }
  if (!environment || typeof environment.executeTool !== 'function') {
    throw new Error('runAgentLoop: environment.executeTool wajib disediakan.')
  }

  const signal = options.signal || null
  const workspaceRoot = options.workspace || options.workspaceRoot || null
  const sessionId = options.sessionId || `session-${Date.now()}`
  const benchArch = options.arch || currentBenchArch()

  const requestedCeiling = Number.isFinite(options.hardCeiling) && options.hardCeiling > 0
    ? Math.floor(options.hardCeiling)
    : SYSTEM_ABSOLUTE_HARD_CEILING

  const hardCeiling = Math.min(requestedCeiling, SYSTEM_ABSOLUTE_HARD_CEILING)

  // Budget steps
  let maxPlanSteps = Number.isFinite(options.maxTurns) && options.maxTurns > 0
    ? Math.max(1, Math.floor(options.maxTurns))
    : resolvePlanStepBudget({
        config: {
          aiProvider: options.provider,
          model: options.model,
          effortLevel: options.effort
        },
        userInput: prompt,
        options
      })

  const effectiveObjectiveText = options.originalPrompt || prompt
  const objectiveKind = classifyObjectiveKind(effectiveObjectiveText)
  const supervisor =
    benchArch === 'vanilla' || objectiveKind === 'conversational' || options.disableTools
      ? null
      : createTrajectorySupervisor()

  let pendingSupervisorHint = null
  let pendingVerifyObservation = null
  let _verifyReplanCount = 0
  let consecutiveUnprovenClaims = 0
  let lastToolsCountAtVerifyReplan = -1
  let verifyErrorCount = 0
  let blockedChallengeCount = 0
  let noActionStreak = 0
  let consecutiveIdenticalReasoning = 0
  let lastReasoningFingerprint = null
  let consecutiveStagnantEvaluations = 0
  let _budgetRenewCount = 0

  const loopMessages = []
  if (Array.isArray(options.initialHistory)) {
    for (const m of options.initialHistory) {
      if (m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') {
        loopMessages.push({ role: m.role, content: m.content })
      }
    }
  }
  // Prompt WAJIB masuk sebagai pesan user. planning.js hanya merakit
  // `[system, ...loopMessages]` — `userInput` dipakai untuk klasifikasi/
  // playbook, TIDAK pernah ditambahkan sebagai pesan. Tanpa baris ini model
  // hanya menerima system prompt dan menjawab "input kosong / minta
  // klarifikasi" meski user mengetik pertanyaan (bug terukur 2026-09-26).
  // initialHistory = konteks lama saja (bukan prompt berjalan), jadi aman.
  loopMessages.push({ role: 'user', content: String(prompt) })
  const executedToolsList = Array.isArray(options.initialExecutedTools)
    ? [...options.initialExecutedTools]
    : []
  const trace = []
  let stepCount = Number.isFinite(options.initialStepCount) && options.initialStepCount > 0
    ? options.initialStepCount
    : 0
  let isDone = false
  let sessionOutcome = 'failed'
  let lastTerminalReason = null
  let lastDecision = null
  let previousProgressRecord = null

  // Phase A1: Explicit session transport, no global mutation
  const sessionFetchTransport = options.transport || options.fetchAI || environment.fetchAI || null

  try {
    while (!isDone) {
      if (signal?.aborted) {
        sessionOutcome = 'user_abort'
        lastTerminalReason = 'aborted-by-signal'
        break
      }

      stepCount++

      // Budget check & converge warning
      const stepsLeft = maxPlanSteps - stepCount
      if (stepsLeft <= 5 && stepsLeft > 0 && !isDone) {
        loopMessages.push({
          role: 'user',
          content: `[SYSTEM / BUDGET] Sisa ${stepsLeft} langkah dari ${maxPlanSteps}. WAJIB konvergen: selesaikan jawaban final ("answer", "is_done": true) atau aksi penutup.`
        })
      }

      let decision = null

      // If budget reached, evaluate potential productivity extension or terminate
      if (stepCount >= maxPlanSteps) {
        const recentTools = executedToolsList.slice(-5)
        const isProductive = shouldRenewBudget({
          recentTools,
          verificationMoved: pendingVerifyObservation !== null,
          breakerOpen: false,
          supervisorDirective: supervisor?.lastDirective || 'continue'
        })

        if (isProductive && maxPlanSteps < hardCeiling) {
          const newBudget = renewBudgetWindow(maxPlanSteps, hardCeiling)
          if (newBudget > maxPlanSteps) {
            const added = newBudget - maxPlanSteps
            maxPlanSteps = newBudget
            _budgetRenewCount++
            loopMessages.push({
              role: 'user',
              content: `[SYSTEM / BUDGET] Jatah langkah diperbarui +${added} (total ${maxPlanSteps}, batas sistem ${hardCeiling}) karena misi masih aktif dan produktif.`
            })
          } else {
            sessionOutcome = 'failed'
            lastTerminalReason = 'step-budget-exhausted'
            decision = {
              thought: 'Batas langkah keamanan sistem tercapai.',
              answer: 'Eksekusi dihentikan karena telah mencapai batas langkah keamanan sistem maksimum.',
              is_done: true,
              action: null
            }
            isDone = true
            lastDecision = decision
            break
          }
        } else {
          sessionOutcome = 'failed'
          lastTerminalReason = 'step-budget-exhausted'
          decision = {
            thought: 'Batas langkah tercapai tanpa bukti produktivitas lanjutan.',
            answer: 'Eksekusi dihentikan karena telah mencapai batas langkah yang ditentukan.',
            is_done: true,
            action: null
          }
          isDone = true
          lastDecision = decision
          break
        }
      }

      // Inject pending verifier observation (from unverified completion claim replan)
      if (pendingVerifyObservation) {
        loopMessages.push({
          role: 'user',
          content: pendingVerifyObservation
        })
        pendingVerifyObservation = null
      }

      // Get next action via authoritative planner (getNextAction).
      // unifiedContext may be provided by the caller (e.g. headless CLI
      // working-memory); default preserves existing empty-context behavior.
      const unifiedContext = options.unifiedContext && typeof options.unifiedContext === 'object'
        ? {
          memories: Array.isArray(options.unifiedContext.memories) ? options.unifiedContext.memories : [],
          archives: Array.isArray(options.unifiedContext.archives) ? options.unifiedContext.archives : [],
          documents: Array.isArray(options.unifiedContext.documents) ? options.unifiedContext.documents : [],
          turnPairs: Array.isArray(options.unifiedContext.turnPairs) ? options.unifiedContext.turnPairs : []
        }
        : { memories: [], archives: [], documents: [], turnPairs: [] }
      decision = await getNextAction(
        prompt,
        loopMessages,
        signal,
        unifiedContext,
        '',
        options.activeTopic || '',
        {
          ...options,
          fetchAI: sessionFetchTransport,
          transport: sessionFetchTransport,
          workspaceRoot,
          sessionId,
          turn: stepCount,
          onToken: (chunk) => {
            if (chunk?.text && typeof environment.onThought === 'function') {
              environment.onThought(chunk.text)
            }
          }
        }
      )

      lastDecision = decision
      if (typeof environment.onThought === 'function' && decision?.thought) {
        environment.onThought(decision.thought)
      }

      // Step trace recording
      const stepTraceRecord = {
        step: stepCount,
        kind: 'decision',
        decision: {
          thought: decision.thought,
          action: decision.action,
          answer: decision.answer,
          is_done: decision.is_done,
          task_status: decision.task_status
        }
      }
      trace.push(stepTraceRecord)
      environment.onStep?.(stepTraceRecord)

      // Handle disabled tools option
      if (options.disableTools) {
        decision.action = null
        if (!decision.answer) {
          decision.answer = 'Alat dinonaktifkan untuk sesi ini.'
        }
      }

      const hasAction = Boolean(
        decision.action &&
        (decision.action.tool || (Array.isArray(decision.action) && decision.action.length > 0))
      )

      // ----------------------------------------------------------------------
      // DECISION EVALUATION (Action vs Answer / Completion)
      // ----------------------------------------------------------------------
      if (!hasAction) {
        const classification = classifyMainDecision(decision, {
          hasExecutedTools: executedToolsList.length > 0,
          missionActive: true,
          objectiveKind,
          conversational: objectiveKind === 'conversational'
        })
        const intent = classification.intent

        if (intent === INTENT.CONTINUE) {
          noActionStreak++
          const reasoningFingerprint = `${(decision.thought || '').trim().toLowerCase()}|${(decision.answer || '').trim().toLowerCase()}`.slice(0, 500)
          if (reasoningFingerprint && reasoningFingerprint === lastReasoningFingerprint) {
            consecutiveIdenticalReasoning++
          } else {
            consecutiveIdenticalReasoning = 1
          }
          lastReasoningFingerprint = reasoningFingerprint

          // Semantic repetition (identical reasoning >= 8 turns) terminates fail-closed.
          // Progressive reasoning survives turn 8, escalates via S7_ESCALATE, and is capped at MAX_PROGRESSIVE_NO_ACTION_LIMIT.
          const isSemanticRepetitionExhausted = consecutiveIdenticalReasoning >= MAX_NO_ACTION_TERMINAL_STREAK
          const isProgressiveWindowExhausted = noActionStreak >= MAX_PROGRESSIVE_NO_ACTION_LIMIT

          if (isSemanticRepetitionExhausted || isProgressiveWindowExhausted) {
            sessionOutcome = 'failed'
            lastTerminalReason = 'no-progress-streak-exhausted'
            isDone = true
            break
          }

          const rung = resolveStagnationRung({
            repeat: consecutiveIdenticalReasoning > 1 ? consecutiveIdenticalReasoning : 0,
            noActionStreak
          })

          const observationPrompt =
            noActionStreak >= 7
              ? `[STAGNATION LADDER: ${rung.stage}] Kamu telah ${noActionStreak} giliran bernalar tanpa aksi konkret. Segera ambil tindakan via tool ("action") sekarang.`
              : noActionStreak >= MAX_NO_PROGRESS_STREAK
                ? `[STAGNATION LADDER: ${rung.stage}] Kamu telah ${noActionStreak} giliran tanpa aksi konkret. Lanjutkan dengan mengeksekusi tool ("action") sekarang.`
                : '[OBSERVATION]: Kamu menjawab tanpa aksi padahal misi belum selesai. Lanjutkan eksekusi via "action" atau buat klaim penyelesaian final yang terverifikasi.'

          loopMessages.push({
            role: 'assistant',
            content: JSON.stringify({ thought: decision.thought, answer: decision.answer })
          })
          loopMessages.push({
            role: 'user',
            content: observationPrompt
          })
          continue
        }

        if (intent === INTENT.BLOCKED) {
          if (
            shouldChallengeBlocked({
              toolsExecuted: executedToolsList.length,
              challengesUsed: blockedChallengeCount,
              conversational: objectiveKind === 'conversational'
            })
          ) {
            blockedChallengeCount++
            loopMessages.push({
              role: 'assistant',
              content: JSON.stringify({ thought: decision.thought, answer: decision.answer })
            })
            loopMessages.push({
              role: 'user',
              content: `[OBSERVATION]: ${BLOCKED_CHALLENGE_TEXT}`
            })
            continue
          } else {
            sessionOutcome = 'blocked'
            lastTerminalReason = classification.reason || 'blocked-reported'
            isDone = true
            break
          }
        }

        if (intent === INTENT.NEEDS_USER) {
          sessionOutcome = 'needs_user'
          lastTerminalReason = classification.reason || 'question-asked'
          isDone = true
          break
        }

        if (intent === INTENT.SELF_TERMINATE) {
          sessionOutcome = 'self_terminated'
          lastTerminalReason = classification.reason || 'self-terminate-reported'
          isDone = true
          break
        }

        // INTENT.FINAL (Completion Claim) -> Objective Verification Gate
        if (intent === INTENT.FINAL || decision.is_done === true) {
          noActionStreak = 0

          try {
            const evidence = evaluateEvidence({
              kind: objectiveKind,
              objectiveText: effectiveObjectiveText,
              answer: decision.answer,
              // GUI menulis executedTools {tool, fullResult}; runner headless
              // menyimpan {tool, result}. Petakan di sini agar bukti tool
              // CLI/TUI TIDAK tak-terlihat oleh verifier (bug e2e M2c:
              // gate selalu not_run di CLI/TUI meski tool sukses).
              tools: executedToolsList.map((t) => ({ tool: t.tool, fullResult: t.result }))
            })

            const gate = gateCompletion({
              modelClaimDone: true,
              verification: evidence.state,
              kind: objectiveKind
            })

            if (gate.complete || benchArch === 'vanilla') {
              sessionOutcome = 'completed'
              lastTerminalReason = `${classification.reason || 'explicit-done'}+verify:${benchArch === 'vanilla' ? 'skipped-vanilla' : gate.reason}`
              isDone = true
              break
            }

            // Continuous evidence gathering & bounded replan
            const hasNewEvidenceSinceLastVerify = executedToolsList.length > lastToolsCountAtVerifyReplan
            if (hasNewEvidenceSinceLastVerify) {
              consecutiveUnprovenClaims = 0
            }
            consecutiveUnprovenClaims++

            const allowReplan =
              gate.replan &&
              canAttemptEvidenceRecovery({
                consecutiveRejections: consecutiveUnprovenClaims,
                hasNewEvidence: false,
                maxConsecutiveRejections: MAX_VERIFY_REPLANS
              }) &&
              stepCount < maxPlanSteps

            if (allowReplan) {
              _verifyReplanCount++
              lastToolsCountAtVerifyReplan = executedToolsList.length
              pendingVerifyObservation = buildReplanObservation(evidence)
              loopMessages.push({
                role: 'assistant',
                content: JSON.stringify({ thought: decision.thought, answer: decision.answer })
              })
              continue
            }

            // Verification replan budget exhausted
            sessionOutcome = 'failed'
            lastTerminalReason = `verify-${evidence.state}`
            isDone = true
            break
          } catch (err) {
            // Verifier fail-closed recovery: internal verifier exceptions MUST NOT fake completion.
            if (verifyErrorCount < MAX_VERIFY_REPLANS && stepCount < maxPlanSteps) {
              verifyErrorCount++
              pendingVerifyObservation = `[VERIFICATION ERROR] Pemeriksaan verifikasi sistem mengalami kegagalan internal: ${err?.message || 'internal error'}. Lakukan verifikasi eksplisit menggunakan tool sebelum menyelesaikan tugas.`
              loopMessages.push({
                role: 'assistant',
                content: JSON.stringify({ thought: decision.thought, answer: decision.answer })
              })
              continue
            }
            sessionOutcome = 'failed'
            lastTerminalReason = `verification-error:${err?.message || 'internal'}`
            isDone = true
            break
          }
        }
      }

      // ----------------------------------------------------------------------
      // ACTION EXECUTION BRANCH
      // ----------------------------------------------------------------------
      if (hasAction) {
        noActionStreak = 0
        consecutiveIdenticalReasoning = 0
        lastReasoningFingerprint = null

        // Emergency brake: explicit self-terminate markers supersede actions
        if (isExplicitSelfTerminate(decision)) {
          sessionOutcome = 'self_terminated'
          lastTerminalReason = 'explicit-self-terminate-with-action'
          isDone = true
          break
        }

        const actionsToExecute = Array.isArray(decision.action)
          ? decision.action
          : [decision.action]

        loopMessages.push({
          role: 'assistant',
          content: JSON.stringify({ thought: decision.thought, action: decision.action })
        })

        const roundObservations = []

        for (const act of actionsToExecute) {
          if (!act?.tool) continue
          if (signal?.aborted) break

          const toolName = act.tool
          const toolQuery = act.query || ''

          let toolResult
          try {
            toolResult = await environment.executeTool(toolName, toolQuery, {
              step: stepCount,
              sessionId,
              workspaceRoot,
              signal,
              // Subagent depth (CLI chain): environment boleh membawa depth
              // (createEnvironment(d)); tanpa ini nested spawn selalu depth 0
              // dan MAX_SUBAGENT_DEPTH tak pernah menyala.
              depth: Number(environment?.depth) || 0
            })
          } catch (execErr) {
            toolResult = {
              ok: false,
              result: `[ERROR] Tool ${toolName} gagal: ${execErr.message}`,
              error: {
                code: 'tool-error',
                category: 'execution',
                message: execErr.message
              }
            }
          }

          const obsText = typeof toolResult.result === 'string'
            ? toolResult.result
            : JSON.stringify(toolResult.result ?? toolResult.error ?? 'ok')

          const toolOk = toolResult.ok === true

          executedToolsList.push({
            tool: toolName,
            query: toolQuery,
            success: toolOk,
            result: obsText,
            step: stepCount,
            error: toolResult.error || null
          })

          roundObservations.push(`[${toolName}] ${obsText}`)

          // Trajectory supervisor update (governance across attempts)
          if (supervisor) {
            try {
              const supResult = supervisor.update({
                tool: toolName,
                query: toolQuery,
                success: toolOk,
                verificationState: toolOk ? VERIFICATION_STATE.NOT_RUN : VERIFICATION_STATE.FAILED
              })
              if (supResult?.hintText && !pendingSupervisorHint) {
                pendingSupervisorHint = supResult.hintText
              }
            } catch (_) {}
          }

          // Deterministic progress evaluation (side-effect: memutakhirkan
          // previousProgressRecord; outcome belum dikonsumsi — lihat TODO).
          // TODO: konsumsi outcome stagnasi untuk menghentikan loop lebih awal.
          try {
            const currentRecord = {
              tool: toolName,
              query: toolQuery,
              success: toolOk,
              result: obsText,
              verificationState: toolOk ? VERIFICATION_STATE.NOT_RUN : VERIFICATION_STATE.FAILED
            }
            const progress = evaluateProgress({
              previous: previousProgressRecord,
              current: currentRecord
            })
            previousProgressRecord = currentRecord

            if (progress.outcome === PROGRESS_OUTCOME.PROGRESS) {
              consecutiveStagnantEvaluations = 0
              pendingSupervisorHint = null
            } else if (progress.outcome === PROGRESS_OUTCOME.STAGNANT) {
              consecutiveStagnantEvaluations++
              if (consecutiveStagnantEvaluations >= 8) {
                sessionOutcome = 'failed'
                lastTerminalReason = 'stagnation-loop-exhausted'
                isDone = true
                break
              }
              if (consecutiveStagnantEvaluations >= 3 && !pendingSupervisorHint) {
                const rung = resolveStagnationRung({
                  repeat: consecutiveStagnantEvaluations,
                  stagnantStreak: consecutiveStagnantEvaluations,
                  hasPriorSuccess: executedToolsList.some((t) => t.ok)
                })
                pendingSupervisorHint = `[STAGNATION LADDER: ${rung.stage}] Terdeteksi ${consecutiveStagnantEvaluations}x eksekusi tanpa progres baru. Ubah strategi (${rung.strategy}): jangan ulangi tool dan argumen yang sama.`
              }
            }
          } catch (_) {}

          const toolTrace = {
            step: stepCount,
            kind: 'tool',
            tool: toolName,
            query: toolQuery,
            ok: toolOk,
            result: obsText
          }
          trace.push(toolTrace)
          environment.onStep?.(toolTrace)
        }

        let combinedObservation = roundObservations.join('\n\n')
        if (combinedObservation.length > 8000) {
          combinedObservation = combinedObservation.slice(0, 8000) + '\n... [OUTPUT DIPOTONG]'
        }

        if (pendingSupervisorHint) {
          combinedObservation += `\n\n[SUPERVISOR HINT]: ${pendingSupervisorHint}`
          pendingSupervisorHint = null
        }

        loopMessages.push({
          role: 'user',
          content: `[OBSERVATION]:\n${combinedObservation}`
        })
      }
    }
  } finally {
    // Session transport is isolated per run and does not require global cleanup
  }

  return {
    success: sessionOutcome === 'completed',
    outcome: sessionOutcome,
    terminalReason: lastTerminalReason,
    reply: lastDecision?.answer || '',
    thought: lastDecision?.thought || '',
    stepCount,
    toolCallsCount: executedToolsList.length,
    executedTools: executedToolsList,
    effectiveHardCeiling: hardCeiling,
    trace,
    history: loopMessages
  }
}

export default { runAgentLoop }
