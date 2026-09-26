# TASK — Sesi Berikutnya Abelink

> 1 sesi = 1 topik. Di luar topik = catat, jangan kerjakan.

## Status terakhir (2026-09-26, sesi long-horizon M2c+M3)

- Migrasi: M0..M2c ✅, **M3 ✅** (D1 dijawab lewat `docs/ADR-001-loop-divergence.md`:
  GUI pertahankan loop sendiri, paritas dikunci test kontrak bersama
  `tests/loopParity.test.mjs`; divergensi budget `GOAL_MODE_FLOOR=48` GUI-only
  diakui dan dipin test). M4..M6 belum.
- Observability headless LIVE (flag `ABELINK_TRAJECTORY_HEADLESS=1`, default
  OFF): CLI/TUI menulis harness JSONL root yang sama dengan GUI;
  `harness:diagnose --session <id>` membedah sesi CLI/TUI (terbukti runtime).
  E2E menemukan + memperbaiki bug verifier-headless (bukti tool `{tool,result}`
  tak terlihat `normalizeOps` yang membaca `fullResult` — gate selalu `not_run`).
- Cleanup unreferenced ✅ di branch terpisah `chore/cleanup-unreferenced-2026-09-26`:
  `chatSummarizer.js`, `updateChecker.js`, `AppleSwitch.jsx`, `assets/icon.svg`
  (verifikasi dua lapis; AGENTS.md sudah diselaraskan).
- Remediasi long-horizon (jawaban "kenapa benchmark bisa berjam-jam")
  terjadwal di ADR-001: R1 needs_user→ask_human window, R2 konsumsi
  `evaluateProgress` untuk gate anti-penutupan-dini, R3 bounded work-resume,
  R4 instrumen `unnecessaryActionRate`. Semua di M5/M6.
- PR belum dibuat (butuh push owner): `refactor/m2c-headless-observability`
  (M2c + fix e2e + ADR-001 + parity test) dan `chore/cleanup-unreferenced-2026-09-26`.

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
   - **Keputusan 2026-09-26 (agen memilih atas instruksi owner): pakai karakter
     maskot, BUKAN foto mobil** — foto itu memuat logo Maserati + watermark
     fotografer di dalam piksel (tidak layak secara legal) dan tidak terbaca di
     16×16. Sisanya menunggu: (a) berkas PNG sumber disimpan ke repo, (b) hak
     pakai maskot (gantung, terkait item 2 lisensi).
   - Alat sudah siap: `bash scripts/apply-brand-assets.sh assets/mark-source.png
     [--banner <lebar.png>]` (`bun run brand:icons`) menulis ulang SEMUA target
     dari satu sumber persegi, jadi tidak ada ikon yang tertinggal.
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
2. ~~Pass cleanup terpisah~~ **SELESAI 2026-09-26** (branch
   `chore/cleanup-unreferenced-2026-09-26`): 4 berkas dihapus setelah
   verifikasi reachability dua lapis (nama export + import() dinamis).
3. ~~Ekspos verdict `objectiveVerifier` runtime ke adapter benchmark~~ —
   SEBAGIAN teratasi: bukti tool headless kini TERLIHAT verifier (fix
   `{tool,result}`→`fullResult` di agentRunner), tapi adapter benchmark belum
   mengekspos verdict runtime ke `runtimeVerificationState` (sisa item).
4. Paket 2/3 scan warisan: identitas subagent + os channels + logging bypass
   sisa + `|| 0.5` + satukan konstanta.
5. Skill registry tahap 2 (skor relevansi index, bukan abjad).
