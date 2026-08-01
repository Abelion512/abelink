# MARK v2 — Agentic Upgrade Plan

**Date:** 2026-07-26
**Author:** Hermes / MARK Orchestrator
**Status:** Draft (post-stress-test solutions)
**Total Phases:** 4 | **Total Stress Tests:** 14 | **Files Changed:** ~20 | **New Files:** ~10

---

## EXECUTIVE SUMMARY (Bahasa Bisnis)

### Why This Upgrade?
MARK saat ini adalah asisten AI monolitik: satu model, satu loop, satu context window.
Untuk support autonomous workflows + agentic AI, MARK perlu:
- **Multi-model orchestration** — model murah untuk chat, model mahal untuk coding, model vision terpisah
- **Task decomposition** — complex task dipecah, sub-task jalan parallel
- **Context hygiene** — context di-compact, session bisa di-recap
- **Safety layer** — confidence scoring, risk assessment, circuit breaker tiap sub-agent

### 14 Masalah + Solusi Ringkas

#### Phase 1 — Model Router + Vision

1. **Model Blind Detection** → Runtime probe test. Setiap connect, MARK test dulu: model bisa JSON? Bisa vision? Simpan hasil.
2. **Multi-Endpoint Config** → Single-endpoint via 9Router. Semua model di-proxy via 1 endpoint. Config cukup 1 API key.
3. **Vision Cascade Slow** → Parallel call (gemini + mimo bersamaan). Pakai result pertama yang cukup confident. Jangan serial.
4. **Output Format Mismatch** → Parse cascade: JSON → XML → Key-Value → regex extract. Kalau semua gagal, panggil model lain.

#### Phase 2 — Orchestrator + Sub-Agent

5. **Circular DAG Deadlock** → Cycle detection sebelum execute. Kalau cycle detected, fallback ke sequential.
6. **Parallel File Race** → File lock per-path. Sub-agent B tahan sampai A selesai write ke file yang sama.
7. **DeepSeek Gagal Generate DAG** → Template-guided decomposition. Model cuma isi template, gak bikin dari 0.
8. **Synthesizer Conflict** → Result diff sebelum merge. Kalau 2 sub-agent claim file sama, flag sebagai conflict.

#### Phase 3 — Context Compactor + Recap

9. **Compaction Swallow Errors** → Error log terpisah (SQLite). Compactor cuma compress chat, error tetap di log.
10. **Recap Mid-Typing** → Debounce. Recap hanya trigger kalau InputBar kosong + gak ada focus.
11. **Recap Token Cost** → Rate limit. Max 1 auto-recap per 15 menit. Manual `/recap` gak di-rate.

#### Phase 4 — Metacognitive + MCP

12. **LLM Confidence Is Fake** → Jangan trust raw score. Gunakan behavioral signal: model pernah sukses handle tool ini sebelumnya? Kalau pertama kali → wajib confirm.
13. **MCP Tool Explosion** → Tool search. Tool schema gak di-inject semua. Agent search dulu, baru inject relevan.
14. **RKG Unbounded Growth** → Eviction policy. Nodes > 30 hari tanpa akses → archive. Query tetap bisa tapi prioritas rendah.

---

## PHASE 1: Model Router + Vision (~3 days)

### Files to Create
| File | Path | Purpose |
|------|------|---------|
| `model-router.js` | `src/renderer/src/api/ai/model-router.js` | Model registry, routing, capability detection, fallback chain |
| `vision-service.js` | `src/renderer/src/api/ai/vision-service.js` | 2-tier vision dispatch (fast + deep), parallel cascade |

### Files to Modify
| File | Path | Change |
|------|------|--------|
| `ai-bridge.js` | `src/main/ai-bridge.js` | Accept `model` parameter, dynamic endpoint routing |
| `core.js` | `src/renderer/src/api/ai/core.js` | Replace single fetchAI with multi-model dispatch |
| `planning.js` | `src/renderer/src/api/ai/planning.js` | Use model-router for vision tasks, not main model |
| `useMarkPlan.js` | `src/renderer/src/hooks/agent/useMarkPlan.js` | Vision tools (analyze-screen, camera-look) → vision-service |
| `output-sanitizer.js` | `src/renderer/src/api/ai/output-sanitizer.js` | Add `response_format: 'xml'` path for no-JSON models |

### Solution Detail

#### S1 — Model Blind Detection (`model-router.js`)
Runtime probe test. Setiap connect ke endpoint baru, MARK otomatis test:
- JSON mode support (kirim prompt kecil + `response_format: json_object`, cek 400 error)
- Vision support (kirim 1x1 pixel PNG, cek 400 error)
- Hasil di-cache di localStorage selama 24 jam

**Path:** `src/renderer/src/api/ai/model-router.js:40-70`
**Fallback:** Probe fail → skip JSON/vision, fallback XML + text-only. MARK tetap bisa chat.

#### S2 — Single-Endpoint via 9Router (`model-router.js`)
Semua model via SATU endpoint 9Router. Config cukup: 1 base_url + 1 api_key.
Routing via parameter `model` (contoh: `ag/deepseek-v4-flash-free`, `ag/gemini-3.1-flash-preview`).

**Path:** `src/renderer/src/api/ai/model-router.js:80-120`
**Fallback:** 9Router down → retry 3x → fallback ke LM Studio lokal `localhost:1234`.

#### S3 — Parallel Vision Cascade (`vision-service.js`)
- Fire gemini-flash DAN mimo-2.5 PARALLEL (bukan serial)
- Timeout 8 detik
- Ambil result pertama yang cukup confident
- Camera optimization: frame sampling 1 FPS + motion trigger via OpenCV lokal

**Path:** `src/renderer/src/api/ai/vision-service.js:30-70`
**Fallback:** All vision fail → return `[Vision unavailable]`, MARK lanjut chat biasa.

#### S4 — Multi-Format Parse Chain (`fallback-serializer.js`)
Enhanced parse cascade:
1. JSON (if model supports json mode)
2. XML tags (universal, model cheap bisa output XML)
3. Key-Value (line by line parsing)
4. Regex intent extraction (last resort, lossy)
5. Cross-model retry with different model

**Path:** `src/renderer/src/api/ai/fallback-serializer.js` (existing file, enhance)

---

## PHASE 2: Orchestrator + Sub-Agent (~3 days)

### Files to Create
| File | Path | Purpose |
|------|------|---------|
| `orchestrator.js` | `src/renderer/src/api/ai/orchestrator.js` | Task classifier + decomposer + dispatcher + synthesizer |
| `sub-agent-pool.js` | `src/renderer/src/api/ai/sub-agent-pool.js` | Parallel agent lifecycle, result packet, file lock |
| `dag-validator.js` | `src/renderer/src/api/ai/dag-validator.js` | Cycle detection, topological sort, race detection |

### Files to Modify
| File | Path | Change |
|------|------|--------|
| `useMarkPlan.js` | `src/renderer/src/hooks/agent/useMarkPlan.js` | Replace while loop → call orchestrator.run() |
| `useMarkAgent.js` | `src/renderer/src/hooks/useMarkAgent.js` | Add orchestrator state, sub-agent progress UI |
| `guard-gate.js` | `src/renderer/src/api/ai/guard-gate.js` | Per-sub-agent guard instance, shared circuit state |
| `input-architecture.js` | `src/renderer/src/api/ai/input-architecture.js` | Replace 8K hard-limit → 1M context support |

### Solution Detail

#### S5 — Cycle Detection via Kahn's Algorithm (`dag-validator.js`)
Topological sort on subtask DAG. Kalau cycle detected → otomatis flatten ke sequential chain.
Output: subtasks dengan `dependsOn` diatur sequential.

**Path:** `src/renderer/src/api/ai/dag-validator.js:20-55`
**Fallback:** Sequential chain (lebih lambat, gak deadlock).

#### S6 — File Lock Per-Path (`sub-agent-pool.js`)
FileLock class dengan acquire/release per file path. Sub-agent yang mau write ke path yang sama harus nunggu FIFO.
Read-only tools (read-file, grep-search, browser-read) exempt dari lock.

**Path:** `src/renderer/src/api/ai/sub-agent-pool.js:50-85`
**Fallback:** Lock timeout 30 detik → release paksa, sub-agent di-retry.

#### S7 — Template-Guided Decomposition (`orchestrator.js`)
Model gak disuruh bikin JSON DAG dari 0. MARK provide template JSON kosong, model cuma isi.
Template: `{ "subtasks": [{ "id": "1", "description": "...", "type": "sequential|parallel|gate", "dependsOn": [] }] }`

**Path:** `src/renderer/src/api/ai/orchestrator.js:30-65`
**Fallback:** Parse fail → return simple 2-step: `[{research}, {answer}]`. MARK tetap kerja.

#### S8 — Result Diff Before Merge (`orchestrator.js`)
Setelah semua sub-agent selesai, orchestrator compare file claims tiap agent.
Jika 2+ agent claim file yang sama → flag sebagai conflict, inject ke parent model untuk decision.

**Path:** `src/renderer/src/api/ai/orchestrator.js:100-130`
**Resolution:** Parent model decide: merge, prefer one, or redo.

---

## PHASE 3: Context Compactor + Recap (~2 days)

### Files to Create
| File | Path | Purpose |
|------|------|---------|
| `context-compactor.js` | `src/renderer/src/api/ai/context-compactor.js` | Smart compaction, error log preservation |
| `session-recap.js` | `src/renderer/src/api/ai/session-recap.js` | Claude Code-style `/recap` + auto-recap |
| `error-log.js` | `src/renderer/src/api/ai/error-log.js` | Persistent error/solution log (SQLite) |

### Files to Modify
| File | Path | Change |
|------|------|--------|
| `input-architecture.js` | `src/renderer/src/api/ai/input-architecture.js` | Replace truncation → compaction call |
| `useMarkPlan.js` | `src/renderer/src/hooks/agent/useMarkPlan.js` | Add `/recap` command, auto-recap hook |
| `planning.js` | `src/renderer/src/api/ai/planning.js` | Inject error log into system prompt |
| `InputBar.jsx` | `src/renderer/src/components/core/InputBar.jsx` | `/recap` command handler, away detection |
| `ResponseArea.jsx` | `src/renderer/src/components/core/ResponseArea.jsx` | Recap overlay display |

### Solution Detail

#### S9 — Separate Error Log (`error-log.js`)
Error log di SQLite terpisah dari chat history. Compactor cuma compress CHAT.
Error log inject ke system prompt tiap turn (otomatis, gak perlu di-compact).

**Path:** `src/renderer/src/api/ai/error-log.js:10-45`
**Structure:** `error_log(hash, tool, error, solution, count, last_seen)`. INSERT OR REPLACE by hash.

#### S10 — Recap Debounce (`session-recap.js`)
Auto-recap hanya trigger jika 4 kondisi terpenuhi:
1. User away > 3 menit (no keyboard/mouse activity)
2. Cooldown > 15 menit sejak auto-recap terakhir
3. InputBar kosong (user gak lagi ngetik)
4. InputBar gak ter-focus

Manual `/recap` selalu allowed, gak kena cooldown.

**Path:** `src/renderer/src/api/ai/session-recap.js:20-55`

#### S11 — Auto-Recap Rate Limit (`session-recap.js`)
Auto-recap: max 1× per 15 menit. Pakai model termurah (gemini flash).
~100 tokens per recap × ~4/jam = 400 tokens/jam. Negligible.

**Path:** `src/renderer/src/api/ai/session-recap.js:70-95`

---

## PHASE 4: Metacognitive + MCP Integration (~3 days)

### Files to Create
| File | Path | Purpose |
|------|------|---------|
| `metacognitive-router.js` | `src/renderer/src/api/ai/metacognitive-router.js` | Risk assessment, confidence via behavioral signal |
| `mcp-manager.js` | `src/main/mcp/mcp-manager.js` | MCP server discovery, tool registration, callTool bridge |
| `rkg-store.js` | `src/renderer/src/api/ai/rkg-store.js` | Relational Knowledge Graph with TTL eviction |

### Files to Modify
| File | Path | Change |
|------|------|--------|
| `planning.js` | `src/renderer/src/api/ai/planning.js` | MCP tools: search pattern, not inject all |
| `system-prompt.js` | `src/renderer/src/api/ai/system-prompt.js` | Dynamic tool definition injection per matched category |
| `tool-registry.js` | `src/renderer/src/api/ai/tool-registry.js` | Unified schema: native + MCP + plugin |
| registry move | `src/main/tools/registry.js` | Move registry to main process (MCP runs in main) |

### Solution Detail

#### S12 — Behavioral Confidence (`metacognitive-router.js`)
Jangan trust LLM self-reported confidence. Hitung dari behavioral signals:
- Tool success rate (riwayat: tool ini pernah sukses berapa kali?)
- User pernah approve tool ini sebelumnya?
- Apakah ini known pattern?
- Destructive score (write-file ke /etc? rm -rf?)

Weighted formula, bukan raw score.
**New tool = first time use → always require-confirm.** Setelah approve 3x sukses → auto-execute.

**Path:** `src/renderer/src/api/ai/metacognitive-router.js:20-55`

#### S13 — Tool Search Pattern (`mcp-manager.js` + `planning.js`)
Instead of inject 500 MCP tool schemas ke system prompt:
- System prompt cuma: "MCP tools available. Use `mcp-search: keyword` to find relevant tools."
- Agent search → return top 3 → agent pilih → execute
- Cache recent matches per session

**Benefit:** 500 MCP tools = 2 lines in system prompt. Zero bloat.

**Path:** `src/main/mcp/mcp-manager.js:40-75` (search), `planning.js:260-290` (system prompt)

#### S14 — RKG Eviction Policy (`rkg-store.js`)
- MAX_NODES: 10.000 nodes soft limit
- ARCHIVE_AFTER_DAYS: 30 hari tanpa akses → archived
- PRIORITY_BOOST: profile/preference gak pernah di-archive. learn: 90 hari. notes: 60 hari.
- Query: archived only as fallback if no active match

**Path:** `src/renderer/src/api/ai/rkg-store.js:30-70`
**Storage:** SQLite. 10K nodes ≈ 2MB.

---

## IMPLEMENTATION ORDER

```
Phase 1 (3 days):
  Day 1: model-router.js + capability probe
  Day 2: ai-bridge.js refactor + 9Router single-endpoint
  Day 3: vision-service.js + fallback-serializer enhance

Phase 2 (3 days):
  Day 4: dag-validator.js + orchestrator.js (decomposer)
  Day 5: sub-agent-pool.js + file lock
  Day 6: orchestrator.js (dispatcher+synthesizer) + useMarkPlan refactor

Phase 3 (2 days):
  Day 7: error-log.js + context-compactor.js
  Day 8: session-recap.js + UI integration

Phase 4 (3 days):
  Day 9: metacognitive-router.js + tool history
  Day 10: mcp-manager.js + tool search + system-prompt.js refactor
  Day 11: rkg-store.js + eviction policy
```

### Quick Wins (Day-1 capable)
1. **Fallback-serializer enhance** — Fix model-cheap-gagal-JSON NOW
2. **9Router single-endpoint** — Sederhanakan config dari 4 endpoint ke 1
3. **Error-log.js** — Compactor gak makan error history

---

## RISK MATRIX

| Risk | Impact | Prob. | Mitigation |
|------|--------|-------|------------|
| Sub-agent rusak MARK yg jalan | HIGH | MEDIUM | Feature flag. Orchestrator mode = opt-in. Default: current loop. |
| Biaya API naik 3-5x | MEDIUM | HIGH | Daily budget per model. Vision cascade timeout 8s. |
| Probe consume token | LOW | HIGH | Cache 24 jam di localStorage. |
| MCP search bikin lambat | MEDIUM | MEDIUM | Cache recent matches per session. |
| RKG makan storage | LOW | MEDIUM | 10K nodes ≈ 2MB. Archive 30 hari. |
