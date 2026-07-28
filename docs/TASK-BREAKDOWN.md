# MARK Agent — Task Breakdown & Roadmap

> **Priority:** P0 (now) → P1 (this week) → P2 (next week) → P3 (this month) → P4 (future)
> **Source:** Synthesized from 25 planning docs, codebase audit, and competitive research
> **Author:** Abelion512 | **Updated:** 2026-07-28

---

## P0 — EMERGENCY (15 minutes)

| # | Task | Effort | Risk | Files | Verification |
|---|------|--------|------|-------|-------------|
| **P0.1** | `git push origin feat/model-fallback-abelink` | 5min | None | All | 15 commits pushed |
| **P0.2** | `tar -czf ~/mark-backup-$(date +%Y%m%d).tar.gz .` | 5min | None | All | Backup exists |
| **P0.3** | `npm run build:linux` — must pass | 5min | Low | electron-builder.yml | Exit code 0 |

**Why P0:** 15 unpushed commits + 18 unstaged files = critical data loss risk. Senior identified this as #1 issue.

---

## P1 — STABILIZE & WIRE DEAD CODE (3 days)

### P1.1 — Wire tool-registry into planning.js (4h, Risk: Medium)

**Goal:** 343 lines of structured tool definitions currently unused. Wire them into the active agent loop.

**Previous work:**
- `tool-registry.js` restored from commit 3620950
- planning.js currently uses hardcoded tool dispatch in `CATEGORY_TEXTS` (7 categories)
- `getPluginActions()` and `getAgentSkills()` already vector-routed

**Implementation:**
1. `planning.js`: import `getToolRegistry()`
2. During `getPluginActions`/`getAgentSkills`, also register native tools via `registerTool()`
3. `tool-registry.toToolCallSystemPrompt()` replaces hardcoded tool list in system prompt
4. Registry `execute()` handles tool dispatch — but REACT LOOP in `useMarkPlan.js` stays as-is for now. Registry is for tool DEFINITION, not execution.

**Files:**
- `src/renderer/src/api/ai/tool-registry.js` — add register calls for native tools
- `src/renderer/src/api/ai/planning.js` — import registry, use in prompt building
- `src/renderer/src/hooks/agent/useMarkPlan.js` — optionally read from registry for dispatch

**Verification:** `getToolRegistry().getAll()` returns 15+ tools including native + plugins + skills.

**Risk:** planning.js has 7 vector-routed categories. Registry has flat list. Need mapping layer so tools keep their category routing for memory/context.

---

### P1.2 — Wire vision-service into useMarkPlan (4h, Risk: Medium)

**Goal:** 88 lines of dual-path vision currently unused. Wire into screenshot/camera dispatch.

**Previous work:**
- `vision-service.js` restored from commit 3620950
- MiMo model identified: **Xiaomi MiMo-V2.5** (310B MoE, native multimodal)
- Vision currently inline in `useMarkPlan.js` lines ~553-636, hardcoded to `localhost:1234`

**Implementation:**
1. Replace inline camera/screen analysis in `useMarkPlan.js` with `vision-service.js` calls
2. Dual-path behavior:
   - **Fast path:** Try provider's vision model first (Gemini via 9Router)
   - **Deep path:** Fallback to MiMo (via LM Studio or 9Router)
   - If both fail: text-only mode, return error message
3. `vision-service.js` must read user's AI provider config (not hardcode `localhost:1234`)

**Files:**
- `src/renderer/src/api/ai/vision-service.js` — add provider config support
- `src/renderer/src/hooks/agent/useMarkPlan.js` — replace inline code with vision-service calls

**Verification:** `analyzeScreen()` with provider=9Router produces description. With provider=LMStudio/MiMo, produces deeper analysis.

**Risk:** MiMo availability not guaranteed. Default to Gemini-only if MiMo unreachable. MiMo requires LM Studio with vision endpoint or 9Router route.

---

### P1.3 — Wire verification loop (2h, Risk: Low)

**Goal:** After every tool execution, verify result before continuing loop.

**Previous work:**
- `planning.js` `getNextAction()` returns `{ action, answer }`
- If action result is `[ERROR]`, loop retries. But no content verification.
- Senior's critical review identified this as missing

**Implementation:**
After every tool execution in `useMarkPlan.js`:
1. Capture tool output
2. Quick AI check: `"Apakah hasil tool ${tool} sesuai? Output: ${output}"`
3. Uses `fetchAI` with `isSmallTask=true` (cheap model)
4. If not satisfactory: `insert to messages` → `retry with different approach` (max 2x)
5. If still fails: append warning to final answer

**Files:**
- `src/renderer/src/hooks/agent/useMarkPlan.js` (~30 lines added around tool dispatch)

**Verification:** Tool failure triggers verification response, not silent fallthrough.

**Risk:** Low. Doesn't break existing flow. Adds 2 extra cheap AI calls per tool failure.

---

### P1.4 — Audit log system (2h, Risk: Low)

**Goal:** File-based audit trail for all agent actions, approvals, security events.

**Previous work:**
- RSI audit log exists at `~/.mark/rsi-audit.log`
- Senior's plan specified: `actions.jsonl`, `approvals.jsonl`, `security-events.jsonl`
- User confirmed this structure

**Implementation:**
1. Create `src/main/audit-logger.js`:
   - `logAction(tool, query, result, duration)` → `~/.mark/audit/actions.jsonl`
   - `logApproval(tool, query, approved)` → `~/.mark/audit/approvals.jsonl`
   - `logSecurity(event, severity, detail)` → `~/.mark/audit/security-events.jsonl`
   - Auto-rotate: max 10000 lines per file, evict oldest after 30 days
2. Add IPC endpoints: `audit:log`, `audit:read`, `audit:clear`
3. Add audit view tab in `Configuration.jsx`

**Files:**
- `src/main/audit-logger.js` (NEW)
- `src/preload/index.js` (add IPC channels)
- `src/renderer/src/pages/Configuration.jsx` (add audit tab)

**Verification:** `cat ~/.mark/audit/actions.jsonl` shows tool execution entries with timestamps.

**Risk:** Low. Append-only file I/O. No network, no complex state.

---

### P1.5 — Sensor indicators (1h, Risk: Low)

**Goal:** Visual indicators showing mic/camera/screen state always visible in UI.

**Previous work:**
- VAD state, camera state, awareness state all exist but invisible
- User specifically requested: "Sensor harus punya indikator"

**Implementation:**
Add always-visible indicator bar in `MarkHome.jsx`:
- 🎤 Mic active/inactive (reads VAD state from `useMarkState`)
- 📷 Camera active/inactive (reads `config[0].cameraEnabled`)
- 👁 Screen observation active (reads awareness check-in state)
- Color: green = active, gray = inactive, yellow = cooldown

**Files:**
- `src/renderer/src/pages/MarkHome.jsx`

**Verification:** Mic indicator lights up when speaking. Camera indicator when cam enabled.

**Risk:** Low. Purely UI. No new IPC or state management. Uses existing state.

---

## P2 — PAOS LAYER (5 days)

### P2.1 — MCP minimal client (1 day, Risk: High)

**Goal:** First MCP integration. Tool discovery + tool call via MCP protocol.

**Previous work:**
- `@modelcontextprotocol/sdk@1.30.0` installed but **ZERO CODE**
- Tool-registry ready for tri-layer tools (skills → MCP → plugins)
- Research: MCP is universal connector (Goose, Cline, Cua, Agent Zero all use it)

**Implementation:**
1. Create `src/main/mcp/mcp-manager.js`
2. Discover MCP servers from config (`~/.mark/mcp-servers.json`)
3. Connect via stdio (local CLI tools) or SSE (remote servers)
4. Expose IPC: `mcp:list-tools`, `mcp:call-tool`
5. Discovered MCP tools auto-register in `tool-registry.js`

**Files:**
- `src/main/mcp/mcp-manager.js` (NEW)
- `src/main/mcp/` (directory)
- `src/preload/index.js` (add IPC)
- `src/renderer/src/api/ai/tool-registry.js` (auto-register MCP tools)

**Verification:** MCP tool appears in tool-registry and can be called by agent.

**Risk:** High. SDK API may have changed (1.29→1.30). First MCP integration in codebase. Stdio MCP server spawning adds process management complexity.

---

### P2.2 — Model router (1 day, Risk: High)

**Goal:** Automatic model selection per task type (coding cheaper, vision specialized, chat main).

**Previous work:**
- `model-registry.json` (46 lines) exists with dynamic model combo data
- `model-router.js` claimed in plans but **0 lines exist**
- ai-bridge.js currently uses one model for everything

**Implementation:**
1. Create `src/renderer/src/api/ai/model-router.js`
2. Map task type → model:
   - `coding` → cheapest (Qwen 2.5 7B)
   - `vision` → Gemini (fast) / MiMo (deep)
   - `chat` → main model (9Router)
   - `tools` → cheapest (classification only)
   - `planning` → main model
3. Read from config (Dexie) or `model-registry.json`
4. If selected model fails → fallback to next in tier
5. Vision already handled by `vision-service.js` — router just picks endpoint

**Files:**
- `src/renderer/src/api/ai/model-router.js` (NEW)
- `src/renderer/src/api/ai/planning.js` (integrate router)
- `src/renderer/src/api/ai/vision-service.js` (use router)

**Verification:** Small task (`echo hello`) uses cheaper model. Complex chat uses main model. Vision uses vision model.

**Risk:** HIGH — model routing affects EVERY AI call. Must test with real providers. Model latency varies wildly.

---

### P2.3 — Error log service (1 day, Risk: Medium)

**Goal:** Structured error tracking that survives context compression.

**Previous work:**
- Current error handling: `console.error()` + `[ERROR]` prefix in strings
- prompt-compressor eats errors when it compresses middle section
- claim: "error-log.js" in v2 upgrade plan — zero lines exist

**Implementation:**
1. Create `src/renderer/src/api/ai/error-log.js`
2. Rotating buffer: last 100 errors in memory
3. Persist to Dexie new `errors` store
4. Error log INJECTED into system prompt (not part of message history)
   - So compression never eats it
5. Error history visible in UI (Configuration.jsx → debug tab)

**Files:**
- `src/renderer/src/api/ai/error-log.js` (NEW)
- `src/renderer/src/api/db.js` (add `errors` store, schema v15→v16)
- `src/renderer/src/api/ai/planning.js` (inject error context)
- `src/renderer/src/pages/Configuration.jsx` (error viewer)

**Verification:** Errors persist after context compression. Error viewer shows last 100 errors.

**Risk:** Medium. Dexie schema migration required (v15→v16). Must not break existing data.

---

### P2.4 — Context compactor upgrade (1 day, Risk: High)

**Goal:** Smart context compression that preserves critical information.

**Previous work:**
- `prompt-compressor.js` (91 lines) exists but is basic
- Current: threshold 0.75 (compress when >75% of 128K), target 20%, protect first 3 + last 20
- Document flaw: token estimation uses 3.5 chars/token heuristic (Indonesian+JSON varies 2-4x)
- Multiple planning docs flagged this as needing improvement

**Implementation:**
1. Per-message token counting (not estimate)
2. Trigger earlier: `threshold: 0.60` instead of 0.75 (current triggers too late)
3. Preserve: system prompt, last 15 turns, last tool result, error log
4. Compressed summary stored as system message (agent sees it as context, not lost)
5. When degradation detected: inject error history BEFORE compressed block

**Files:**
- `src/renderer/src/api/ai/prompt-compressor.js` (rewrite)

**Verification:** After compression at turn 30, agent still remembers task context. Error log preserved.

**Risk:** HIGH — context is the most fragile part of agent loop. Bad compression = confused agent = infinite loops.

---

### P2.5 — Orchestrator + Sub-agent pool (2 days, Risk: HIGH — CONSIDER DEFERRING)

**Goal:** Break complex tasks into subtasks, run in parallel, merge results.

**Previous work:**
- Claimed in v2 upgrade plan: "orchestrator.js" + "sub-agent-pool.js"
- Reality: **0 lines exist**
- Hermes-style CEO→Codex orchestration referenced
- This is the most complex feature planned

**Implementation:**
1. Create `src/renderer/src/api/ai/orchestrator.js`
2. Task decomposition:
   - Take complex user request
   - Break into 2-5 subtasks (using cheap model)
   - Each subtask has: `{ tool, query, expectedOutput }`
3. Sub-agent pool: run subtasks in parallel (max 3)
   - Each subtask gets own `fetchAI()` call
   - Each subtask has independent tool execution
4. Results merged by main agent into final answer
5. Feature flag: `config[0].enableOrchestrator` (default: false)

**Files:**
- `src/renderer/src/api/ai/orchestrator.js` (NEW)
- `src/renderer/src/api/ai/sub-agent-pool.js` (NEW)
- `src/renderer/src/api/db.js` (add config flag)
- `src/renderer/src/pages/Configuration.jsx` (add toggle)

**Verification:** "Cari info tentang X dan bandingkan dengan Y" produces merged answer with both sources.

**Risk:** HIGHEST. Worker pools + concurrent AI calls + result merging. Consider deferring to P3.

---

## P3 — SECURITY + POLISH (3 days)

### P3.1 — Scoped permissions (4h, Risk: Medium)

**Goal:** Anti-generalization security. No blanket permissions.

**Previous work:**
- OS control architecture: "Scoped Permissions (anti-generalization)"
- Current: ApprovalContext with blanket yes/no
- 4 path risk categories designed

**Implementation:**
1. Create `src/main/permissions.js`
2. Path categories:
   - `reinstallable` (node_modules, pip) → auto-delete
   - `generated` (build, dist, out) → auto-delete
   - `user-content` (Documents, Downloads, Desktop) → BLOCK, ask user
   - `source-code` (.js, .py, .go, .rs) → BLOCK, ask user
   - `config` (.env, .git, .config) → BLOCK
   - `system` (/etc, /usr, /bin) → BLOCK
3. Quarantine: moved deleted files → `~/.mark/quarantine/` with manifest
4. User reviews quarantine → restore or permanent delete

**Files:**
- `src/main/permissions.js` (NEW)
- `src/renderer/src/contexts/ApprovalContext.jsx` (integrate categories)

**Verification:** `rm` on `~/Documents/file.txt` blocked. `rm` on `/tmp/temp.txt` allowed.

**Risk:** Medium. Could block legitimate operations. Must have override.

---

### P3.2 — Privacy zones (2h, Risk: Low)

**Goal:** 4-level data isolation. Sensitive data never reaches prompt or logs.

**Previous work:**
- OS control architecture: "Data Zones"
- Guard-gate: add privacy check
- Tag existing memory types

**Implementation:**
1. Tag all memory/data with privacy level:
   - `public`: web search results, weather, public info
   - `internal`: user preferences, file names, app state
   - `sensitive`: API keys, credentials, tokens → NEVER in prompt
   - `secret`: encryption keys, master passwords → NEVER in log or prompt
2. Guard-gate: before context injection, check privacy level
3. Default: all existing data tagged `internal`. Only new data needs explicit tagging.

**Files:**
- `src/renderer/src/api/ai/guard-gate.js` (add privacy check)
- `src/renderer/src/api/db.js` (add privacyLevel field to memory store)

**Verification:** API key not present in system prompt or console.log.

**Risk:** Low. Opt-in tagging. Existing data unchanged. Default behavior unchanged.

---

### P3.3 — 100-turn stability test (2h, Risk: Low)

**Goal:** Automated stability verification after every change.

**Previous work:**
- `tests/stability/100-turn-test.sh` skeleton exists (commit 6d382c2)
- Currently only tests module loading
- Multiple plans ask for stability test

**Implementation:**
1. Upgrade script to:
   - Actually call API endpoints via IPC (not just `require`)
   - Send 100 test messages, measure responses
   - Track: tool success rate, crash count, memory growth, avg latency
2. Target KPIs:
   - Tool success rate: >90%
   - Crashes: 0
   - Memory growth: <50MB over 100 turns
   - Avg response time: <10s per turn

**Files:**
- `tests/stability/100-turn-test.sh`

**Verification:** Script reports pass/fail for each KPI.

**Risk:** Low. Test infrastructure only. Doesn't affect production code.

---

## P4 — FUTURE (NICE TO HAVE, not scheduled)

| # | Task | Reason for Deferral |
|---|------|---------------------|
| P4.1 | Unified MCP auto-discovery | P2.1 provides basic MCP. Auto-discovery adds complexity |
| P4.2 | Metacognitive router | Research project, not production feature |
| P4.3 | RKG Store | Orama + Dexie already cover memory needs |
| P4.4 | Session recap agent | Low value, high effort |
| P4.5 | SWE-bench / GAIA benchmark | Requires significant setup. Stabilize first |
| P4.6 | Self-learning skill writing | Hermes-style. Requires stable orchestrator first |
| P4.7 | Webcam vision (autonomous) | camera-look works via VisionService. Autonomous triggers needed |
| P4.8 | Speech-to-Speech (no TTS gap) | Research area. Edge-TTS acceptable for now |

---

## Total Estimates

| Phase | Tasks | Effort | Risk Level |
|-------|-------|--------|------------|
| **P0** | 3 | 15min | None |
| **P1** | 5 | 3 days | Low-Medium |
| **P2** | 5 | 5 days | Medium-High |
| **P3** | 3 | 3 days | Low-Medium |
| **P4** | 8 | Not scheduled | — |
| **Total** | 16+8 | ~11 days (P0-P3) | — |

## Important Notes for Contributors

### Read Before Modifying
1. **`FEATURES.md`** — Full feature specification, constants, file inventory, IPC contract
2. **`AGENTS.md`** — Project overview, architecture, invariants, gotchas
3. **This document** — Active roadmap, task breakdown, dependencies

### Critical Invariants (from AGENTS.md)
- **JSON parsing fallback chain:** NEVER remove. 3 tiers in ai-bridge.js + multi-stage cleanAndParse()
- **Electron process boundary:** OS interactions via preload → IPC → main ONLY
- **Memory thresholds:** 0.3 (vector memory), 0.25 (orama), 0.35 (category router) — DON'T CHANGE WITHOUT CROSS-REF
- **VAD parameters:** Tuned for Indonesian speech. Don't change RMS threshold without testing
- **Relational growth:** warmth/trust FLOOR=0.15, MAX_DRIFT=0.01. Enforced in relationship.js
- **Single session:** Chat never auto-resets. This amplifies LLM bias over time

### Avoiding Previous Mistakes
- **Don't create files without wiring them.** `tool-registry.js` and `vision-service.js` sat unused for weeks
- **Don't plan 15 tasks in one day.** The 26 Jul v2 upgrade plan was called "vaporware" in the very next session
- **Don't remove and re-add the same dependency.** `@cliqz/adblocker-electron` was removed, re-added, removed again
- **Don't change turn timeout every 3 days.** It's 90s now. Verify with real usage before changing again
- **Don't document before code.** docs/PLANNED/ has 25 files. Many describe code that doesn't exist