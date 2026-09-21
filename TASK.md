# TASK — Sesi Berikutnya Abelink

> 1 sesi = 1 topik. Di luar topik = catat, jangan kerjakan.

## Status terakhir (2026-09-20)

- `main` @ `9f8ffdb` = PR #45 (general agentic runtime) SUDAH merged.
- **PR #46** (branch `feat/typed-evidence-plane-agent-benchmark-matrix`) sudah
  **merged ke `main`**: measurement plane AbelinkBench + matriks 30 fixture, dan
  tiga ronde patch review (ablasi representasi + eksperimen A, cacat validitas
  pengukuran, lalu guard sumbu arsitektur).
- Rincian ketiga ronde: `docs/PLANNED/sessions/2026-09-21_pr46-measurement-plane.md`.
- Gate lokal sesi patch terakhir: vitest 126 file / 1294 pass, lint 0 error,
  build OK, `node evaluation/smoke.mjs` LOLOS. Rust tidak disentuh.
- **Eksperimen A masih deferred:** sumbu `--arch` belum dieksekusi harness
  benchmark (`ARCH_AXIS_IN_BENCH_PATH = false` di `evaluation/abelink-adapter.mjs`),
  jadi `vanilla` vs `basic` akan berjalan identik. Jangan jalankan A/B arch dan
  jangan laporkan angkanya sampai sumbu itu tersambung.

## Menunggu keputusan owner (jangan dikerjakan tanpa jawaban)

1. **Aset gambar maskot** — perlu path file di repo (chat tidak bisa menyimpan
   biner). Target penggantian: `assets/banner-repo.png` (README baris 3),
   `resources/icon.png`, `src-tauri/icons/*`, `extension/icons/*`.
2. **Lisensi** — `LICENSE` masih "MARK Agent Source Available License v1.0"
   (copyright Mada Putra) dan README baris 125 menunjuk lisensi upstream.
   Pilih teks pengganti dulu (proprietary / MIT / ketentuan sama atas nama
   Abelink) sebelum menyentuhnya.
3. **Sisa brand non-gambar** (bisa dikerjakan setelah nomor 2):
   `src/api/appIdentity.js` (masih `author: 'Mazees'` + repo mark-agent, dan ini
   masuk ke prompt identitas diri), README baris 3/9/125, `scripts/dev.sh`,
   `src-tauri/src/cmd_fs.rs` (kandidat migrasi legacy). Catatan:
   `.github/workflows/upstream-sync.yml` = mekanisme pembanding upstream yang
   memang dipertahankan (cron mati, `workflow_dispatch` manual).

## Topik berikutnya (pilih SATU)

1. **PR #47 — wiring sumbu arsitektur untuk nyata.** Bench harus benar-benar
   mengeksekusi arsitektur yang dibandingkan (jalur boundary ABELINK nyata:
   `startRun`/`sendPrompt`/`endRun`/`abortRun` di `evaluation/bench/boundary-spec.mjs`,
   atau jalur orkestrasi sisi engine dengan supervisor + verification gate).
   Setelah itu `ARCH_AXIS_IN_BENCH_PATH` boleh jadi `true` dan eksperimen A baru
   sah dijalankan. Menyentuh runtime — butuh desain + PR sendiri.
2. Pass cleanup terpisah (branch sendiri, JANGAN campur PR #46) — kandidat
   terverifikasi unreferenced: `src/api/ai/chatSummarizer.js` (masih
   didokumentasikan di AGENTS.md), `src/api/updateChecker.js`,
   `src/components/core/AppleSwitch.jsx`, `src/assets/icon.svg`.
   Verifikasi ulang reachability sebelum hapus (pelajaran sesi ponytail:
   2 klaim audit pernah salah).
3. Ekspos verdict `objectiveVerifier` runtime ke adapter benchmark supaya
   verified-success juga bisa berasal dari runtime, bukan hanya oracle harness.
4. Paket 2/3 scan warisan: identitas subagent + os channels + logging bypass
   sisa + `|| 0.5` + satukan konstanta.
5. Skill registry tahap 2 (skor relevansi index, bukan abjad).
