# MARK Agent Fork — Linux-only @abelion
## CRITICAL RULES — PERMANENT MEMORY
1. **NEVER push to GitHub without explicit user approval.** Commits to local branch are fine. Push = `git push` = requires user to say "push" first. No exceptions.
2. **NEVER run destructive operations** (force push, filter-branch, delete branch) without asking first.
3. **Security audit before push** — at minimum: syntax check, build pass, no hardcoded secrets.

## Identity
- This is a **Linux-only fork** of [Mazees/mark-agent](https://github.com/Mazees/mark-agent)
- Windows/macOS references stripped. All paths Linux-native (`/home/user/...`)
- Config via UI (Configuration page). No `.env`, no `config.yaml`.

## AI Backend
- **9Router** proxy (`http://localhost:20128`) as primary endpoint — no local GPU needed
- Default fallback: LM Studio (`http://localhost:1234`)
- Model: `abelink` (composite: DeepSeek V4 Flash + Nemotron + Mimo 2.5)
- Format parsing: `fallback-serializer.js` — JSON → XML → KV → Regex → Graceful
- Error log: `error-log.js` (Dexie SQLite), auto-injected to system prompt
- Context compactor: `context-compactor.js` replaces hard truncation

## New/Modified Files (MARK v2 Upgrade)
| File | Purpose |
|------|---------|
| `fallback-serializer.js` | Multi-format output parser with regex intent extraction |
| `model-router.js` | Multi-model dispatch with capability probe + `import.meta.env` fallback |
| `error-log.js` | Persistent error/solution log (Dexie) |
| `context-compactor.js` | Smart context compression replaces truncation |
| `input-architecture.js` | Message normalization + compaction call |
| `session-recap.js` | Away detection + `/recap` command |
| `metacognitive-router.js` | Behavioral confidence scoring + destructive pattern check |
| `dag-validator.js` | Cycle detection via Kahn's algorithm |
| `sub-agent-pool.js` | Parallel sub-agent lifecycle with file locks |
| `orchestrator.js` | Task decomposer + dispatcher + synthesizer pipeline |
| `system-prompt.js` | Adaptive prompt tiers (stable/context/volatile) |
| `rkg-store.js` | Relational Knowledge Graph with 30-day eviction |
| `verification-service.js` | Tool output verification |
| `mcp-manager.js` | MCP server discovery + tool search pattern |
| `registry.js` | Unified tool registry (Hermes-style) |

## Rules
- **Think-First**: Brainstorm before Write/Edit
- **Git-Aware**: Check `git log -p` before modifying existing files
- **Feature Flags**: Orchestrator mode = opt-in (`options.orchestratorMode`)
- **Safety Net**: Commit/stash before destructive git operations

## Commands
- `npm run dev` — Start Electron dev server
- `git status | hermes "explain"`

## Model Routing
- Single model ID `abelink` via 9Router — server-side fallback handles model switching
- Vision disabled by default (no vision model configured)
- All `ag/` prefix models are Antigravity, not 9Router
- Probe disabled by default — re-enable via config
