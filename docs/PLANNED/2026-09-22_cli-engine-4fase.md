# CLI-Engine 4 Fase — Plan Implementasi (contract-first, fan-out)

Date: 2026-09-22
Status: approved. Eksekusi fan-out 4 subagents, 1 per fase.
Mode: build. Branch: feat/headless-agent-cli.

## 0. Prinsip (locked)

- Satu inti (`runAgentLoop`), banyak host (CLI/GUI/TUI/gateway/cron).
  Tanpa duplikat loop. Tanpa produk CLI baru — GUI ke CLI.
- Referensi per fase (keputusan owner):
  - Fase 1 (resume): BANYAK referensi (opencode run/session + Hermes session-storage).
  - Fase 2 (TUI): opencode (TUI/CLI/models).
  - Fase 3 (gateway): Hermes gateway-internals.
  - Fase 4 (cron): Hermes cron-internals + agy/dll (konsultasi saat implementasi, jangan klaim isi yang belum dibaca).
- Satu fase satu owner-file-set. Kontrak antar-fase di §5 — subagents
  implementasi paralel TANPA menyentuh file fase lain.

## 1. Referensi normatif (jangan contek buta)

- Opencode: `opencode run "msg"` non-interaktif; `-c/--continue`,
  `-s/--session`, `-m provider/model`, `--format json`, `--attach`,
  `/models`, `/sessions`, `/resume`, `/new`, `/thinking`, variants +
  `variant_cycle`, loading priority flag > config > last-used > internal.
- Hermes agent-loop: dua entry (`chat`/`run_conversation`), turn lifecycle,
  interruptible call, tool sequential/concurrent, callback per platform,
  budget 500, fallback chain, compression lindungi 20 pesan terakhir.
- Hermes provider-runtime: precedence explicit > config.yaml > env >
  default; key di-scope per base URL; fallback chain; auxiliary routing.
- Hermes session-storage: SQLite WAL + FTS5 + lineage kompresi +
  isolasi profil (`HERMES_HOME`); CLI resume = baca DB yang sama.
- Hermes gateway: adapter → `MessageEvent`, session key
  `agent:{ns}:{platform}:{type}:{id}`, two-level guard, auth berlapis
  (allow-all/allowlist/pairing/default-deny), delivery multi-target, hooks.
- Hermes cron: `jobs.json` atomic, tick 60 dtk, at-most-once +
  missed-occurrence contract, sesi fresh terisolasi, delivery
  `platform:target`, recursion guard, file locking, `hermes cron *`.

## 2. Fase 1 — Resume headless (refs: opencode + Hermes session-storage)

- Store file `~/.config/abelink/cli-sessions/<id>.json` (0600):
  `{v:1,id,workspace,provider,model,modelVersion,effort,createdAt,
  updatedAt,prompt,outcome,terminalReason,messages:[{role,content}]}`.
  Cap 50 pesan saat save. Tanpa FTS/lineage/sync-GUI (ceiling tercatat).
- `headlessCli.js`: `loadCliSession/saveCliSession/listCliSessions({dir})`
  pure, dir-injected, never-throw (mirip `loadCliFileConfig`).
- `agentRunner.js`: `options.initialHistory` → seed `loopMessages`
  (hanya user/assistant, string content); return tambah `history`.
- `bin/abelink.mjs`: `--session/-s <id>`, `--continue/-c` (terakhir per
  workspace), subcommand `sessions`; prompt opsional saat resume;
  footer `session <id>` + `sessionId` di `--json`.
- Test: parse flag; round-trip tmpdir (+corrupt/missing); history mencapai
  planner (mock fetchAI); lifecycle save→reload→resume-append.
- File milik Fase 1: `src/api/ai/headlessCli.js`, `src/api/ai/agentRunner.js`,
  `bin/abelink.mjs`, `tests/cli*.test.mjs`.

## 3. Fase 2 — TUI interaktif (ref: opencode)

- File BARU `bin/abelink-tui.mjs` (+ `agent interactive` alias opsional).
  Reuse: `createSidecarClient`, auth chain, preflight, `NATIVE_TOOLS`
  dispatch, memory loader. Stdlib `node:readline` (tanpa dep baru).
- Per-turn AbortController (Ctrl-C batalkan turn saja); `onThought/onStep`
  → line renderer; `needs_user` → re-prompt (bukan exit).
- Slash (parse `^/`, tak dikirim sebagai prompt): `/model [alias|id]`,
  `/effort [...]`, `/sessions`, `/continue <id>`, `/new`, `/help`.
  Tunda `/undo` (tanpa primitif).
- Streaming: teruskan `stream:true` + event frame sidecar (gap tercatat).
- Kontrak ke Fase 1: pakai `loadCliSession/saveCliSession` + `initialHistory`
  persis §2 (jangan bikin store kedua).
- Test: tabel parser, alias resolve, effort validasi, store round-trip,
  abort→`user_abort`, needs_user→prompt, regresi one-shot.
- File milik Fase 2: `bin/abelink-tui.mjs` (BARU), `tests/cli-tui.test.mjs`
  (BARU). DILARANG edit `bin/abelink.mjs` kecuali help 1 baris (koordinasi).

## 4. Fase 3 — Telegram gateway minimal (ref: Hermes gateway)

- File BARU `sidecar/main/telegram/gateway.mjs` (~150 baris) di atas
  service yang ada: normalisasi → `MessageEvent`
  `{platform:'telegram',chatKind,chatId,userId,username,messageId,
  text,caption/file,ts}` → session key
  `agent:abelink:telegram:{private|group}:{chatId}` → allowlist
  (deny default; `ALLOW_ALL` env opsional) → guard per-sesi →
  `runAgentLoop` → reply via `sendTelegramMessage`; approval via
  keyboard + `waitForAskUserAnswer` yang ada.
- Tanpa pairing DM (tunda; reuse `pendingChatIdsSet` nanti), tanpa
  multi-target fan-out (direct reply + broadcast terpercaya saja).
- Test BARU `tests/telegram-gateway.test.mjs`: normalisasi, matriks
  allowlist, dedup, guard, relay incl. timeout, antrean offline.
  Regresi: `telegramStart`, `telegramTargets`, headless-security assert.
- File milik Fase 3: `sidecar/main/telegram/gateway.mjs` (BARU),
  `tests/telegram-gateway.test.mjs` (BARU). DILARANG edit service/channel.

## 5. Fase 4 — Cron greenfield (refs: Hermes cron + agy/dll)

- `jobs.json` di `brandDir()/cron/jobs.json`:
  `{version:1,jobs:[{id,name,prompt,schedule:{kind:"intervalSec",everySec}|
  {kind:"cron",expr},timezone,enabled,delivery:{platform:"log"|"telegram",
  target},effort,maxTurns,workspace,createdAt,lastRunAt,nextRunAt,
  lastStatus}]}`. Tulis tmp+rename + `mkdir -p`.
- Daemon BARU `bin/abelink-cron.mjs`: tick 60 dtk → due (`nextRunAt<=now`;
  catch-up = run sekali, catat `missed:true`) → lock `O_EXCL` +
  stale-PID check → spawn `bun bin/abelink.mjs --json` (+`ABELINK_CRON=1`,
  `ABELINK_JOB_ID`) → ledger JSONL → update atomic → release.
  At-most-once = lock + single-flight.
- Delivery: `log` dulu (ledger + `lastStatus`); `telegram` memakai sender
  service yang ada (tanpa itu = tetap `log`, jujur).
- Recursion guard: di bawah `ABELINK_CRON=1`, tolak tool `cron_*` +
  paksa depth-cap subagent yang ada.
- CLI: `abelink cron list/create/pause/resume/run/remove` (kelola
  `jobs.json` saja).
- Test BARU `tests/cron-scheduler.test.mjs`: nextDue/missed murni, lock
  contention, atomic tulis, at-most-once konkurensi (mock runAgentLoop),
  guard, envelope ledger, e2e mock.
- File milik Fase 4: `bin/abelink-cron.mjs` (BARU),
  `tests/cron-scheduler.test.mjs` (BARU), `src/api/ai/headlessCli.js`
  HANYA blok guard `cron_*` (koordinasi via kontrak, tanpa refactor).

## 6. Kontrak bersama (mengikat 4 subagents)

- Session store §2 adalah SATU-SATUNYA store CLI. Fase 2/4 reuse, bukan duplikat.
- `runAgentLoop` options baru HANYA `initialHistory`; return tambah
  `history`. Tanpa perubahan signature lain.
- CLI flags baru: `--session/-s`, `--continue/-c`, `sessions`. Exit codes
  tetap 0/1/2/3. `--json` tambah `sessionId` saja.
- Test runner: `bunx vitest run <file>`; lint file tersentuh 0 errors.
- DILARANG: edit file fase lain; ubah perilaku GUI; klaim angka tanpa run;
  hardcode key; bypass approval.

## 7. Gate

- Per fase: target tests hijau + lint 0 errors + E2E tercatat.
- Full `bunx vitest run` + `bun evaluation/smoke.mjs` hijau di akhir.
- Session log per fase di `docs/PLANNED/sessions/`.
