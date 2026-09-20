import { describe, expect, it } from 'vitest'
import { PROGRESS_OUTCOME, evaluateProgress, normalizeProgressKey } from '../src/api/ai/progressEvaluator.js'

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
