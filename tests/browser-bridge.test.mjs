import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import {
  BROWSER_BRIDGE,
  ensureSession,
  getSession,
  dropSession,
  handshake,
  dispatchCommand,
  takeNext,
  resolveCommand,
  listSessions,
  sweepSessions
} from '../sidecar/main/browser/bridge-core.mjs'

const S = 'test-session'
// Token TIDAK di-cache lintas test: beforeEach membuat ulang sesi sehingga
// token lama menjadi tidak valid (drop+ensure = token baru).
const T = () => ensureSession(S).token

beforeEach(() => {
  // Pastikan session uji bersih di tiap kasus.
  dropSession(S)
  ensureSession(S)
})

afterAll(() => {
  dropSession(S)
})

describe('browser bridge core', () => {
  it('handshake menerima token benar dan menolak token salah', () => {
    const s = ensureSession('hs-test')
    expect(handshake('hs-test', s.token).ok).toBe(true)
    expect(handshake('hs-test', 'token-palsu').ok).toBe(false)
    expect(handshake('session-aneh', s.token).ok).toBe(false)
    dropSession('hs-test')
  })

  it('dispatchCommand -> takeNext menyerahkan perintah yang sama (id, type, payload)', async () => {
    const p = dispatchCommand(S, 'read-dom', {})
    const cmd = await takeNext(S, T())
    expect(cmd.type).toBe('read-dom')
    expect(cmd.payload).toEqual({})
    expect(typeof cmd.id).toBe('string')
    // Selesaikan dan pastikan promise dispatch resolve dengan hasilnya.
    const r = resolveCommand(S, T(), cmd.id, { ok: true, data: '{"elements":[]}' })
    expect(r.ok).toBe(true)
    await expect(p).resolves.toEqual({ ok: true, data: '{"elements":[]}', error: null })
  })

  it('takeNext tanpa perintah mengembalikan null setelah idle timeout', async () => {
    const orig = BROWSER_BRIDGE.POLL_TIMEOUT_MS
    BROWSER_BRIDGE.POLL_TIMEOUT_MS = 30
    const cmd = await takeNext(S, T())
    BROWSER_BRIDGE.POLL_TIMEOUT_MS = orig
    expect(cmd).toBeNull()
  })

  it('perintah yang tidak pernah dijawab melempar timeout eksplisit (bukan sukses palsu)', async () => {
    const orig = BROWSER_BRIDGE.COMMAND_TIMEOUT_MS
    BROWSER_BRIDGE.COMMAND_TIMEOUT_MS = 40
    await expect(dispatchCommand(S, 'act', { markId: 'mk1' })).rejects.toThrow(/kedaluwarsa/)
    BROWSER_BRIDGE.COMMAND_TIMEOUT_MS = orig
    // Antrean kembali bersih setelah timeout.
    expect(getSession(S).pending.length).toBe(0)
  })

  it('resolveCommand dengan commandId asing ditolak, bukan diam-diam sukses', () => {
    const r = resolveCommand(S, T, 'id-tidak-ada', { ok: true, data: 'x' })
    expect(r.ok).toBe(false)
  })

  it('resolveCommand dengan token salah ditolak', async () => {
    const p = dispatchCommand(S, 'read-dom', {})
    const cmd = await takeNext(S, T())
    const r = resolveCommand(S, 'token-palsu', cmd.id, { ok: true, data: 'x' })
    expect(r.ok).toBe(false)
    // Perintah masih bisa diselesaikan dengan token benar.
    expect(resolveCommand(S, T(), cmd.id, { ok: true, data: 'y' }).ok).toBe(true)
    await expect(p).resolves.toMatchObject({ ok: true, data: 'y' })
  })

  it('hasil lebih besar dari MAX_RESULT_CHARS dipotong dengan penanda', async () => {
    const orig = BROWSER_BRIDGE.MAX_RESULT_CHARS
    BROWSER_BRIDGE.MAX_RESULT_CHARS = 100
    const p = dispatchCommand(S, 'read-dom', {})
    const cmd = await takeNext(S, T())
    resolveCommand(S, T(), cmd.id, { ok: true, data: 'x'.repeat(500) })
    const res = await p
    BROWSER_BRIDGE.MAX_RESULT_CHARS = orig
    // Kontrak: isi dipotong ke MAX_RESULT_CHARS, lalu ditandai sufiks.
    expect(res.data.length).toBeLessThanOrEqual(100 + 20)
    expect(res.data.startsWith('x'.repeat(100))).toBe(true)
    expect(res.data.endsWith('[dipotong]')).toBe(true)
  })

  it('antrean penuh menolak perintah baru dengan error jelas', async () => {
    const orig = BROWSER_BRIDGE.MAX_QUEUE
    BROWSER_BRIDGE.MAX_QUEUE = 1
    const first = dispatchCommand(S, 'read-dom', {})
    await expect(dispatchCommand(S, 'read-dom', {})).rejects.toThrow(/penuh/)
    // Bersihkan: ambil dan selesaikan perintah pertama.
    const cmd = await takeNext(S, T())
    resolveCommand(S, T(), cmd.id, { ok: true, data: 'z' })
    await first
    BROWSER_BRIDGE.MAX_QUEUE = orig
  })

  it('dropSession menolak long-poll dan mengosongkan sesi', async () => {
    ensureSession('drop-test')
    const t2 = getSession('drop-test').token
    const poll = takeNext('drop-test', t2)
    dropSession('drop-test')
    await expect(poll).resolves.toBeNull()
    expect(getSession('drop-test')).toBeNull()
  })

  it('sweepSessions hanya menjatuhkan sesi mati (lastSeenAt tua, antrean kosong)', () => {
    ensureSession('sweep-dead')
    ensureSession('sweep-alive')
    const dead = getSession('sweep-dead')
    dead.lastSeenAt = Date.now() - BROWSER_BRIDGE.SESSION_TTL_MS - 1000
    const dropped = sweepSessions()
    expect(dropped).toContain('sweep-dead')
    expect(dropped).not.toContain('sweep-alive')
    expect(getSession('sweep-alive')).not.toBeNull()
    dropSession('sweep-dead')
    dropSession('sweep-alive')
  })

  it('listSessions melaporkan status koneksi berdasar lastSeenAt', () => {
    ensureSession('list-test')
    const s = getSession('list-test')
    s.lastSeenAt = Date.now()
    let listed = listSessions().find((x) => x.id === 'list-test')
    expect(listed.connected).toBe(true)
    s.lastSeenAt = Date.now() - BROWSER_BRIDGE.SESSION_TTL_MS - 1
    listed = listSessions().find((x) => x.id === 'list-test')
    expect(listed.connected).toBe(false)
    dropSession('list-test')
  })
})
