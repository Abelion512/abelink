import { describe, it, expect } from 'vitest'
import { checkApprovalByMode } from '../src/renderer/src/api/ai/approval-modes.js'

describe('checkApprovalByMode', () => {
  it('bypass never needs approval', () => {
    expect(checkApprovalByMode('bypass', 'delete-file').needsApproval).toBe(false)
  })

  it('plan mode blocks write tools', () => {
    const r = checkApprovalByMode('plan', 'write-file')
    expect(r.blocked).toBe(true)
  })

  it('plan mode allows reads', () => {
    expect(checkApprovalByMode('plan', 'read-file').needsApproval).toBe(false)
  })

  it('selective: low risk auto, high risk ask', () => {
    expect(checkApprovalByMode('selective', 'read-file').needsApproval).toBe(false)
    expect(checkApprovalByMode('selective', 'delete-file').needsApproval).toBe(true)
  })

  it('strict asks for everything', () => {
    expect(checkApprovalByMode('strict', 'memory-search').needsApproval).toBe(true)
  })
})
