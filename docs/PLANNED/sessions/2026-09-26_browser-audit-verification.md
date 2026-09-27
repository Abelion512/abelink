# Session log — 2026-09-26 — Verifikasi audit root-cause koneksi extension browser

Branch: `refactor/m2c-headless-observability` · Mode: verifikasi (bukan implementasi).
Permintaan owner: "mengapa tidak memverifikasi apakah audit Anda benar, lalu stress-test
hasil ide Anda?" — sesi ini jawabannya.

## Konteks

Audit baca-kode (sebelum sesi ini) menghasilkan 5 hipotesis root-cause (RC1–RC5) kenapa
extension browser sering gagal koneksi. Klaim audit = hipotesis, bukan bukti. Sesi ini
menguji tiap klaim lewat test hermetik + stress test core bridge.

## Hasil verifikasi (klaim -> status)

| Klaim | Status | Bukti (test) |
|---|---|---|
| RC1 fail-fast TTL 5 menit menolak sesi stale | **TERKONFIRMASI** | RC1-A (throw `terputus`), RC1-D (TTL = 300000ms) |
| RC1 "sweep -> poll 401 -> loop mati, perintah hilang" | **DIKOREKSI: self-heal** | RC1-B (dispatch setelah sweep tetap tersaji), RC1-C (poll 401 sesi di-sweep -> handshake token FILE pulih 200 -> perintah selama outage tidak hilang). `ensureSession` reseed token dari file. |
| RC2 "sub-agent pasti gagal sunyi (isolasi token sesi)" | **DIKOREKSI (sebagian)** | RC2-B: tool-layer `pickConnected` PUNYA fallback lintas sesi -> dispatch diteruskan ke `default` yang connected. RC2-A: jebakan token tetap NYATA di jalur CHANNEL (`browser:*` antre per-sesi, tanpa drain lintas). |
| RC3 `startError` di-latch; port bebas pun tidak retry | **TERKONFIRMASI** | RC3-A (proses child: EADDRINUSE -> port dibebaskan -> 2x start tetap gagal dengan error identik) |
| RC4 origin pin menolak ID lain (termasuk unpacked sah) | **TERKONFIRMASI** | RC4-A (token valid + Origin id-lain -> 403) |
| RC5 `probePorts` menghitung 403 sebagai `authed` | Dibaca, belum dites (minor) | — |
| MV3 alarm min ~1 menit menjelaskan celah keepalive | **ASUMSI PLATFORM** — tidak bisa diverifikasi dari repo; butuk pengukuran di browser nyata | — |

## Stress test (S1–S3, semuanya hijau)

- **S1**: 30 round-trip berurutan ala extension nyata (drain kontinu): FIFO utuh, semua
  resolve ok, ~24ms per round-trip (713ms total).
- **S1b**: burst 30 dispatch tanpa drain: hanya `MAX_QUEUE` (16) terbuffer, 14 ditolak
  keras `penuh`; 16 yang terbuffer di-reject jujur saat sesi di-drop (di produksi:
  timeout 90s). **Tidak ada jalur sukses palsu.** Batas desain, bukan kebocoran.
- **S3**: rotasi token refresh-on-use: handshake terbitkan `newToken`, token lama tetap
  diterima dalam grace 24 jam, token asing ditolak.

## Berkas berubah

- **Baru**: `tests/browserAuditVerify.test.mjs` (12 test; RC3 dijalankan di proses child
  agar latch tidak merusak modul server milik file test ini; `XDG_DATA_HOME` diarahkan ke
  tmp agar seeding token hermetik).

## Rekomendasi yang DIREVISI pasca-bukti (urutan baru)

1. **RC3 (latch)** — sekarang terbukti permanen: retry `startBrowserBridge()` bila
   `startError` EADDRINUSE, atau reset `startError` saat `stopBrowserBridge()`.
2. **RC1b (TTL)** — relax `SESSION_TTL_MS` 5m -> 15m ATAU beri grace fail-fast; jarak
   alarm MV3 (~1 menit, asumsi platform) jauh di bawah TTL, tapi idle panjang tetap
   kena. Self-heal handshake SUDAH ada (RC1-C) — cukup pastikan extension selalu jatuh
   ke jalur handshake, bukan menyerah.
3. **RC2b (jalur channel)** — bila sub-agent memakai channel `browser:*` langsung
   (bukan tool layer), terapkan fallback `pickConnected` yang sama di channel; kalau
   semua pemakaian nyata lewat tool layer, jebakan ini laten saja — catat, jangan kerjakan.
4. **RC4** — kirim daftar origin diizinkan dari sisi token, atau dokumentasikan bahwa
   unpacked build tidak didukung (pilihan owner).
5. **RC5 (minor)** — `probePorts`: `authed = res.status === 200` agar 403 tidak
   tampil "siap".

## Verifikasi

| Cek | Hasil |
|---|---|
| `bunx vitest run tests/browserAuditVerify.test.mjs` | 12/12 hijau |
| Regresi: browser-e2e + reconnect-scenarios + ReadRecovery + flavor | 47/47 hijau |
| `bun run lint` | exit 0 (0 error, 42 warning baseline) |

## Efek samping yang ditemukan + diperbaiki

`beforeAll` test menjalankan server dengan `XDG_DATA_HOME` tmp tetapi `configHome`
asli -> `ensureNativeHost` sempat MENULIS manifest native host Chrome asli menunjuk ke
path tmp. Ditemukan dari stdout run pertama; diperbaiki: `afterAll` menghapus env uji
SEBELUM rm tmp lalu memanggil `ensureNativeHost({ flavor: 'prod' })` sekali lagi.
Verifikasi pasca-fix: manifest `~/.config/google-chrome/NativeMessagingHosts/
id.abelink.bridge.json` kembali menunjuk `/home/<user>/.local/share/abelink/native-host/
abelink-bridge-host.sh`.

## Batasan dikenal

- Klaim MV3 (alarm granularity, suspensi 30s) = asumsi platform, bukan fakta repo —
  butuh pengukuran di Chrome nyata (bukan bagian sesi ini).
- E2E dengan browser sungguhan tetap belum pernah dijalankan (ARCHITECTURE.md §6) —
  test ini hermetik di lapisan HTTP/core; lapisan chrome.* masih di-cover runbook manual
  `extension/README.md`.
- Belum di-commit; menunggu keputusan owner (aturan branch+PR tetap berlaku).
