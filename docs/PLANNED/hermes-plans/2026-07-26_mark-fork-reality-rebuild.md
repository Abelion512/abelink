# MARK Fork Linux — Strategic Rebuild Plan

**Author:** Hermes / Abelion Group
**Date:** 2026-07-26
**Status:** Active
**Type:** Reality Audit + Architectural Rebuild
**Total Work Packages:** 5 | **Estimated Duration:** 14-18 days

---

## EXECUTIVE SUMMARY

### Reality Check
15-task "Agentic Upgrade" plan from 2026-07-24 is **vaporware**. All claimed files (`orchestrator.js`, `model-router.js`, `sub-agent-pool.js`, `mcp-manager.js`, `context-compactor.js`, `session-recap.js`, `error-log.js`, `metacognitive-router.js`, `rkg-store.js`, `dag-validator.js`, `system-prompt.js`, `tool-registry.js`) — **zero exist on filesystem or in git history**.

What actually exists:
- Working chat loop via renderer-side `planning.js` + `tools.js`
- `ai-bridge.js` in main process (HTTP proxy, streaming, retry)
- Feature layer: YouTube, Last.fm, WhatsApp, MPRIS, browser-agent, agent-skills-loader
- MCP SDK (`@modelcontextprotocol/sdk: ^1.25.3`) installed but **zero implementation code**

### Core Problem
**AI stack lives in renderer process.** All state (planning queue, tools cache, awareness data, guard state) dies on navigation/refresh. Renderer is ephemeral by design — this is Electron 101 violation.

---

## WP-1: Architecture — AI Belts Out of Renderer
**Priority:** P0 | **Duration:** 4-5 days | **Risk:** Highest

### What
Move all AI-logic files from `src/renderer/src/api/ai/` to `src/main/ai/`. Renderer keeps only UI components, hooks, and thin IPC wrappers.

### Migration Map
| File | From (Renderer) | To (Main) |
|------|-----------------|-----------|
| `planning.js` | `renderer/src/api/ai/` | `main/ai/planning.js` |
| `tools.js` | `renderer/src/api/ai/` | `main/ai/tools.js` |
| `awareness.js` | `renderer/src/api/ai/` | `main/ai/awareness.js` |
| `guard-gate.js` | `renderer/src/api/ai/` | `main/ai/guard-gate.js` |
| `fallback-serializer.js` | `renderer/src/api/ai/` | `main/ai/fallback-serializer.js` |
| `output-sanitizer.js` | `renderer/src/api/ai/` | `main/ai/output-sanitizer.js` |
| `prompt-compressor.js` | `renderer/src/api/ai/` | `main/ai/prompt-compressor.js` |
| `chatSummarizer.js` | `renderer/src/api/ai/` | `main/ai/chat-summarizer.js` |
| `vision-service.js` | `renderer/src/api/ai/` | `main/ai/vision-service.js` |
| `persona.js` | `renderer/src/api/ai/` | `main/ai/persona.js` |
| `utils.js` | `renderer/src/api/ai/` | `main/ai/utils.js` |
| `ai-bridge.js` | `main/` | `main/ai/ai-bridge.js` |

### IPC Contract (Preload)
Renderer needs these new IPC channels (added to existing preload):
- `ai:fetch` — prompt → main → model → response → renderer
- `ai:plan` — planning state query
- `ai:tools` — tool execution request
- `ai:abort` — abort active fetch
- `ai:state` — state snapshot (for UI)

### File Changes
- `src/main/index.js` — wire IPC handlers, init AI module
- `src/main/preload/index.js` — expose new APIs
- `src/renderer/src/api/ai/core.js` — rewrite as thin IPC wrapper
- `src/renderer/src/api/ai/index.js` — re-export from IPC only

### Rollback
Git worktree `feat/ai-main-migration`. If regression >2 days, revert and stay in renderer.

---

## WP-2: Build Real Agentic Layer
**Priority:** P1 | **Duration:** 5-7 days | **Depends on:** WP-1

### WP-2A: model-router.js (Day 1-2)
**File:** `src/main/ai/model-router.js`

Capability probe + model registry + fallback chain.
- Runtime probe: test JSON mode, vision, context window
- Cache results to SQLite (24h TTL)
- Routing: try cheapest → escalate on failure
- 9Router-aware: detect `ag/` prefix, provider passthrough
- Fallback: LM Studio local if 9Router down

### WP-2B: error-log.js (Day 1)
**File:** `src/main/ai/error-log.js`

Persistent error DB via `better-sqlite3` (already in deps? check).
- Table: `error_log(hash PK, tool, error_text, solution, count, last_seen)`
- Auto-inject top 3 frequent errors into system prompt
- Separate from chat history — immune to compaction

### WP-2C: context-compactor.js (Day 2)
**File:** `src/main/ai/context-compactor.js`

- Trigger: estimated tokens > 70% of model limit
- Keep: first 3 + last 5 messages intact
- Compress middle into: `[COMPRESSED: N messages] summary`
- Never compress error log entries
- Token estimation: `Math.ceil(text.length / 3.5)`

### WP-2D: mcp-manager.js (Day 3-4)
**File:** `src/main/ai/mcp-manager.js`

MCP SDK (`@modelcontextprotocol/sdk: ^1.25.3`) sudah installed — write implementation.
- Server discovery from config or `~/.mark/mcp-servers/`
- Tool schema search (not bulk inject)
- callTool IPC bridge
- Timeout per tool: 30s default
- Worker thread isolation per MCP server (optional)

### WP-2E: orchestrator.js (Day 5-7)
**File:** `src/main/ai/orchestrator.js`

Simple task decomposition. NOT full DAG/sub-agent.
- Split complex request into 2-3 subtasks
- Execute parallel if independent
- Merge results
- Feature-flag gated (default: off, current loop remains default)
- No sub-agent pool yet — that's WP-4

---

## WP-3: Model Translation (Structured Output)
**Priority:** P1 | **Duration:** 2 days | **Depends on:** WP-2A

### Current State
fallback-serializer.js: JSON → XML → KV → Regex. 5-tier cascade. Works but slow (try-fail-try-fail).

### Fix (in order of impact)
1. **Prompt engineering first** — XML schema in system prompt + 2-shot example. Even cheap models can do XML reliably.
2. **9Router `response_format` passthrough** — model-router detects which upstream providers support `json_object`, routes there first.
3. **Constrained decoding** — if LM Studio local, use logit bias / grammar to force JSON.
4. **Cross-model retry** — if cascade fails all tiers, retry with different model.

### What NOT to build
- JSON repair beyond `jsonrepair` (already working)
- Custom parser for each model provider

---

## WP-4: Sub-Agent Pool (When Needed)
**Priority:** P2 | **Duration:** 3-4 days | **Depends on:** WP-2E

**Do NOT build until single-agent orchestrator proven stable for 2+ weeks.**

### Design
- `worker_threads` (NOT renderer — renderer is ephemeral)
- Max 3 concurrent sub-agents
- File lock per-path (FIFO queue)
- Result diff + conflict detection
- Circuit breaker: 3 failures → pause pool

### Risks
- Memory: each worker thread ≈ 50MB baseline
- Complexity: debug parallel agent harder than sequential
- Premature if single-agent loop still buggy

---

## WP-5: Stress Testing & Observability
**Priority:** P2 | **Duration:** 2-3 days | **Depends on:** WP-1, WP-2

### Tests (in order)
1. **Memory stability** — `process.memoryUsage()` logged every 10 turns. Run 100 chat iterations. Max heap growth: 50MB.
2. **IPC latency** — 1000 sequential `ai:fetch` calls, measure p50/p95/p99
3. **Model failure injection** — every 3rd API call returns 500/503. Verify planning.js retry works.
4. **Long session** — 500 messages continuous. Verify compactor triggers correctly.
5. **MCP timeout** — tool that never responds. Verify 30s timeout kills it.
6. **Concurrent tool race** — 2 tools write same file simultaneously. Verify lock works.

### Observability
- Console structured logging (already partial, enhance)
- Optional: OTEL trace export (Hermes already uses it, could share)

---

## EXECUTION ORDER

```
Week 1:
  Day 1-2   WP-1: Move planning.js + tools.js + awareness.js to main
  Day 3-4   WP-1: Move guard-gate + fallback-serializer + vision-service
  Day 5     WP-1: IPC wiring, test, fix regressions

Week 2:
  Day 6-7   WP-2A: model-router.js
  Day 8     WP-2B: error-log.js + WP-2C: context-compactor.js
  Day 9-10  WP-2D: mcp-manager.js
  Day 11    WP-3: structured output enhancement

Week 3:
  Day 12-13 WP-2E: orchestrator.js (simple, feature-flag)
  Day 14-15 WP-5: stress testing + fixes
```

---

## WHAT NOT TO BUILD (Skip List)

| Feature | Reason |
|---------|--------|
| RKG Store | `oramaStore.js` + `vectorMemory.js` already provide memory. Scope creep. |
| Metacognitive Router | Behavioral confidence scoring is a research project, not a feature. |
| Full DAG Orchestrator | Complex for zero proven benefit. Single-agent loop first. |
| Session Recap | Low value. `/recap` command = nice-to-have, not blocker. |
| Agent Skills Store | `agent-skills-loader.js` already exists in main. Works. |

---

## RISK MATRIX

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| AI migration to main breaks existing chat | HIGH | MEDIUM | Git worktree. Feature-flag `useNewArchitecture`. Parallel run old renderer path. |
| worker_threads memory spike | MEDIUM | LOW | Not building pool yet. WP-4 deferred. |
| 9Router API changes | MEDIUM | LOW | model-router probe detects at runtime, not hardcoded. |
| Upstream merges break fork | MEDIUM | MEDIUM | Keep fork commits shallow. Cherry-pick only non-breaking upstream changes. |
| Electron upgrade breaks IPC | LOW | LOW | electron-vite handles bundling. Test build after migration. |
