# Session Log: S1+G1 isolasi tab + L1 /goal + improvement trajectory

Tanggal: 2026-09-19 | Branch: `feat/session-goal-isolation` | Status: selesai, siap merge

## Masalah (trajectory 2026-09-19 + audit)
- 47 read + 40 click + 23 extract/hari; T24 failed 2x; S17 blocked.
- Sesi lain rebut tab sesi aktif (klik nyasar ke Wikipedia/Google, T7-T9 S17).
- /goal tidak ada sebagai mode (hanya /execution-discipline sebagai skill).

## Keputusan
- S1: activeConfig bawa sessionId String; adopsi kecualikan primer sesi lain; group() tab milik sesi lain -> buat tab sendiri.
- G1: 1 primer per sesi + N anggota per grup (komentar kontrak, perilaku tetap).
- L1: skill native /goal (kontrak DONE + snapshot-first + stop-loop) + floor budget 48.
- Improvement: helper stop-loop + test; snapshot-first sudah ada dari B1.

## Berkas berubah
- `toolDispatcher.js`: +1 baris sessionId.
- `extension/background.js`: anti-curi group + exclude adopsi + komentar primer.
- `native-skills.js`: skill goal. `useAbelinkPlan.js`: floor 48.
- Tests: session-tab-isolation (7), goal-mode (6).

## Hasil verifikasi
- Baru: 13/13 hijau. Regresi browser: 78/78. ESLint: 0 error.
- InputBar.jsx hanya churn UI sesi lain (tidak ikut commit).

## Batasan dikenal
- Extension JS butuh Reload manual (service worker lama).
- Stop-loop sebagai helper test; penegakan di prompt /goal + aturan B2.
