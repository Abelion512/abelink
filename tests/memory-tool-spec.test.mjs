import { describe, it, expect } from 'vitest'
import { MEMORY_TOOL_SPEC, validateMemoryOp } from '../src/api/ai/memoryTool.js'

describe('MEMORY_TOOL_SPEC', () => {
  it('punya shape kanonis', () => {
    expect(MEMORY_TOOL_SPEC.name).toBe('memory')
    expect(MEMORY_TOOL_SPEC.actions).toEqual(['add', 'replace', 'remove', 'batch'])
    expect(MEMORY_TOOL_SPEC.perTurnFailureCap).toBe(3)
    expect(MEMORY_TOOL_SPEC.terminalSuccess).toBe(true)
  })
})

describe('validateMemoryOp', () => {
  it('add valid', () => {
    expect(validateMemoryOp({ action: 'add', target: 'memory', new_text: 'x' }).ok).toBe(true)
  })

  it('replace butuh old_text + new_text', () => {
    expect(validateMemoryOp({ action: 'replace', target: 'user', new_text: 'x' }).ok).toBe(false)
    expect(validateMemoryOp({ action: 'replace', target: 'user', old_text: 'a', new_text: 'x' }).ok).toBe(true)
  })

  it('remove butuh old_text', () => {
    expect(validateMemoryOp({ action: 'remove', target: 'memory' }).ok).toBe(false)
    expect(validateMemoryOp({ action: 'remove', target: 'memory', old_text: 'a' }).ok).toBe(true)
  })

  it('batch butuh operations non-kosong yang valid', () => {
    const good = validateMemoryOp({ action: 'batch', target: 'memory', operations: [{ action: 'add', target: 'memory', new_text: 'x' }] })
    expect(good.ok).toBe(true)
    expect(validateMemoryOp({ action: 'batch', target: 'memory', operations: [] }).ok).toBe(false)
    expect(validateMemoryOp({ action: 'batch', target: 'memory' }).ok).toBe(false)
  })

  it('menolak action/target tak dikenal', () => {
    expect(validateMemoryOp({ action: 'nope', target: 'memory' }).ok).toBe(false)
    expect(validateMemoryOp({ action: 'add', target: 'nope', new_text: 'x' }).ok).toBe(false)
  })
})
