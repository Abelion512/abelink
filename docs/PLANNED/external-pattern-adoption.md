# External Pattern Adoption Register

Pola dari produk luar (Hermes, opencode, claude-code, codex, gemini, qwen,
agy) masuk ke Abelink HANYA bila: (1) sumber primer terverifikasi, (2) bench
atau evaluasi menunjukkan delta, (3) boundary coding-agent dihormati
(AGENTS.md: diferensiasi = orkestrasi riset/browser/OS/memory/long-horizon,
bukan duplikasi coding). "Mandiri tapi gandeng" — adopsi pola, bukan produk.

## Status: ADOPTED (mendarat di TUI-v2)

| Pola | Sumber primer | Adopsi | Bukti |
|---|---|---|---|
| Satu inti, banyak host (AIAgent untuk CLI/gateway/ACP/batch; beda platform di entry point) | Hermes developer-guide/architecture ("Platform-agnostic core") | `runAgentLoop` untuk CLI/TUI/gateway/cron; GUI = slice susulan | 4fase §0 + V2-1c |
| Katalog model terpusat + TTL + refresh background + atomic write | opencode `packages/core/src/models-dev.ts` (TTL 5 mnt, refresh 60 mnt, tmp+rename, Flock) | `cli/tui/modelCatalog.mjs` (TTL 5 mnt, stale-while-revalidate, tmp+rename) | S1, 1322 model live |
| Picker Favorites -> Recent(10) -> providers + last-used precedence | opencode `dialog-model.tsx` + `context/local.tsx` + `provider.ts defaultModel` | `curatePicker` + recentModels cli.json (cap 10) | S1 |
| `/models --refresh` | opencode docs/cli | `/models --refresh` | S1 |
| Effort mapped & clamped per provider (profile + subset + defaultEffort) | qwen docs model-providers ("Override reasoning capabilities") | `cli/tui/thinkingPolicy.mjs` (profile per thinkingFormat + clamp) | S2 |
| Level tak didukung -> tertinggi-di-bawahnya | claude-code docs/model-config | `clampEffort` | S2 |
| `ultracode` = kirim xhigh + orkestrasi workflow (BUKAN level model) | claude-code docs/model-config | `ultraLocal` flag + wire xhigh | V2-3/S2 |
| `ultrathink` = keyword in-context turn itu saja, effort API tak berubah | claude-code docs/model-config | Dipahami; tidak diimplementasi (tak ada keyword setara) | — |
| Adaptive thinking + `output_config.effort`, budget manual deprecated/ditolak 4.7+ | Anthropic docs effort + extended-thinking | Bridge thinkFmt-driven (adaptive vs budget vs strip) | S2 |
| Ganti budget/effort mid-conversation menginvalidasi cache | Anthropic docs extended-thinking (prompt caching) | warning cache + hold-constant per session | V2-2 |
| `/usage` statistik terminal; recap HTML = perintah terpisah | gemini `/stats`, codex `/usage`, qwen `/stats` vs `/export html` | `/usage` terminal (tanpa $); HTML = TODO terpisah | S3 |
| Session resume (`--continue/--session`, picker, fork) | opencode/cli, claude-code/sessions, hermes/sessions | Sudah ada (Fase 1: `--continue/-c`, `--session/-s`, `sessions`) | Fase 1 |

## Status: UNDERSTOOD (dipahami, belum/tidak diadopsi)

| Pola | Sumber primer | Keputusan |
|---|---|---|
| Variants per model + `ctrl+t` cycle (bukan knob global) | opencode docs/models + `transform.ts` | Tidak: 9Router sudah sediakan thinkingFormat live; knob effort + clamp cukup |
| `/thinking` display-only | opencode docs/tui | Tidak: `/thinking` kita = toggle tampil (kebetulan sama), tanpa klaim capability |
| Enter=simpan vs s=sesi-saja (picker) | claude-code docs/model-config | Tidak: keputusan terkunci /model selalu permanen |
| Harga live per model (`--verbose`, `Free` label) | opencode docs/cli | Tunda: butuh key + network; offline = alias statis |
| `/insights` HTML analitik gesekan | claude-code docs/costs | Tunda: beda dari /usage; scope recap terpisah |
| Fallback chain provider + 3 API modes | Hermes provider-runtime | Tunda: relevan saat multi-provider, kini 9Router-first |
| SQLite WAL + FTS5 + lineage sesi | Hermes session-storage | Tunda: file store Fase 1 cukup; migrasi bila FTS dibutuhkan |
| Sub-agent scope model (model utama tak override sub-agent) | gemini docs/cli/model | Catat: `spawn effort low` kita = kebijakan sendiri, dievaluasi terpisah |

## Aturan penambahan baris

Satu baris per pola: sumber primer (URL/file + baris), status (ADOPTED/UNDERSTOOD/Tunda + alasan), bukti (test/sesi). Tanpa sumber primer = tidak masuk.
