import { describe, it, expect } from 'vitest'
import { getNativeToolsDefinition } from '../sidecar/main/node-tools.js'

describe('Human-in-the-Loop browser-ask tool', () => {
  const tools = getNativeToolsDefinition()

  it('tool browser-ask terdaftar di NATIVE_TOOLS', () => {
    expect(tools['browser-ask']).toBeDefined()
    expect(typeof tools['browser-ask'].handler).toBe('function')
  })

  it('browser-ask tidak memerlukan native approval dialog (rfd) karena bersifat non-destruktif', () => {
    expect(tools['browser-ask'].needsApproval).toBe(false)
  })

  it('mengembalikan status waiting_for_user dan needs_user dengan query alasan', async () => {
    const res = await tools['browser-ask'].handler('TradingView meminta login Google')
    expect(res.success).toBe(true)
    expect(res.waiting_for_user).toBe(true)
    expect(res.needs_user).toBe(true)
    expect(res.data).toContain('TradingView meminta login Google')
    expect(res.data).toContain('[BROWSER HUMAN-IN-THE-LOOP]')
  })

  it('fallback pesan default jika query kosong', async () => {
    const res = await tools['browser-ask'].handler('')
    expect(res.success).toBe(true)
    expect(res.waiting_for_user).toBe(true)
    expect(res.data).toContain('Membutuhkan interaksi langsung pengguna di browser')
  })
})
