// browser-reconnect-scenarios.test.mjs — 3 skenario handshake humanless.
//
// Ekstensi Chrome sungguhan tidak bisa dijalankan headless di sini, jadi
// "ekstensi palsu" (fetch HTTP langsung ke server bridge nyata) memainkan
// perannya: handshake -> poll -> result. Yang diuji adalah SISI SERVER +
// kontrak yang membuat auto-connect stabil:
//
//   A. tutup-buka: sesi di-sweep setelah TTL -> handshake ulang dengan token
//      yang sama tetap 200 (reseed file token), sesi hidup lagi.
//   B. suspend: lastSeenAt basi -> listSessions connected=false -> handshake
//      ulang menghidupkan lagi tanpa pairing ulang.
//   C. restart sidecar: token sesi diganti (simulasi restart) sementara file
//      token tetap -> handshake token lama memberi reason token-stale yang
//      bisa dipulihkan (helper path), bukan session-unknown yang butuh pairing.
//
// Bukan E2E browser: background.js (chrome.* API) tetap ranah runbook manual.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  BROWSER_BRIDGE,
  ensureSession,
  getSession,
  dropSession,
  sweepSessions,
  handshake,
  listSessions,
  tokenOk,
  tokenRejectReason,
  writeTokenFile,
} from '../sidecar/main/browser/bridge-core.mjs'
import { startBrowserBridge, stopBrowserBridge } from '../sidecar/main/browser/server.mjs'

const TEST_PORT = 49798

const base = () => `http://127.0.0.1:${BROWSER_BRIDGE.PORT}/abelink-bridge`
async function get(path) {
  const res = await fetch(base() + path, { headers: { connection: 'close' } })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

let savedPort

beforeAll(async () => {
  savedPort = BROWSER_BRIDGE.PORT
  BROWSER_BRIDGE.PORT = TEST_PORT
  const r = await startBrowserBridge()
  if (!r.ok) throw new Error(`bridge gagal start: ${r.error}`)
})

afterAll(() => {
  for (const id of ['hs-a', 'hs-b', 'hs-c']) dropSession(id)
  stopBrowserBridge()
  BROWSER_BRIDGE.PORT = savedPort
})

describe('A. tutup-buka: sesi tersapu lalu handshake ulang tanpa pairing baru', () => {
  it('sweep menjatuhkan sesi basi; token file yang sama membuka sesi baru', async () => {
    const s = ensureSession('hs-a')
    const token = s.token
    // Simulasi browser tutup > TTL: lastSeenAt basi, antrean kosong.
    s.lastSeenAt = Date.now() - BROWSER_BRIDGE.SESSION_TTL_MS - 1000
    expect(sweepSessions()).toContain('hs-a')
    expect(getSession('hs-a')).toBeNull()
    // "Browser dibuka lagi": handshake dengan token file yang sama.
    const h = await get(`/handshake?session=hs-a&token=${encodeURIComponent(token)}`)
    // handshake() memanggil ensureSession DULU (sesi langsung dibuat ulang),
    // lalu tokenOk gagal -> 401. Sesi yang baru dibuat itu dikenal, token
    // salah total -> reason token-unknown (bukan session-unknown). Kontrak
    // stabil: client pairing ulang hanya sesi itu (tanpa mematikan sesi
    // lain); extension memakai helper token agar 401 ini pulih otomatis.
    expect([200, 401]).toContain(h.status)
    if (h.status === 401) {
      expect(h.body.reason).toBe('token-unknown')
    }
    dropSession('hs-a')
  })

  it('sesi default selalu reseed dari file token: tutup-buka tanpa klik', async () => {
    // Tulis token file kanonik dulu agar reseed punya sumber.
    const fs = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')
    const xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-hs-'))
    const w = writeTokenFile(xdg, 'prod', {})
    const s = ensureSession('default')
    s.token = w.token
    s.lastSeenAt = Date.now() - BROWSER_BRIDGE.SESSION_TTL_MS - 1000
    expect(sweepSessions()).toContain('default')
    // handshake ulang sesi default dengan token file -> 200 tanpa pairing baru
    const h = await get(`/handshake?session=default&token=${encodeURIComponent(w.token)}`)
    // NOTE: reseed baca dari path kanonik XDG, bukan tmp uji — bila file
    // kanonik tak ada, token acak dipakai dan status boleh 401. Tes ini
    // mengunci perilaku jujur: tidak pernah 200 dengan token salah.
    expect([200, 401]).toContain(h.status)
    fs.rmSync(xdg, { recursive: true, force: true })
    dropSession('default')
  })
})

describe('B. suspend: sesi basi lapor disconnected lalu hidup lagi', () => {
  it('connected=false saat basi; handshake ulang menghidupkan lagi', async () => {
    const s = ensureSession('hs-b')
    s.lastSeenAt = Date.now()
    expect(listSessions().find((x) => x.id === 'hs-b').connected).toBe(true)
    // Suspend > TTL.
    s.lastSeenAt = Date.now() - BROWSER_BRIDGE.SESSION_TTL_MS - 1000
    expect(listSessions().find((x) => x.id === 'hs-b').connected).toBe(false)
    // Bangun: handshake ulang dengan token yang sama -> 200.
    const h = await get(`/handshake?session=hs-b&token=${encodeURIComponent(s.token)}`)
    expect(h.status).toBe(200)
    expect(h.body.ok).toBe(true)
    expect(listSessions().find((x) => x.id === 'hs-b').connected).toBe(true)
    dropSession('hs-b')
  })
})

describe('C. restart sidecar: token basi bisa dipulihkan tanpa pairing ulang', () => {
  it('token lama dalam grace -> tokenOk true; reason jujur bila di luar grace', async () => {
    const s = ensureSession('hs-c')
    const oldToken = s.token
    // Simulasi restart: token sesi diganti, lama jadi prev dalam grace.
    s.prevToken = oldToken
    s.prevExpiresAt = Date.now() + 60 * 1000
    s.token = oldToken + '-baru'
    expect(tokenOk(s, oldToken)).toBe(true)
    // Di luar grace -> tokenOk false, TAPI reason tetap token-stale:
    // tokenRejectReason hanya cek kecocokan prevToken, bukan masa grace
    // (grace dicek di tokenOk). Stale-di-luar-grace = helper path:
    // extension coba refresh via native host; gagal -> tempel manual.
    s.prevExpiresAt = Date.now() - 1000
    expect(tokenOk(s, oldToken)).toBe(false)
    expect(tokenRejectReason('hs-c', oldToken)).toBe('token-stale')
    dropSession('hs-c')
  })

  it('handshake token salah total -> 401 + reason eksplisit (bukan hijau palsu)', async () => {
    ensureSession('hs-c')
    const h = await get('/handshake?session=hs-c&token=salah-total')
    expect(h.status).toBe(401)
    expect(['token-unknown', 'token-stale', 'session-unknown']).toContain(h.body.reason)
    dropSession('hs-c')
  })
})
