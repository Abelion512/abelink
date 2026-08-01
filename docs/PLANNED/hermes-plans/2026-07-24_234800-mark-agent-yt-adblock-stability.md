# Mark Agent (Linux Fork) — Code Review, YT Display & Adblock Plan

> **For Hermes:** Execute via `/goal`.
> **Risk:** Medium. Backup before each main-process task.

**Goal:** Eliminate 12+ security/stability bugs + rewrite YT player display + proper adblock.

**Architecture:** Electron main process + React renderer + `<webview>` for YouTube.

---

## ✅ Progress So Far (Already Done — No Action Needed)

| Item | Status | Detail |
|------|--------|--------|
| Linux adaptation | ✅ Done | Window-tracker (xdotool/DBus/swaymsg), build config, icon |
| MPRIS D-Bus | ✅ Done | `mpris-service.js`, track sync, media keys |
| Agent Skills Loader | ✅ Done | `agent-skills-loader.js`, IPC bridge, vector-match |
| InputBar history | ✅ Done | ArrowUp/Down, 50-item stack |
| Config caching | ✅ Done | Cache-aside pattern di planning.js |
| Native notif | ✅ Done | `native-notify` via notify-send (perlu fix security) |
| Will-quit cleanup | ✅ Done | stopTracking, closeBrowser, tray destroy |
| Display from screenshot | ✅ Done | YT webview, FAB toggle, dark theme, music card |

---

## 🔴 HIGH PRIORITY — Security & Stability

### Task 1: Fix command injection in native-notify

**File:** `src/main/native-tools.js:404-416`

**Bug:** Shell string concat → backticks/`$()`/`;` execute arbitrary commands.

**Fix:** `execPromise('notify-send', [title, body])` — no shell.

---

### Task 2: Remove auto-sudo in grep-search

**File:** `src/main/native-tools.js:213-221`

**Bug:** Auto `sudo apt-get install -y ripgrep` — privilege escalation vector.

**Fix:** Remove auto-install. Fallback to grep silently.

---

### Task 3: Fix setInterval async overlap (awareness engine)

**File:** `src/main/awareness/window-tracker.js:185-228`

**Bug:** `setInterval` with async callback → overlapping polls if fn takes >60s.

**Fix:** Recursive `setTimeout` instead. Rename `intervalId` → `timeoutId`.

---

### Task 4: Fix browser loadURL timeout leaving inconsistent state

**File:** `src/main/browser-agent.js:127-145`

**Bug:** `Promise.race` timeout doesn't cancel `loadURL` → half-loaded page.

**Fix:** Listen `did-finish-load`/`did-fail-load`, `webContents.stop()` on timeout.
Replace hardcoded 2s SPA wait with adaptive poll (max 3s).

---

### Task 5: Fix AbortController listener leak

**File:** `src/main/ai-bridge.js:165-168`

**Bug:** `removeEventListener` with `.bind()` creates new ref → dead listeners pile up.

**Fix:** Store bound reference: `const h = () => controller.abort(...)`.

---

### Task 6: Fix fd leak in agent-skills-loader

**File:** `src/main/agent-skills-loader.js:46-49`

**Bug:** `fs.openSync` without close on parse failure.

**Fix:** Replace with `fs.readFileSync(filePath, 'utf8', 4096)`.

---

## 🟠 MEDIUM PRIORITY — YouTube Display Rewrite

### Task 7: Merge duplicate useEffect in YoutubeMusicPlayer

**File:** `src/renderer/src/components/YoutubeMusicPlayer.jsx:59-208`

**Bug:** Dua blok `useEffect` identik — adblock CSS/JS inject **2x**, `new-window` listener di block pertama di-overwrite cleanup block kedua.

**Fix:** Merge jadi satu `useEffect`. Hapus duplikasi.

---

### Task 8: Replace interval adblock with `@cliqz/adblocker-electron`

**File:** New: `src/main/adblocker.js` + patch `src/main/index.js`

**Current:** `setInterval(500ms)` querySelector → fragile, CPU heavy, YouTube class selectors change.

**Fix based on Gemini research:**
Install: `npm install @cliqz/adblocker-electron cross-fetch`

```js
// src/main/adblocker.js
import { ElectronBlocker } from '@cliqz/adblocker-electron'
import fetch from 'cross-fetch'

export async function setupAdBlocker(session) {
  const blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch)
  blocker.enableBlockingInSession(session)
  return blocker
}
```

**Target session:** `persist:youtube` (webview partition).

**Remove from renderer:**
- Hapus `setInterval` ad skip loop (lines 93-113, 183-203)
- Keep CSS cosmetic hiding (scrollbar, player sizing)

---

### Task 9: Optimize track polling — 1s to 5s + video events

**File:** `src/renderer/src/contexts/YoutubeMusicContext.jsx:17-52`

**Current:** Poll DOM setiap 1 detik. CPU waste.

**Fix:** 
- Poll interval: 1s -> 5s
- Listen `timeupdate` event from `<video>` instead (fires ~4Hz, less impactful than full DOM query)
- Detect via `MutationObserver` on title element

---

### Task 10: Replace full YouTube page with embed

**File:** `src/renderer/src/components/YoutubeMusicPlayer.jsx:253`

**Current:** `src="https://www.youtube.com/"` -> full page (sidebar, comments, ads, heavy).

**Fix:** Use `https://www.youtube-nocookie.com/embed/VIDEO_ID`:
- No sidebar/comments/recommendations
- Fewer ads (Google serves fewer on embed)
- No cookies tracking
- Lighter DOM -> less CPU

**Change navigation logic:**
- Remove `window.location.href = musicUrl` (full reload)
- Instead, update `src` attribute directly on webview

---

### Task 11: Security — remove contextIsolation=no

**File:** `src/renderer/src/components/YoutubeMusicPlayer.jsx:258`

**Current:** `webpreferences="enableRemoteModule, contextIsolation=no"`

**Fix:** `webpreferences="contextIsolation=yes"` (remove `enableRemoteModule`).

---

### Task 12: Set dynamic User-Agent

**File:** `src/renderer/src/components/YoutubeMusicPlayer.jsx:259`

**Current:** Hardcoded Chrome 128 (outdated).

**Fix:** Ambil dari `navigator.userAgent` runtime, atau set mobile UA untuk lighter version.

---

## ⚪ LOW PRIORITY — Cleanup

### Task 13: Strip excessive console.log

**File:** Multiple — `ai-bridge.js:360`, `native-tools.js`, `index.js`

**Fix:** Wrap in `if (!app.isPackaged)` guard.

### Task 14: Format tabs to spaces

**File:** `src/main/native-tools.js:198`, `planning.js:216-218`

### Task 15: Extract IPC handlers from index.js (526 lines)

**File:** `src/main/index.js`

**Split into:** `screenshot-handler.js`, `youtube-handler.js`, `tts-handler.js`, `misc-ipc.js`

---

## Execution Order (Priority)

```
Phase 1 — Security (T1, T2, T11)   -> 3 tasks
Phase 2 — Stability (T3, T4, T5, T6) -> 4 tasks
Phase 3 — YT Display (T7, T8, T9, T10) -> 4 tasks
Phase 4 — Cleanup (T12, T13, T14, T15) -> 4 tasks
```

## Verification

1. `npm run dev` — no crash
2. YT player: play video -> no ads, smooth polling, embed view (no sidebar)
3. `notify-send` — no injection via special chars
4. Awareness — 1h runtime, no overlapping polls (check console)
5. Browser — navigate to slow page -> graceful timeout
6. `npm run build:linux` — build succeeds
