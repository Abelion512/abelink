// Kontrak G1 (2026-09-27): tryAutoResume wajib punya jalur pemulihan 401.
//
// Latar: pengukuran MV3 Chrome nyata (docs/PLANNED/sessions/2026-09-27_mv3-
// keepalive-measurement.md, temuan S3c + probe sendNativeMessage) membuktikan
// tryAutoResume lama terjebak handshake 401 berulang bila token session-
// storage BASI-TERISI: helper hanya dikonsultasi bila token KOSONG.
//
// background.js adalah script klasik MV3 (tanpa modul, chrome.* global) dan
// tidak bisa diimport di vitest — kontrak diverifikasi statis ala
// browser-flavor.test.mjs: segmen tryAutoResume diekstrak lalu diasersi.
// Bukti perilaku e2e di Chrome sungguhan: scripts/mv3-keepalive-measure.mjs
// mode s3only (S3c regen token -> dispatch -> pulih tanpa intervensi).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension')
const bg = readFileSync(join(root, 'background.js'), 'utf8')

// Ekstrak badan tryAutoResume: dari definisi sampai listener alarm berikut.
const fnMatch = bg.match(/async function tryAutoResume\(\)[\s\S]*?\n}\n\nif \(typeof chrome !== 'undefined' && chrome\.alarms\)/)
expect(fnMatch, 'fungsi tryAutoResume tidak ditemukan').not.toBeNull()
const fn = fnMatch[0]

describe('G1: tryAutoResume pulih dari token basi via native host', () => {
  it('handshake 401 -> konsultasi helper -> tukar token -> handshake ulang', () => {
    // Cabang 401 ada di jalur handshake resume:
    expect(fn).toMatch(/if \(hs\.status === 401\)/)
    // Helper dikonsultasi di cabang 401 (bukan hanya saat token kosong):
    const m = fn.match(/if \(hs\.status === 401\)[\s\S]*/)
    expect(m[0]).toMatch(/getTokenViaNativeHost\(cfg\.port\)/)
    // Guard anti-loop: hanya tukar bila helper memberi token BERBEDA.
    expect(m[0]).toMatch(/via\.token !== cfg\.token/)
    // Handshake ulang SEKALI setelah tukar token:
    expect(m[0]).toMatch(/const hs2 = await apiGet\(cfg, 'handshake'\)/)
    // Urutan wajib: cek 200 -> running=true -> loop() (tidak ada jalur lain
    // yang melanjutkan loop dari cabang 401).
    const branchAll = fn.match(/if \(hs\.status === 401\)[\s\S]*?\n    \} catch \{/)[0]
    const i200 = branchAll.indexOf('if (hs2.status === 200)')
    const iRunning = branchAll.indexOf('running = true', i200)
    const iLoop = branchAll.indexOf('loop()', iRunning)
    expect(i200).toBeGreaterThan(-1)
    expect(iRunning).toBeGreaterThan(i200)
    expect(iLoop).toBeGreaterThan(iRunning)
  })

  it('jalur sukses lama (200 langsung) tidak berubah', () => {
    expect(fn).toMatch(/if \(hs\.status === 200\)/)
    expect(fn).toMatch(/auto-resume service worker aktif/)
  })

  it('gagal helper / token sama tetap menyerah pada attempt ini (jadwal ulang tetap jalan)', () => {
    // Setelah blok 401 tidak ada loop() liar di luar guard 200 — penyerah
    // ditandai dengan jatuh ke scheduleAutoResume di akhir fungsi.
    expect(fn).toMatch(/scheduleAutoResume\(5000\)/)
    // Helper dipanggil maksimal sekali di cabang 401 (tanpa retry loop):
    const branch = fn.match(/if \(hs\.status === 401\)[\s\S]*?\n    \} catch \{/)[0]
    expect(branch.match(/getTokenViaNativeHost/g)).toHaveLength(1)
  })

  it('token yang diterima helper dipersist ke kedua storage (session + per-port)', () => {
    const branch = fn.match(/if \(hs\.status === 401\)[\s\S]*?\n    \} catch \{/)[0]
    expect(branch).toMatch(/chrome\.storage\.session\.set\(\{ token: cfg\.token \}\)/)
    expect(branch).toMatch(/setPortToken\(cfg\.port, cfg\.token\)/)
  })
})
