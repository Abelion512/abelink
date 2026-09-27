import { describe, expect, it } from 'vitest'
import { PROGRESS_OUTCOME, evaluateProgress, isFailure, isMalfunction, normalizeProgressKey } from '../src/api/ai/progressEvaluator.js'

describe('progressEvaluator', () => {
  it('treats improved verification as progress', () => {
    const result = evaluateProgress({
      previous: { tool: 'browser-read', query: 'tab', success: true, verificationState: 'partially_verified', observation: 'Page loaded' },
      current: { tool: 'browser-read', query: 'tab', success: true, verificationState: 'verified', observation: 'Submission confirmed' }
    })
    expect(result.outcome).toBe(PROGRESS_OUTCOME.PROGRESS)
    expect(result.verificationImproved).toBe(true)
  })

  it('does not call different tool with unchanged evidence progress', () => {
    const result = evaluateProgress({
      previous: { tool: 'grep-search', query: 'alpha', success: true, observation: 'no match' },
      current: { tool: 'read-file', query: 'src/a.js', success: true, observation: 'no match' }
    })
    expect(result.outcome).toBe(PROGRESS_OUTCOME.NEUTRAL)
    expect(result.newStrategy).toBe(true)
    expect(result.newEvidence).toBe(false)
  })

  it('detects identical evidence and strategy as stagnation', () => {
    const result = evaluateProgress({
      previous: { tool: 'browser-read', query: 'tab', success: true, observation: 'same page' },
      current: { tool: 'browser-read', query: 'tab', success: true, observation: 'same page' }
    })
    expect(result.outcome).toBe(PROGRESS_OUTCOME.STAGNANT)
  })

  it('normalizes trivial strategy variants', () => {
    expect(normalizeProgressKey('Grep-Search', '  Auth  ')).toBe(normalizeProgressKey('grep-search', 'auth'))
  })
})

describe('isFailure vs isMalfunction split', () => {
  it('human decisions are failures for governance but not breaker malfunctions', () => {
    for (const s of ['[DITOLAK] no', '[DITOLAK-HUMAN-LOOP] no', '[DIBATALKAN] x', '[BLOCKED] y', '[NO-RESULTS] kosong']) {
      expect(isFailure(s)).toBe(true)
      expect(isMalfunction(s)).toBe(false)
    }
  })

  it('true malfunctions trip both', () => {
    for (const s of ['[ERROR] boom', '[FORMAT SALAH] x', '[SEARCH-ERROR] y']) {
      expect(isFailure(s)).toBe(true)
      expect(isMalfunction(s)).toBe(true)
    }
  })
})
