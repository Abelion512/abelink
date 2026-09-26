# Session: Context-Adaptive Budget + CLI Headless + TUI Spike (2026-09-21)

## Recorded principles (user)
- **3repot** = Anthropic + OpenAI + Hermes + support (Kimi, Gemini, DeepSeek, Grok, dst).
- **Contek ahli, ATM** — never build from zero for this app. Zero-AlphaGo is the exception, not the model.

## Reference findings
- Anthropic (context engineering): compaction + structured note-taking + sub-agents; context rot; attention budget; just-in-time retrieval; tool-result clearing.
- OpenAI (Agents API/SDK): automatic context compaction, sessions, programmatic tool calling, prompt caching.
- Hermes: closed learning loop, skills, subagents, FTS5 recall, 60+ tools, MCP.
- opencode (TUI target): TUI+CLI+Web one engine, Tab plan/build, /undo, keybinds, MCP/skills.

## Changes (uncommitted)
- Stream 1: `sessionCompactor.js` (+shouldCompactLoop pure, buildCompactedLoopWindow pure, MIDLOOP cooldown/prune consts, header fix 525K→45K); `useAbelinkPlan.js` (turnsSinceCompact state, mid-loop trigger + prune at loop tail); `ContextGauge.jsx` (single source of truth import); `tests/midloopCompaction.test.mjs` (8).
- Stream 2: `planStepBudget.js` (+shouldRenewBudget/renewBudgetWindow pure, BUDGET_RENEW_STEPS=48); `useAbelinkPlan.js` (renew-or-honest-stop replaces one-shot +16; forced text now says "tanpa kemajuan"); `tests/budgetSafetyNet.test.mjs` (8).
- Stream 3: new `src/api/ai/headlessCli.js` (parseSpawnQuery, checkSubagentBudget depth2/max3, condense 2k, approval relay hardline-never, config chain home+repo-local, file-backed working-memory, sequential runHeadlessSubagent); `agentRunner.js` (+options.unifiedContext seam, default unchanged); `bin/abelink.mjs` (--approve-all/--deny-all, auth chain, memories, spawn_subagent); `tests/cliHeadless.test.mjs` (17).
- Stream 4: spike recommends @opentui/core (opencode stack), thin client over runAgentLoop, zero engine changes; scratch in /tmp deleted.
- `useManualCompaction.js` already on single source of truth — no change needed.

## Verification
- Targeted: 17 + 16 green. Full: 1421/1422 (1 flaky: syntax-prose gmail-list network timeout, passes solo 6/6, files untouched by this session). Lint touched files: exit 0, 0 errors. `bin/abelink.mjs --help`: exit 0. Build: OK.

## Follow-ups
- E2E: long-horizon mission via compaction (not failed); CLI live run with subagent.
- TUI integration after engine contract stabilizes.
