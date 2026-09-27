# Session 2026-09-22 — Fix dialog + E2E tanpa GUI

Mode: build. Branch: feat/headless-agent-cli. Worktree barreleye diabaikan
(= origin/main, tak bawa commit lokal).

## 1. Fix dialog capabilities:execute

Akar: `browser-extension:status` tak terdaftar di core_tools/katalog —
dispatcher jatuh ke fallback plugin (`executeCapability('plugin', ...)`)
-> error "tidak dikenal". Rust gate benar (whitelist read-only di
`cmd_node_bridge.rs:240`), source Auto Mode benar
(`approval_policy.rs:56,58`), binary dev mengandung whitelist (strings=3).
Dialog di screenshot user berasal dari binary lama / pre-confirm ganda
`nativeConfirm` di `knowledgeTools.js:63-75` (belt & suspenders, tanpa
read-only exception).

Fix:

- `parseConnectorNamespacedTool` + rute 9b `toolDispatcher.js` (di LUAR blok
  checkTools): direct ke `executeCapability(connector, aksi)`, tanpa fallback
  plugin, tanpa pre-confirm ganda.
- Prompt `planning.js:220`: tangga recovery langkah 1 = tool nyata.
- `tests/connectorNamespaced.test.mjs`: 3 passed.

Verifikasi: target 3 hijau, lint 0 errors, full 1445 hijau.
`capabilities:execute(browser-extension,status)` via sidecar headless:
success, tanpa dialog.

## 2. E2E tanpa GUI Abelink

Jawaban: sidecar engine headless (stdio JSON-RPC, tanpa Tauri) + Brave
headful (Chrome stable tolak --load-extension) + extension repo + CDP.
GUI Tauri tidak dibuka sama sekali.

Hasil `bun scripts/e2e-browser-live.mjs`:

- Bridge prod:49712 ready, popup pairing sekali -> tersambung, flavor terpin.
- `browser:navigate` example.com: ok, 1 elemen ter-tag.
- `read-dom`: ok. Screenshot 3 tahap di /tmp/abelink-e2e.

## 3. Trajectory IKI + worktree

- Trajectory: navigate no-handshake (bridge mati waktu itu), browser-ask
  ditolak benar, `browser-extension:status` error plugin -> blocked jujur.
  Setelah fix rute 9b, langkah recovery valid.
- barreleye: abaikan per user. Penjelasan tetap: = origin/main, tak bawa
  5 commit lokal belum push.
