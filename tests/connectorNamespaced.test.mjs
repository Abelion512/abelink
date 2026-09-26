import { describe, it, expect } from 'vitest'
import { parseConnectorNamespacedTool } from '../src/hooks/agent/plan/toolDispatcher.js'

// Rute 9b: <connector>:<aksi> langsung ke capabilities, tanpa fallback plugin.
// Latar: 'browser-extension:status' jatuh ke fallback plugin -> error
// "tidak dikenal" + dialog capabilities:execute yang membingungkan user.

describe('parseConnectorNamespacedTool', () => {
  it('mengenali browser-extension:status/guide-install/close-session', () => {
    expect(parseConnectorNamespacedTool('browser-extension:status')).toEqual({
      connectorId: 'browser-extension',
      actionId: 'status'
    })
    expect(parseConnectorNamespacedTool('browser-extension:guide-install')).toEqual({
      connectorId: 'browser-extension',
      actionId: 'guide-install'
    })
    expect(parseConnectorNamespacedTool('browser-extension:close-session')).toEqual({
      connectorId: 'browser-extension',
      actionId: 'close-session'
    })
  })

  it('menolak tool biasa, plugin, dan bentuk rusak', () => {
    for (const t of [
      'browser-navigate',
      'connector-run',
      'read-file',
      'plugin:foo',
      'weather:current',
      'browser-extension:',
      ':status',
      'browser-extension',
      'browser-extension:STATUS',
      '',
      null
    ]) {
      expect(parseConnectorNamespacedTool(t)).toBeNull()
    }
  })

  it('hanya browser-extension yang direct (pintu umum tetap connector-run)', () => {
    // fs/weather/time disebut eksplisit via connector-run agar schema/guide
    // + audit terpusat; rute direct tidak dibuka untuk mereka.
    expect(parseConnectorNamespacedTool('fs:read')).toBeNull()
    expect(parseConnectorNamespacedTool('time:now')).toBeNull()
  })
})
