# MARK v2 — Task Breakdown by Priority

**File Context:**
- Plan master: `.hermes/plans/2026-07-26_mark-v2-agentic-upgrade.md`
- Existing codebase: `src/main/`, `src/renderer/src/api/ai/`, `src/renderer/src/hooks/`
- Dependencies: `@modelcontextprotocol/sdk` v1.25.3 already installed
- Current bottleneck: monolithic loop `useMarkPlan.js:913L`, single model `ai-bridge.js`, hardcoded tools `planning.js` system prompt `300L`

---

## P0 — CRITICAL (Blocks all other work)

### TASK-01: Multi-Format Output Parser

| Field | Detail |
|-------|--------|
| **ID** | TASK-01 |
| **Title** | Enhanced fallback output parser — fix model cheap gagal JSON |
| **Impact/Fungsi** | Model cheap (deepseek-v4, mimo-2.5) sering output format gak valid. Saat ini cuma JSON + jsonrepair kemudian sering fail kemudian loop death spiral. Enhanced parser bikin MARK survive dari output model kualitas rendah |
| **Estimasi** | 4 jam |
| **Pro/Cons** | **Pro:** Langsung solve problem paling sakit. Model murah jadi usable. Death spiral ilang **Cons:** Parse bisa false-positive (terima output salah) |
| **File changes** | `src/renderer/src/api/ai/fallback-serializer.js` (enhance), `src/renderer/src/api/ai/core.js` (cleanAndParse menjadi use enhanced) |
| **Method** | Add Strategy 4 (regex intent extract) + Strategy 5 (cross-model retry with system prompt). Keep existing JSON/XML/KV |

### TASK-02: Model Router Foundation

| Field | Detail |
|-------|--------|
| **ID** | TASK-02 |
| **Title** | Multi-model router with capability probe |
| **Impact/Fungsi** | Prasyarat untuk semua multi-model feature. MARK bisa pilih model berbeda per task type (orchestrator vs worker vs vision). Tanpa ini, semua task pake 1 model = bottleneck |
| **Estimasi** | 8 jam |
| **Pro/Cons** | **Pro:** Buka jalan ke vision terpisah, coding pake model mahal, chat pake model murah **Cons:** Complexity naik. 1 endpoint fail affect multiple routes |
| **File changes** | NEW: `src/renderer/src/api/ai/model-router.js` MODIFY: `src/main/ai-bridge.js` (accept model param, multi-endpoint) MODIFY: `src/renderer/src/api/ai/core.js` (use model-router) |
| **Method** | Runtime probe: test JSON mode + vision support on connect. Cache 24h localStorage. Fallback chain: 9Router menjadi LM Studio local |

### TASK-03: 9Router Single-Endpoint Consolidation

| Field | Detail |
|-------|--------|
| **ID** | TASK-03 |
| **Title** | Consolidate multi-model config to single 9Router endpoint |
| **Impact/Fungsi** | User cukup config 1 endpoint + 1 API key. Semua model (deepseek, gemini, mimo, nemotron) di-proxy via 9Router. Config complexity turun 4x |
| **Estimasi** | 6 jam |
| **Pro/Cons** | **Pro:** Dramatisir konfigurasi. Gampang debug (1 log stream) **Cons:** 9Router jadi single point of failure. Tapi fallback ke LM Studio lokal |
| **File changes** | MODIFY: `src/main/ai-bridge.js` (9Router proxy routing) MODIFY: `src/renderer/src/api/ai/model-router.js` (model to 9Router ID) MODIFY: Config UI `src/renderer/src/pages/Configuration.jsx` |
| **Method** | Semua call via `${9ROUTER_URL}/v1/chat/completions` dengan `model: ag/deepseek-...` |

---

## P1 — HIGH IMPACT (Produktivitas langsung terasa)

### TASK-04: Vision Service

| Field | Detail |
|-------|--------|
| **ID** | TASK-04 |
| **Title** | 2-tier vision dispatch: Gemini 3.1 Flash-Lite + Mimo 2.5 |
| **Impact/Fungsi** | Vision MARK sekarang paksa pake model chat utama (deepseek) yang gak support menjadi selalu error. Dedicated vision model = MARK bisa liat layar dan kamera dengan benar |
| **Estimasi** | 8 jam |
| **Pro/Cons** | **Pro:** Vision works. Parallel call = latency turun dari 5s ke 2s. Camera optimization (frame sampling 1FPS) **Cons:** 2 model = 2 API cost. Tapi gemini flash murah |
| **File changes** | NEW: `src/renderer/src/api/ai/vision-service.js` MODIFY: `src/renderer/src/hooks/agent/useMarkPlan.js` (vision tools menjadi vision-service) MODIFY: `src/renderer/src/api/ai/planning.js` |
| **Method** | Parallel call gemini-fast + mimo-deep. 8s timeout. Take first confident result. Camera: 1-2 FPS + motion trigger via OpenCV lokal |

### TASK-05: Error Log SQLite

| Field | Detail |
|-------|--------|
| **ID** | TASK-05 |
| **Title** | Persistent error/solution log - not lost on compaction |
| **Impact/Fungsi** | Error history selama ini ilang pas context di-compact. MARK jadi lupa error yang sama, fix problem sama 2x. Error log SQLite = error tetap available, inject ke system prompt otomatis |
| **Estimasi** | 4 jam |
| **Pro/Cons** | **Pro:** Gak ada error repetition. Error counter memungkinkan deteksi recurring issue **Cons:** SQLite overhead kecil (~1ms per query) |
| **File changes** | NEW: `src/renderer/src/api/ai/error-log.js` MODIFY: `src/renderer/src/api/ai/planning.js` (inject error log to system prompt) |
| **Method** | INSERT OR REPLACE by sha256(tool+error). Auto-inject 3 most relevant errors ke system prompt tiap turn |

### TASK-06: Context Compactor

| Field | Detail |
|-------|--------|
| **ID** | TASK-06 |
| **Title** | Smart context compression instead of hard truncation |
| **Impact/Fungsi** | Saat ini input-architecture.js cuma truncate dari belakang (8K token). Context kompresi preserve keputusan penting, file changes, error pattern. MARK inget konteks lebih lama |
| **Estimasi** | 8 jam |
| **Pro/Cons** | **Pro:** Sesi panjang gak degradasi. Keputusan arsitektur gak ilang **Cons:** Compression lossy. Model bayar token untuk baca compressed summary |
| **File changes** | NEW: `src/renderer/src/api/ai/context-compactor.js` MODIFY: `src/renderer/src/api/ai/input-architecture.js` (panggil compactor instead of truncate) |
| **Method** | Trigger lebih dari 70% context. Keep: system prompt + last 3 turns. Compress: middle turns via auxiliary model (cheap). Preserve: file write artifacts, error patterns |

---

## P2 — AGENTIC CORE (Orchestrator + Sub-Agent)

### TASK-07: Task Decomposer

| Field | Detail |
|-------|--------|
| **ID** | TASK-07 |
| **Title** | Task complexity detection + DAG decomposition |
| **Impact/Fungsi** | MARK sekarang gak bisa bedain hai sama buat web app todo list. Keduanya diproses sama. Task decomposer: complex task dipecah jadi sub-task DAG, simple task langsung jawab |
| **Estimasi** | 10 jam |
| **Pro/Cons** | **Pro:** Complex task handle optimal. Simple task gak kena overhead planning **Cons:** Template DAG mungkin terlalu kaku. Fallback ke single-loop |
| **File changes** | NEW: `src/renderer/src/api/ai/orchestrator.js` (classifier + decompose) NEW: `src/renderer/src/api/ai/dag-validator.js` (cycle detection) |
| **Method** | Template-guided: model isi form JSON. Cycle detection via Kahn. Classifier: keyword length + tool pattern |

### TASK-08: Sub-Agent Pool

| Field | Detail |
|-------|--------|
| **ID** | TASK-08 |
| **Title** | Parallel sub-agent execution with conflict resolution |
| **Impact/Fungsi** | Eksekusi paralel multi-subtask. Max 3 agent barengan. File race di-handle via lock per-path. Result packet terstruktur |
| **Estimasi** | 12 jam |
| **Pro/Cons** | **Pro:** Parallel = speedup 2-3x. File lock = gak ada race condition. Result packet = synthesizer gampang merge **Cons:** Complexity tinggi. Debug parallel agent susah |
| **File changes** | NEW: `src/renderer/src/api/ai/sub-agent-pool.js` (parallel lifecycle, file lock) MODIFY: `src/renderer/src/api/ai/orchestrator.js` (dispatcher + synthesizer) MODIFY: `src/renderer/src/hooks/agent/useMarkPlan.js` |
| **Method** | Each sub-agent: fresh context + tool filter + model route + iteration budget 10. File lock: FIFO queue per path. Read-only exempt |

### TASK-09: Orchestrator Integration

| Field | Detail |
|-------|--------|
| **ID** | TASK-09 |
| **Title** | Replace 913-line monolithic loop with orchestrator calls |
| **Impact/Fungsi** | useMarkPlan.js saat ini 913 lines campur logic + UI + tool execution. Pisah jadi: orchestrator (pure logic, testable) + thin React wrapper |
| **Estimasi** | 12 jam |
| **Pro/Cons** | **Pro:** Code quality. Testable. Fitur baru gampang ditambah **Cons:** Refactor berisiko. Butuh feature flag - orchestrator mode opt-in dulu |
| **File changes** | MODIFY: `src/renderer/src/api/ai/orchestrator.js` (dispatcher + synthesizer) MODIFY: `src/renderer/src/hooks/agent/useMarkPlan.js` (thin wrapper) MODIFY: `src/renderer/src/hooks/useMarkAgent.js` |
| **Method** | Replace while loop menjadi orchestrator.run(). Feature flag default false. Old loop sebagai fallback |

---

## P3 — QUALITY OF LIFE (Recap + Safety)

### TASK-10: Session Recap

| Field | Detail |
|-------|--------|
| **ID** | TASK-10 |
| **Title** | Claude Code-style /recap + auto-recap on return |
| **Impact/Fungsi** | User balik ke MARK setelah 5 menit, langsung tau progress saat ini. Gak perlu scroll history. Krusial untuk multi-session parallel work |
| **Estimasi** | 6 jam |
| **Pro/Cons** | **Pro:** QoL besar. Claude Code users expect this. Auto-recap 15min cooldown = token cost minimal **Cons:** Recap overlay bisa ganggu kalau timing salah. Debounce handle ini |
| **File changes** | NEW: `src/renderer/src/api/ai/session-recap.js` MODIFY: `src/renderer/src/hooks/agent/useMarkPlan.js` MODIFY: `src/renderer/src/components/core/InputBar.jsx` MODIFY: `src/renderer/src/components/core/ResponseArea.jsx` |
| **Method** | 4 kondisi trigger: away lebih dari 3min + cooldown lebih dari 15min + input empty + unfocused. Manual /recap always allowed. Model termurah (gemini flash) |

### TASK-11: Metacognitive Router

| Field | Detail |
|-------|--------|
| **ID** | TASK-11 |
| **Title** | Behavioral confidence scoring + risk assessment |
| **Impact/Fungsi** | MARK sekarang execute tool kalo model bilang yakin. Behavioral router pake history sukses + user approval. First-time tool menjadi wajib confirm 3x |
| **Estimasi** | 8 jam |
| **Pro/Cons** | **Pro:** Safety naik drastis. Gak ada execute hallucinated command **Cons:** False positive (block tool aman) - mitigasi: user override via settings |
| **File changes** | NEW: `src/renderer/src/api/ai/metacognitive-router.js` MODIFY: `src/renderer/src/api/ai/orchestrator.js` (pre-exec check) |
| **Method** | 4 signals: tool success rate (40%) + user approval history (30%) + pattern match (20%) + destructive score (-50%). New tool = confirm |

---

## P4 — ECOSYSTEM (MCP + Registry)

### TASK-12: MCP Manager

| Field | Detail |
|-------|--------|
| **ID** | TASK-12 |
| **Title** | MCP server discovery + tool search pattern |
| **Impact/Fungsi** | @modelcontextprotocol/sdk v1.25.3 sudah terinstall tapi belum dipakai. MCP Manager: connect ke MCP servers, register tools, tool search pattern (gak inject 500 schemas ke prompt) |
| **Estimasi** | 10 jam |
| **Pro/Cons** | **Pro:** MARK connect ke GitHub, Postgres, Slack via MCP. Tool search = 500 tools = 2 lines di prompt **Cons:** MCP server config masih manual |
| **File changes** | NEW: `src/main/mcp/mcp-manager.js` MODIFY: `src/renderer/src/api/ai/planning.js` (tool search pattern) MODIFY: `src/main/index.js` (init MCP on app ready) |
| **Method** | Tool search: agent call mcp-search:keyword, return top 3, agent pick, execute. Cache per session |

### TASK-13: Unified Tool Registry

| Field | Detail |
|-------|--------|
| **ID** | TASK-13 |
| **Title** | Central registry for native + MCP + plugin tools |
| **Impact/Fungsi** | Tool execution sekarang pake if/else chain di useMarkPlan.js:489-779. Registry: tiap tool self-register di satu tempat. Dispatch by name. MUDAH nambah tool baru |
| **Estimasi** | 6 jam |
| **Pro/Cons** | **Pro:** Arsitektur bersih. Tool discoverable. Plugin dan MCP unified **Cons:** Migration butuh refactor tool definitions |
| **File changes** | NEW: `src/main/tools/registry.js` MODIFY: `src/renderer/src/api/ai/tools.js` (register via registry) MODIFY: all existing tool files (register at bottom) |
| **Method** | Hermes-style: tiap tool file panggil registry.register() di import time. Registry hold Map + toolsets grouping |

### TASK-14: Relational Knowledge Graph

| Field | Detail |
|-------|--------|
| **ID** | TASK-14 |
| **Title** | Graph-based long-term memory + 30-day eviction policy |
| **Impact/Fungsi** | MARK pake vector memory (Dexie + Orama). RKG tambah relational edges antar entitas. Eviction policy prevent bloat |
| **Estimasi** | 8 jam |
| **Pro/Cons** | **Pro:** Relational query (project A depends on API B) lebih natural. Eviction = ukuran terkontrol **Cons:** Storage ~2MB per 10K nodes. Query lebih complex |
| **File changes** | NEW: `src/renderer/src/api/ai/rkg-store.js` MODIFY: `src/renderer/src/api/ai/vectorMemory.js` (integrasi RKG) |
| **Method** | 10K soft limit. 30 hari archive. Profile/preference gak di-archive. Archived fallback query |

---

## P5 — POLISH (Edge case handling)

### TASK-15: Adaptive System Prompt Tiers

| Field | Detail |
|-------|--------|
| **ID** | TASK-15 |
| **Title** | Progressive prompt assembly - stable/context/volatile tiers |
| **Impact/Fungsi** | System prompt 300+ lines tiap turn. Hermes-style tiers: stable (cacheable) + context (dynamic per category) + volatile (per-turn). Token usage turun 40%+ |
| **Estimasi** | 6 jam |
| **Pro/Cons** | **Pro:** Token hemat. Prompt caching bisa overlap **Cons:** Butuh refactor planning.js yang 576 lines |
| **File changes** | NEW: `src/renderer/src/api/ai/system-prompt.js` MODIFY: `src/renderer/src/api/ai/planning.js` (use system-prompt builder) |
| **Method** | Tier 1 cacheable (identity, rules). Tier 2 per-turn (categories => tool subset). Tier 3 volatile (observations). Dynamic toolset per activeCategories |

---

## EXECUTION ORDER

```
WEEK 1 (P0 - Must work first)
  Mon: TASK-01 Fallback parser (4h)
  Tue: TASK-02 Model router (8h)
  Wed: TASK-03 9Router config (6h)
  Thu: TASK-04 Vision service (8h)
  Fri: TASK-05 Error log (4h) + TASK-06 Compactor (8h)

WEEK 2 (P2 - Agentic core)
  Mon: TASK-07 Task decomposer (10h)
  Tue: TASK-08 Sub-agent pool (12h)
  Wed: TASK-09 useMarkPlan refactor (12h)
  Thu-Fri: Buffer / bugfix

WEEK 3 (P3-P5 - QoL + Ecosystem)
  Mon: TASK-10 Session recap (6h)
  Tue: TASK-11 Metacognitive router (8h)
  Wed: TASK-12 MCP manager (10h)
  Thu: TASK-13 Tool registry (6h) + TASK-14 RKG (8h)
  Fri: TASK-15 System prompt tiers (6h) + Buffer
```

**Total: ~118 jam (15 hari kerja) - 3 minggu**
**Quick Win (hari ini):** TASK-01 Fallback parser (4h). Langsung solve problem paling sakit.
