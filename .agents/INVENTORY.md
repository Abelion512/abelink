# `.agents/` Infrastructure & Self-Improvement Pipeline — Repo Inventory

> Agent-consumable format — setiap agent bisa pilih task mana yang mau dikerjain. Hasil scan 2026-07-30.

## A. Existing Knowledge Pipeline

### A1. Session Knowledge Extraction
- **File:** `src/renderer/src/api/ai/sessionKnowledge.js` (full, ~60 lines)
- **What:** `extractSessionKnowledge()` — keyword-scans chat data for decisions/patterns/insights/gaps/errors
- **Trigger:** Auto-saved on unmount via `useMarkAgent.js:209-212`
- **IPC:** `save-session-knowledge` → main process writes JSON to `~/.mark/knowledge/sessions/`
- **Schema:** `session-knowledge-v1` — `$schema`, `id`, `timestamp`, `agent`, `project`, `session.topic`, `knowledge.{decisions,patterns,insights,gaps,errors}`
- **Weakness:** Keyword-based (not vector-based), only fires on page unmount, no dedup

### A2. Knowledge → RAG Pipeline
- **File:** `src/renderer/src/api/ragPipeline.js:11-135`
- **What:** Imports session knowledge JSON → chunks → vector embeddings → Orama index
- **Flow:** `ragPipeline.js` detects `$schema: session-knowledge-v1` → chunks knowledge fields → stores in Dexie + Orama for semantic search
- **Search:** `vectorMemory.js` with `searchExtendedMemory()` → threshold 0.3, top 3, types `['notes', 'learn']`

### A3. "Learn" Memory (in-system-prompt)
- **File:** `src/renderer/src/api/ai/planning.js:268-271, 368, 393-394`
- **What:** AI system prompt instructs model to save "learn" memory after solving complex problems
- **JSON schema in prompt:** `{ "memory": { "type": "learn", "summary", "memory", "action": "insert|update|delete" } }`
- **Search trigger:** "Sebelum menulis kode, cek 'learn' memory dulu via memory-search"
- **Weakness:** AI-controlled (no deterministic trigger), no promotion to reusable skill format

### A4. Existing Auto-Save Hooks
- `useMarkAgent.js:204-212` → auto-save session knowledge on component unmount
- `planning.js` → AI decides when to save "learn" memory (ad-hoc, not enforced)
- `db.js:98` → `VALID_TYPES = ['profile', 'preference', 'notes', 'learn']` — 4 memory types, no "skill" type

## B. Existing Skills Infrastructure

### B1. agent-skills-loader.js
- **File:** `src/main/agent-skills-loader.js` (full, ~122 lines)
- **What:** Scans `~/.agents/skills/*/SKILL.md` → parses YAML frontmatter → exposes via IPC
- **Scan dirs:** `~/.agents/skills/`, `~/.zcode/skills/`, `$AGENT_SKILLS_DIR/.agents/skills/`
- **IPC handlers:** `get-list`, `get-content`, `reload`
- **ParseSkillFile output:** `{ name, description, content }` — **no watermark fields yet**

### B2. planning.js skill injection
- **File:** `src/renderer/src/api/ai/planning.js:208-233`
- **What:** Vector-matches user input against skill descriptions (threshold >= 0.35) → injects matched SKILL.md content
- **Cached:** `skillsVectorCache`, `skillsContentCache` — avoids re-fetch every turn
- **Sanitizer:** `sanitizeSkillContent()` strips prompt injection patterns from SKILL.md (lines 186-206)

### B3. tool-registry.js
- **File:** `src/main/tool-registry.js`
- **What:** L0/L1 progressive disclosure — all tools (built-in + skills + plugins) in one registry
- **Skills discovered:** Scans `~/.agents/skills/` dirs at L0 level (name + 1 line)

## C. Existing Directory Structure (what's on disk)

```
~/.agents/skills/         — user-global skills (Hermes pattern, used by agent-skills-loader)
~/.zcode/skills/          — Z.code skills (secondary, used by agent-skills-loader)
~/.mark/knowledge/sessions/  — session knowledge JSONs (written by save-session-knowledge IPC)
~/Documents/Mark Plugins/ — plugins (unrelated to skills, evaluated JS)
```

**No project-local `.agents/` directory exists yet.** Skills are user-global only, not version-controlled.

## D. Gaps & Opportunities for Self-Improvement

| # | Gap | Why It Matters | What To Build |
|---|-----|---------------|---------------|
| 1 | AI can save "learn" memory but cannot create SKILL.md | Knowledge trapped in vector DB, not reusable as skill | Auto-create SKILL.md from repeated learn patterns |
| 2 | Session knowledge dumped as JSON, never promoted | Gems buried in `~/.mark/knowledge/sessions/` never become agent capabilities | Knowledge → Skill promotion trigger |
| 3 | No dedup between learn memory and skill content | Same solution stored twice in different formats | Skill registry checks existing SKILL.md before creating |
| 4 | No origin tracking | Can't tell MARK-native vs user vs AI-generated | WATERMARK frontmatter (this plan) |
| 5 | Auto-save only on unmount | Session ends without topic closure = lost knowledge | Periodic save during long sessions |
| 6 | Keyword extraction only | `extractSessionKnowledge()` misses vector-semantic patterns | Enhance with embedding similarity scoring |

## E. Agent Handoff Format — Task Matrix

```
Task ID   | Subsystem               | Files Changed     | Est. Lines | Depends On
----------|-------------------------|-------------------|------------|-----------
A.1       | `.agents/` dirs         | New directories   | 0 code     | (none)
A.2       | WATERMARK parsing       | agent-skills-loader.js | +15  | A.1
A.3       | Origin badge in prompt  | planning.js       | +3         | A.2
A.4       | Self-improvement hook   | useMarkAgent.js   | +30        | A.1, A.3
A.5       | Skill creation IPC      | index.js + preload| +20        | A.4
A.6       | Session→Skill promote   | sessionKnowledge  | +40        | A.5
A.7       | Docs & AGENTS.md        | .md files         | +50        | A.1-A.6
```
