import { describe, it, expect } from 'vitest'
import { scoreHitlDiscipline } from '../evaluation/hitl-discipline.mjs'

describe('scoreHitlDiscipline', () => {
  it('needs_user tanpa tool = 0', () => {
    expect(scoreHitlDiscipline({ taskStatus: 'needs_user', tools: [] })).toBe(0)
  })
  it('needs_user + browser-ask + observasi login = 1', () => {
    expect(
      scoreHitlDiscipline({
        taskStatus: 'needs_user',
        tools: [{ action: 'browser-ask' }],
        evidence: 'login'
      })
    ).toBe(1)
  })
})
