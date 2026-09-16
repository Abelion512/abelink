import { describe, it, expect, beforeEach } from 'vitest'
import {
  playbookLookup,
  playbookRecord,
  playbookClear,
  configKeyFor,
  PLAYBOOK_MAX_ENTRIES,
} from '../src/api/ai/playbooks.js'

beforeEach(() => playbookClear())

describe('playbooks — low-effort deterministic replay', () => {
  it('exact hit returns cached answer', () => {
    playbookRecord({ prompt: 'status server?', configKey: 'custom|m|e', answer: 'OK', taskStatus: 'done' })
    const hit = playbookLookup({ prompt: 'status server?', configKey: 'custom|m|e' })
    expect(hit?.answer).toBe('OK')
  })

  it('miss on different prompt or different config', () => {
    playbookRecord({ prompt: 'a', configKey: 'k', answer: 'A' })
    expect(playbookLookup({ prompt: 'b', configKey: 'k' })).toBeNull()
    expect(playbookLookup({ prompt: 'a', configKey: 'other' })).toBeNull()
    expect(playbookLookup({ prompt: 'a ' /* trailing space */, configKey: 'k' })).toBeNull()
  })

  it('cap eviction drops oldest, keeps newest', () => {
    for (let i = 0; i < PLAYBOOK_MAX_ENTRIES + 5; i++) {
      playbookRecord({ prompt: `p${i}`, configKey: 'k', answer: `a${i}` })
    }
    expect(playbookLookup({ prompt: 'p0', configKey: 'k' })).toBeNull()
    expect(playbookLookup({ prompt: `p${PLAYBOOK_MAX_ENTRIES + 4}`, configKey: 'k' })?.answer).toBe(
      `a${PLAYBOOK_MAX_ENTRIES + 4}`
    )
  })

  it('configKeyFor distinguishes provider/model/endpoint', () => {
    const a = configKeyFor({ aiProvider: 'custom', customModel: 'm', customEndpoint: 'e' })
    const b = configKeyFor({ aiProvider: 'custom', customModel: 'm2', customEndpoint: 'e' })
    expect(a).not.toBe(b)
  })
})
