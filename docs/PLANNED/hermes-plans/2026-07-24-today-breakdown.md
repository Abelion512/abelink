# MARK Agent — Today's Breakdown 2026-07-24

**Codebase:** 78 files, 10,288 lines, 48 dependencies
**Build:** ✅ Passes (1m 20s)
**Target:** 9Router backend (`http://localhost:20128/v1`)

---

## Task 1: Fix abort listener leak in core.js

**Files:** `src/renderer/src/api/ai/core.js:22`

**Bug:** `addEventListener('abort', onAbort)` missing `{ once: true }`. Setiap fetchAI call tambah listener baru tanpa auto-removal.

**Fix:**
```js
// BEFORE (line 22):
signal.addEventListener('abort', onAbort);
// AFTER:
signal.addEventListener('abort', onAbort, { once: true });
```

Hapus `removeEventListener` di line 42 — `{ once: true }` jamin auto cleanup.

**Verifikasi:** `npm run build` — 0 warnings

---

## Task 2: Hapus redundant config fetch

**Files:** `src/renderer/src/api/ai/core.js:4-6`, `planning.js:494`

**Bug:** `core.js` fetch `getAllConfig()` dari Dexie tiap fetchAI dipanggil. Padahal `planning.js` udah cache via `getConfigCached()`. 2x IndexedDB read per planning loop — padahal cuma butuh `conf` object.

**Fix:**
```js
// core.js — terima conf sebagai parameter opsional
export const fetchAI = async (messages, signal, isSmallTask = false, jsonSchema = null, conf = null) => {
  if (!conf) {
    const currentConfig = await getAllConfig()
    conf = currentConfig[0] || {}
  }
```

```js
// planning.js:494 — kirim conf yang udah di-cache
const response = await fetchAI(messages, signal, false, schema, conf)
```

**Verifikasi:** `npm run build` — test 1 loop vs 2 Dexie reads

---

## Task 3: RAF batched thinking

**Files:** `src/renderer/src/hooks/agent/useMarkPlan.js:9,33,46-54`

**Optimization:** Ganti time-based throttle (300ms) ke `requestAnimationFrame`. RAF syncs ke VSync — render cuma pas browser siap.

**Fix — ganti:**
```js
// HAPUS:
const THINKING_UPDATE_INTERVAL = 300
const lastThinkingUpdateRef = useRef(0)

// REPLACE updateThinkingMessage dengan:
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

Ganti caller: `updateThinkingMessage(txt)` → `scheduleThinkingUpdate(txt)`, `updateThinkingMessage(txt, true)` → `flushThinkingUpdate(txt)`.

**Verifikasi:** `npm run build` — cari `updateThinkingMessage` di codebase, pastiin gak ada yg kelewat.

---

## Task 4: Create .env.example

**Files:** Create `.env.example`

**Why:** Template untuk setup 9Router + Groq STT. Gak perlu nebak config.

```env
# MARK AI Backend Configuration
AI_PROVIDER=custom
CUSTOM_ENDPOINT=http://localhost:20128/v1/chat/completions
CUSTOM_API_KEY=your-9router-key
CUSTOM_MODEL=ag/gemini-3.1-flash-low
GROQ_API_KEY=your-groq-key
```

---

## Summary

| # | Task | Files | Lines | Type |
|---|------|-------|-------|------|
| 1 | Fix abort listener leak | `core.js:22` | ~2 | Bug |
| 2 | Remove redundant config fetch | `core.js:4-6`, `planning.js:494` | ~8 | Perf |
| 3 | RAF batched thinking | `useMarkPlan.js:9,33,46-54` | ~25 | Perf |
| 4 | Create .env.example | `new file` | ~12 | Setup |

**Total:** 4 real tasks, ~50 lines, 0 new deps
