# Session: Performance, YouTube Migration & Lazy Loading

**Date:** 2026-07-24 ~09:00–19:30 WIB
**Branch:** `feat/performance-and-readibility`
**Author:** Abelion512

---

## Completed

### 1. YouTube Music → YouTube Migration
- Replaced `ytmusic-api` with `yt-search` (existing dependency)
- Changed webview URL from `music.youtube.com` → `youtube.com`
- Updated DOM selectors: YT Music → YouTube keyboard shortcuts (`k`, `Shift+N`, `Shift+P`)
- Updated tool descriptions in AI prompt: "YT Music" → "YouTube"
- Webview: `width: 420px`, `height: 560px`, `partition="persist:youtube"` (login persists across restarts)
- Zero-dep adblock: CSS + JS injection inside webview. Ad containers hidden, ad detected → mute + 16x speed + skip
- YouTube login: persist antar restart. Google login gak bisa di webview (detect Electron) — workaround: login di webview dulu, cookies persist

### 2. Lazy Loading Skills & Plugins
- **`agent-skills-loader.js`**: Boot reads only frontmatter (name + description). Content fetched on-demand via IPC. Log reduced from 66 lines → 1 line
- **`plugin-loader.js`**: `loadPlugins()` scans manifest only, skips `import()`. Plugin module loaded on-demand on first `plugin:execute`
- **`planning.js`**: Skills content cache (`skillsContentCache`) + plugin list cache 60s (`pluginListCache`)
- **`index.js`**: `loadPlugins()` → fire-and-forget after `createWindow()`. Window appears instantly

### 3. Bug Fixes
- **`handleIntervention` not defined**: Function was lost during refactor, restored
- **MPRIS "stream is closed"**: `ipcMain.handle()` → `ipcMain.on()`, `ipcRenderer.invoke()` → `ipcRenderer.send()`. All wrapped in `safePropertySetter()` + try/catch
- **EIO stdout crash**: `pushToBuffer` error handler
- **ArrowUp/ArrowDown history**: Enter no longer double-submits. `Ctrl+Enter` submits. Enter creates newline
- **InputBar**: Stop button replaces Send button during loading (saves space)
- **`process.stdout.on('error')`**: Silence broken pipe
- **Adblock patterns**: Removed `ytimg.com/api/*`, `google-analytics`, `googletagservices` that broke YouTube connectivity

### 4. Codebase Cleanup
- Removed `@cliqz/adblocker-electron` (deprecated) → zero-dep adblock
- Removed `@ghostery/adblocker-electron` (caused black screen)
- Removed `ytmusic-api` dependency
- Added `partition="persist:youtube"` + `webpreferences="enableRemoteModule, contextIsolation=no"`

---

## Pending

1. **YouTube Google login in webview**: Google blocks webview login ("suspicious activity"). `persist:youtube` persists cookies, but initial login still in webview. Workaround: login once, cookies persist.
2. **System prompt still says "OS Windows"**: In awareness engine — needs fix to "OS Linux"
3. **Auxiliary vision**: Deferred. Jarvis performance first.
4. **Benchmark system**: Deferred.
5. **Security/safety for human**: Interview-me session incomplete, needs continuation.

---

## Impact

| Metric | Before | After |
|--------|--------|-------|
| Window load | Waits for `await loadPlugins()` | Instant |
| Skill boot | 66 full SKILL.md reads | 66 frontmatter-only reads |
| YouTube | `ytmusic-api` + YT Music | YouTube + CSS adblock |
| MPRIS crash | Unhandled "stream is closed" | All wrapped, silent fail |
| Input UX | Enter = submit + ArrowUp/Down | Ctrl+Enter = submit, Enter = newline, Arrow = history |

---

## Files Modified

| File | Changes |
|------|---------|
| `package.json` | Remove `ytmusic-api`, add deps |
| `src/main/index.js` | Adblock patterns, MPRIS IPC, boot order |
| `src/main/agent-skills-loader.js` | Lazy frontmatter-only load |
| `src/main/plugins/plugin-loader.js` | Lazy plugin module loading |
| `src/main/mpris-service.js` | Safe property setters, try/catch |
| `src/preload/index.js` | MPRIS `send()` instead of `invoke()` |
| `src/renderer/src/api/ai/planning.js` | Skills content cache, plugin list cache |
| `src/renderer/src/components/core/InputBar.jsx` | Ctrl+Enter submit, Arrow history, Stop replaces Send |
| `src/renderer/src/components/YoutubeMusicPlayer.jsx` | YouTube URL, CSS adblock, persist partition, no zoom |
| `src/renderer/src/contexts/YoutubeMusicContext.jsx` | YouTube selectors, keyboard controls |
| `src/renderer/src/hooks/agent/useMarkPlan.js` | Restored `handleIntervention` |
| `src/renderer/src/hooks/agent/useMarkMusic.js` | YouTube URL template |
| `src/renderer/src/api/ai/tools.js` | "YouTube Music" → "YouTube" |
