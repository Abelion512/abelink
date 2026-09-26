# Session: Trajectory Audit + 7-Item Fix Wave (2026-09-21)

## Decisions
- User report (6 items: Knowledge crash, ai-slop compare, plugin ghost-install, nav overlap, EN/ZH language) + user-flagged trajectory audit → 2 severe trajectory bugs (A+B) added to scope ahead of the original 6.
- Knowledge simulator: implement handler (user: "ikut rekomendasi"), not delete.
- System language: EN default, ZH second (user decision).
- `Sparkles` in `planning.js:257` is prompt prose instructing the model — intentional, kept.
- Sub-agent/agentRunner turn framing explicitly deferred (documented debt, not silent).

## Files changed (23, +570/-428, uncommitted)
- BUG B: `src/api/ai/progressEvaluator.js` (+`isFailure`, superset of trajectoryLearning FAILURE_RE + BLOCKED/FORMAT SALAH/DITOLAK-*), `src/hooks/agent/useAbelinkPlan.js` (5 predicate sites unified + supervisor feed for rejected/circuit-block paths; breaker keeps ignoring approval denial).
- BUG A: `src/api/harness.js` (+`logTurnStart`), `useAbelinkPlan.js:883` harness mirror, `scripts/harness-diagnose.mjs` (START-tanpa-END scoped: non-latest turns or sessions with terminal end).
- Knowledge: `src/pages/Knowledge.jsx` (+`handleRunSimulation` :187, `Sparkles`→`Activity`).
- Plugin: `sidecar/main/plugins/plugin-loader.js` (catch cleanup, post-clone manifest validation, exists-but-invalid → EN invalid-format error).
- Nav: `ConfigSidebar.jsx:83` (`px-3`→`pl-14`, + `tx(language)` wiring).
- Sparkles: `ChatStudio.jsx`, `AbelinkHome.jsx`, `ChatStudioModal.jsx`, `ChatList.jsx`, `MessageBubble.jsx` (icon swaps; repo-wide `grep Sparkles src/` clean except prompt prose).
- Locale Phase A: new `src/api/locale.js` (~700 EN+ZH keys, `tx`/`localeTag`, legacy `id`→EN), converted: `Configuration.jsx`, `ConfigSidebar.jsx`, `GeneralSection.jsx` (+`zh` option), `ModelSection.jsx`, `SttRouterConfig.jsx`, `DataControlsSection.jsx`, `PersonalizationSection.jsx`, `ShortcutsSection.jsx`, `VoiceVideoSection.jsx`, `DeveloperSection.jsx`, `CapabilitiesHub.jsx` (~190 `tx()` calls), `AppSidebar.jsx` (pre-existing user EN edits preserved). `toLocaleTimeString` follows locale, never `id-ID`.

## Verification
- `bunx vitest run`: 129 files, 1346/1346 passed.
- `bun run lint` (touched files + hub/locale/config): exit 0, 0 errors (warnings pre-existing).
- `bun run build`: success (37s).
- `bun -e` locale smoke: EN `Open Folder` / ZH `打开文件夹` / tags `zh-CN`/`en-US`.
- Empirical grounding: dev harness `2026-09-21` had 5 kind files, zero `turn-start.jsonl` (BUG A); `tool-calls.jsonl` held `[DITOLAK-HUMAN-LOOP]` with `ok=True` (BUG B live).

## Known limits / follow-ups
- Phase B: surfaces outside `/#/config` still ID (uncharted scope).
- `alert()`-based errors kept as alerts (no modal migration).
- `obra/superpowers` can never list as Abelink plugin (no manifest) — user must delete stale `~/Documents/Abelink Plugins-dev/superpowers/`; error message now says so.
- Diagnose red-flag check for turn framing in bench/sub-agent paths still absent (no turn events emitted there).
