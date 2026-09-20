import { describe, expect, it } from 'vitest'
import { buildTrajectoryLearningPack, formatTrajectoryLearningPack } from '../src/api/ai/trajectoryLearning.js'

describe('trajectoryLearning', () => {
  it('separates successful evidence from failed diagnostics', () => {
    const pack = buildTrajectoryLearningPack({
      objective: 'Research API behavior',
      verificationState: 'verified',
      outcome: 'completed',
      executedTools: [
        { tool: 'browser-read', query: 'docs', status: 'done', fullResult: 'Endpoint returns JSON.' },
        { tool: 'browser-read', query: 'missing', status: 'failed', fullResult: '[ERROR] 404 not found' }
      ]
    })
    expect(pack.successfulSteps).toHaveLength(1)
    expect(pack.recentFailures).toHaveLength(1)
    expect(pack.successfulSteps[0].observation).toContain('Endpoint returns JSON')
    expect(pack.recentFailures[0].observation).toContain('404')
  })

  it('treats final answer as a claim, not evidence', () => {
    const text = formatTrajectoryLearningPack(buildTrajectoryLearningPack({ finalAnswer: 'Everything worked' }))
    expect(text).toContain('Final answer (claim only)')
    expect(text).toContain('Model-only claims and unverified failures are not proof.')
  })

  it('bounds objective and observation sizes', () => {
    const pack = buildTrajectoryLearningPack({
      objective: 'x'.repeat(5000),
      executedTools: [{ tool: 'run-shell', query: 'test', fullResult: 'x'.repeat(5000) }]
    })
    expect(pack.objective.length).toBeLessThanOrEqual(1200)
    expect(pack.successfulSteps[0].observation.length).toBeLessThanOrEqual(800)
  })
})
