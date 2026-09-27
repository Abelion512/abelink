import { describe, it, expect, vi } from 'vitest'
import {
  normalizeTelegramUpdate,
  sessionKeyForEvent,
  isAllowed,
  createTelegramGateway,
  resolveHeadlessTelegramEnabled,
} from '../sidecar/main/telegram/gateway.mjs'

const textUpdate = (over = {}) => ({
  message: {
    message_id: 7,
    date: 1700000000,
    chat: { id: 111, type: 'private' },
    from: { id: 111, username: 'bosz' },
    text: 'halo',
    ...over,
  },
})

describe('normalizeTelegramUpdate', () => {
  it('text private -> MessageEvent + session key', () => {
    const evt = normalizeTelegramUpdate(textUpdate())
    expect(evt).toMatchObject({
      platform: 'telegram',
      chatKind: 'private',
      chatId: '111',
      userId: '111',
      username: 'bosz',
      messageId: '7',
      text: 'halo',
    })
    expect(sessionKeyForEvent(evt)).toBe('agent:abelink:telegram:private:111')
  })

  it('photo + caption -> file kind photo', () => {
    const evt = normalizeTelegramUpdate(
      textUpdate({ photo: [{ file_id: 'a' }, { file_id: 'b' }], caption: 'jelaskan', text: undefined }),
    )
    expect(evt.file).toEqual({ kind: 'photo', fileId: 'b' })
    expect(evt.caption).toBe('jelaskan')
  })

  it('document -> file kind document + nama', () => {
    const evt = normalizeTelegramUpdate(
      textUpdate({ document: { file_id: 'd1', file_name: 'lap.pdf' }, text: undefined }),
    )
    expect(evt.file).toEqual({ kind: 'document', fileId: 'd1', name: 'lap.pdf' })
  })

  it('group chat -> chatKind group + session key group', () => {
    const evt = normalizeTelegramUpdate(
      textUpdate({ chat: { id: -5, type: 'group' } }),
    )
    expect(evt.chatKind).toBe('group')
    expect(sessionKeyForEvent(evt)).toBe('agent:abelink:telegram:group:-5')
  })

  it('non-message update -> null', () => {
    expect(normalizeTelegramUpdate({ callback_query: {} })).toBeNull()
    expect(normalizeTelegramUpdate({})).toBeNull()
  })
})

describe('allowlist matrix', () => {
  const evt = { userId: '111', username: 'bosz', chatId: '111' }
  it('numeric id lolos', () => {
    expect(isAllowed(evt, { adminSet: new Set(['111']) }).allowed).toBe(true)
  })
  it('@username lolos (tanpa @, case-insensitive)', () => {
    expect(isAllowed({ ...evt, userId: '999' }, { adminSet: new Set(['bosz']) }).allowed).toBe(true)
  })
  it('pending ditolak eksplisit', () => {
    expect(
      isAllowed(evt, { adminSet: new Set(['111']), pendingSet: new Set(['111']) }).reason,
    ).toBe('pending')
  })
  it('unknown -> deny default', () => {
    const r = isAllowed({ userId: 'x', username: '', chatId: 'x' }, { adminSet: new Set(['111']) })
    expect(r).toEqual({ allowed: false, reason: 'unknown' })
  })
  it('ALLOW_ALL env opsional', () => {
    expect(isAllowed({ userId: 'x', chatId: 'x' }, { allowAll: true }).reason).toBe('allow-all')
  })
})

const makeGw = (over = {}) => {
  const sent = []
  const sender = vi.fn(async () => ({ success: true }))
  const runAgent = vi.fn(async (evt) => ({ answer: `echo:${evt.text || evt.caption}` }))
  const gw = createTelegramGateway({
    tgAdminIds: '111,@bosz',
    runAgent,
    sender,
    ...over,
  })
  return { gw, sent, sender, runAgent }
}

describe('dedup + running-guard + offline', () => {
  it('msgId sama 2x -> satu reply', async () => {
    const { gw, runAgent } = makeGw()
    const u = textUpdate()
    expect((await gw.handleUpdate(u)).status).toBe('replied')
    expect((await gw.handleUpdate(u)).status).toBe('duplicate')
    expect(runAgent).toHaveBeenCalledTimes(1)
  })

  it('pesan kedua saat busy -> queued, tanpa double send', async () => {
    let release
    const gate = new Promise((r) => { release = r })
    const sender = vi.fn(async () => ({ success: true }))
    const runAgent = vi.fn(async (evt) => {
      if (evt.text === 'satu') await gate
      return { answer: evt.text }
    })
    const gw = createTelegramGateway({ tgAdminIds: '111', runAgent, sender })
    const first = gw.handleUpdate(textUpdate({ message_id: 1, text: 'satu' }))
    await vi.waitFor(() => expect(runAgent).toHaveBeenCalledTimes(1))
    const second = await gw.handleUpdate(textUpdate({ message_id: 2, text: 'dua' }))
    expect(second.status).toBe('queued')
    release()
    await first
    await vi.waitFor(() => expect(runAgent).toHaveBeenCalledTimes(2))
    expect(sender).toHaveBeenCalledTimes(2)
  })

  it('queue penuh -> busy + intervention ack, pesan dibuang jujur', async () => {
    let release
    const gate = new Promise((r) => { release = r })
    const sender = vi.fn(async () => ({ success: true }))
    const runAgent = vi.fn(async (evt) => {
      if (evt.text === 'satu') await gate
      return { answer: evt.text }
    })
    const gw = createTelegramGateway({ tgAdminIds: '111', runAgent, sender, queueCap: 1 })
    const first = gw.handleUpdate(textUpdate({ message_id: 1, text: 'satu' }))
    await vi.waitFor(() => expect(runAgent).toHaveBeenCalledTimes(1))
    expect((await gw.handleUpdate(textUpdate({ message_id: 2, text: 'dua' }))).status).toBe('queued')
    const busy = await gw.handleUpdate(textUpdate({ message_id: 3, text: 'tiga' }))
    expect(busy.status).toBe('busy')
    release()
    await first
    await vi.waitFor(() => expect(runAgent).toHaveBeenCalledTimes(2))
    // ack intervention + 2 reply
    expect(sender).toHaveBeenCalledTimes(3)
    expect(runAgent).not.toHaveBeenCalledWith(expect.objectContaining({ text: 'tiga' }))
  })

  it('sender gagal -> offline queue + flush jujur', async () => {
    const sender = vi.fn(async () => ({ success: false, error: 'Bot not connected.' }))
    const gw = createTelegramGateway({ tgAdminIds: '111', runAgent: async () => ({ answer: 'x' }), sender })
    const r = await gw.handleUpdate(textUpdate())
    expect(r.status).toBe('replied')
    expect(gw._state.offlineQueue).toHaveLength(1)
    sender.mockResolvedValueOnce({ success: true })
    const flushed = await gw.flushOffline()
    expect(flushed).toMatchObject({ sent: 1, pending: 0 })
  })
})

describe('gerbang headless (M0/B-6)', () => {
  it('default OFF: env kosong/nilai aneh tidak menyalakan jalur headless', () => {
    expect(resolveHeadlessTelegramEnabled({})).toBe(false)
    expect(resolveHeadlessTelegramEnabled({ ABELINK_TELEGRAM_HEADLESS: '' })).toBe(false)
    expect(resolveHeadlessTelegramEnabled({ ABELINK_TELEGRAM_HEADLESS: 'yes' })).toBe(false)
    expect(resolveHeadlessTelegramEnabled({ ABELINK_TELEGRAM_HEADLESS: '0' })).toBe(false)
  })

  it('hanya "1"/"true" (case-insensitive) yang menyalakan', () => {
    expect(resolveHeadlessTelegramEnabled({ ABELINK_TELEGRAM_HEADLESS: '1' })).toBe(true)
    expect(resolveHeadlessTelegramEnabled({ ABELINK_TELEGRAM_HEADLESS: 'TRUE' })).toBe(true)
  })

  it('tanpa runner -> balasan [SKIP] jujur, bukan "selesai" palsu', async () => {
    const sender = vi.fn(async () => ({ success: true }))
    const gw = createTelegramGateway({ tgAdminIds: '111', sender })
    await gw.handleUpdate(textUpdate())
    expect(sender).toHaveBeenCalledTimes(1)
    expect(sender.mock.calls[0][1]).toContain('[SKIP]')
  })
})

describe('approval relay', () => {
  it('meneruskan keyboard + jawaban', async () => {
    const asker = vi.fn(async () => 'Approve')
    const { gw } = makeGw({ asker })
    await expect(gw.requestApproval('111', 'lanjut?', ['Approve', 'Reject'], 1000)).resolves.toBe('Approve')
    expect(asker).toHaveBeenCalledWith('111', 'lanjut?', ['Approve', 'Reject'], 1000)
  })

  it('timeout -> null', async () => {
    const asker = vi.fn(async () => null)
    const { gw } = makeGw({ asker })
    await expect(gw.requestApproval('111', 'lanjut?', ['Approve'], 10)).resolves.toBeNull()
  })
})
