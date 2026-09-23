# Session Log — CLI Fase 2 TUI (2026-09-22)

## Keputusan
- `bin/abelink-tui.mjs` (NEW, ~600 baris): host interaktif readline-stdlib, reuse bentuk
  `createSidecarClient`/auth chain/security preflight/`NATIVE_TOOLS`/memory loader dari
  `bin/abelink.mjs` via copy bentuk (engine untouched).
- Slash `^/`: /model /effort /sessions /continue /new /help (+/exit); /undo = unsupported
  (tanpa primitif, sesuai plan). Non-slash = prompt.
- Per-turn AbortController: Ctrl-C batalkan turn saja; abort tool → `{code:'user_abort'}`.
- `needs_user` → re-prompt, never exit. Exit hanya /exit atau EOF.
- Streaming: `TUI_STREAM_ENABLED=false` + `buildAiFetchBody()` single choke point (flag flip).
- Store: reuse Fase-1 (`saveCliSession`/`loadCliSession`/`listCliSessions` + `initialHistory`);
  tidak ada store kedua. Cap 50 pesan dua sisi (TUI pre-cap + store cap).

## Berkas berubah (milik Fase 2 saja)
- `bin/abelink-tui.mjs` (NEW)
- `tests/cli-tui.test.mjs` (NEW, 41 tests)

## Hasil verifikasi
- `bunx vitest run tests/cli-tui.test.mjs`: 41/41 passed (termasuk round-trip store Fase-1
  asli via tmpdir + `sessionToInitialHistory` → seed `loopMessages`).
- `bunx eslint` kedua file: 0 errors.
- Tidak ada edit ke `bin/abelink.mjs`, `agentRunner.js`, `headlessCli.js`
  (modifikasi terlihat di tree = kerja paralel Fase-1, bukan file milik Fase 2).

## Batasan dikenal (gap)
- GAP-STREAM: frame streaming sidecar belum dikonfirmasi; aktifkan via
  `TUI_STREAM_ENABLED=true` setelah sidecar honor `stream:true`.
- Fase-1 mendarat mid-flight dengan bentuk sync `{ok,file}`/`null`/`[]` — adapter TUI
  menanganinya (cek `res.ok === false`, `await` toleran sync/async).
- E2E interaktif (`bun bin/abelink-tui.mjs` + sidecar hidup) belum dijalankan — butuh
  kredensial model; unit + lint gate hijau.
