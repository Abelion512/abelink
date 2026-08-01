# Mark Linux Performance & Stability Plan

**Goal:** Fix memory leaks, crash resilience, and Linux-native desktop integration (Ubuntu/Mint).

**Confirmed requirements:**
- Memory grows over time + occasional freeze after heavy coding
- AbortSignal listener pileup in agentic loop
- Browser-agent cleanup gaps
- D-Bus MPRIS for music keys
- `notify-send` native notifications

---

### Task 1: Fix AbortSignal listener leak in useMarkPlan.js

**Files:** `src/renderer/src/hooks/agent/useMarkPlan.js` (lines ~152, ~596, ~621)

**Bug:** 3x `signal.addEventListener('abort', onAbort)` with zero `removeEventListener`. Each tool call piles one up. After 50+ tool calls in a session, ~50 orphan listeners hold closures referencing large objects.

**Fix:** Add `{ once: true }` option — auto-removes after first fire:
```js
abortControllerRef.current.signal.addEventListener('abort', onAbort, { once: true })
```

---

### Task 2: Fix dangling setTimeout in browser-agent.js

**Files:** `src/main/browser-agent.js:134`

**Bug:** `setTimeout(resolve, 60000)` inside `Promise.race` — no `clearTimeout` if `loadURL` wins. Each navigation adds a pending 60s timer.

**Fix:** Store timer ID, clear in `.finally()`:
```js
const timerId = setTimeout(resolve, 60000)
Promise.race([...]).finally(() => clearTimeout(timerId))
```

---

### Task 3: Clean up browser window + stopTracking on app quit

**Files:** `src/main/index.js` (will-quit handler), `src/main/browser-agent.js`

**Fix:** Import `closeBrowser` and `stopTracking`, call in `will-quit`:
```js
import { stopTracking } from './awareness/window-tracker.js'
import { closeBrowser } from './browser-agent.js'

app.on('will-quit', async () => {
  stopTracking()
  try { await closeBrowser() } catch {}
  if (tray) tray.destroy()
  globalShortcut.unregisterAll()
})
```

---

### Task 4: Native Linux notification via notify-send

**Files:** `src/main/native-tools.js`

**Add tool:** `native-notify` using `notify-send` (D-Bus native, appears in GNOME/KDE notification center):
```js
'native-notify': {
  needsApproval: false,
  handler: async (query) => {
    const [title, ...bodyParts] = query.split('||')
    await execPromise(`notify-send "${title.replace(/"/g,'\\"')}" "${(bodyParts.join('||')).replace(/"/g,'\\"')}"`)
    return { success: true }
  }
}
```

---

### Task 5: D-Bus MPRIS for music player controls

**Files:** New `src/main/mpris-service.js`

**Approach:** Listen to D-Bus via `dbus-native` (already in npm) or shell `qdbus`. Register `org.mpris.MediaPlayer2.Mark` with `org.mpris.MediaPlayer2.Player` interface (Play, Pause, Next, Previous, Stop). Forward commands to the renderer's music context.

This lets users control Mark's music via keyboard media keys, lockscreen controls, GNOME media widget.

---

### Task 6: xdg-open verification

**Files:** `src/main/index.js:81`

`shell.openExternal` in Electron uses `xdg-open` under the hood on Linux. Already correct. No change needed, just verify.

---

### Verification

1. `npm run dev` — 0 warnings, no `run-powershell`/`findstr`/`active-win` references
2. Heavy session test — run 20+ tool calls in coding loop, monitor RAM via `htop`
3. `Ctrl+C` — app exits cleanly, no stray process
4. `notify-send` — Mark sends visible D-Bus notification
5. MPRIS — media keys (play/pause) control Mark's music

### Out of scope

- Electron → native toolkit migration (stay Electron)
- Wayland-native tray (waiting for Electron 40+)
- Flatpak packaging
