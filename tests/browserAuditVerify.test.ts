// Verifikasi audit koneksi extension<->bridge (2026-09-26).
// Setiap test memetakan ke satu klaim audit (RC1..RC4) + stress test.
// Hasil yang diharapkan: klaim benar -> test MENEGUHKAN; klaim salah ->
// test MENDEGRADASI klaimnya (hasil aktual dicatat di session log).
//
// Hermetik: port uji sendiri (49798), XDG_DATA_HOME diarahkan ke tmp agar
// seeding token sesi 'default' tidak menyentuh file prod user.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import {
  BROWSER_BRIDGE,
  ensureSession,
  getSession,
  dispatchCommand,
  dropSession,
  sweepSessions,
  listSessions,
  handshake,
  tokenOk,
  writeTokenFile,
} from '../sidecar/main/browser/bridge-core.ts'
import { startBrowserBridge, stopBrowserBridge } from '../sidecar/main/browser/server.ts'
import { tryExtensionReadDomForTest } from '../sidecar/main/tools/browserTools.ts'

const TEST_PORT = 49798
const S = 'audit-verify'
let tmpXdg
let savedPort
let savedPollTimeout

const get = async (p) => {
  const res = await fetch(`http://127.0.0.1:${BROWSER_BRIDGE.PORT}/abelink-bridge${p}`, {
    headers: { connection: 'close' },
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}
const post = async (p, payload) => {
  const res = await fetch(`http://127.0.0.1:${BROWSER_BRIDGE.PORT}/abelink-bridge${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', connection: 'close' },
    body: JSON.stringify(payload),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

beforeAll(async () => {
  tmpXdg = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-audit-'))
  process.env.XDG_DATA_HOME = tmpXdg // seeding token 'default' kini hermetik
  savedPort = BROWSER_BRIDGE.PORT
  savedPollTimeout = BROWSER_BRIDGE.POLL_TIMEOUT_MS
  BROWSER_BRIDGE.PORT = TEST_PORT
  BROWSER_BRIDGE.POLL_TIMEOUT_MS = 150
  const rec = writeTokenFile(`${tmpXdg}/abelink`, 'prod', {})
  globalThis.__fileToken = rec.token // token yang akan extension "pegang"
  const r = await startBrowserBridge()
  if (!r.ok) throw new Error(`bridge gagal start di port uji: ${r.error}`)
})

afterAll(async () => {
  for (const id of listSessions().map((s) => s.id)) dropSession(id)
  stopBrowserBridge()
  BROWSER_BRIDGE.PORT = savedPort
  BROWSER_BRIDGE.POLL_TIMEOUT_MS = savedPollTimeout
  delete process.env.XDG_DATA_HOME
  // Perbaikan efek samping: startBrowserBridge memasang native host dengan
  // dataHome TMP (env uji) ke configHome ASLI -> manifest Chrome sempat
  // menunjuk ke path tmp. Install ulang dengan env asli agar manifest
  // kembali menunjuk ke data home prod yang benar.
  try {
    const { ensureNativeHost } = await import('../sidecar/main/browser/native-host.ts')
    await ensureNativeHost({ flavor: 'prod' })
  } catch {}
  try {
    fs.rmSync(tmpXdg, { recursive: true, force: true })
  } catch {}
})

// ---------------------------------------------------------------------------
// RC1 — MV3 idle + sweep 60s + fail-fast TTL
// ---------------------------------------------------------------------------
describe('RC1: sweep, fail-fast, dan pemulihan 401', () => {
  it('RC1-A sesi stale (>TTL) + dispatch -> ditolak fail-fast "terputus"', async () => {
    const s = ensureSession('audit-rc1a')
    s.lastSeenAt = Date.now() - BROWSER_BRIDGE.SESSION_TTL_MS - 1000
    await expect(dispatchCommand('audit-rc1a', 'read-dom', {})).rejects.toThrow(/terputus/)
    dropSession('audit-rc1a')
  })

  it('RC1-B sweep menghapus sesi stale, TAPI dispatch sesudahnya tidak error: perintah tetap diantre dan tersaji (self-heal)', async () => {
    // Klaim lama yang diuji: "sweep -> perintah berikutnya gagal 401 sesi tak dikenal".
    const s = ensureSession('audit-rc1b')
    s.lastSeenAt = Date.now() - BROWSER_BRIDGE.SESSION_TTL_MS - 1000
    expect(sweepSessions()).toContain('audit-rc1b') // sweep menghapus
    expect(getSession('audit-rc1b')).toBeNull()
    // Perintah datang setelah sweep:
    const pending = dispatchCommand('audit-rc1b', 'read-dom', {}) // recreate (lastSeenAt=0, tanpa fail-fast)
    const polled = await get(`/poll?session=audit-rc1b&token=${getSession('audit-rc1b').token}`)
    expect(polled.status).toBe(200)
    expect(polled.body.command.type).toBe('read-dom')
    await post(`/result?session=audit-rc1b&token=${getSession('audit-rc1b').token}`, {
      commandId: polled.body.command.id,
      ok: true,
      data: '{}',
    })
    await expect(pending).resolves.toMatchObject({ ok: true })
    dropSession('audit-rc1b')
  })

  it('RC1-C ras 401 extension-view: poll sesi yang di-sweep -> 401; handshake token FILE -> pulih; perintah selama outage tersaji', async () => {
    // Extension memegang token file (prod nyata: token berasal dari file).
    const fileToken = globalThis.__fileToken
    ensureSession('default') // seed dari file -> token = fileToken
    expect(getSession('default').token).toBe(fileToken)
    // Sesi ter-sweep (mis. idle + sweep 60s):
    dropSession('default')
    // Extension poll dengan token lamanya -> 401 (sesi tak dikenal):
    const p1 = await get(`/poll?session=default&token=${fileToken}`)
    expect(p1.status).toBe(401)
    // Pemulihan jalur handshake (yang dilakukan tryAutoResume):
    const h = await get(`/handshake?session=default&token=${fileToken}`)
    expect(h.status).toBe(200) // ensureSession reseed token dari file -> cocok lagi
    // Perintah yang di-dispatch SELAMA outage tidak hilang:
    const pending = dispatchCommand('default', 'read-dom', {})
    const p2 = await get(`/poll?session=default&token=${fileToken}`)
    expect(p2.status).toBe(200)
    expect(p2.body.command.type).toBe('read-dom')
    await post(`/result?session=default&token=${fileToken}`, {
      commandId: p2.body.command.id,
      ok: true,
      data: '{}',
    })
    await expect(pending).resolves.toMatchObject({ ok: true })
    dropSession('default')
  })

  it('RC1-D TTL fail-fast = 5 menit; tanpa extension, perintah pertama setelah idle > TTL gagal sebelum sweep sempat jalan', () => {
    expect(BROWSER_BRIDGE.SESSION_TTL_MS).toBe(5 * 60 * 1000)
    // (batas platform MV3 alarm min ~1 menit TIDAK bisa diverifikasi di repo
    //  — dicatat sebagai asumsi platform, bukan fakta repo.)
  })
})

// ---------------------------------------------------------------------------
// RC2 — isolasi token sesi + fallback tool-layer
// ---------------------------------------------------------------------------
describe('RC2: sesi non-default', () => {
  it('RC2-A JEBAKAAN LATEN: token sesi non-default acak, tak pernah bisa dilayani extension yang poll default (jalur CHANNEL)', () => {
    const def = ensureSession('default')
    const sub = ensureSession('audit-rc2-sub')
    expect(sub.token).not.toBe(def.token)
    expect(sub.token).not.toBe(globalThis.__fileToken)
    // Konsekuensi: dispatch ke 'audit-rc2-sub' via channel browser:* tidak
    // akan PERNAH diambil extension (antre per-sesi, tanpa drain lintas).
    dropSession('audit-rc2-sub')
  })

  it('RC2-B KOREKSI KLAIM AUDIT: tool-layer punya fallback lintas sesi -> perintah sub-agent diteruskan ke sesi connected (default)', async () => {
    const seen = []
    const fakeDispatch = async (sessionId, type) => {
      seen.push({ sessionId, type })
      return { ok: true, data: '{"elements":[]}' }
    }
    const fakeCore = {
      listSessions: () => [
        { id: 'subagent-xyz', connected: false },
        { id: 'default', connected: true },
      ],
      dispatchCommand: fakeDispatch,
      getLastUrl: () => null,
    }
    const ext = await tryExtensionReadDomForTest('subagent-xyz', {
      core: fakeCore,
      ensureExtensionUp: async () => null,
      dispatchCommand: fakeDispatch,
    })
    expect(ext).not.toBeNull()
    expect(seen[0].sessionId).toBe('default') // fallback jalan, BUKAN sesi mati sub-agent
  })
})

// ---------------------------------------------------------------------------
// RC4 — origin pin
// ---------------------------------------------------------------------------
describe('RC4: origin pin menolak ID extension lain — termasuk build unpacked yang sah', () => {
  it('RC4-A token VALID + origin chrome-extension://<id-lain> -> 403 tetap', async () => {
    const s = ensureSession(S)
    const res = await fetch(
      `http://127.0.0.1:${BROWSER_BRIDGE.PORT}/abelink-bridge/handshake?session=${S}&token=${s.token}`,
      { headers: { Origin: 'chrome-extension://unpackeddevideexampleaaaa' } }
    )
    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// Stress — sifat core di bawah beban (bukan klaim audit, tapi kesehatan)
// ---------------------------------------------------------------------------
describe('STRESS: core bridge di bawah beban', () => {
  it('S1 30 round-trip berurutan ala extension nyata (drain kontinu): FIFO utuh, semua ok', async () => {
    const s = ensureSession('audit-stress')
    const N = 30
    const t0 = Date.now()
    for (let i = 0; i < N; i++) {
      const pending = dispatchCommand('audit-stress', 'read-dom', { i })
      const r = await get(`/poll?session=audit-stress&token=${s.token}`)
      const cmd = r.body?.command
      expect(cmd?.payload?.i).toBe(i) // FIFO utuh, tak ada yang hilang
      await post(`/result?session=audit-stress&token=${s.token}`, {
        commandId: cmd.id,
        ok: true,
        data: JSON.stringify({ i }),
      })
      const res = await pending
      expect((res as any).ok).toBe(true)
    }
    const ms = Date.now() - t0
    console.log(`[stress] ${N} round-trip = ${ms}ms (rata ${(ms / N).toFixed(1)}ms)`)
    dropSession('audit-stress')
  }, 30000)

  it('S1b burst 30 dispatch tanpa drain: hanya MAX_QUEUE (16) terbuffer, sisanya ditolak keras — batas desain, bukan kebocoran', async () => {
    ensureSession('audit-burst')
    const outcomes = []
    for (let i = 0; i < 30; i++) {
      outcomes.push(dispatchCommand('audit-burst', 'read-dom', { i }).then(
        () => null,
        (e) => String(e?.message || e)
      ))
    }
    dropSession('audit-burst') // 16 resolver tersisa di-reject jujur oleh dropSession, sebelum await
    const res = await Promise.all(outcomes)
    const full = res.filter((m) => m && /penuh/.test(m))
    expect(full).toHaveLength(30 - BROWSER_BRIDGE.MAX_QUEUE) // 14 ditolak keras saat burst
    // 16 yang terbuffer di-reject jujur saat sesi di-drop (di produksi:
    // 'kedaluwarsa' setelah COMMAND_TIMEOUT 90s tanpa konsumen). Tidak ada
    // jalur di mana perintah burst dianggap sukses diam-diam.
    expect(res.filter((m) => m && /ditutup sebelum/.test(m))).toHaveLength(BROWSER_BRIDGE.MAX_QUEUE)
  })

  it('S2 backpressure: antrean penuh (MAX_QUEUE 16) -> perintah ke-17 ditolak jujur', async () => {
    ensureSession('audit-bp')
    for (let i = 0; i < BROWSER_BRIDGE.MAX_QUEUE; i++) {
      // catch di tempat agar cleanup dropSession tidak jadi unhandled rejection
      dispatchCommand('audit-bp', 'read-dom', { i }).catch(() => {})
    }
    await expect(dispatchCommand('audit-bp', 'read-dom', { overflow: true })).rejects.toThrow(/penuh/)
    dropSession('audit-bp')
  })

  it('S3 rotasi token: handshake token aktif -> newToken; token lama dalam grace masih diterima', () => {
    process.env.ABELINK_TOKEN_ROTATE_MS = '1' // paksa rotasi di handshake berikut
    const s = ensureSession('audit-rotate')
    const oldToken = s.token
    s.tokenCreatedAt = Date.now() - 10
    const h = handshake('audit-rotate', oldToken)
    expect(h.ok).toBe(true)
    expect(h.newToken).toBeTruthy()
    expect(tokenOk(getSession('audit-rotate'), oldToken)).toBe(true) // grace 24h
    expect(tokenOk(getSession('audit-rotate'), 'garbage')).toBe(false)
    delete process.env.ABELINK_TOKEN_ROTATE_MS
    dropSession('audit-rotate')
  })
})

// ---------------------------------------------------------------------------
// RC3 — latch startError (FIX 2026-09-27): dulu EADDRINUSE sekali membuat
// startError PERMANEN (port bebas pun start tidak dicoba lagi). Kini
// startError hanyalah deskripsi kegagalan terakhir: attempt berikutnya selalu
// mencoba ulang, stopBrowserBridge() me-reset, dan start selalu Promise.
// Dijalankan di PROSES TERPISAH agar tidak menyentuh modul server milik file
// test ini (pola lama dipertahankan).
// ---------------------------------------------------------------------------
describe('RC3: startError tidak lagi latch (anti-latch + stop-reset)', () => {
  it('RC3-A matriks lifecycle di proses child: gagal EADDRINUSE -> pulih saat port bebas -> idempoten -> stop-reset -> pulih lagi', () => {
    const script = `
      import http from 'node:http'
      const { startBrowserBridge, stopBrowserBridge, bridgeReady } = await import(${JSON.stringify(
        pathToFileURL(path.resolve('sidecar/main/browser/server.ts')).href
      )})
      const PORT = ${TEST_PORT - 1}
      // Fase 1: port diblokir -> start gagal EADDRINUSE.
      const blocker = http.createServer(() => {}).listen(PORT, '127.0.0.1')
      await new Promise((r) => blocker.once('listening', r))
      const r1 = await startBrowserBridge()
      // Fase 2: port dibebaskan -> start BERIKUTNYA harus benar-benar mencoba
      // ulang dan sukses (dulu: latch error lama, ok:false permanen).
      await new Promise((r) => blocker.close(r))
      const r2 = await startBrowserBridge()
      // Fase 3: start saat listening -> idempoten sukses (bukan error).
      const r3 = await startBrowserBridge()
      const readyWhenListening = bridgeReady()
      // Fase 4: stop -> start -> pulih lagi (stop reset state bersih).
      stopBrowserBridge()
      const readyAfterStop = bridgeReady()
      const r4 = await startBrowserBridge()
      // Fase 5: gagal -> stop -> start (bukti stop-reset: dulu startError
      // permanen bahkan setelah stop).
      stopBrowserBridge()
      const blocker2 = http.createServer(() => {}).listen(PORT, '127.0.0.1')
      await new Promise((r) => blocker2.once('listening', r))
      const r5 = await startBrowserBridge()
      stopBrowserBridge() // stop SAAT GAGAL = reset latch
      await new Promise((r) => blocker2.close(r))
      const r6 = await startBrowserBridge()
      console.log(JSON.stringify({
        firstFailedWithInuse: !r1.ok && /sudah dipakai/.test(r1.error || ''),
        recoversWhenPortFree: !!r2.ok,                       // anti-latch inti
        idempotent: !!r3.ok,                                 // start 2x saat hidup
        readyWhenListening,
        readyAfterStop,
        recoversAfterStopRestart: !!r4.ok,
        failedAgainWhenBusy: !r5.ok,
        recoversAfterFailThenStop: !!r6.ok,                  // stop-reset inti
      }))
      process.exit(0)
    `
    const tmp = path.join(os.tmpdir(), `abelink-rc3-${Date.now()}.mjs`)
    fs.writeFileSync(tmp, script)
    try {
      const out = execFileSync(process.execPath, [tmp], {
        env: { ...process.env, ABELINK_BRIDGE_PORT: String(TEST_PORT - 1) },
        encoding: 'utf8',
        timeout: 30000,
      })
      const line = out.trim().split('\n').filter((l) => l.startsWith('{')).pop()
      const result = JSON.parse(line)
      expect(result.firstFailedWithInuse).toBe(true)
      expect(result.recoversWhenPortFree).toBe(true) // dulu: false (latch)
      expect(result.idempotent).toBe(true)
      expect(result.readyWhenListening).toBe(true)
      expect(result.readyAfterStop).toBe(false)
      expect(result.recoversAfterStopRestart).toBe(true)
      expect(result.failedAgainWhenBusy).toBe(true)
      expect(result.recoversAfterFailThenStop).toBe(true) // dulu: false (latch)
    } finally {
      fs.rmSync(tmp, { force: true })
    }
  }, 45000)

  it('RC3-B startBrowserBridge selalu mengembalikan Promise (kontrak pemanggil .catch() di engine channel)', async () => {
    // Bridge sedang listening di file ini -> jalur "sudah hidup". Dulu jalur
    // ini mengembalikan object polos; engine/channels/browser.mjs memanggil
    // .catch() atas hasilnya -> TypeError laten di jalur sync lama.
    const r = startBrowserBridge()
    expect(r).toBeInstanceOf(Promise)
    await expect(r).resolves.toMatchObject({ ok: true })
  })
})
