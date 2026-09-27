# Session Log — Patch G1: Pemulihan 401 di `tryAutoResume` (Token Basi-Terisi)

- **Tanggal:** 2026-09-27
- **Branch:** `refactor/m2c-headless-observability`
- **Pemicu:** gap G1 dari pengukuran MV3 (2026-09-27 pagi): `tryAutoResume` hanya konsultasi helper token bila token session-storage KOSONG; token basi-terisi (helper gagal + SW pernah suspensi) terjebak handshake 401 berulang tanpa pernah pulih.

## Perubahan

- `extension/background.js` — `tryAutoResume()`:
  - Cabang `hs.status === 401` baru: konsultasi `getTokenViaNativeHost(cfg.port)` SEKALI per attempt; bila helper memberi token **berbeda** (guard `via.token !== cfg.token`, anti-loop), tukar token (session + per-port storage) lalu handshake ulang SEKALI. Lanjut `running=true; loop()` HANYA bila 200. Helper gagal/token sama = menyerah pada attempt ini; `scheduleAutoResume(5000)` di akhir tetap menjadwalkan percobaan berikutnya.
  - Jalur sukses lama (200 langsung + `newToken`) tidak berubah; pagar anti-auto-switch tanpa pairing (test `browser-flavor`) tidak tersentuh (patch berada SETELAH segmen terpagar).
- `extension/popup.js` — guard 1 baris: `autoConnect()` saat load dilewati bila dibuka dengan query `?noprobe=1`. Perilaku user (popup tanpa query) tidak berubah; alat ukur kini bisa membaca status tanpa memicu side effect attempt start.
- `tests/resumeSelfHeal.test.mjs` — BARU, 4 test kontrak statis (ala `browser-flavor.test.mjs`): cabang 401 wajib konsultasi helper maksimal 1x, guard anti-loop, handshake ulang sekali, urutan 200→running→loop, persist dua storage, jalur sukses lama utuh.
- `scripts/mv3-keepalive-measure.mjs` + `scripts/mv3-native-host-probe.mjs` — re-apply fix path manifest NMH (`.../NativeMessagingHosts`) yang tertimpa commit concurrent; `probeStatus()` kini menavigasi `popup.html?noprobe=1` dan menyertakan probe helper `sendNativeMessage` + `status_trail` (poll 5s selama S3c).

## Insiden proses yang ditemukan & ditangani

- **Overwrite concurrent:** commit `d417401` dkk. menyapu file `scripts/` dan membawa versi LAMA harness (path copy manifest tanpa `/NativeMessagingHosts`), sehingga satu run S3c berjalan dengan helper tak terpasang di profil (artefak lama yang sama) dan sempat dianggap regresi patch. Diagnosa dari data (field `helper` kosong, trail tak terekam, `lastError` berisi teks jalur `start` yang tak pernah dipanggil harness) menuntun ke dua akar: (1) revert path, (2) kontaminasi instrumen — `probeStatus()` lama menavigasi popup tanpa guard sehingga `autoConnect()` popup memicu attempt start sendiri (popup.js lama auto-connect saat load). Keduanya diperbaiki; bukan bug pada patch G1 maupun server.

## Verifikasi

- `tests/resumeSelfHeal.test.mjs` 4/4; `browser-flavor` (pagar pairing) lolos.
- Regresi keluarga browser (19 file) + resumeSelfHeal: **173/173 hijau**.
- `bun run lint`: exit 0, 0 error (baseline warning).
- E2E Chrome nyata (`ABELINK_MV3_MODE=s3only`): S3S_SERVED 1.56s; **S3C_SERVED 1.57s** dengan trail `running=true, err=null, helper ok:true` — kontaminasi instrumen hilang.
- Release gate penuh `bash scripts/verify.sh`: **LOLOS, exit 0** — mencakup patch G1 (`node --check background/popup`, vitest penuh, lint, crypto harness 8+25, perf gate, bench quick, vite build, cargo check, clippy `-D warnings`). Catatan jujur: pada run ini loop tetap hidup, sehingga yang tereksekusi runtime adalah jalur 401 loop; jalur `tryAutoResume` G1 ter-cover kontrak statis (script klasik MV3 tidak bisa diimport di vitest). Bukti runtime G1 butuh kondisi loop-mati + helper hidup yang tidak dapat dipicu deterministik dari harness tanpa menyentuh SW (attach = memalsukan lifecycle).

## Batasan

- Helper dikonsultasi sekali per attempt tanpa retry di dalam cabang (guard anti-loop); kegagalan helper dipulihkan oleh siklus `scheduleAutoResume` berikutnya.
- `?noprobe=1` di popup adalah kontrak internal alat ukur; user tidak pernah mengetik query ini.
