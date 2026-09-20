// Tests: start/stop lifecycle Telegram (connect-lalu-putus regression).
// Kasus asal: token+admin dimasukkan, status sempat connected lalu kembali
// disconnected — penyebabnya launch fire-and-forget + stop permanen pada
// error polling sesaat.
//
// Catatan: test fast-fail memakai network (getMe ke api.telegram.org dengan
// token invalid -> 401 cepat). Bila offline, test ini skip otomatis.

import { describe, it, expect } from 'vitest'
import {
  startTelegramBot,
  stopTelegramBot,
  getConnectionStatus,
  sendAgentExecutionDone
} from '../sidecar/main/telegram/telegram-service.js'

const online = async () => {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 5000)
    await fetch('https://api.telegram.org', { method: 'HEAD', signal: ctrl.signal })
    clearTimeout(t)
    return true
  } catch {
    return false
  }
}

describe('telegram start/stop lifecycle', () => {
  it('token invalid -> gagal bersih + status akhir disconnected', async () => {
    if (!(await online())) return
    const r = await startTelegramBot('123456:INVALID_TOKEN_FOR_TEST', null)
    expect(r?.success).toBe(false)
    expect(getConnectionStatus().status).toBe('disconnected')
  }, 60000)

  it('stop idempoten dari kondisi mati', () => {
    stopTelegramBot()
    stopTelegramBot()
    expect(getConnectionStatus().status).toBe('disconnected')
  })

  it('token kosong -> disconnected tanpa throw', async () => {
    await startTelegramBot('   ', null)
    expect(getConnectionStatus().status).toBe('disconnected')
  })

  it('eksekusi sama (msgId sama) hanya dibalas sekali', async () => {
    const data = { chatId: '1', result: { answer: 'ok' }, msgId: 'dup-1' }
    const first = await sendAgentExecutionDone(data)
    const second = await sendAgentExecutionDone(data)
    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    expect(second.deduped).toBe(true)
  })
})