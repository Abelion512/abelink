# Session log — 2026-09-26 — M2c: trajectory headless (PLAN-T1) + H5 tool hooks

Program: P1/P2 wave M2c · Blocker baru: tidak ada · Branch:
`refactor/m2c-headless-observability` (di atas `refactor/m2b-cli-core`).
Induk: `docs/PLANNED/2026-09-26_master-migration-program.md`.

## Hasil

Dua item W1 dokumen Hermes dikerjakan sekaligus karena saling mengunci:
H5 (audit JSONL butuh penulis) + PLAN-T1 (penulis butuh choke point yang
meneleponnya).

### 1. PLAN-T1 — trajectory headless

Masalah akar (dari dokumen paritas, terverifikasi): sesi TUI/CLI tidak pernah
menulis harness — `~/.local/share/abelink/harness/<hari ini>` tidak ada walau
TUI dipakai; `/usage` TUI selalu kosong; bug "kadang input kosong" tidak bisa
di-root-cause karena prompt efektif tak terekam.

- `src/api/harnessCore.js` (BARU, murni, zero I/O): bentuk event
  `makeHarness{ToolCall,TurnStart,TurnEnd}` + `normalizeHarnessSessionId`.
  Kinds file: `tool-calls`/`turn-start`/`turn-end` (nama file mengikuti
  kebiasaan GUI). tool-call menulis `ok` (paritas payload GUI
  useAbelinkPlan.js) + `success` (kontrak docs/HARNESS-LOG-SCHEMA.md) —
  menutup gap lama: reader (`usageStats.mjs` `success !== false`,
  diagnose "fails") menghitung baris `ok:false` GUI sebagai SUKSES.
- `cli/core/harness-writer.mjs` (BARU): writer JSONL headless ke root SAMA
  dengan GUI (`ABELINK_DATA_HOME|XDG_DATA_HOME|~/.local/share` +
  `abelink/harness/<date>/<kind>.jsonl`), row `{ts,kind,line}` identik output
  Rust `cmd_harness.rs` — reader GUI membaca tanpa cabang headless.
  - Flag `ABELINK_TRAJECTORY_HEADLESS=1` (default OFF, plan §4.4 — perilaku
    lama sampai flag lulus); `ABELINK_HARNESS_DISABLE=1` kill-switch.
  - Kind divalidasi ketat mirror Rust (`[A-Za-z0-9_-]`, 1..64, anti escape).
  - **Tanpa rotasi generasi**: file aktif >50MB fail-closed (skip +
    counter `skippedSize`), bukan 50MB×3 ala Rust — beda jujur, tercatat di
    ARCHITECTURE.md §9.
  - fs/path/env/now injectable (test hermetik mem-fs, tanpa sentuh HOME).
- `createHeadlessHarnessLogger`: turn-start membawa meta PLAN-T1 (prompt
  efektif ≤2000 + provider/model/effort); tool membawa ok/success/query≤200/
  resultSummary≤2000/durationMs; turn-end membawa outcome/reason.
- Wire: `bin/abelink.mjs`, `bin/abelink-tui.mjs`, `cli/tui/engine.mjs`
  (defaultRunTurn TUI v2) — beginTurn sebelum runAgentLoop, finalize
  (turn-end + patch outcome/terminalReason ke SESI yang sama via store
  Fase-1) sebelum saveTuiSession/saveCliSession (satu tulisan, tidak saling
  timpa). Crash path juga dapat turn-end `fatal-exception` (start-tanpa-end
  tidak dihasilkan sendiri oleh bug kita).
- **Turn kontinu per SESI**: runAgentLoop me-restart stepCount dari 1 setiap
  run; `createToolAuditLogger` menahan offset akumulatif sehingga
  sessionId→turn monoton (hierarki AOS) dan turn berikutnya tidak bentrok
  nomor dengan turn run sebelumnya.

### 2. H5 — tool gateway hooks (jalur headless)

- `cli/core/tool-hooks.mjs` (BARU): `executeToolWithHooks(core, hooks, tool,
  query, ctx)` — (1) `onBeforeTool({tool,query,ctx})` → `{ok:false}` = BLOCK
  (core tidak dipanggil, audit `rejected:true`); (2) core dieksekusi, throw
  dinormalisasi ke shape `[ERROR]` standar; (3) audit selalu
  (`{tool, ok, ms, resultSummary}`); (4) `onAfterTool({tool, ok, ms, result,
  error, ctx})` → boleh redaksi, tidak bisa mengubah audit yang sudah ditulis.
  Hook error TIDAK pernah menggagalkan turn.
- Choke point di HOST (bukan di dalam `node-tools.js`): mencakup SEMUA
  dispatch headless — NATIVE_TOOLS lokal + fallback RPC sidecar — tanpa
  menyentuh sidecar (yang disetel M4). Ketiga host membungkus
  `environment.executeTool` dengan satu pemanggilan.
- `createToolAuditLogger` (di tool-hooks.mjs): audit count + beginTurn/
  finalize + patch sesi (`loadFn`/`saveFn` injectable, best-effort never-fatal).

### 3. Perbaikan kecil ikutan (satu baris, perilaku reader)

- `cli/tui/usageStats.mjs` `summarizeDir`: baris tanpa `sessionId` tidak lagi
  masuk bucket `'?'` yang menenggelamkan sesi nyata (baris seperti itu tak
  terhitung oleh reader mana pun di skema; sebelumnya GUI lama bisa menulis
  itu). Tanpa test yang mengunci perilaku lama (dicek dulu).

## Keputusan desain (bisa diperiksa)

| Keputusan | Alasan |
|---|---|
| Kontrak murni di `src/api/harnessCore.js`, I/O di `cli/core/` | aturan "no Node APIs in src/" tetap hidup; GUI bisa memakai bentuk yang sama tanpa Node |
| Envelope row identik Rust, bukan format baru | acceptance = reader GUI (export/diagnose/usage) membaca headless TANPA cabang; terbukti di bukti runtime |
| Choke point H5 di host, bukan di `NATIVE_TOOLS` | satu tempat untuk tiga host + mencakup jalur RPC fallback; sidecar registry disentuh M4 (B-15) |
| Turn offset akumulatif, bukan turn global di agentRunner | agentRunner murni (jangan tambah state lintas run); offset cukup untuk hierarki AOS |
| `ok` + `success` ditulis berdampingan | paritas GUI (writer lama) + kontrak skema (reader) tanpa migrasi data lama |

## Verifikasi

| Cek | Hasil |
|---|---|
| `bunx vitest run` | **150 file / 1716 test hijau** (termasuk 21 test baru) |
| `bunx vitest run tests/toolHooks.test.mjs tests/harnessHeadless.test.mjs` | 21 passed |
| `bun run lint` | exit 0 (0 error, 42 warning = intrinsics OpenTUI) |
| `bun run typecheck` / `typecheck:node` | exit 0 / exit 0 |
| Smoke TUI v1 pipe (`/help`+`/exit`, flag ON) | banner + exit 0; tanpa turn = TANPA file harness (jalur non-model tak berubah) |
| Smoke PTY v2 (tmux 140×36) | hero, sidebar Context/MCP/LSP, prompt — parity terjaga |
| **Gate PLAN-T1**: CLI nyata `ABELINK_TRAJECTORY_HEADLESS=1 bun bin/abelink.mjs "1+1" --max-turns 1` | file `turn-start.jsonl`+`turn-end.jsonl` muncul di root GUI; `bun run harness:diagnose --session <id>` → "2 events, 1 turn", turn jujur `failed:step-budget-exhausted` (max-turns 1), red-flag **bersih** |
| Adapter benchmark (`evaluation/abelink-adapter.mjs --task map_probe`) | exit 0, dengan & tanpa flag (jalur bench tak tersentuh) |
| Test CLI/TUI lama (5 berkas, 155 test) | hijau — wiring tidak mengubah kontrak lama |

## Berkas berubah

- **Baru**: `src/api/harnessCore.js`, `cli/core/harness-writer.mjs`,
  `cli/core/tool-hooks.mjs`, `tests/toolHooks.test.mjs`,
  `tests/harnessHeadless.test.mjs`
- **Diubah**: `cli/core/index.mjs` (barrel +7 ekspor), `cli/tui/engine.mjs`,
  `bin/abelink-tui.mjs`, `bin/abelink.mjs`, `cli/tui/usageStats.mjs` (filter
  sessionId), `docs/ARCHITECTURE.md` (§9 satu-skema-dua-penulis),
  `docs/PLANNED/2026-09-26_master-migration-program.md` (M2c ✅),
  `docs/PLANNED/2026-09-26_hermes-cli-engine-adoption.md` (H5 DONE-headless),
  `docs/PLANNED/2026-09-26_tui-parity-and-pluggable-migration.md` (PLAN-T1 ✅)

## Batasan dikenal

- Default tetap OFF: `ABELINK_TRAJECTORY_HEADLESS=1` harus disetel eksplisit
  (keputusan plan §4.4). Judul task M5 "wire" akan menyalakan flag secara
  default setelah paritas terbukti beberapa hari.
- Writer headless tanpa rotasi generasi (>50MB fail-closed). Paritas penuh
  rotasi menyusul bila digunakan berat.
- Dispatch INTERNAL sidecar (`engine/channels/*`) belum ber-hook (H5 sisa,
  disentuh M4 saat registry bertipe).
- Sesi GUI (Dexie) tidak ditulis oleh writer ini — GUI punya jalur Rust sendiri
  yang sudah jalan; tidak ada duplikasi penulis di renderer.
- `test:live` tidak dijalankan (butuh 9Router hidup ~70s); smoke memakai
  koneksi nyata yang sudah ada (CLI 1-turn + adapter).
- Belum di-commit: menunggu konfirmasi owner untuk push/PR (aturan branch+PR
  tetap: PR ke `main` dari `refactor/m2c-headless-observability`, stacked di
  atas M2b).
