# Session Log: bridge token reseed (install ok, browser diam)

Tanggal: 2026-09-18 | Branch: `fix/bridge-token-reseed` | Status: selesai, siap merge

## Gejala
- Install native host sukses (manifest + wrapper ada), tapi browser tidak terjadi apa-apa.
- Popup: Dev:49713 "Token ditolak sidecar (401)".
- Trajectory: `no-handshake` berulang, kadang tersambung lalu putus lagi.

## Root cause (bukti)
- `ensureSession()` membuat token ACAK tiap sesi baru; `dropSession()` membuangnya.
- Pemicu drop: `browser:close` (agen stop + auto-close saat completed — termasuk fitur auto-close yang baru di-merge) dan sesi non-default sub-agent.
- Setelah drop, `ensureSession('default')` berikutnya memakai token acak yang TIDAK COCOK dengan file token → extension (yang pegang token file benar) ditolak 401 selamanya sampai klik manual.
- Bukti langsung: kedua file token dev (root 5757d377… + brand ab230c54…) SAMA-SAMA 401 ke bridge yang jalan → bridge pegang token ketiga di memori.
- File brand `abelink-dev/abelink/browser-bridge-token` = sisa versi lama (14 Sep), tidak dibaca kode sekarang — dibiarkan (tidak dihapus).

## Keputusan
- `ensureSession('default')` reseed token dari file via `readTokenRecord` (best-effort; gagal baca → acak seperti dulu). Tanpa import baru, tanpa cycle (pakai `tokenPathFor`/`flavorFromPort` yang sudah ada).
- Ini sekaligus memperbaiki regresi auto-close: close→drop→recreate kini kembali ke token file, bukan token asing.

## Berkas berubah
- `sidecar/main/browser/bridge-core.mjs`: reseed di ensureSession (+20 baris).
- `tests/browser-bridge.test.mjs`: +1 test reseed hermetik (XDG temp).

## Hasil verifikasi
- Reseed manual (PORT dev + ABELINK_DATA_HOME dev): token sesi == token file.
- `bunx vitest run tests/browser-bridge.test.mjs`: 31/31 hijau.

## Batasan dikenal
- Sidecar dev yang SEDANG jalan (PID 504541) masih kode lama — perlu restart (`tauri dev` / sidecar restart) agar fix aktif; lalu klik Connect sekali di popup.
- Extension di Chrome memuat background.js E1/E2 dari commit kemarin — klik Reload di chrome://extensions bila belum.
