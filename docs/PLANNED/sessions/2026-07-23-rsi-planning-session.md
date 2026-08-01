# Session: RSI Planning & Code Improvements

**Date:** 2026-07-23  
**Branch:** `feat/rsi-improvements`  
**Context:** Moving Mark Agent from desktop-only Electron AI assistant → hybrid platform with RSI capabilities

---

## 1. Code Changes (feat/rsi-improvements branch)

### New Files

#### `src/main/browser-dom-parser.js` (NEW)
- Extracted 110-line `DOM_PARSER_SCRIPT` from `browser-agent.js` into standalone module
- DOM IIFE: scans interactive elements (a[href], button, input, select, textarea, roles), assigns `data-mark-id`, extracts visible text via TreeWalker, injects "Mark is working..." overlay
- Limits: MAX_ELEMENTS=80, MAX_TEXT_LENGTH=80, text buffer 8000 chars

### Modified Files

#### `src/main/browser-agent.js` (470 lines, was 605)
- `import { DOM_PARSER_SCRIPT } from './browser-dom-parser.js'`
- Removed 136-line inline script — clean separation: window lifecycle vs injected script

#### `src/main/native-tools.js` (394 lines, was 356)
- `import os from 'os'` (was using non-ESM `require('os')`)
- **RSIAuditLog**: Every CLI invocation logged to `~/.mark/rsi-audit.log` as JSONL. Auto-rotate at 5MB (keep last 1000 lines). Format: `{t, tool, cmd, ok}`
- **safeEnv()**: Whitelists only essential env vars (`HOME`, `USER`, `PATH`, `SHELL`, `TERM`, `LANG`, `LC_ALL`, `NODE_PATH`, `DISPLAY`, `WAYLAND_DISPLAY`, `XDG_CURRENT_DESKTOP`, `XDG_SESSION_TYPE`, `NODE_*`, `npm_*`)
- `run-powershell` → `run-shell` rename. Uses `safeEnv()` + `RSIAuditLog`
- `run-cli`: Destructive command guard via `isDangerousCommand()`, returns directed message to use `run-shell` for dangerous ops
- Expanded `DANGEROUS_KEYWORDS` list

#### `src/main/ai-bridge.js` (511 lines, was 496)
- Replaced naive `firstBrace`→`lastBrace` JSON extraction with balanced-pair `extractJSON()`
- Now handles: `{objects}` (depth-counted), `[arrays]` (previously broken), nested objects

### Renderer Files (references updated)
- `src/renderer/src/api/ai/planning.js` — 3 refs
- `src/renderer/src/hooks/agent/useMarkPlan.js` — 1 ref
- `src/renderer/src/pages/Guidebook.jsx` — 1 ref

---

## 2. RSI Architecture Decisions

### Priority Order: C → A → D → B

| Phase | Name | Strategy |
|-------|------|----------|
| **C** | RSI Discovery Engine | Detect capability gaps → crawl GitHub (via built-in browser, not API) → find repos → analyze → suggest integration → adapt |
| **A** | Autonomous Agent Loop | Dynamic ReAct loop (5-7 step limit), guardrails via Zod, permission levels (L1 autonomous, L2 semi, L3 restricted), verification loops |
| **D** | Computer Use | Screen analysis + keyboard/mouse control |
| **B** | Clone & Understand | Self-reasoning about own architecture |

### Core Philosophy: "Use Existing First"
- Don't build from scratch — compose existing tools
- C phase wraps GitHub crawl via Mark's existing browser, not new API integration
- Claude verification loop patterns mapped to Mark architecture

### Key Technical Decisions

| Concept | Decision |
|---------|----------|
| **Two-tier RSI filtering** | Tier-1 (quant: stars, recency, license) sans LLM → Tier-2 (semantic: README embedding × capability profile vector) |
| **Capability Profile Vector** | Embedding of all installed plugins + tool descriptions + usage history |
| **Usage-based pruning** | Deprecate after 14d inactivity, archive if <30% success rate |
| **Dynamic tool injection** | Metadata in system prompt only; full code loaded on demand |
| **Verification loops** | 3 patterns mapped: Standalone (self-check), Embedded (per-step), Chained (skill pipeline) |
| **Chained skills** | `/code-review → /simplify → /verify → /design` pattern (Anthropic internal) |
| **Safe subprocess env** | Whitelist-based env vars for shell execution |

### Claude Resources → Mark RSI Mapping

| RSI Step | Claude Insight Applied |
|----------|----------------------|
| ① Detect gap | Agentic verification loop pattern — let agent detect own failures |
| ② Search solution | Cookbook-as-seed pattern — Mark's own usage history as seed DB |
| ③ Analyze | Standalone verification loop — critique before integrating |
| ④ Suggest | Embedded verification — per-step guardrails |
| ⑤ Adapt | Chained verification — `test → review → deploy` pipeline |

---

## 3. Visual Companion Content

Two architecture diagrams created:

1. **`rsi-discovery.html`** — 5-step RSI Discovery Engine: Detect Gap → Search (GitHub crawl) → Analyze → Suggest → Adapt. Shows two-tier filtering pipeline.

2. **`claude-mapping.html`** — Claude verification loop patterns mapped to Mark RSI architecture. Shows Standalone/Embedded/Chained patterns at each RSI step.

Location: `.superpowers/brainstorm/76665-1784806501/content/`

---

## 4. Files Examined (for reference)

| File | Purpose |
|------|---------|
| `src/main/browser-agent.js` | Browser automation lifecycle |
| `src/main/native-tools.js` | CLI/shell tool execution |
| `src/main/ai-bridge.js` | LLM API bridge + JSON extraction |
| `src/main/plugins/plugin-loader.js` | Plugin system (manifest + index.js) |
| `src/main/agent-skills-loader.js` | Agent skills loader (SKILL.md parser) |
| `src/main/awareness/window-tracker.js` | Cross-platform active window tracking |
| `src/renderer/src/api/ai/planning.js` | ReAct loop system prompt assembly |
| `src/renderer/src/hooks/agent/useMarkPlan.js` | Tool execution routing |
| `src/renderer/src/pages/Guidebook.jsx` | Guidebook UI |

---

## 5. Next Steps (Phase A Design)

When continuing:
1. Present Phase A (Autonomous Agent Loop) architecture based on verification loop patterns
2. After all phases approved: write design doc to `docs/superpowers/specs/YYYY-MM-DD-mark-rsi-design.md`
3. Stop visual companion server when done

---

## 6. Errors & Fixes During Session

| Issue | Fix |
|-------|-----|
| `require('os')` in ESM module | Changed to `import os from 'os'` |
| Orphaned IIFE body after DOM_PARSER extraction | Second Edit pass to remove dangling code |
| Visual companion server timeout (30min) | Restarted with `run_in_background` |
| WebFetch failing on claude.com | Used `curl` + custom UA + Python extraction |
| Git stash/checkout confusion | `git checkout -- . && git clean -fd && git add -A` |
