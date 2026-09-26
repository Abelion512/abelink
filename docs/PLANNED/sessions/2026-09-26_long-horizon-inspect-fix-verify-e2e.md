# Session log — 2026-09-26 — Long-horizon: inspect -> fix -> verify -> e2e

Branch utama: `refactor/m2c-headless-observability` (commit `271afbc`)
Branch cleanup: `chore/cleanup-unreferenced-2026-09-26` (commit `533e6e4`)
Mode: otonom multi-loop atas permintaan owner (report-based, berjam-jam).

## Loop 0 — Baseline

`bash scripts/verify.sh` → **OK VERIFY LOLOS** (vitest, lint 0 err, watermark,
perf, bench quick, vite build, cargo check, clippy -D warnings).

## Loop 1 — Inspect (bukti, bukan tebakan)

- TODO/FIXME ledger di zona inti: **1** (`agentRunner.js:460`, desain
  terdokumentasi — konsumsi outcome stagnasi; bukan cacat).
- Reachability 4 kandidat TASK.md item 2, dua lapis (nama export + pola
  `import()` dinamis + `require()`): `chatSummarizer.js`
  (`summarizeAndArchive`), `updateChecker.js` (4 export), `AppleSwitch.jsx`,
  `assets/icon.svg` → **semua unreferenced**.
- Duplikasi formula data-home: **3 lokasi** (`cli/core/harness-writer.mjs`,
  `scripts/harness-common.mjs`, `cli/tui/engine.mjs` jalur `/usage`).

## Loop 2–3 — Fix + Verify

- Delegasi formula → `resolveDataHome` (sumber tunggal, sudah ter-test
  dataHome.test.mjs/sttGuard.test.mjs); override `deps.harnessRoot` engine
  dipertahankan untuk test. Test menyentuh 3 berkas: 76 hijau.

## Loop 4 — E2E runtime (yang menemukan bug terbesar)

E2E hermetik BARU `tests/e2eHeadlessWiring.test.mjs`: `defaultRunTurn` ASLI
(bukan stub runTurn) → runAgentLoop → hooks → writer → finalize; fetchAI
di-stub di seam environment; flag via `deps.trajectoryHeadless`; root via
`deps.harnessWriter`; HOME tmp untuk store sesi; **tanpa mutasi env flag**
(imun race antar worker vitest). Timeout eksplisit 30s (latensi integrasi
~4.5–6s/turn; timeout default 5s memotong dan loop zombie mengembalikan
`__ABELINK_AI_FETCH__` saat test berikut jalan — akar interferensi).

**Tiga cacat ditemukan e2e dan diperbaiki:**

1. **Bukti verifier tak terlihat di headless (bug integrasi nyata):**
   `executedToolsList` runner = `{tool, result}`; `normalizeOps` verifier
   membaca `fullResult` → gate verifikasi di CLI/TUI selalu `not_run`, klaim
   "selesai" non-konversasional DITOLAK 2x lalu gagal meski tool sukses.
   Fix: pemetaan `{tool, result -> fullResult}` di call-site agentRunner
   (bentuk output kontrak tidak berubah). Setelah fix: e2e tool+klaim →
   `completed` (gate meloloskan dengan bukti).
2. **Crash path TUI v2 tanpa turn-end** (start-tanpa-end = red flag palsu di
   harness:diagnose). Fix: finalize `fatal-exception` di catch path
   `defaultRunTurn` (error tetap dilempar — kontrak submitLine tak berubah).
3. **Audit di-recreate tiap run** → nomor turn reset. Semantik ditegaskan:
   **satu run prompt = satu turn harness** (start/end selalu berpasangan,
   monotonik lintas run: 1,2,...), step internal loop disimpan di field
   `step` record tool. Audit hidup per sesi (`forSession`), di-recreate saat
   `/new` atau `/continue`.

Bukti e2e jalur hidup (flag ON): file `turn-start.jsonl`+`turn-end.jsonl`
muncul di root GUI; `harness:diagnose --session <id>` → digest jujur;
cron `list` exit 0; adapter benchmark exit 0.

## Loop 5 — Cleanup (branch terpisah, aturan TASK.md)

Hapus 4 berkas unreferenced (verifikasi dua lapis dulu). Catatan jujur:
`chatSummarizer.js` masih tercantum di tabel AGENTS.md — pembaruan tabel
digabung ke PR dokumentasi berikutnya, bukan di PR hapus.

## Verifikasi akhir per branch

| Cek | m2c (271afbc) | cleanup (533e6e4) |
|---|---|---|
| vitest penuh | 180 gabungan hijau ×3 run; full suite hijau | **151 file / 1720 hijau** |
| lint | 0 error | 0 error |
| tsc / tsc:node | 0 / 0 | 0 |
| smoke runtime | CLI flag ON → diagnose terbaca; PTY v2 normal | — |

## Batasan dikenal

- **1 flake sekali teramati** (`harnessHeadless` ×1 pada run penuh pertama di
  branch cleanup; tidak terulang di 2 run penuh berikutnya + hijau sendirian;
  polanya bukan deterministik — diduga shared tmpdir antar worker pada run
  yang sangat panjang; belum ada bukti akar, jadi hanya dicatat, tidak di-fix
  buta). **UPDATE ronde M3: akar DITEMUKAN dan DIPERBAIKI** — ts writer tidak
  monotonik antar file (detail: `2026-09-26_m3-adr-parity-docs.md`); setelah
  fix, 4 run penuh beruntun hijau + test regresi deterministik.
- Verifier gate kini SAMA ketatnya di CLI/TUI dan GUI (bukti tool diterima);
  `runtimeVerificationState` adapter benchmark belum mengekspos verdict ini
  (item TASK.md nomor 3, belum dikerjakan).
- TODO agentRunner (stagnasi outcome) sengaja tidak disentuh (B-11 freeze
  wilayah planning; perubahan logika = PR desain terpisah).
- PR belum dibuat (butuh push owner): `refactor/m2c-headless-observability`
  (2 commit) dan `chore/cleanup-unreferenced-2026-09-26` (1 commit), keduanya
  stacked di atas `refactor/m2b-cli-core`.
