// tests/web-approval.test.ts
import { describe, it, expect } from 'vitest'
import { decide } from '../webui-server/approval.ts'

describe('approval auto-default', () => {
  it('baca auto-allow, rm-rf deny, baru ask', () => {
    expect(decide({ kind: 'read', target: 'src/api/db.ts' })).toBe('allow')
    expect(decide({ kind: 'shell', target: 'rm -rf ~' })).toBe('deny')
    expect(decide({ kind: 'shell', target: 'cowsay halo' })).toBe('ask')
  })
})
