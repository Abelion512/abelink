# Session: Fix Vision IPC GlobalConfig + MaxListeners + Empty Content Retry

## Ringkasan

**Tanggal:** 2026-08-01
**Branch:** `worktree-fix-vision-55b` (off `5.5.0`)
**Files touched:** `src/main/index.js`, `src/main/ai-bridge.js`, `src/main/youtube-player.js`, `src/main/pc-agent.js`
**Ringkasan:** Dev-log audit of `npm run dev` surfaced three runtime issues: (1) `ReferenceError: globalConfig is not defined` in `vision:resolve-model` / `vision:get-endpoint` IPC handlers — the handlers referenced a bare `globalConfig` variable that never existed in `index.js` scope (config lives in `ai-bridge.js` as module-private state, exposed via `getGlobalConfig()`); (2) `MaxListenersExceededWarning: 11 did-stop-loading listeners` on WebContents — only mainWindow and browser-agent windows had `setMaxListeners(50)`, youtube-player ytWindow and pc-agent overlayWindow were missing it; (3) empty `content: null` / `finish: "length"` responses counted as success in `ai-bridge.js`, letting empty responses propagate to the agent loop. All three fixed, committed `9148f0e`, pushed, draft PR #21 opened against `5.5.0`.

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
|---------|------|------------|-----|--------|
| `ReferenceError: globalConfig is not defined` in vision IPC | `src/main/index.js:647,654` | Handlers referenced bare `globalConfig`; config is module-private in `ai-bridge.js` (`let globalConfig = {}`), only exported via `getGlobalConfig()` | Import `getGlobalConfig` from `./ai-bridge.js`, replace `globalConfig \|\| {}` with `getGlobalConfig()` | ✅ Fixed (PR #21) |
| `MaxListenersExceededWarning: 11 did-stop-loading listeners` | `src/main/youtube-player.js`, `src/main/pc-agent.js` | Only mainWindow + browser-agent had `setMaxListeners(50)`; ytWindow and overlayWindow created fresh per-use without raising limit | Add `ytWindow.webContents.setMaxListeners(50)` and `overlayWindow.webContents.setMaxListeners(50)` | ✅ Fixed |
| Empty `content: null` / `finish: "length"` treated as success | `src/main/ai-bridge.js:485` | Non-streaming path returned `{ content: '' }` with `success = true` on empty content — caller sees successful empty observation, agent loop feeds blank text | Retry with exponential backoff (up to `policy.maxRetries`), only `break` after exhausting retries | ✅ Fixed |

## Files Modified

| File | Perubahan |
|------|-----------|
| `src/main/index.js` | Import `getGlobalConfig`; both vision handlers use `getGlobalConfig()` instead of bare `globalConfig \|\| {}` |
| `src/main/ai-bridge.js` | Empty-content branch: set `lastError`, track failed usage, retry with backoff loop instead of returning success |
| `src/main/youtube-player.js` | `ytWindow.webContents.setMaxListeners(50)` after BrowserWindow creation |
| `src/main/pc-agent.js` | `overlayWindow.webContents.setMaxListeners(50)` after BrowserWindow creation |

## Agent Learnings

### Pattern Konkret

1. **Module-private config via getter** — `ai-bridge.js` holds config in module scope (`let globalConfig`), never exported as a bare identifier. IPC handlers in `index.js` must use the exported `getGlobalConfig()` getter. A bare `globalConfig` reference is a `ReferenceError` at runtime (not compile time — no TS in main process). Grep for `globalConfig` in the file before assuming it's in scope.

2. **MaxListenersExceededWarning leaks silently** — every `new BrowserWindow()` needs its own `webContents.setMaxListeners(50)` right after creation. The warning is non-fatal but indicates a real leak; Dev/HMR mode adds external listeners that can't be seen in source. Pattern: check every `new BrowserWindow` site, not just the main window.

3. **Empty content as fake success** — treating `content: null` as success poisons the agent loop (blank observation → AI hallucinates or retries uselessly). Empty content is a model failure signal; retry within the existing backoff policy before giving up.

### File Invariants

| File | Invariant |
|------|-----------|
| `src/main/index.js` | Vision IPC handlers must call `getGlobalConfig()`, never reference a bare `globalConfig` |
| `src/main/ai-bridge.js` | Empty content must never return `success = true`; retry via backoff loop |
| Every `new BrowserWindow` site | Add `webContents.setMaxListeners(50)` immediately after creation |

### Verification Checklist

- [x] `grep getGlobalConfig src/main/index.js` — import line 112, used at 647 & 654
- [x] `grep setMaxListeners` — all 4 windows: index.js:74, browser-agent.js:29, youtube-player.js:45, pc-agent.js:153
- [x] `node --check` passed on all 4 modified files
- [x] Commit `9148f0e` on `worktree-fix-vision-55b`, pushed to origin
- [x] PR #21 draft open against `5.5.0`: https://github.com/Abelion512/mark-agent/pull/21
- [ ] `npm run dev` smoke test — verify no ReferenceError + no MaxListeners warning in fresh run (needs LM Studio on localhost:20128)

## Callback

After the next `npm run dev`, confirm the dev log shows no `ReferenceError: globalConfig is not defined`, no `MaxListenersExceededWarning`, and no `empty Content kosong` lines — or report residuals so the retry logic can be tuned?
