# MARK Agent ATM Audit & Implementation Plan

**Goal:** Verifikasi + implementasi 5 high-priority ATM items untuk MARK Agent performance.

**Architecture:** Electron + React + Node.js. Target path: `/media/abelion/Isaf/ican/project/AGENT/mark-agent-fork/`

**Tech Stack:** Electron 39, React 19, Vite 7, Node.js 18+

---

### Task 1: Verifikasi — Arrow Up/Down History

**Objective:** Confirm history navigation sudah jalan di `InputBar.jsx`

**Files:**
- Read: `src/renderer/src/components/core/InputBar.jsx:22-101`

**Status:** ✅ ALREADY IMPLEMENTED
- `historyStackRef` (max 50 entries)
- `historyIndexRef` (-1 = new input position)
- `savedInputRef` (save current input before navigation)
- ArrowUp: navigate back in history
- ArrowDown: navigate forward / restore saved input
- On submit: push to stack, reset index
- ATM pattern: Node.js `readline._history[]` — proven sejak Node v0.x

**Action:** No change needed.

---

### Task 2: Verifikasi — Config Cache

**Objective:** Confirm config cache-aside pattern di `planning.js`

**Files:**
- Read: `src/renderer/src/api/ai/planning.js:7-25`

**Status:** ✅ ALREADY IMPLEMENTED
- `_configCache` module-level cache
- `_configCachePromise` dedup concurrent requests
- `config-updated` event listener untuk cache invalidation
- ATM pattern: Cache-aside (Redis/Memcached proven pattern)

**Action:** No change needed.

---

### Task 3: Verifikasi — Parallel Tool Calls

**Objective:** Confirm `Promise.all` untuk parallel fetch

**Files:**
- Read: `src/renderer/src/api/ai/planning.js:122-125`

**Status:** ✅ ALREADY IMPLEMENTED
```js
const [pluginActions, agentSkills] = await Promise.all([
  getPluginActions(),
  getAgentSkills()
])
```
- ATM pattern: `Promise.all` — ES6 native standard

**Action:** No change needed.

---

### Task 4: Verifikasi — grep-search exclude flags

**Objective:** Confirm grep exclude `node_modules` + `.git`

**Files:**
- Read: `src/main/native-tools.js:198-230`

**Status:** ✅ ALREADY IMPLEMENTED
```js
const cmd = `grep -rni --exclude-dir=node_modules --exclude-dir=.git -m 50 "${keyword}" "${dirPath}"`
```
- Plus ripgrep auto-install attempt via `sudo apt-get install -y ripgrep`
- `{ shell: '/bin/bash' }` already used everywhere
- `maxBuffer: 10 * 1024 * 1024` untuk large output
- ATM pattern: Standard production grep flags

**Action:** No change needed.

---

### Task 5: Refactor — RAF Batched Thinking

**Objective:** Ganti `THINKING_UPDATE_INTERVAL` (time-based) ke `requestAnimationFrame` (RAF-based)

**Files:**
- Modify: `src/renderer/src/hooks/agent/useMarkPlan.js`

**Current code (lines 9, 33, 46-54):**
```js
const THINKING_UPDATE_INTERVAL = 300
const lastThinkingUpdateRef = useRef(0)

const updateThinkingMessage = (text, force = false) => {
  const now = Date.now()
  if (!force && now - lastThinkingUpdateRef.current < THINKING_UPDATE_INTERVAL) return
  lastThinkingUpdateRef.current = now
  setChatData((prev) => {
    const filtered = prev.filter((item) => !item.isThinking)
    return [...filtered, { role: 'ai', content: text, isThinking: true }]
  })
}
```

**Problem:** Time-based throttle (300ms) masih causing React re-render meski gak ada visual change. RAF syncs ke VSync — render cuma pas browser siap.

**Fix — RAF pattern (ATM: Web API `requestAnimationFrame`):**

```js
const thinkingRafRef = useRef(null)
const lastThinkingTextRef = useRef('')

const scheduleThinkingUpdate = (text) => {
  lastThinkingTextRef.current = text
  if (thinkingRafRef.current) return
  thinkingRafRef.current = requestAnimationFrame(() => {
    thinkingRafRef.current = null
    setChatData((prev) => {
      const filtered = prev.filter((item) => !item.isThinking)
      return [...filtered, { role: 'ai', content: lastThinkingTextRef.current, isThinking: true }]
    })
  })
}

const flushThinkingUpdate = (text) => {
  if (thinkingRafRef.current) cancelAnimationFrame(thinkingRafRef.current)
  thinkingRafRef.current = null
  lastThinkingTextRef.current = text
  setChatData((prev) => {
    const filtered = prev.filter((item) => !item.isThinking)
    return [...filtered, { role: 'ai', content: text, isThinking: true }]
  })
}
```

**Changes needed:**
1. Remove `THINKING_UPDATE_INTERVAL` constant (line 9)
2. Remove `lastThinkingUpdateRef` (line 33)
3. Replace `updateThinkingMessage` (lines 46-54) with `scheduleThinkingUpdate` + `flushThinkingUpdate`
4. Replace all `updateThinkingMessage(text)` → `scheduleThinkingUpdate(text)`
5. Replace all `updateThinkingMessage(text, true)` → `flushThinkingUpdate(text)`

**Verification:**
1. `npm run build` must succeed
2. Start chat session — thinking messages appear smooth

**Risks:**
- RAF batched to next frame (16ms delay max) — negligible

---

## Summary

| # | Item | Status | Action |
|---|------|--------|--------|
| 1 | ArrowUp/Down history | ✅ Done | None |
| 2 | Config cache | ✅ Done | None |
| 3 | Parallel Promise.all | ✅ Done | None |
| 4 | grep-search exclude | ✅ Done | None |
| 5 | RAF batched thinking | ⚠️ Pending | ~20 line refactor |

**Total code changes:** ~20 lines in 1 file
**New dependencies:** 0
**ATM source:** Web API `requestAnimationFrame`
