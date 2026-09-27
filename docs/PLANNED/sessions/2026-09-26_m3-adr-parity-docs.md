# Session log — 2026-09-26 — M3 (D1/ADR-001 + parity test) + sweep dokumentasi

Branch: `refactor/m2c-headless-observability` (lanjutan; M2c + fix e2e sudah
di-commit sebelumnya). Mode: long-horizon otonom, ronde kedua.

## Isi kerja

1. **M3/D1 — `docs/ADR-001-loop-divergence.md` (BARU, DITERIMA).**
   Keputusan: GUI mempertahankan loop sendiri; paritas dikunci modul governance
   BERSAMA (objectiveVerifier + trajectorySupervisor + planStepBudget +
   classifier). Bukti pengukuran sebelum memutuskan: grep menunjukkan KEDUA
   loop sudah memanggil keempat modul yang sama → opsi (b) cukup, opsi (a)
   risiko besar tanpa nilai tambah.
   - Divergensi diakui (tidak disembunyikan): `GOAL_MODE_FLOOR = 48` GUI-only
     (dipin test); `needs_user` terminal di kedua host.
   - ADR mencatat akar masalah long-horizon + remediasi R1..R4 (M5/M6).
2. **`tests/loopParity.test.mjs` (BARU, 6 test).** Tabel gerbang wajib ada di
   KEDUA loop; skenario governance: klaim tanpa bukti → `verify-*` failed via
   jalur penuh `runAgentLoop`; dengan bukti → VERIFIED; hint supervisor tepat
   di ambang `MODIFY_REPEAT`; budget floor GUI-only dipin; classifier pin.
3. **Sweep dokumentasi:** AGENTS.md (hapus `chatSummarizer.js`, tambah
   `agentRunner.js` + `harnessCore.js` + baris `cli/` di pohon, catat 4
   penghapusan di Removed Layers, delineasi archiver), TASK.md (status +
   topik 2/3 ditandai selesai/sebagian), program induk (M3 ✅ + D1 dijawab),
   dokumen Hermes (H1 → DONE via ADR).

## Jawaban pertanyaan owner ("kenapa benchmark bisa berjam-jam, kita tidak")

Ringkas (detail di ADR-001): PRD tidak kurang jelas; gerbang quality Abelink
lebih ketat daripada benchmark publik, dan siklus henti-nya antisipatif:
`needs_user` menghentikan loop; `evaluateProgress` tidak dikonsumsi (GUI bahkan
tidak memanggil); `MAX_VERIFY_REPLANS=2` tanpa jalur work-resume. Remediasi
R1..R4 terjadwal M5/M6, menjaga prinsip: tanpa fallback model, gate verify
tetap wajib.

## Verifikasi

| Cek | Hasil |
|---|---|
| `bunx vitest run tests/loopParity.test.mjs` | 6/6 hijau |
| Full suite + lint + tsc | hijau (lihat bawah) |

## Bonus: flake harnessHeadless DITEMBUS akarnya

Flake `logger headless -> file nyata` (run2 + run6 dari ~7 run penuh): reader
`readSessionEvents` urut via `ts`, tapi writer menghitung `new Date()` dua kali
per append (envelope vs row) dan tidak menjamin monotonic ANTAR file — tiga
event dari tiga file dalam milidetik sama diurutkan sesuai `readdirSync`
(arbitrer). Fix di lapisan benar: writer menjamin ts MONOTONIK KETAT per
instance (`lastTsMs + 1`), satu sumber ts untuk envelope+row, tanggal dihitung
dari ts yang sama. Test regresi deterministik ditambahkan (clock beku `Date(0)`
+ 3 file — reproduksi flake tanpa menunggu kebetulan). Bukti: 4 run penuh
beruntun hijau (run8..11) setelah fix.

## Batasan

- ADR-001 = keputusan arsitektur yang MENGGATUS tabel acceptance H1 lama
  (`grep runAgentLoop src/hooks` tidak lagi menjadi ukuran); sudah ditulis di
  dokumen Hermes.
- Golden output 10 prompt CLI vs TUI vs GUI dari plan M3 digantikan oleh test
  paritas kontrak + e2e hermetik (bukti lebih murah dan deterministik);
  golden A/B penuh tetap terbuka bila owner mau (butuh model hidup).
