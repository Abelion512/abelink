# Session 2026-09-23 — build/lint + extension keepalive + riset Claude

## 1) build + lint
- `bun run build`: OK (43s, vite).
- `bun run lint`: 0 errors, 1031 warnings (pre-existing tech debt).

## 2) Extension popup-close disconnect
- Root cause: MV3 worker suspend ~30s idle. Loop hidup di celah `sleep(1500)`
  tanpa event; popup terbuka = traffic message menahan SW, popup tutup =
  suspend → loop mati. Bukan storage, bukan token. Plus bug lokal: keepalive
  else-branch panggil `loop()` saat `pollAbort==null` (juga benar saat sleep
  sehat) → loop ganda berebut `/poll`.
- Fix (`extension/background.js`): `loopActive` reentrancy guard + try/finally;
  keepalive branch hanya `loop()` bila `!loopActive`; `scheduleAutoResume`
  tulis `lastError: 'Menyambung ulang otomatis...'` (jujur, bukan hijau palsu).
- Test: `tests/browser-flavor.test.mjs` +2 (guard + status jujur).
- Verifikasi: 5 file browser 76/76 hijau, eslint 0 errors, smoke LOLOS.
- Batas dikenal: resume gap ≤60s (alarm floor) tetap ada; WebSocket sidecar =
  fix nyata berikutnya (butuh endpoint WS baru).

## 3) Riset Claude frontier
- Doc: `docs/PLANNED/2026-09-23_claude-frontier-research.md` (sumber primer
  platform.claude.com, diverifikasi langsung).
- Isi: lineup Fable5.1/Opus5.5/Sonnet5/Haiku4.5 + harga/cache; verifikasi
  (structured outputs GA, strict tool use, task budgets, progress updates);
  reasoning (adaptive, effort, per-message effort, interleaved, omitted);
  tools (tool search, programmatic calling, computer use, code exec, web search);
  context (1M, compaction, editing, memory tool, awareness); cache (aturan
  breakpoint + invalidasi); 7 task konkret berurutan.
- Belum ada perubahan kode — riset + task list saja sesuai permintaan.

## Berkas berubah
- `extension/background.js`, `tests/browser-flavor.test.mjs`
- `docs/PLANNED/2026-09-23_claude-frontier-research.md`, log ini
- Sesi lalu (belum commit): `bin/abelink.mjs`, `bin/abelink-tui.mjs`,
  `PROJECT-STATUS.md`, `task.md`, `docs/PLANNED/sessions/2026-09-23_tui-workspace-guard.md`
- TIDAK commit (aturan branch+PR). `stash@{0}` sesi lain tak tersentuh.
