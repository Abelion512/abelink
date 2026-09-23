# CLI-Engine Roadmap — Satu Inti, Banyak Host (ATM Hermes)

Date: 2026-09-22
Status: roadmap doc. Sumber: Hermes agent-loop / session-storage /
provider-runtime / gateway-internals / cron-internals (docs primer) +
audit kode Abelink.

## Prinsip (Hermes, diadaptasi)

- Satu loop inti (`runAgentLoop`) dilayani CLI, GUI, bench, dan nanti
  gateway/cron. Beda host hanya di entry point, bukan duplikat loop.
- Satu resolver provider dipakai semua host (precedence: explicit >
  config > env > default; key di-scope per base URL).
- Satu session store dibaca semua host (SQLite WAL + FTS + lineage).
- Callback per host (thinking/step/stream) dari satu loop yang sama.

## Pemetaan kini (terverifikasi kode)

| Hermes | Abelink | Status |
|---|---|---|
| `AIAgent.run_conversation` | `runAgentLoop` (agentRunner.js) | Ada — dipakai CLI + bench |
| prompt tiers + policy | planning.js + autonomyContract | Ada, tersebar |
| provider resolver bersama | ai-bridge per-request config | Belum — tiap jalur bawa config sendiri |
| tool registry + hooks | NATIVE_TOOLS + channels | Ada, tanpa pre/post hook |
| supervisor/verifier | trajectorySupervisor + objectiveVerifier | Ada |
| SQLite + FTS + lineage | Dexie (GUI-only) | Sebagian — CLI file working-memory |
| gateway + session key + delivery | telegram-service (polling) | Sebagian — tanpa MessageEvent/auth berlapis |
| cron scheduler | task-daemon (reap) + groomer timer | TIDAK ADA scheduler — greenfield |

## Fase (vertikal, satu fase satu sesi, gate manusia)

### Fase 1 — resume headless (boleh habis CLI stabil; CLI kini stabil)

- Session store file/DB, `--continue`/`--resume` ala `opencode run -c/-s`.
- Lineage kompresi, FTS bila murah. Tanpa duplikat loop.

### Fase 2 — TUI (setelah semua fungsi GUI tersedia di CLI)

- Interaktif: multiline, streaming, interrupt, `/model` + variants,
  `/effort`, sessions list. Tanpa duplikat loop; host ketiga di atas inti.

### Fase 3 — Telegram gateway minimal (tele saja)

- Session key, allowlist/pairing, delivery, approval relay,
  running-guard. Di atas telegram-service yang ada.

### Fase 4 — cron (next time; GUI TIDAK punya scheduler)

- Yang ada kini: task-daemon (reap), groomer timer, Google Calendar
  (manajemen jadwal, bukan scheduler). Jadi cron = greenfield:
  jobs.json + tick + delivery + recursion guard.

## Aturan eksekusi

- Spek → slice vertikal + gate manusia → implementasi. Tanpa fan-out semua.
- Setiap fase: plan doc sendiri sebelum kode.
