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
2. ~~**Lisensi**~~ **SELESAI 2026-09-27** (PR docs-completion):
   `LICENSE` = proprietary Abelion Group; README + `package.json`
   (`UNLICENSED` + `private`) selaras.
3. ~~**Sisa brand non-gambar**~~ **SEBAGIAN SELESAI 2026-09-27**:
   `appIdentity.js` + `auditName.test.mjs` + komentar header
   (`gemini-web.js`, `sessionCompactor.js`, `planning.js`) sudah netral;
   `upstream-sync.yml` + `branch-guard.yml` DICABUT, branch `linux` lokal
   dihapus, remote `public-upstream` dilepas. Sisa: PNG maskot (tunggu aset
   owner), `scripts/dev.sh:282` (fossil cleanup fungsional — biarkan),
   logika deteksi nama `persona.js`/`planning.js` (jangan sentuh tanpa
   instruksi), rewrite history (ditolak — forward-clean saja).

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
