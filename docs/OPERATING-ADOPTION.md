# Operating Adoption Map — status & backlog

Status per area operating model (per 2026-09-19). Tiap baris: sudah ada
di repo → file; belum → backlog berprioritas.

## Sudah teradopsi (hijau)

| Area | Bukti di repo |
| ---- | ------------- |
| Guardian 3-tier | `sidecar/main/tools/_shared.mjs` + `tests/hermes-guardian.test.mjs` |
| Sensitive-write umum | `sidecar/main/tools/_shared.mjs` + `src-tauri/src/hardline.rs` (Hermes ~/.ssh, .env, rc) |
| Approval native | `src-tauri/src/cmd_node_bridge.rs` APPROVAL_ACTIONS + rfd |
| Watchdog independen | `src-tauri/src/watchdog.rs` (1000/100/60) |
| Budget + eskalasi | `planStepBudget.js` + eskalasi +16 (`useAbelinkPlan.js`) |
| Contract claim/bukti | `agentDecision` + `objectiveVerifier` (claim-quoted, test-evidence, SEARCH-ERROR) |
| RSI terukur | `learnedSkills` telemetri + trial gate + arsip (`db.js` v29) |
| Anti-hack repair | artefak vitest wajib (`selfHealingEngine.js`) |
| Internet-first persisten | `builtinPlugins.internetFirst` + toggle |
| Registry + deferred load | skills/plugins/connectors 1-baris + read-skill/read-tools |
| Rantai search | 9Router → browser google → DDG (`browserTools.mjs`, `routerSearch.mjs`) |
| Session reseed | `ensureSession` reseed token file (`bridge-core.mjs`) |
| 401 beralasan | `tokenRejectReason` + auto-retry helper |
| Snapshot konten | `browser-snapshot`/`wait-for`, extract tanpa selector |
| Isolasi tab sesi | sessionId propagation + anti-curi adopsi/grup |
| /goal kontrak misi | skill native + floor budget 48 |
| Memory router | `src/api/ai/memoryRouter.js` (per-turn context selection & assembly) |
| Tool search deferred | `src/api/tools/toolCatalog.js` + `tests/toolSearchDeferred.test.mjs` |
| Skill folder bundle | `src/api/skills/skillFolder.js` + `sidecar/engine/channels/skills.mjs` |
| Budget counter murni | `StepBudget`, `wrapUpNotice` (`effortSystem.js`, `budgetNotice.js`) |
| Eval gate | `scripts/verify.sh` + AbelinkBench |

## Backlog (kuning — prioritas berurutan)

1. **Rust kenal hardline** — SELESAI (9d1a3f8).
2. **Sensitive-write umum** — SELESAI (feat/sensitive-write-guardian).
3. **Memory router eksplisit** — SELESAI (feat/memory-router).
4. **Tool search deferred penuh** — SELESAI (feat/tool-search-deferred).
5. **Skill folder penuh** — SELESAI (feat/skill-folder-bundle).
6. **Handoff contract JSON** — objective/done/remaining/blocked/
   artifacts/verified/next_action tertulis tiap sesi durable.
7. **Nudge + eval mini skill** — pemicu graduateTrialSkill otomatis
   (sekarang manual).
8. **MEMORY_TOOL_SPEC wiring** — single memory tool + failure cap
   (spec ada, belum di-wire).
9. **Identifier rename** — `dev.abelink` / `dev.abelink.dev` (butuh audit
   tabrakan data dir dulu).
10. **CDP mode kedua** — bila butuh heap/trace/network forensik
    (sekarang pola CDP ditiru tanpa CDP).

## Sengaja tidak diadopsi (merah — dengan alasan)

- Lease lintas-proses Hermes — tidak ada kontensi Desktop/CLI/gateway
  di Abelink (Dexie single-renderer).
- SQLite hardening (FTS5/trigram/lockguard) — Orama + Dexie cukup di
  browser; tidak ada WAL/lease yang perlu dijaga.
- Kanban penuh — durable tasks Dexie cukup; klaim lintas-restart belum
  dibutuhkan.
- cua-driver/MCP browser — daemon Linux + extension cukup; dependensi
  biner baru tidak sepadan.
- Free-tier rescue ring — tidak ada tier gratis setara di Abelink;
  rescue tanpa tier = jalur fallback tak teruji.
- Konsolidasi LLM curator default-ON — mahal + berisiko; prune
  deterministik cukup (LLM hanya opt-in).
