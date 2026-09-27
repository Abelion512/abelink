# Session 2026-09-22 — Dialog capabilities:execute + trajectory + worktree

Mode: build. Tiga masalah user, semua sampai akar kode + trajectory.

## 1. Dialog "capabilities:execute" (screenshot)

Rantai terverifikasi:

- Model panggil `browser-extension:status` (reasoning harness 09-20 & 09-22).
- Nama itu TIDAK ada di `core_tools`/katalog/group/prompt — model mengarang
  dari pola `<connector>:<aksi>` connector `browser-extension` yang memang ada
  di `sidecar/main/capabilities/catalog.mjs:178`.
- Dispatcher tak punya rute namespaced → jatuh ke fallback plugin
  (`executeCapability('plugin', ...)`) → error "tidak dikenal".
- Rust gate (`cmd_node_bridge.rs:166,213,240`): `capabilities:execute` +
  whitelist read-only (`browser-extension:status` lolos). Source (HEAD) benar.
- Binary dev 11:08:06 vs commit Auto Mode f86b17b 11:08:48: BINARY 42 DETIK
  LEBIH TUA. Bila app dev tidak rebuild setelah f86, policy lama jalan.
- Policy file: tidak ada (efektif = default source = always untuk family ini).

Fix sesi ini (sudah terpasang sebelum sesi, diverifikasi sesi ini):

- `parseConnectorNamespacedTool` + rute 9b `toolDispatcher.js` (di LUAR blok
  checkTools): direct ke `executeCapability(connector, aksi)`, tanpa fallback
  plugin, tanpa pre-confirm ganda.
- Prompt `planning.js:220`: tangga recovery langkah 1 = `browser-extension:status`.
- `tests/connectorNamespaced.test.mjs`: 3 passed.

AKSI USER: relaunch `bash scripts/dev.sh` agar binary rebuild. Tanpa itu
dialog tetap muncul dari binary lama.

Kenapa izin ada: hanya aksi destruktif. Status read-only kini sunyi.

## 2. Trajectory IKI (turn 1-5, sesi 1, 09-22)

- T1-T2 navigate no-handshake: bridge mati waktu itu (sekarang dev:49713
  tersambung — masalah koneksi selesai).
- T3 browser-ask DITOLAK sistem: benar, bukan login wall (evidence gate).
- T4-T5 `browser-extension:status` → error plugin → T5 blocked jujur.
- T5 `blocked | state-blocked` = terminal BENAR, bukan kegagalan verifier.
- Setelah fix: recovery punya langkah 1 nyata, bukan karangan.

## 3. Worktree barreleye "ada yang hilang"

- barreleye @ 6957a79 = origin/main. `git pull` up-to-date BENAR.
- Repo utama 5 commit di atas main, BELUM push (`main..HEAD` = 5, sebaliknya 0,
  `git branch -r` tanpa headless/barreleye).
- Jadi bukan ketinggalan: 5 commit lokal tak terlihat dari worktree lain
  sampai di-push. Commit + push `feat/headless-agent-cli` dulu, baru pull
  di barreleye. Tanpa itu, pull selamanya up-to-date.

## Verifikasi

- Target: 3 passed. Full: 1445 passed. Lint: 0 errors.
