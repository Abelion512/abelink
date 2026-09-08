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
  sweepSessions,
  groupSession,
  getSessionGroups,
  deriveGroupName,
  setBrowserConfig,
  getBrowserConfig,
  extractUrl,
  normalizeMarkId,
  isWebScrapeCommand,
  looksLikeCrawlerSource,
  tokenOk,
  writeTokenFile,
  STATUS_ICON
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
    const r = resolveCommand(S, T(), 'id-tidak-ada', { ok: true, data: 'x' })
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

  it('groupSession membuat/memperbarui group task', async () => {
    dispatchCommand('test-session', 'read-dom', {})
    const cmd = await takeNext('test-session', ensureSession('test-session').token)
    const r = groupSession('test-session', { task: 'read-dom', status: 'acting', color: 1 })
    expect(r.ok).toBe(true)
    expect(r.group.status).toBe('acting')
    expect(r.group.color).toBe('blue')
    resolveCommand('test-session', ensureSession('test-session').token, cmd.id, { ok: true, data: 'ok' })
  })

  it('groupSession tanpa task error', async () => {
    const r = await groupSession('test-session', { status: 'acting' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('wajib')
  })

  it('deriveGroupName menghasilkan nama benar', () => {
    expect(deriveGroupName('acting', 'session-abc')).toMatch(/🖱️ \(acting\) — session-abc/)
    expect(deriveGroupName('idle', undefined)).toMatch(/🟢 \(idle\) — untitled/)
    expect(deriveGroupName('done', '')).toMatch(/✅ \(done\) — /)
  })

  it('STATUS_ICON konstanta lengkap', () => {
    expect(STATUS_ICON.loading).toBe('⏳')
    expect(STATUS_ICON.reading).toBe('📖')
    expect(STATUS_ICON.acting).toBe('🖱️')
    expect(STATUS_ICON.idle).toBe('🟢')
    expect(STATUS_ICON.done).toBe('✅')
    expect(STATUS_ICON.error).toBe('❌')
  })

  it('listSessions melaporkan grup', async () => {
    ensureSession('group-test')
    groupSession('group-test', { task: 'browse', status: 'acting', color: 1 })
    const listed = listSessions()
    const groups = listed.find((x) => x.id === 'group-test')?.groups
    expect(groups).toBeDefined()
    expect(groups?.['browse']?.status).toBe('acting')
    expect(groups?.['browse']?.color).toBe('blue')
    dropSession('group-test')
  })
})

describe('konfigurasi auto-close tab', () => {
  it('default mati (jangan tutup hasil kerja user)', () => {
    setBrowserConfig({})
    expect(getBrowserConfig().autoCloseTabs).toBe(false)
  })

  it('set true/false eksplisit, abaikan non-boolean', () => {
    expect(setBrowserConfig({ autoCloseTabs: true }).autoCloseTabs).toBe(true)
    expect(getBrowserConfig().autoCloseTabs).toBe(true)
    expect(setBrowserConfig({ autoCloseTabs: 'ya' }).autoCloseTabs).toBe(true)
    expect(setBrowserConfig({ autoCloseTabs: false }).autoCloseTabs).toBe(false)
  })
})

describe('sanitasi URL model', () => {
  it('markdown [label](url) -> URL bersih (kasus sesi nyata)', () => {
    expect(extractUrl('[https://claude.com/blog](https://claude.com/blog)')).toBe('https://claude.com/blog')
    expect(extractUrl('buka [blog Claude](https://claude.com/blog) dong')).toBe('https://claude.com/blog')
  })

  it('URL polos lolos, tanpa skema ditambah https, sampah ditolak', () => {
    expect(extractUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(extractUrl('claude.com/blog')).toBe('https://claude.com/blog')
    expect(extractUrl('bukan url sama sekali')).toBe('')
    expect(extractUrl('')).toBe('')
  })
})

describe('normalisasi ID elemen klik', () => {
  it('"3" -> "mk3", "mk3" tetap, "MK3" dilowercase', () => {
    expect(normalizeMarkId('3')).toBe('mk3')
    expect(normalizeMarkId('mk3')).toBe('mk3')
    expect(normalizeMarkId('MK3')).toBe('mk3')
    expect(normalizeMarkId(' mk12 ')).toBe('mk12')
  })
})

describe('pagar scrape run-shell', () => {
  it('pola spiral observasi nyata ditolak', () => {
    expect(isWebScrapeCommand(`curl -sL https://claude.com/blog | grep -i -oE '<h1>'`)).toBe(true)
    expect(isWebScrapeCommand(`curl -sL https://x.com | sed 's/<[^>]*>//g'`)).toBe(true)
    expect(isWebScrapeCommand(`python3 -c "import urllib.request; print(urllib.request.urlopen('https://x.com').read())"`)).toBe(true)
  })

  it('penggunaan shell sah tetap lolos', () => {
    expect(isWebScrapeCommand('curl http://localhost:8080/api/health')).toBe(false)
    expect(isWebScrapeCommand('curl -o /tmp/f.zip https://x.com/f.zip')).toBe(false)
    expect(isWebScrapeCommand('ls -la /tmp')).toBe(false)
    expect(isWebScrapeCommand('grep -r "foo" src/')).toBe(false)
  })

  it('heredoc crawler + file .py urllib ditolak', () => {
    expect(isWebScrapeCommand(`cat << 'EOF' > /tmp/x.py\nimport urllib.request\nprint(urllib.request.urlopen('https://x.com').read())\nEOF\npython3 /tmp/x.py`)).toBe(true)
    expect(looksLikeCrawlerSource(`import urllib.request, re\nhtml = urllib.request.urlopen('https://x.com').read()\nprint(re.findall(r'href="(.*?)"', html))`)).toBe(true)
    expect(looksLikeCrawlerSource(`import requests\nprint(requests.get('https://api.x.com/v1/data').json())`)).toBe(false)
    expect(looksLikeCrawlerSource(`print("halo dunia")`)).toBe(false)
  })
})

describe('rotasi token refresh-on-use', () => {
  it('file plaintext lawas diadopsi tanpa ganti token', async () => {
    const fs = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mark-tok-'))
    fs.writeFileSync(path.join(dir, 'browser-bridge-token'), 'tok-lama-123')
    const r = writeTokenFile(dir)
    expect(r.token).toBe('tok-lama-123')
    const rec = JSON.parse(fs.readFileSync(path.join(dir, 'browser-bridge-token'), 'utf8'))
    expect(rec.token).toBe('tok-lama-123')
    expect(typeof rec.createdAt).toBe('number')
    fs.rmSync(dir, { recursive: true, force: true })
    dropSession('default')
  })

  it('handshake segar: tanpa newToken; kedaluwarsa: rotasi + grace', async () => {
    const fs = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mark-tok-'))
    const saved = process.env.MARK_TOKEN_ROTATE_MS
    try {
      const w = writeTokenFile(dir)
      const fresh = handshake('default', w.token)
      expect(fresh.ok).toBe(true)
      expect(fresh.newToken).toBeUndefined()

      process.env.MARK_TOKEN_ROTATE_MS = '1'
      await new Promise((r) => setTimeout(r, 5))
      const rot = handshake('default', w.token)
      expect(rot.ok).toBe(true)
      expect(typeof rot.newToken).toBe('string')
      expect(rot.newToken).not.toBe(w.token)

      // Token lama masih diterima dalam masa grace.
      const s = getSession('default')
      expect(tokenOk(s, w.token)).toBe(true)
      expect(tokenOk(s, rot.newToken)).toBe(true)
      expect(tokenOk(s, 'salah')).toBe(false)

      // Grace habis -> token lama ditolak, baru diterima.
      s.prevExpiresAt = Date.now() - 1
      expect(tokenOk(s, w.token)).toBe(false)
      expect(tokenOk(s, rot.newToken)).toBe(true)
    } finally {
      if (saved === undefined) delete process.env.MARK_TOKEN_ROTATE_MS
      else process.env.MARK_TOKEN_ROTATE_MS = saved
      fs.rmSync(dir, { recursive: true, force: true })
      dropSession('default')
    }
  })
})
