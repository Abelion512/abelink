# bin/ — CLI Engine Abelink (engine, bukan sekadar client)

Arsitektur: **satu engine, banyak client**. Engine = `runAgentLoop`
(`src/api/ai/agentRunner.js`) + helper headless (`src/api/ai/headlessCli.js`)
+ pengaman headless (`src/api/ai/headlessSecurity.js`). Client di atas
kontrak engine yang sama: GUI (loop sendiri, paritas via modul bersama —
lihat ADR-001), extension browser, TUI, gateway Telegram.

## Binary

| File | Peran | Baris |
|---|---|---|
| `bin/abelink.mjs` | CLI headless: `agent run "<prompt>"` + flags provider/model/effort/permission | ~766 |
| `bin/abelink-tui.mjs` | TUI interaktif (slash `/models /init`, `@file`, `!shell`) | ~907 |
| `bin/abelink-cron.mjs` | Scheduled runs | ~574 |

## Cara run

```bash
bun bin/abelink.mjs agent run "ringkas repo ini" --workspace /tmp/x
bun bin/abelink-tui.mjs --workspace /tmp/x
```

`gemini-web` butuh sesi browser Google (hanya GUI) → gagal 100% headless
(`bin/abelink.mjs` menolak eksplisit, bukan gagal senyap). Flag keamanan
terlarang ditolak di mode headless (`evaluateHeadlessSecurity`).

## Gateway

`sidecar/main/telegram/gateway.mjs` — Telegram sebagai client remote di atas
engine yang sama (kontrak: `tests/telegram-gateway.test.mjs`).

## Kaitan

- Arah CLI: `docs/ABELINK_CLI_DIRECTION.md` (proposed).
- Kontrak harness headless + paritas GUI: `docs/ARCHITECTURE.md` §9–10.
- Data utama: `docs/abelink-5w1h.html` (FROZEN).
