// PR46 evidence plane: normalization + provenance. Pure, offline, no LLM.
import { describe, it, expect } from 'vitest'
import {
  EVIDENCE_STATUS,
  EVIDENCE_SOURCES,
  MAX_OBSERVATION_CHARS,
  classifyEvidenceStatus,
  normalizeEvidenceRecord,
  evidenceFromRun,
  summarizeEvidence,
  createEvidenceLedger,
  provenanceChain,
} from '../evaluation/evidence.mjs'

describe('evidence status classification', () => {
  it('adapter ERROR prefix is tool execution failure', () => {
    expect(classifyEvidenceStatus({ observation: 'ERROR: akses ditolak', success: false })).toBe(
      EVIDENCE_STATUS.FAILED
    )
    expect(classifyEvidenceStatus({ observation: '[DITOLAK] perlu izin' })).toBe(EVIDENCE_STATUS.FAILED)
  })

  it('genuine negative evidence is distinct from execution failure', () => {
    const negative = classifyEvidenceStatus({ observation: 'tidak ditemukan hasil', success: true })
    expect(negative).toBe(EVIDENCE_STATUS.NEGATIVE)
    expect(negative).not.toBe(EVIDENCE_STATUS.FAILED)
  })

  it('empty observation is not executed, never success', () => {
    expect(classifyEvidenceStatus({ observation: '' })).toBe(EVIDENCE_STATUS.NOT_EXECUTED)
  })
})

describe('normalizeEvidenceRecord', () => {
  it('keeps provenance fields and bounds the payload', () => {
    const rec = normalizeEvidenceRecord({
      runId: 'run-1',
      taskId: 'task-a',
      lane: 'research',
      arch: 'basic',
      model: { provider: 'p', modelId: 'm', modelVersion: 'v1' },
      step: 3,
      tool: 'read-file',
      status: EVIDENCE_STATUS.SUCCESS,
      observation: 'x'.repeat(MAX_OBSERVATION_CHARS + 50),
      source: EVIDENCE_SOURCES.TOOL,
    })
    expect(rec.runId).toBe('run-1')
    expect(rec.taskId).toBe('task-a')
    expect(rec.step).toBe(3)
    expect(rec.tool).toBe('read-file')
    expect(rec.observation.length).toBe(MAX_OBSERVATION_CHARS)
    expect(rec.observationTruncated).toBe(true)
    expect(rec.claim).toBe(false)
    // Tool status is never a task-success verdict.
    expect(rec.status).toBe(EVIDENCE_STATUS.SUCCESS)
  })

  it('marks model decisions as claims, not evidence', () => {
    const rec = normalizeEvidenceRecord({ action: 'model-decision', claim: true })
    expect(rec.claim).toBe(true)
  })
})

describe('evidenceFromRun', () => {
  it('normalizes the real adapter stepLog shape', () => {
    const records = evidenceFromRun({
      runId: 'r',
      taskId: 't',
      lane: 'os',
      stepLog: [
        { step: 1, type: 'fetch', response: 'saya akan menulis file' },
        { step: 1, type: 'tool', tool: 'write-file', result: 'ok', success: true },
        { step: 2, type: 'tool', tool: 'read-file', result: 'ERROR: denied', success: false },
        { step: 3, type: 'tool', tool: 'write-file', result: 'ok', success: true },
      ],
    })
    const summary = summarizeEvidence(records)
    expect(summary.toolCalls).toBe(3)
    expect(summary.failures).toBe(1)
    expect(summary.retries).toBe(1) // second write-file
    expect(summary.recoveryEvents).toBe(1) // failed read -> successful write
    expect(records[0].action).toBe('model-decision')
    expect(records[0].claim).toBe(true)
  })

  it('prefers the normalized trace (tool + query preserved)', () => {
    const records = evidenceFromRun({
      runId: 'r',
      taskId: 't',
      trace: [
        { step: 1, kind: 'decision', response: 'plan' },
        {
          step: 2,
          kind: 'tool',
          toolCalls: [{ tool: 'run-shell', query: 'ls -la', result: 'a.txt' }],
          observation: 'a.txt',
        },
      ],
    })
    expect(records.length).toBe(2)
    expect(records[1].tool).toBe('run-shell')
    expect(records[1].action).toBe('tool')
  })

  it('flags repeated actions and stagnation deterministically', () => {
    const records = evidenceFromRun({
      runId: 'r',
      taskId: 't',
      trace: [
        { step: 1, kind: 'tool', toolCalls: [{ tool: 'browser-read', query: 'x', result: 'same' }] },
        { step: 2, kind: 'tool', toolCalls: [{ tool: 'browser-read', query: 'x', result: 'same' }] },
      ],
    })
    expect(records[1].repeated).toBe(true)
    expect(records[1].stagnant).toBe(true)
    expect(records[1].progressOutcome).toBe('stagnant')
  })

  it('is deterministic: same input yields identical records', () => {
    const input = {
      runId: 'r',
      taskId: 't',
      stepLog: [{ step: 1, type: 'tool', tool: 'write-file', result: 'ok', success: true }],
    }
    expect(evidenceFromRun(input)).toEqual(evidenceFromRun(input))
  })
})

describe('evidence ledger + provenance chain', () => {
  it('keeps records in-memory and summarizes them', () => {
    const ledger = createEvidenceLedger({ runId: 'r', taskId: 't', lane: 'study' })
    ledger.add(normalizeEvidenceRecord({ tool: 'read-file', status: EVIDENCE_STATUS.SUCCESS }))
    ledger.add(normalizeEvidenceRecord({ tool: 'write-file', status: EVIDENCE_STATUS.FAILED }))
    expect(ledger.records.length).toBe(2)
    expect(ledger.summary().failures).toBe(1)
  })

  it('links result -> evidence -> oracle -> report', () => {
    const chain = provenanceChain({
      result: { runId: 'r', taskId: 't', passed: true },
      evidence: [normalizeEvidenceRecord({ tool: 'write-file' })],
      oracle: { kind: 'world-state', independent: true, passed: true },
      report: { kind: 'abelinkbench-measurement-report', schemaVersion: 1 },
    })
    expect(chain.result.finalAnswerIsClaim).toBe(true)
    expect(chain.evidence.count).toBe(1)
    expect(chain.oracle.independent).toBe(true)
    expect(chain.report.kind).toBe('abelinkbench-measurement-report')
  })
})
