# Session 2026-09-22 — Fix CLI gagal (provider routing + 9Router auth)

Mode: build. Branch: feat/headless-agent-cli.

## Gejala user

`bun run cli:agent -- "battle di iki tryout 10 soal"` ->
`Server AI lokal tidak merespons di localhost:20128. Nyalakan dulu aplikasinya.`

## Diagnosis (3 akar, semua terverifikasi bukti)

1. **Default provider salah untuk headless.** CLI default `gemini-web`
   (`bin/abelink.mjs:97`, `headlessCli.js:73`, test pin `gemini-web`).
   gemini-web = RPC web Google tanpa cookie (`generateGeminiResponse(...,
   cookie='')`), gagal -> fallback `aiProvider: 'local'` ->
   `http://127.0.0.1:20128` TANPA API key -> 9Router jawab
   `Missing API key` -> pesan "nyalakan dulu aplikasinya" (menyesatkan:
   server hidup, key yang hilang). GUI selamat karena config Dexie-nya
   (`customApiKey sk-e15...`, `customModel oc/muse-spark-...`) tidak pernah
   dibaca CLI; CLI hanya kirim env (kosong).
2. **Model name mentah 404.** `conf.model || conf.customModel ||
   'claude-work'` (`ai-bridge.js:348`): key GUI `customModel` =
   `oc/muse-spark-1.3-contributor-free` (ID 9Router valid) TERTIMPA default
   CLI `gemini/gemini-2.5-flash` (404 di 9Router). Terbukti: `claude-work`
   -> 200 via `deepseek-v4-flash-0731free`; `abelink` -> 200 via
   `muse-spark-1.3-contributor-free`; `google/gemini-3-flash`,
   `deepseek/deepseek-v4-flash`, `openai/gpt-5-mini`, `moonshotai/kimi-k3`
   semua `No active credentials`.
3. **Signature mismatch (crash kedua).** `core.js:154` panggil
   `fetchTransport({messages, config, ...})` satu objek; adapter CLI lama
   terima positional `(messages, config, ...)` -> `messages` undefined ->
   `inputMessages.map is not a function`. Mock test (`cliHeadless`) pakai
   bentuk objek — adapter produksi salah.

## Fix

- `headlessCli.js:resolveCliAuth`: default `custom` + `claude-work`
  (headless; gemini-web butuh sesi browser GUI).
- `bin/abelink.mjs`: default options `custom`/`claude-work`, help text,
  flags mapping tanpa pengecualian gemini-web, `combinedConfig` auth-menang
  (`auth.model || cliOptions.model || ... || 'claude-work'`), adapter terima
  bentuk objek + positional fallback.
- Test update: `cli.test.mjs` + `cliHeadless.test.mjs` pin default baru.

## Verifikasi

- Target: 20 passed. Full: 1445 passed. Lint: 0 errors.
- E2E real headless (tanpa GUI):
  `CUSTOM_API_KEY='sk-...' bun bin/abelink.mjs agent run "jawab hanya: ok"`
  -> COMPLETED 1 step. Tanpa key -> gagal jujur (bukan pesan menyesatkan).

## Cara run (jawaban user)

```bash
bun bin/abelink.mjs agent run "<prompt>" --workspace /tmp/ujicli
```

- Butuh `CUSTOM_API_KEY` (key 9Router, mis. dari `~/.9router/db/data.sqlite`
  tabel `apiKeys`) atau `GROQ_API_KEY`, atau `~/.config/abelink/cli.json`
  / `.abelink/cli.json` (`{provider, model, ...}`).
- Tanpa key + tanpa server lokal = gagal jujur di provider custom.
- `--approve-all` untuk tool approval-gated; hardline tetap ditolak.

## Batasan dikenal

- Key 9Router per-client; key contoh di log ini milik user, jangan commit.
- `gemini-web` tetap default GUI (ada sesi browser); CLI default custom.
