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
  VERIFICATION_STATE
} from './objectiveVerifier.js'
import { createTrajectorySupervisor } from './trajectorySupervisor.js'
import { evaluateProgress } from './progressEvaluator.js'
import {
  classifyMainDecision,
  INTENT,
  isExplicitSelfTerminate,
  shouldChallengeBlocked,
  BLOCKED_CHALLENGE_TEXT
} from './agentDecision.js'
import { resolvePlanStepBudget } from './planStepBudget.js'
import { currentBenchArch } from './benchArch.js'

const MAX_NO_PROGRESS_STREAK = 3
const BUDGET_EXTENSION_STEPS = 16

/**
 * Execute the autonomous ReAct agent loop in a framework-agnostic environment.
 *
 * @param {Object} params
 * @param {string} params.prompt - The initial user prompt or task instruction.
 * @param {Object} [params.options] - Configuration options (maxTurns, effort, provider, model, workspaceRoot, signal, etc.)
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

  // Budget steps
  let maxPlanSteps = Number.isFinite(options.maxTurns)
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

  const objectiveKind = classifyObjectiveKind(prompt)
  const supervisor =
    benchArch === 'vanilla' || objectiveKind === 'conversational' || options.disableTools
      ? null
      : createTrajectorySupervisor()

  let pendingSupervisorHint = null
  let pendingVerifyObservation = null
  let verifyReplanCount = 0
  let blockedChallengeCount = 0
  let noActionStreak = 0
  let budgetExtended = false

  const loopMessages = []
  const executedToolsList = []
  const trace = []
  let stepCount = 0
  let isDone = false
  let sessionOutcome = 'failed'
  let lastTerminalReason = null
  let lastDecision = null
  let previousProgressRecord = null

  // Install custom AI fetch transport if provided by environment
  let restoreTransport = null
  if (typeof environment.fetchAI === 'function') {
    const prevTransport = globalThis.__ABELINK_AI_FETCH__
    globalThis.__ABELINK_AI_FETCH__ = environment.fetchAI
    restoreTransport = () => {
      globalThis.__ABELINK_AI_FETCH__ = prevTransport
    }
  }

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
        const hasRecentProgress =
          recentTools.length > 0 &&
          recentTools.some(
            (t) => typeof t?.result === 'string' && !t.result.startsWith('[ERROR]') && !t.result.startsWith('[BLOCKED]')
          )

        if (!budgetExtended && hasRecentProgress) {
          budgetExtended = true
          maxPlanSteps += BUDGET_EXTENSION_STEPS
          loopMessages.push({
            role: 'user',
            content: `[SYSTEM / BUDGET] Jatah langkah ditambah +${BUDGET_EXTENSION_STEPS} (total ${maxPlanSteps}) karena ada kemajuan tool baru-baru ini. Selesaikan tugas segera.`
          })
        } else {
          sessionOutcome = 'failed'
          lastTerminalReason = 'step-budget-exhausted'
          decision = {
            thought: 'Batas langkah keamanan tercapai.',
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

      // Get next action via authoritative planner (getNextAction)
      decision = await getNextAction(
        prompt,
        loopMessages,
        signal,
        { memories: [], archives: [], documents: [], turnPairs: [] },
        '',
        options.activeTopic || '',
        {
          ...options,
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
          if (noActionStreak >= MAX_NO_PROGRESS_STREAK) {
            sessionOutcome = 'failed'
            lastTerminalReason = 'no-progress-streak-exhausted'
            isDone = true
            break
          }
          loopMessages.push({
            role: 'assistant',
            content: JSON.stringify({ thought: decision.thought, answer: decision.answer })
          })
          loopMessages.push({
            role: 'user',
            content: '[OBSERVATION]: Kamu menjawab tanpa aksi padahal misi belum selesai. Lanjutkan eksekusi via "action" atau buat klaim penyelesaian final yang terverifikasi.'
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
              objectiveText: prompt,
              answer: decision.answer,
              tools: executedToolsList
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

            if (gate.replan && verifyReplanCount < MAX_VERIFY_REPLANS) {
              verifyReplanCount++
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
          } catch (verErr) {
            // Verifier additive: errors never crash legitimate completion
            sessionOutcome = 'completed'
            lastTerminalReason = classification.reason || 'explicit-done'
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
              signal
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

          // Deterministic progress evaluation
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
    if (typeof restoreTransport === 'function') {
      restoreTransport()
    }
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
    trace
  }
}

export default { runAgentLoop }
