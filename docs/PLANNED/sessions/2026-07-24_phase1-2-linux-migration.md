# Session: Linux Migration & Optimization (Phase 1 + 2)

**Date:** 2026-07-24
**Branch:** feat/performance-and-readibility (master)
**Head:** 349fcf1
**Commits ahead of upstream/master:** 15

---

## Objective

Migrate Mark Agent from Windows-first to Linux-only. Fix memory leaks, desktop integration, stability.

## Phase 1 — Full Linux Migration

### Windows remnants eliminated

| File | Change |
|------|--------|
| `native-tools.js` | `findstr` → `grep -rni`, `powershell.exe` → `bash -c`, `D:\` paths → `/home/user/` |
| `media-downloader.js` | Removed `IS_WIN` branch, no `.exe` path |
| `window-tracker.js` | Removed `active-win` import, Linux-only `getActiveWindow()` |
| `index.js` | Tray icon uses bundled `icon.png` directly, no `app.getFileIcon` |
| `electron-builder.yml` | Removed win/nsis/mac/dmg, only `linux:` target |
| `package.json` | Removed `build:win`, `build:mac`, removed `active-win` dep |
| `README.md` | Linux Edition branding, xdotool dependency, only `build:linux` |
| `Guidebook.jsx` | All path examples Linux-only, no `D:\` |
| `planning.js` | `run-powershell` → `run-shell`, no PowerShell text refs |
| `useMarkPlan.js` | `run-powershell` → `run-shell` |

### Platform awareness

AI system prompt now includes:
```
# PLATFORM
OS: Linux (Linux-only build).
Shell: bash. File paths: /home/user/... (Linux native).
```

### Other changes

- Headless GPU detection: `disable-gpu` if no `DISPLAY`/`WAYLAND_DISPLAY`
- Browser session persistence: `partition: 'persist:mark-browser'`
- `agent-skills-loader.js`: scans `~/.agents/skills/SKILL.md` for AI skill injection
- `run-cli` tool: RSI (Recursive Self Improvement) — subprocess Claude Code, Z.ai, Hermes CLI
- `'learn'` type added to memory schema for RSI recall
- Guidebook plugin recommendations section

---

## Phase 2 — Performance & Stability

### 1. AbortSignal listener leak (CRITICAL)

**File:** `useMarkPlan.js:152, 599, 624`

**Bug:** 3x `signal.addEventListener('abort', onAbort)` without `removeEventListener`. After ~50 tool calls in a single session, ~50 orphan listeners hold closures referencing large objects (`loopMessages`, `decision`, `unifiedContext`).

**Fix:** Added `{ once: true }` — listener auto-removes after first fire.

**Impact:** Eliminates primary memory leak source during long coding sessions.

### 2. Dangling setTimeout in navigateTo

**File:** `browser-agent.js:131-135`

**Bug:** `setTimeout(resolve, 60000)` inside `Promise.race` with `loadURL`. If loadURL resolves before timeout, the timer still runs 60s later. Each navigation adds one. After 20 navigations, 20 pending timers exist.

**Fix:** Store timer ID, call `clearTimeout` in `.finally()`.

**Impact:** No more ghost timers holding `resolve` references.

### 3. Clean exit — will-quit handler

**File:** `index.js:475-479`

**Bug:** `will-quit` only destroyed tray + unregistered shortcuts. Awareness engine interval kept running, browser window left open.

**Fix:** 
- `stopTracking()` — stops 60s awareness interval
- `closeBrowser()` — destroys browser window cleanly
- `stopMpris()` — unregisters D-Bus service
- All called in `will-quit` + SIGINT/SIGTERM handler

**Impact:** No orphan processes on Ctrl+C or quit.

### 4. Native Linux notifications

**File:** `native-tools.js`

**Added tool `native-notify`:**
```js
'native-notify': {
  handler: async (query) => {
    const [title, ...bodyParts] = query.split('||')
    await execPromise(`notify-send "${esc(title)}" "${esc(body)}"`)
  }
}
```

**Impact:** D-Bus native notifications visible in GNOME/KDE notification center.

### 5. D-Bus MPRIS integration

**File:** `mpris-service.js` (new)

**Dep:** `mpris-service` (npm) — adds 0 external runtime deps beyond D-Bus.

- Registers `org.mpris.MediaPlayer2.Mark` on D-Bus
- Exposes `PlayPause`, `Next`, `Previous`, `Stop` interfaces
- Track metadata synced via `YoutubeMusicContext.jsx` polling (title, artist, album art, duration)
- Desktop media keys, lockscreen controls, GNOME media widget all work

**Impact:** Mark's music player controllable via keyboard media keys, lockscreen, and GNOME/KDE sound menu.

---

## Files changed (working tree — not yet committed)

```
 M package-lock.json
 M package.json
 M src/main/browser-agent.js
 M src/main/index.js
 M src/main/native-tools.js
 M src/main/mpris-service.js          (new)
 M src/preload/index.js
 M src/renderer/src/api/ai/planning.js
 M src/renderer/src/contexts/YoutubeMusicContext.jsx
 M src/renderer/src/hooks/agent/useMarkPlan.js
?? .hermes/plans/2026-07-24_linux-performance-stability.md
?? src/main/mpris-service.js
```

## Build

0 errors. Main 229kB, preload 6.6kB, renderer ~4.9MB JS + ~248kB CSS.

## Dependencies added

- `mpris-service` ^2.1.2 — MPRIS D-Bus interface

## Dependencies removed

- `active-win` ^8.2.1 — doesn't work on Linux, replaced by xdotool/swaymsg/hyprctl

## Caveats / Out of scope

- Wayland-native tray: waiting for Electron 40+
- Flatpak/Snap config: not done
- `xdg-mime` file associations: not done
- YouTube-dl download occasionally fails (GitHub API rate limit) — fixed via `YOUTUBE_DL_SKIP_DOWNLOAD=1` env var + manual binary download

## Author

Abelion512 <agen.salva@gmail.com>
