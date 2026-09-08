// Fase 1 pagar otonomi: self-terminate classifier + session circuit breaker.
import { describe, it, expect } from 'vitest'
import {
  classifyMainDecision,
  classifySubagentAnswer,
  INTENT,
  isSelfTerminateText,
  isExplicitSelfTerminate
} from '../src/api/ai/agentDecision.js'
import { createCircuitBreaker, isDestructive, SPIRAL_STOP_STREAK } from '../src/api/ai/circuitBreaker.js'

describe('self-terminate — explicit marker beats action (emergency brake)', () => {
  it('completion:self_terminate + action => SELF_TERMINATE, tool never runs', () => {
    const r = classifyMainDecision(
      { action: { tool: 'run-shell' }, completion: 'self_terminate', answer: 'Berhenti.' },
      { hasExecutedTools: true, missionActive: true }
    )
    expect(r.intent).toBe(INTENT.SELF_TERMINATE)
    expect(r.terminal).toBe(true)
  })
  it('task_status abort_mission => SELF_TERMINATE', () => {
    expect(
      isExplicitSelfTerminate({ task_status: 'abort_mission', action: null })
    ).toBe(true)
  })
  it('normal done is NOT self-terminate', () => {
    expect(isExplicitSelfTerminate({ task_status: 'done' })).toBe(false)
    expect(isSelfTerminateText('Masih saya kerjakan.')).toBe(false)
  })
})

describe('self-terminate — reported text during mission', () => {
  it('out-of-scope declaration => SELF_TERMINATE', () => {
    const r = classifyMainDecision(
      { action: null, answer: 'Ini di luar scope tugasku, aku menghentikan diri.' },
      { hasExecutedTools: true, missionActive: true }
    )
    expect(r.intent).toBe(INTENT.SELF_TERMINATE)
    expect(r.reason).toBe('self-terminate-reported')
  })
  it('frustration without stop language => NOT self-terminate', () => {
    const r = classifyMainDecision(
      { action: null, answer: 'Duh, gagal terus. Coba cara lain.' },
      { hasExecutedTools: true, missionActive: true }
    )
    expect(r.intent).not.toBe(INTENT.SELF_TERMINATE)
  })
  it('subagent explicit self-terminate => distinct terminal type', () => {
    const r = classifySubagentAnswer(
      { answer: 'Berhenti.', completion: 'self_terminate' },
      {}
    )
    expect(r.type).toBe('self_terminated')
  })
})

describe('circuit breaker — consecutive failures open the circuit', () => {
  it('opens after threshold, blocks destructive only', () => {
    const b = createCircuitBreaker({ threshold: 3 })
    b.record(true)
    b.record(false)
    b.record(false)
    expect(b.isOpen()).toBe(false)
    b.record(false)
    expect(b.isOpen()).toBe(true)
    expect(b.shouldBlock('run-shell')).toBe(true)
    expect(b.shouldBlock('delete-file')).toBe(true)
    expect(b.shouldBlock('read-file')).toBe(false)
    expect(b.shouldBlock('os:emergency-stop')).toBe(false)
  })
  it('success resets streak; non-boolean ignored (approval denial)', () => {
    const b = createCircuitBreaker({ threshold: 2 })
    b.record(false)
    b.record(null)
    b.record(true)
    expect(b.isOpen()).toBe(false)
    expect(b.failures()).toBe(0)
  })
  it('reset re-closes; new session starts closed', () => {
    const b = createCircuitBreaker({ threshold: 1 })
    b.record(false)
    expect(b.isOpen()).toBe(true)
    b.reset()
    expect(b.isOpen()).toBe(false)
    expect(createCircuitBreaker().isOpen()).toBe(false)
  })
  it('isDestructive covers os:* except emergency-stop', () => {
    expect(isDestructive('os:click')).toBe(true)
    expect(isDestructive('os:emergency-stop')).toBe(false)
    expect(isDestructive('read-file')).toBe(false)
  })
  it('spiral stop trips at streak, resets on success', () => {
    expect(SPIRAL_STOP_STREAK).toBeGreaterThan(5)
    const b = createCircuitBreaker()
    for (let i = 0; i < SPIRAL_STOP_STREAK - 1; i++) b.record(false)
    expect(b.shouldSpiralStop()).toBe(false)
    b.record(false)
    expect(b.shouldSpiralStop()).toBe(true)
    b.record(true)
    expect(b.shouldSpiralStop()).toBe(false)
  })
})
