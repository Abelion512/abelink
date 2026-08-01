# MARK Improvement Roadmap — Design Spec

**Date:** 2026-07-31
**Branch:** `feat/performance-and-readibility`
**Status:** Approved by user (Abelion512)

## Goal

Reduce technical debt in the MARK codebase without changing any user-visible behavior. Three phases: **Stability → Performance → Readability**, in that order, because reliability fixes reduce debugging cost for all later work, performance is user-visible value, and readability is a long-term maintenance win.

## Non-Goals

- No new features. No behavior changes. Every task is a refactor or a small hardening fix.
- No framework migration (loop stays hand-rolled in `useMarkPlan` — Anthropic: "most successful implementations use simple, composable patterns rather than complex frameworks").
- No new dependencies except `vitest` (dev-only, Task 8).

## Verified Against External References

- Anthropic, *Building Effective Agents* (Dec 2024): simplest pattern that passes evaluation; workflows for predictability, agents for flexibility; avoid framework abstraction layers.
- Claude Agent SDK permissions docs: six-step permission evaluation (hooks → deny → ask → permission mode → allow → canUseTool); hooks fire even in bypass mode.
- React docs (Context7 `/reactjs/react.dev`): `React.lazy` + `Suspense` route splitting pattern.
- Vitest docs (Context7 `/vitest-dev/vitest`): node environment sufficient for pure-utility unit tests; no jsdom needed for `cleanAndParse`-style functions.

## Current Pain Points (measured)

| File | Lines | Problem |
|---|---|---|
| `src/renderer/src/pages/Configuration.jsx` | 1611 | 17 handlers + JSX mixed; 4 useEffects with setTimeout |
| `src/renderer/src/hooks/agent/useMarkPlan.js` | 1011 | Agent loop + 15 tool branches in one function |
| `src/renderer/src/pages/Guidebook.jsx` | 967 | Static docs page loaded eagerly |
| `src/renderer/src/pages/Plugins.jsx` | 597 | Eagerly loaded |
| `src/main/ai-bridge.js` | 497 | `cleanAndParse` duplicated with renderer `core.js` |

## Phase 1 — Stability

### Task 1: Unify `cleanAndParse` into `src/shared/`

**Problem:** Two divergent implementations:
- `src/main/ai-bridge.js:482` — async, lazy `getJsonrepair()`, no fast-path
- `src/renderer/src/api/ai/core.js:59` — sync, fast-path raw parse first, `jsonrepair` direct import

Divergence = behavioral drift (e.g., renderer rejects arrays via `!Array.isArray`, main accepts anything).

**Solution:**
- Create `src/shared/cleanAndParse.js` exporting `cleanAndParse(raw)` — sync, fast-path first, lazy jsonrepair via dynamic import fallback, `{...}` substring extraction fallback, object-only result check.
- `src/main/ai-bridge.js` imports it (drop its local copy).
- `src/renderer/src/api/ai/core.js` imports it (drop its local copy).
- Verify electron-vite supports `src/shared` import from both main and renderer (check `electron.vite.config.mjs` alias; add `@shared` alias if needed).

**Test:** `tests/cleanAndParse.test.js` — plain JSON, fenced JSON, broken trailing commas, array-only (→ null), BOM prefix, garbage → null.

### Task 2: Harden agent loop cleanup + guard-gate bypass invariant

**Problem (measured in `useMarkPlan.js`):**
- `isExecutingRef` release is in `finally` ✅, but `dismissProcess` only runs in `catch` — a successful-but-degenerate loop leaves the process panel stale.
- `setChatData` updater functions are not guarded; an unexpected throw inside an updater (e.g., `autonomousInitialMessage` null + `item.content === autonomousInitialMessage` comparison is safe, but others may not be) can leave a stale `isThinking` bubble.
- **Guard-gate bypass gap (from research):** Claude hooks fire even in `bypassPermissions` mode. In `useMarkPlan.js`, the pre-flight guard runs only inside the native-tools branch; when `approvalMode === 'bypass'` the `checkApprovalByMode` result is skipped but `guard.preFlightCheck` still runs — verify this is true and, if not, ensure guard executes in bypass.

**Solution:**
- Wrap tool-dispatch body so any non-AbortError exception still feeds `[ERROR]` observation back to the loop (already exists) **and** increments `failureCounters` (gap: crash path at line 892-897 does NOT increment counters — hard-stop can never trigger on crashes).
- Ensure `dismissProcess` runs in both catch and normal-exit paths.
- Add regression guard: crash path increments `failureCounters.same_tool_failure[tool]`.

## Phase 2 — Performance

### Task 3: Decompose `useMarkPlan.js` tool dispatch

Extract per-domain tool execution into `src/renderer/src/hooks/agent/tools/` modules (follows existing `agent/` folder pattern):

| Module | Tools |
|---|---|
| `youtube.js` | `yt-search`, `yt-summary` |
| `music.js` | `music-*` |
| `vision.js` | `analyze-screen`, `camera-look` |
| `wa.js` | `wa-send`, `screenshot-to-wa` |
| `native.js` | read-file/write-file/browser-*/run-*/native-notify + guard + approval flow |
| `pc.js` | `os-*`/`pc-*` |
| `plugin.js` | fallback plugin execution |

Each module: `export async function executeTool({ tool, query, ctx })` where `ctx` bundles: `chatData/setChatData`, `config`, `abortControllerRef`, `handleMusic`, `getYoutubeData`, `getYoutubeSummary`, `requestApproval`, `requestCameraCapture`, `guard`, `loopMessages`, `failureCounters`, `scheduleThinkingUpdate`, `flushThinkingUpdate`, `pushProcess`, `waContext`, `isAutonomous`, `sanitizeToolOutput`, `checkApprovalByMode`.

**Constraint:** pure mechanical extraction. No logic changes. `useMarkPlan.js` keeps: loop, guardrails, memory handling, answer path, cleanup.

### Task 4: Lazy-load route pages

`src/renderer/src/App.jsx` — replace eager imports of 7 pages with `React.lazy(() => import(...))` + one `<Suspense>` boundary per route or one wrapping boundary. Fallback: existing spinner/loading class (check what `MarkHome` uses; reuse design token).

Pages: `MarkHome`, `Configuration`, `Knowledge`, `LiveAudio`, `Guidebook`, `Plugins`, `RelationalGrowth`, `WhatsappBot`.

**Note:** electron-vite renderer build uses Rollup — dynamic imports produce separate chunks automatically. Verify `base`/`build.rollupOptions.output` config doesn't force single-file output.

### Task 5: Split `Configuration.jsx`

After T4, split the 1611-line page into sections. Target structure:

```
src/renderer/src/pages/config/
  Configuration.jsx        (shell: tabs + state orchestration)
  sections/ConfigAI.jsx        (provider, model, temperature)
  sections/ConfigMemory.jsx    (memory management, traits)
  sections/ConfigAdmin.jsx     (WA admin approval)
  sections/ConfigCamera.jsx    (camera device + preview — reuse ConfigCameraPreview)
  sections/ConfigVoice.jsx     (TTS rate/pitch test)
  sections/ConfigChat.jsx      (export/clear)
```

Each section gets its own local state + useEffect; shared state stays in parent. **Constraint:** visual/behavioral identity — same DaisyUI classes, same order of sections, same Driver.js tour behavior (tour steps reference section IDs — keep IDs).

## Phase 3 — Readability

### Task 6: Slim AGENTS.md

- Keep in AGENTS.md: project overview (short), tech stack (1 line each), critical rules, development guidelines.
- Move to `docs/`: full file inventory table, constants/thresholds table, model selection guidelines.
- AGENTS.md becomes pointer with links.

### Task 7: Dead code sweep

- Grep for unused exports: `window.api.*` methods with no renderer caller; `db.js` exports not imported anywhere; unused IPC handlers in `main/index.js`.
- Remove confirmed dead code. Keep anything referenced by plugins/WA (external entry points — verify before removing).

### Task 8: Test harness (vitest)

- Add `vitest` devDependency. Add `"test": "vitest run"` script.
- `vitest.config.mjs` or extend `electron.vite.config.mjs` with `test` block: `environment: 'node'`.
- Tests for pure utilities: `cleanAndParse` (Task 1), `sanitizeToolOutput`, `checkApprovalByMode`, guard-gate pre/post flight.
- Run in CI-less local workflow: `npm test` before commits touching these modules.

## Success Criteria

- All 8 tasks complete with no user-visible behavior change.
- `npm run build` passes after each phase.
- `npm test` passes (after Task 8).
- `useMarkPlan.js` ≤ ~400 lines; `Configuration.jsx` shell ≤ ~200 lines (sections carry the rest).
- No new runtime dependencies.

## Risks

| Risk | Mitigation |
|---|---|
| Mechanical extraction (T3) introduces subtle behavior change | Per-module commit; diff review; manual smoke test of agent loop |
| Lazy loading flash on slow disks | Single Suspense fallback consistent with app loading state |
| Shared module import path (T1) breaks build | Verify electron-vite alias first; fallback: relative imports |
| Configuration split breaks Driver.js tour | Keep section IDs stable; tour is step-number-based, verify |
| Dead code sweep removes externally-referenced code | Grep plugins/WA docs before removal; keep `window.api` surface stable |
