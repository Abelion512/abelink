// agentDecision.js — shared, deterministic termination semantics for MARK loops.
//
// Problem this module solves: both the main ReAct loop (useMarkPlan) and the
// sub-agent executor treated `answer` (text without an action) as an implicit
// termination signal. That collapses five genuinely different runtime states
// into one: task completed, task failed, task blocked, task needs a user
// decision, task still in progress. A model could end an active mission with
// an answer like "I need more information" without ever observing or acting —
// chatbot behavior, not agent behavior.
//
// These functions classify a decision into an INTERNAL state machine:
//
//   ACT            — execute decision.action, keep looping (observation → next turn)
//   CONTINUE       — not finished; reprompt / auto-continue (bounded by caller)
//   FINAL          — objective claimed completed; report & terminate
//   BLOCKED        — cannot progress (permission/safety/external dependency); report
//   NEEDS_USER     — a user/lead decision is required before progress is possible
//
// The external JSON protocol ({ thought, action, answer, is_done, task_status,
// objective }) stays byte-compatible. This module only changes how the harness
// INTERPRETS that protocol. Everything here is pure & unit-testable (no
// window/db/network imports).

export const INTENT = {
  ACT: 'act',
  CONTINUE: 'continue',
  FINAL: 'report_final',
  BLOCKED: 'report_blocked',
  NEEDS_USER: 'request_decision'
}

export const TERMINAL_OUTCOMES = ['final', 'blocked', 'needs_user'] // internal terminal report types

// Answer-text markers that signal a permission/approval/safety wall, not a
// generic tool failure ("tool X tidak bisa dipakai, coba Y" is recovery, not
// a block). Only narrow refusal/authorization vocabulary lands here.
const BLOCKED_TEXT =
  /(\[DITOLAK\]|menolak|tidak (menyetujui|mengizinkan|diizinkan|diperbolehkan)|ditolak|butuh (izin|persetujuan)|membutuhkan (izin|persetujuan|konfirmasi)|perlu (izin|persetujuan|konfirmasi)|no permission|access denied|permission denied|not permitted|requires approval|awaiting approval)/i

const NEEDS_USER_TEXT =
  /(apakah|bisakah|bolehkah|maukah|haruskah|perlukah|boleh\s+(saya|aku)|setujukah|can you|could you|should i|may i|do you (want|need|mind)|would you|is it (ok|okay)|apakah saya|boleh saya)/i

// text ends with a question mark OR asks an explicit question AND is short
// enough to be a real request-for-decision (not a long report containing a
// rhetorical question).
export function isQuestionText(text = '') {
  const s = String(text || '').trim()
  if (!s) return false
  const short = s.length <= 500
  return short && (/\?\s*$/.test(s) || (NEEDS_USER_TEXT.test(s) && s.length <= 300))
}

export function isBlockedText(text = '') {
  return BLOCKED_TEXT.test(String(text || ''))
}

const hasActionShape = (decision = {}) =>
  !!(decision.action && (decision.action.tool || Array.isArray(decision.action)))

const taskStatus = (decision = {}) => String(decision.task_status || '').toLowerCase()

const explicitState = (decision = {}) => {
  // Sub-agent protocol extension: optional `completion` field (model-visible),
  // main-loop may also emit it; both are optional so old outputs still parse.
  const c = String(decision.completion || decision.status || '').toLowerCase()
  if (['done', 'completed', 'final'].includes(c)) return 'final'
  if (['blocked', 'stuck'].includes(c)) return 'blocked'
  if (['needs_user', 'needs_input', 'ask', 'request_decision'].includes(c)) return 'needs_user'
  if (['continue', 'working', 'in_progress'].includes(c)) return 'in_progress'
  return null
}

/**
 * Classify one decision from the MAIN agent loop.
 *
 * ctx = {
 *   disableTools: bool        — greeting/non-tool mode: answers are always final
 *   hasExecutedTools: bool    — any tool ran during this session
 *   missionActive: bool       — durable task active / objective in flight
 * }
 *
 * Returns { intent, terminal, reason } where intent is one of INTENT.*.
 */
export function classifyMainDecision(decision = {}, ctx = {}) {
  const { disableTools = false, hasExecutedTools = false, missionActive = false } = ctx

  if (disableTools) {
    return { intent: INTENT.FINAL, terminal: true, reason: 'tools-disabled' }
  }

  // Tool call always wins: the agent moves, then observes, then decides again.
  if (hasActionShape(decision)) {
    return { intent: INTENT.ACT, terminal: false, reason: 'action' }
  }

  const status = taskStatus(decision)
  const explicit = explicitState(decision)

  if (status === 'blocked' || explicit === 'blocked') {
    return { intent: INTENT.BLOCKED, terminal: true, reason: 'state-blocked' }
  }
  if (
    status === 'needs_user' ||
    status === 'needs_input' ||
    status === 'awaiting_user' ||
    explicit === 'needs_user'
  ) {
    return { intent: INTENT.NEEDS_USER, terminal: true, reason: 'state-needs-user' }
  }
  // Objective still explicitly open: do NOT let a stray answer/is_done close it.
  if (status === 'in_progress' || explicit === 'in_progress') {
    return { intent: INTENT.CONTINUE, terminal: false, reason: 'state-in-progress' }
  }
  if (decision.is_done === true) {
    return { intent: INTENT.FINAL, terminal: true, reason: 'explicit-done' }
  }
  if (status === 'done' || status === 'simple') {
    return { intent: INTENT.FINAL, terminal: true, reason: 'state-done' }
  }

  const answer = typeof decision.answer === 'string' && decision.answer.trim() ? decision.answer : ''

  if (answer) {
    const mission = hasExecutedTools || missionActive || Boolean(decision.objective)
    if (mission) {
      // Answer without a completion claim while a mission is active is a
      // progress/blocked report, NOT a termination signal.
      if (isBlockedText(answer) && !decision.is_done) {
        return { intent: INTENT.BLOCKED, terminal: true, reason: 'blocked-reported' }
      }
      if (isQuestionText(answer) && !decision.is_done && !hasExecutedTools) {
        return { intent: INTENT.NEEDS_USER, terminal: true, reason: 'question-asked' }
      }
      return { intent: INTENT.CONTINUE, terminal: false, reason: 'answer-without-completion' }
    }
    // Plain conversational reply with no mission in flight: final (backward
    // compatible with pre-audit chat behavior).
    return { intent: INTENT.FINAL, terminal: true, reason: 'conversational-answer' }
  }

  // No action, no answer. Caller decides (durable retry vs final fallback).
  return { intent: INTENT.CONTINUE, terminal: false, reason: 'empty-decision' }
}

/**
 * Classify a sub-agent pause/report decision.
 *
 * Sub-agents pause after a report so the LEAD agent can review (intercom
 * design). But an answer produced right after a recoverable tool error, or an
 * answer that just asks for information the sub-agent could obtain itself, must
 * NOT silently end the mission.
 *
 * ctx = {
 *   hasExecutedTools: bool,
 *   lastObservation: string  — text of the most recent [OBSERVATION]
 *   autoRecoverUsed: int     — corrective auto-continues already injected
 *   maxAutoRecover: int      — bounded budget (default 2)
 * }
 *
 * Returns { type: 'continue'|'final'|'blocked'|'needs_input', reason }.
 * 'continue' means the executor should keep the loop going (optionally with a
 * corrective observation), never a terminal pause.
 */
export function classifySubagentAnswer(decision = {}, ctx = {}) {
  const {
    hasExecutedTools = false,
    lastObservation = '',
    autoRecoverUsed = 0,
    maxAutoRecover = 2
  } = ctx

  if (hasActionShape(decision)) {
    return { type: 'continue', reason: 'action' }
  }

  const explicit = explicitState(decision)
  if (explicit === 'final') return { type: 'final', reason: 'explicit-done' }
  if (explicit === 'blocked') return { type: 'blocked', reason: 'explicit-blocked' }
  if (explicit === 'needs_user') return { type: 'needs_input', reason: 'explicit-needs-user' }
  if (explicit === 'in_progress') return { type: 'continue', reason: 'explicit-continue' }

  const answer = typeof decision.answer === 'string' && decision.answer.trim() ? decision.answer : ''
  if (!answer) return { type: 'continue', reason: 'empty-decision' }

  const lastFailed = /(\[ERROR\]|\[DITOLAK\]|failed|timeout|ECONNREFUSED|HTTP [45]\d\d)/i.test(
    String(lastObservation || '')
  )

  if (lastFailed) {
    if (autoRecoverUsed < maxAutoRecover) {
      return { type: 'continue', reason: 'recover-after-error' }
    }
    if (isQuestionText(answer)) return { type: 'needs_input', reason: 'failed-then-asks' }
    return { type: 'blocked', reason: 'error-budget-exhausted' }
  }

  if (isQuestionText(answer)) {
    return hasExecutedTools
      ? { type: 'needs_input', reason: 'asks-after-work' }
      : { type: 'needs_input', reason: 'asks-before-work' }
  }
  if (isBlockedText(answer)) return { type: 'blocked', reason: 'blocked-reported' }

  return hasExecutedTools
    ? { type: 'final', reason: 'report-after-work' }
    : { type: 'final', reason: 'report-no-tools' }
}

export default { INTENT, classifyMainDecision, classifySubagentAnswer, isBlockedText, isQuestionText }
