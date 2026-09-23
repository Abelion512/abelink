# Session 2026-09-22 — CLI-engine Hermes-style + model frontier + simplifikasi

Mode: build. Branch: feat/headless-agent-cli.

## 1. Arsitektur CLI-engine (ATM Hermes, bukan produk CLI baru)

Hermes: satu `AIAgent` inti dilayani CLI/gateway/ACP/batch/cron.
Pemetaan Abelink (terverifikasi kode, bukan klaim):

- `src/api/ai/agentRunner.js` (`runAgentLoop`) = inti (prompt assembly,
  verifier, supervisor, budget) — dipakai CLI DAN bench adapter.
- `bin/abelink.mjs` CLI = host tipis (parse arg, spawn sidecar, presentasi).
- Tauri GUI (`useAbelinkPlan.js`) = host kedua. Sidecar engine = backend tools.
- Dexie = session storage (GUI); CLI pakai file working-memory
  (Dexie shim rapuh headless — kontrak stabil yang sama).

Yang BELUM setara Hermes (jujur, bukan janji): resume sesi headless,
mode TUI interaktif, gateway/cron. CLI tetap one-shot per run.
Aturan `docs/ABELINK_CLI_DIRECTION.md` dipatuhi: CLI client, bukan otak kedua.

## 2. Model frontier (web research + katalog live)

- OpenRouter live (445 model, key user aktif): frontier per keluarga —
  `google/gemini-3.8-flash`, `anthropic/claude-fable-5.1`,
  `moonshotai/kimi-k3`, `deepseek/deepseek-v4.1-flash`, `qwen/qwen3.8-flash`,
  `z-ai/glm-5.3-flash`, `x-ai/grok-4.6`, `openai/gpt-5.6-luna`.
- Free tier ($0, 24): `qwen/qwen3.8-27b:free`, `zenmux:kimi-k3-free`,
  `z-ai/glm-5.2:free`, `google/gemma-4-31b-it:free`, `openrouter/auto`.
- `kgw` TIDAK ADA di katalog 9Router (4499 model, 0 hit) — bukan alias yang
  dikenali; tidak dibuat-buat. `auto` = `openrouter/auto` (router bawaan).
- Default lama `gemini-2.5-flash` (>1 thn) -> `google/gemini-3.8-flash`.

## 3. Implementasi

- `headlessCli.js`: `MODEL_ALIASES` (19 alias) + `DEFAULT_CLI_MODEL`,
  `resolveCliAuth` kembalikan `apiKey`, `loadNineRouterKey` (bun:sqlite ->
  sqlite3 CLI fallback, best-effort), `writeCliSetup` (tulis
  `~/.config/abelink/cli.json` 0600, key di-redact di output).
- `bin/abelink.mjs`: bare prompt (`abelink "prompt"` = `agent run`),
  subcommand `setup` + `models [filter]`, flag `-m` + `--api-key`,
  fallback sekali ke `claude-work` saat kredensial provider mati,
  FATAL beri hint key konkret (bukan "nyalakan aplikasinya").
- Test: alias resolve, key chain, setup tulis tanpa bocor key, 9Router
  autodetect best-effort.

## Verifikasi

- Target: 27 passed. Full: 1452 passed. Lint: 0 errors.
- E2E headless tanpa flag/key/GUI:
  `bun bin/abelink.mjs "jawab hanya: ok" --workspace /tmp/ujicli
  --max-turns 2 -m free` -> COMPLETED (key autodetect DB, alias resolve).
- `models gemini`, `setup` (status) jalan tanpa sidecar/LLM.

## Cara run baru (jawaban user)

```bash
bun bin/abelink.mjs "battle di iki tryout 10 soal" --workspace /tmp/ujicli
bun bin/abelink.mjs "riset X" -m free        # gratis
bun bin/abelink.mjs "riset X" -m fable       # reasoning berat
bun bin/abelink.mjs models kimi              # lihat alias
bun bin/abelink.mjs setup --model gemini --api-key <key>   # sekali saja
```

Key chain: `--api-key` > `ABELINK_API_KEY`/`CUSTOM_API_KEY` env >
`cli.json` > DB 9Router autodetect > gagal jujur + hint.

## Batasan dikenal

- GUI/VIM ala opencode DITUNDA per user (nanti).
- Key contoh di log sesi ini milik user, jangan commit.
- `gemini-web` tetap default GUI (butuh sesi browser); CLI default custom.
