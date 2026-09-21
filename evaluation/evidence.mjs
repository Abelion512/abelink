// evaluation/evidence.mjs - PR46 evidence plane (thin normalizer, no new store).
//
// PR46 objective: give the measurement layer a single, minimal evidence shape
// that keeps result -> evidence -> oracle -> report provenance intact, WITHOUT
// forcing every tool result into browser-shaped fields and WITHOUT a persistent
// database. Records live in a run-level in-memory ledger only.
//
// This module REUSES existing runtime signals instead of re-deriving them:
//   - src/api/ai/progressEvaluator.js owns progress/stagnation fingerprints.
//   - src/api/ai/objectiveVerifier.js owns the verification-state vocabulary.
//
// Anti-cheat invariants preserved here:
//   - a model final answer is a claim, never evidence (records carry `claim:true`).
//   - tool execution success is not objective success (status is tool-level only).
//   - genuine negative evidence (empty search, explicit not-found) is a distinct
//     `status` value from tool execution failure.

import {
  PROGRESS_OUTCOME,
  evaluateProgress,
  observationFingerprint,
  normalizeProgressKey,
} from '../src/api/ai/progressEvaluator.js'
import { VERIFICATION_STATE } from '../src/api/ai/objectiveVerifier.js'

// Tool-level execution status. Never a task-success verdict.
export const EVIDENCE_STATUS = Object.freeze({
  SUCCESS: 'success',
  FAILED: 'failed',
  NEGATIVE: 'negative', // executed fine, but produced genuine negative evidence
  NOT_EXECUTED: 'not_executed',
  UNKNOWN: 'unknown',
})

// Where a record came from. Keeps provenance explicit instead of guessing.
export const EVIDENCE_SOURCES = Object.freeze({
  TOOL: 'tool-result',
  DECISION: 'model-decision',
  WORLD: 'world-artifact',
  ORACLE: 'task-oracle',
})

export const MAX_OBSERVATION_CHARS = 800

// Conservative markers for tool execution failure (bracket tags used by the
// sidecar/adapter, plus the adapter's own "ERROR: " prefix).
const EXEC_FAILURE_RE = /^\s*(ERROR:|\[ERROR\]|\[DITOLAK\]|\[DIBATALKAN\]|\[SEARCH-ERROR\]|\[CIRCUIT-OPEN\]|\[SPIRAL-STOP\]|\[REPEAT-CACHE\])/i
// Genuine negative evidence: the tool ran and truthfully reported "nothing".
const NEGATIVE_RE = /(tidak ditemukan|tidak ada hasil|no results?|not found|empty result|kosong)/i

const compact = (value, limit) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit)

/**
 * Classify tool execution status. `success` is the adapter's explicit flag when
 * present; otherwise the observation text decides. Negative evidence is a
 * distinct outcome from execution failure.
 */
export function classifyEvidenceStatus({ observation = '', success = null } = {}) {
  const text = String(observation ?? '')
  if (success === true && !EXEC_FAILURE_RE.test(text)) {
    return NEGATIVE_RE.test(text) ? EVIDENCE_STATUS.NEGATIVE : EVIDENCE_STATUS.SUCCESS
  }
  if (success === false || EXEC_FAILURE_RE.test(text)) return EVIDENCE_STATUS.FAILED
  if (!text.trim()) return EVIDENCE_STATUS.NOT_EXECUTED
  return NEGATIVE_RE.test(text) ? EVIDENCE_STATUS.NEGATIVE : EVIDENCE_STATUS.SUCCESS
}

/**
 * Build one normalized evidence record. The shape is intentionally small and
 * generic: tool/action name, status, bounded payload, verification hint,
 * progress signal, and provenance. It is not browser-specific.
 */
export function normalizeEvidenceRecord({
  runId = null,
  benchmarkRunId = null,
  executionId = null,
  representation = null,
  taskId = null,
  lane = null,
  arch = 'basic',
  model = null,
  step = 0,
  tool = null,
  action = 'tool',
  status = EVIDENCE_STATUS.UNKNOWN,
  observation = '',
  verificationState = VERIFICATION_STATE.NOT_RUN,
  source = EVIDENCE_SOURCES.TOOL,
  fingerprint = null,
  strategyKey = null,
  repeated = false,
  retry = false,
  stagnant = false,
  recovery = false,
  progressOutcome = null,
  claim = false,
} = {}) {
  const payload = String(observation ?? '')
  // Execution identity: benchmarkRunId is the benchmark session, executionId is
  // one concrete execution (session + taskId + iteration). `runId` stays as an
  // alias of executionId so existing readers keep working.
  const execution = executionId || runId || null
  return {
    benchmarkRunId,
    executionId: execution,
    runId: execution,
    taskId,
    lane,
    arch,
    representation,
    model,
    step: Number.isInteger(step) ? step : 0,
    tool: tool || null,
    action,
    // Tool-level status only. Never a task-completion verdict.
    status,
    claim: claim === true,
    // Bounded payload: report stays machine-readable and cheap to store in-memory.
    observation: payload.slice(0, MAX_OBSERVATION_CHARS),
    observationTruncated: payload.length > MAX_OBSERVATION_CHARS,
    verificationState,
    source,
    fingerprint: fingerprint || observationFingerprint(payload),
    strategyKey: strategyKey || normalizeProgressKey(tool || '', ''),
    repeated: repeated === true,
    retry: retry === true,
    stagnant: stagnant === true,
    recovery: recovery === true,
    progressOutcome: progressOutcome || null,
  }
}

/**
 * Adapter for the real AbelinkBench trajectory: prefers `trace` (has query per
 * tool call) and falls back to `stepLog` (has an explicit success flag). Both
 * shapes already exist in the runtime; nothing new is collected.
 */
export function evidenceFromRun({
  runId = null,
  benchmarkRunId = null,
  taskId = null,
  lane = null,
  arch = 'basic',
  representation = null,
  model = null,
  trace = [],
  stepLog = [],
  verificationState = VERIFICATION_STATE.NOT_RUN,
} = {}) {
  const records = []
  const seenKeys = new Set()
  let previous = null

  const push = (entry) => {
    const observation = entry.observation
    const strategyKey = normalizeProgressKey(entry.tool || '', entry.query || '')
    const fingerprint = observationFingerprint(observation)
    const repeated = Boolean(previous) && previous.strategyKey === strategyKey && previous.tool === entry.tool && Boolean(entry.tool)
    const retry = Boolean(entry.tool) && seenKeys.has(strategyKey)
    const progress = evaluateProgress({
      previous: previous
        ? {
            tool: previous.tool,
            query: previous.query,
            observation: previous.observation,
            success: previous.status === EVIDENCE_STATUS.SUCCESS || previous.status === EVIDENCE_STATUS.NEGATIVE,
            verificationState,
          }
        : null,
      current: {
        tool: entry.tool,
        query: entry.query,
        observation,
        success: entry.status === EVIDENCE_STATUS.SUCCESS || entry.status === EVIDENCE_STATUS.NEGATIVE,
        verificationState,
      },
    })
    const recovery = Boolean(previous) && previous.status === EVIDENCE_STATUS.FAILED && entry.status === EVIDENCE_STATUS.SUCCESS

    const record = normalizeEvidenceRecord({
      runId,
      benchmarkRunId,
      taskId,
      lane,
      arch,
      representation,
      model,
      step: entry.step,
      tool: entry.tool,
      action: entry.action || 'tool',
      status: entry.status,
      observation,
      verificationState,
      source: entry.source || EVIDENCE_SOURCES.TOOL,
      fingerprint,
      strategyKey,
      repeated,
      retry,
      stagnant: progress.outcome === PROGRESS_OUTCOME.STAGNANT,
      recovery,
      progressOutcome: progress.outcome,
      claim: entry.claim === true,
    })
    records.push(record)
    if (entry.tool) seenKeys.add(strategyKey)
    previous = { ...record, query: entry.query || '' }
  }

  // Preferred: normalized trace (tool calls carry tool + query + result).
  for (const entry of trace || []) {
    if (entry?.kind === 'tool' && Array.isArray(entry.toolCalls) && entry.toolCalls.length) {
      for (const call of entry.toolCalls) {
        const observation = call.result ?? entry.observation ?? ''
        push({
          step: entry.step,
          tool: call.tool || null,
          query: call.query || '',
          action: 'tool',
          status: classifyEvidenceStatus({ observation, success: null }),
          observation,
          source: EVIDENCE_SOURCES.TOOL,
        })
      }
    } else if (entry?.response) {
      push({
        step: entry.step,
        tool: null,
        query: '',
        action: 'model-decision',
        status: EVIDENCE_STATUS.NOT_EXECUTED,
        observation: entry.response,
        source: EVIDENCE_SOURCES.DECISION,
        claim: true,
      })
    }
  }

  // Fallback / complement: raw adapter step log (has explicit success flag).
  if (records.length === 0) {
    for (const step of stepLog || []) {
      if (step?.type === 'fetch') {
        push({
          step: step.step,
          tool: null,
          query: '',
          action: 'model-decision',
          status: EVIDENCE_STATUS.NOT_EXECUTED,
          observation: step.response || '',
          source: EVIDENCE_SOURCES.DECISION,
          claim: true,
        })
      } else if (step?.tool) {
        const observation = step.result || ''
        push({
          step: step.step,
          tool: step.tool,
          query: step.query || '',
          action: 'tool',
          status: classifyEvidenceStatus({ observation, success: step.success ?? null }),
          observation,
          source: EVIDENCE_SOURCES.TOOL,
        })
      }
    }
  }

  return records
}

/** Aggregate an evidence record list into the counters the metrics layer needs. */
export function summarizeEvidence(records = []) {
  const list = Array.isArray(records) ? records : []
  const toolRecords = list.filter((r) => r.action === 'tool' && r.tool)
  const failures = list.filter((r) => r.status === EVIDENCE_STATUS.FAILED).length
  const negatives = list.filter((r) => r.status === EVIDENCE_STATUS.NEGATIVE).length
  const sources = [...new Set(list.map((r) => r.source))]
  return {
    count: list.length,
    toolCalls: toolRecords.length,
    failures,
    negatives,
    retries: list.filter((r) => r.retry).length,
    repeatedActions: list.filter((r) => r.repeated).length,
    stagnationEvents: list.filter((r) => r.stagnant).length,
    recoveryEvents: list.filter((r) => r.recovery).length,
    sources,
    tools: [...new Set(toolRecords.map((r) => r.tool))],
  }
}

/** Run-level in-memory ledger. No persistence, no schema migration. */
export function createEvidenceLedger({ runId = null, benchmarkRunId = null, taskId = null, lane = null, arch = 'basic', representation = null, model = null } = {}) {
  const records = []
  return {
    runId,
    benchmarkRunId,
    taskId,
    lane,
    arch,
    representation,
    model,
    records,
    add(record) {
      records.push(record)
      return record
    },
    summary() {
      return summarizeEvidence(records)
    },
  }
}

/**
 * Provenance chain for one result: result -> evidence -> oracle -> report.
 * Explicit so a report can always be traced back to the observation that
 * supported (or failed to support) a verdict.
 */
export function provenanceChain({ result = null, evidence = null, oracle = null, report = null } = {}) {
  const records = Array.isArray(evidence) ? evidence : evidence?.records || []
  return {
    result: result
      ? {
          runId: result.runId ?? null,
          executionId: result.executionId ?? result.runId ?? null,
          benchmarkRunId: result.benchmarkRunId ?? null,
          taskId: result.taskId ?? null,
          passed: result.passed === true,
          // The model's final answer is a claim; it is recorded, never trusted.
          finalAnswerIsClaim: true,
        }
      : null,
    evidence: {
      count: records.length,
      tools: [...new Set(records.filter((r) => r.tool).map((r) => r.tool))],
      sources: [...new Set(records.map((r) => r.source))],
    },
    oracle: oracle
      ? {
          kind: oracle.kind || 'unknown',
          independent: oracle.independent === true,
          passed: oracle.passed === true,
        }
      : null,
    report: report ? { kind: report.kind || null, schemaVersion: report.schemaVersion ?? null } : null,
  }
}

export default {
  EVIDENCE_STATUS,
  EVIDENCE_SOURCES,
  MAX_OBSERVATION_CHARS,
  classifyEvidenceStatus,
  normalizeEvidenceRecord,
  evidenceFromRun,
  summarizeEvidence,
  createEvidenceLedger,
  provenanceChain,
}
