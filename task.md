# TASK.md — Sesi Baru (2026-09-22 malam)

Branch: `feat/headless-agent-cli` @ `cca8d67` + 97 file berubah (54 modified, 43 untracked). Belum commit.

Konteks: baca `docs/PLANNED/sessions/2026-09-22_fanout-4fase.md` dulu (ringkasan fan-out 4 fase),
lalu `docs/PLANNED/2026-09-22_cli-engine-4fase.md` (kontrak §5-6 mengikat).

Status terakhir: CLI 102 tests hijau (`cli`, `cliHeadless`, `cli-tui`).
TUI `bin/abelink-tui.mjs` (903 baris) jalan untuk slash/model — hang/exit-0-tanpa-output
terjadi pada input tertentu (E2E pipe `printf | bun bin/abelink-tui.mjs` kadang EXIT:0 kosong).

## Urutan kerja (satu task satu sesi, gate manusia tiap akhir)

### T0 — Stabilkan tree (wajib pertama)
- [x] `git stash list` cek titipan sesi lain (2026-09-23: `stash@{0}` aman tak tersentuh).
- [x] Petakan 104 entri dirt: milik CLI vs sesi lain (music/connector/compaction/Jarvis/extension).
- [x] Verifikasi: full 1571/1571 + smoke + eslint sebelum commit.

### T1 — TUI hang / exit-0 tanpa output (prioritas tertinggi, dari user)
- Gejala: `printf '/init\n!echo SHELL-OK\n/exit\n' | bun bin/abelink-tui.mjs` → EXIT:0 kosong.
  Tapi `printf '/models gemini\n/exit\n'` → jalan normal. Intermittent.
- Hipotesis: piped-input race — baris tiba SEBELUM listener 'line' terpasang
  (startup lambat: import sidecar, auth, memori) hilang diam-diam. Kode drain
  `earlyLines`/`earlyCollector` sudah ada (±baris 801-871) tapi belum tentu benar.
- [x] Reproduksi deterministik (2026-09-23): `--workspace` ke dir hilang =
      `/init` ENOENT + `!echo` `[! exited ENOENT]`; hang kosong = varian dinginnya.
- [x] Fix: auto-mkdir workspace di `bin/abelink-tui.mjs:403` + `bin/abelink.mjs:318`.
- [x] Verifikasi: missing-workspace 3/3 hijau ENOENT 0 + `cli-tui/cli/cliHeadless`
      102/102 + `bunx eslint` 0 errors. Detail: `docs/PLANNED/sessions/2026-09-23_tui-workspace-guard.md`.

### T2 — Sisa upgrade TUI ala opencode (lanjutan sesi ini, sebagian sudah mendarat)
Sudah mendarat: slash `/models /details /init` + alias, `@file` + `!shell`,
banner opencode-style, `/thinking` toggle, busy-guard scope prompt saja,
lazy sidecar, komentar GAP-F1 bersih.
- [x] Verifikasi tiap fitur E2E pipe (2026-09-23): `/init`+`!echo` 3/3 exit 0,
      `@note.txt` attach OK, `/details`+`/thinking`+`/models`+`/effort` OK exit 0.
      LLM turn butuh kredensial 9Router (mesin tanpa key → retry, bukan bug TUI).
      Fix: `rl.on('close')` sebelum replay (hang /exit bila sidecar spawn).
- [x] Test 62 di `tests/cli-tui.test.mjs` tetap hijau; tanpa perilaku baru yang butuh test.

### T3 — Commit parsial per fase (jangan big-bang commit)
- [x] Commit 1 `e0168bb`: Fase 1 resume (headlessCli + agentRunner + bin/abelink.mjs + cli tests).
- [x] Commit 2 `5355a61`: Fase 2 TUI (bin/abelink-tui.mjs + cli-tui.test.mjs).
- [x] Commit 3 `424e924`: Fase 3 telegram gateway (gateway.mjs + test).
- [x] Commit 4 `9629fc4`: Fase 4 cron (bin/abelink-cron.mjs + test + guard headlessCli).
- [x] Commit 5 `3e98cc9`: docs (PLANNED + sessions + task.md).
- [x] Setiap commit: target tests hijau + eslint 0 errors SEBELUM commit.

### T4 — Full verification akhir
- [x] `bunx vitest run` full hijau (2026-09-23: 1571/1571).
- [x] `bun evaluation/smoke.mjs` LOLOS.
- [x] `bunx eslint` file tersentuh 0 errors.
- [ ] Cargo lib (bila sentuh Rust): Rust tak tersentuh sesi ini — skip.

## Batasan / jangan sentuh
- `stash@{0}` ponytail-cleanup = milik sesi lain.
- Diff `src/hooks/` (merge 43d971a) = pre-existing, bukan scope.
- Tanpa duplikat loop. Tanpa hardcode key. Tanpa klaim angka tanpa run.
- Protokol fan-out: tanpa ID task eksplisit = tolak.

## Referensi cepat
- Kontrak: `docs/PLANNED/2026-09-22_cli-engine-4fase.md`
- Roadmap: `docs/PLANNED/2026-09-22_cli-engine-roadmap.md`
- Permission: `docs/PLANNED/2026-09-22_cli-permission-modes.md`
- Sesi terakhir: `docs/PLANNED/sessions/2026-09-22_fanout-4fase.md`
- Cara run: `bun bin/abelink.mjs "prompt" --workspace /tmp/x`
- TUI: `bun bin/abelink-tui.mjs --workspace /tmp/x` (atau bare `abelink` di TTY)
