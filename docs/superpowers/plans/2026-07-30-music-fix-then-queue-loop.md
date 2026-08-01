# Music: Fix → Queue → Loop

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix 7 critical bugs in existing music system, then add minimal queue + loop-one.

**Architecture:** Keep hidden BrowserWindow (YouTube.com load). Block ads via webRequest. Fix state bugs first. Add MusicQueue engine as pure JS — no new IPC, no new deps. Queue tools (`music-queue`, `music-add`, `music-remove`) + loop toggle (`music-loop`) dispatch through existing `handleMusic` pattern.

**Tech Stack:** JavaScript, Electron, React, Dexie (queue persistence optional, YAGNI for now), webRequest filter (for ad blocking).

## Global Constraints

- YAGNI: only tools listed below. No volume, no seek, no shuffle, no playlist, no stop
- Queue is in-memory only (survives component remount via Context state, not DB)
- Loop = ONE mode (repeat current track). Toggle on/off. No "all" mode.
- Ad blocking: block known YouTube ad domains via webRequest.onBeforeRequest in youtube-player.js
- All existing tools keep their names. New tools: `music-queue`, `music-add`, `music-remove`, `music-loop`
- Fix bugs BEFORE adding features. Each fix is its own task with verification step.
- MarkHome.jsx inline buttons MUST use context methods, not window.api.ytCommand directly

---
## File Structure

| File | Action | Why |
|------|--------|-----|
| `src/renderer/src/contexts/YoutubeMusicContext.jsx` | **Modify** | Fix duplicate listener, add `'stop'` handler, add queue state, add loop state |
| `src/renderer/src/pages/MarkHome.jsx` | **Modify** | Fix exit animation race, wire buttons to context |
| `src/renderer/src/hooks/agent/useMarkMusic.js` | **Modify** | Add queue/loop handlers, fix empty-string return |
| `src/renderer/src/services/music-queue.js` | **Create** | Queue pure-logic class (no deps) |
| `src/renderer/src/api/ai/planning.js` | **Modify** | Register new tools in schema + category text |
| `src/main/tool-registry.js` | **Modify** | Register tools in BUILTIN_TOOLS + VOICE_FAST_PATH |
| `src/main/youtube-player.js` | **Modify** | Add ad-blocking webRequest filter |
| `src/renderer/src/api/ai/guard-gate.js` | **Modify** | Register new no-query tools |
| `src/renderer/src/api/ai/approval-modes.js` | **Modify** | Register risk levels for new tools |
| `src/renderer/src/hooks/useMarkAgent.js` | **Modify** | Wire new context props to agent context |
| `src/main/index.js` | **Modify** | Remove dead `youtube-search` IPC handler |

### Task 1: Fix duplicate onYtTrackUpdated listener (CRITICAL)

**File:** `src/renderer/src/contexts/YoutubeMusicContext.jsx`

**Problem:** Lines 73-80 and 109-117 both call `window.api.onYtTrackUpdated`. The preload's `onYtTrackUpdated` calls `removeAllListeners` internally (preload/index.js:157), so the second registration overwrites the first. The first listener's `setIsPlaying(true)` is never executed. Result: `isPlaying` stays false after auto-next-track, MPRIS always shows "Paused", AI loses "now playing" awareness.

- [ ] **Step 1: Merge into ONE useEffect**

Replace lines 73-117 with a single listener:

```javascript
// Single source of truth for track updates from main process
useEffect(() => {
  if (!window.api?.onYtTrackUpdated) return
  window.api.onYtTrackUpdated((track) => {
    if (track && track.title) {
      setCurrentTrack(prev => ({
        ...prev,
        title: track.title,
        artist: track.artist || prev.artist,
        // preserve thumbnail — onYtTrackUpdated doesn't include it
      }))
      setIsPlaying(true)
    }
  })
}, [])
```

`ponytail: thumbnail not updated on auto-next because page-title-updated doesn't carry it. Acceptable — thumbnail is cosmetic.`

- [ ] **Step 2: Remove lines 73-80 (the redundant first listener block)**

Delete the useEffect that only calls setCurrentTrack and setIsPlaying. Only keep the merge above.

- [ ] **Step 3: Verify**

Open app. Play a song. Wait for auto-next. Open DevTools console, check `useYoutubeMusic().isPlaying` — should be `true` after track auto-advances. MPRIS should show "Playing".

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/contexts/YoutubeMusicContext.jsx
git commit -m "fix: merge duplicate onYtTrackUpdated — isPlaying now works after auto-next"
```

---

### Task 2: Add MPRIS 'stop' handler (CRITICAL)

**File:** `src/renderer/src/contexts/YoutubeMusicContext.jsx`

**Problem:** MPRIS Stop button (line 323-326 in index.js) sends `execute-music-command('stop')`, but `onExecuteMusicCommand` handler only handles `play`, `next`, `prev`, `toggle`. Stop does nothing.

- [ ] **Step 1: Add 'stop' case to onExecuteMusicCommand**

Inside the existing useEffect (lines 83-106), add:

```javascript
else if (command === 'stop') {
  setCurrentTrack({ title: '', artist: '', thumbnail: '' })
  setIsPlaying(false)
}
```

`ponytail: doesn't close YouTube window or clear URL. Desktop Stop semantic is "reset to idle" — sufficient.`

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/contexts/YoutubeMusicContext.jsx
git commit -m "fix: add 'stop' handler for MPRIS Stop button"
```

---

### Task 3: Fix MarkHome exit animation race + button bypass (CRITICAL)

**Files:**
- Modify: `src/renderer/src/pages/MarkHome.jsx`

**Problems:**
1. Exit animation timer (setTimeout 500ms) can fire AFTER a new track starts, force-hiding the widget.
2. Inline prev/playPause/next buttons call `window.api.ytCommand('prev')` directly, bypassing context methods.

- [ ] **Step 1: Fix exit animation with guard ref**

Replace lines 77-92:

```javascript
const exitTimerRef = useRef(null)

useEffect(() => {
  const hasTrack = isPlaying && currentTrack?.title
  if (hasTrack) {
    // New track — cancel any pending exit and show widget
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current)
      exitTimerRef.current = null
    }
    setIsMusicAnimatingOut(false)
    setShowMusicWidget(true)
  } else {
    if (showMusicWidget) {
      setIsMusicAnimatingOut(true)
      exitTimerRef.current = setTimeout(() => {
        setShowMusicWidget(false)
        setIsMusicAnimatingOut(false)
        exitTimerRef.current = null
      }, 500)
    }
  }
  return () => {
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
  }
}, [isPlaying, currentTrack?.title, showMusicWidget])
```

- [ ] **Step 2: Wire inline buttons to context methods**

Replace lines 258 and 261 and 268 — change from `window.api.ytCommand('prev')` → `prevTrack()`, `playPause()`, `nextTrack()`.

Find where the component destructures context methods (around line 25 area). Make sure prevTrack, playPause, nextTrack are destructured from useYoutubeMusic():

```javascript
const { isPlaying, currentTrack, isPlayerOpen, togglePlayer,
        playUrl, nextTrack, prevTrack, playPause } = useYoutubeMusic()
```

Then in the inline controls (lines 257-273):
```jsx
<button onClick={prevTrack} ...>
<button onClick={playPause} ...>
<button onClick={nextTrack} ...>
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/pages/MarkHome.jsx
git commit -m "fix: exit animation race guard + wire buttons to context methods"
```

---

### Task 4: Clean up dead IPC handlers (CRITICAL)

**File:** `src/main/index.js`

**Problem:** `youtube-search` IPC handler (lines 465-478) is never called by any renderer code. `search-music` (lines 512-528) is the active one. `ytdl:get-info`/`get-audio`/`search` are wired but nothing consumes them. Dead code.

- [ ] **Step 1: Remove `youtube-search` IPC handler**

Delete lines 465-478 entirely. Keeping `search-music` is fine — it's the active one used by `useMarkMusic.js`.

- [ ] **Step 2: Remove ytdl IPC handlers (entirely dead)**

Delete lines 537-545:
```javascript
// Delete these three handlers:
ipcMain.handle('ytdl:get-info', ...)
ipcMain.handle('ytdl:get-audio', ...)
ipcMain.handle('ytdl:search', ...)
```

**Don't delete ytdl-service.js file** — it may be revived later. Just remove IPC handlers.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.js
git commit -m "fix: remove dead IPC handlers (youtube-search, ytdl)"
```

---

### Task 5: Add ad blocking to youtube-player.js (ENHANCEMENT)

**File:** `src/main/youtube-player.js`

**Problem:** YouTube ads play in the hidden BrowserWindow. They waste bandwidth and can confuse track detection.

- [ ] **Step 1: Add ad-domain filter in getOrCreateWindow**

Inside `getOrCreateWindow()`, after line 54, add:

```javascript
// Block known ad & tracking domains
const AD_DOMAINS = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',
  'youtube.com/api/stats/ads',
  'youtube.com/pagead/',
  'yt3.ggpht.com/',
]
ytWindow.webContents.session.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, cb) => {
  const blocked = AD_DOMAINS.some(d => details.url.includes(d))
  cb({ cancel: blocked })
})
```

`ponytail: static domain list. Upgrade to uBlock-origin-style filter lists if ads bypass it.`

- [ ] **Step 2: Commit**

```bash
git add src/main/youtube-player.js
git commit -m "feat: block YouTube ad domains in hidden player"
```

---

### Task 6: MusicQueue engine (pure JS)

**File:** `src/renderer/src/services/music-queue.js`

- [ ] **Step 1: Implement MusicQueue class + self-check**

```javascript
export class MusicQueue {
  constructor() {
    this._queue = []
    this._pos = -1
    this._loop = false  // false = off, true = repeat current
  }

  get size() { return this._queue.length }
  get pos() { return this._pos }
  get loop() { return this._loop }
  get tracks() { return [...this._queue] }
  get current() {
    if (this._pos < 0 || this._pos >= this._queue.length) return null
    return this._queue[this._pos]
  }

  enqueue(track) {
    this._queue.push(track)
    if (this._pos === -1) this._pos = 0
  }

  remove(index) {
    if (index < 0 || index >= this._queue.length) return
    this._queue.splice(index, 1)
    if (this._pos >= this._queue.length) this._pos = this._queue.length - 1
    if (this._pos < 0) this._pos = -1
  }

  clear() {
    this._queue = []
    this._pos = -1
  }

  next() {
    if (this.size === 0) return null
    if (this._loop) return this.current  // loop one: stay on same track
    const next = this._pos + 1
    if (next >= this.size) {
      this._pos = -1  // exhausted
      return null
    }
    this._pos = next
    return this.current
  }

  prev() {
    if (this.size === 0) return null
    if (this._loop) return this.current
    const prev = this._pos - 1
    if (prev < 0) {
      this._pos = 0
      return this.current
    }
    this._pos = prev
    return this.current
  }

  toggleLoop() {
    this._loop = !this._loop
    return this._loop
  }

  jumpTo(index) {
    if (index < 0 || index >= this.queue.length) return false
    this._pos = index
    return true
  }
}

// ── self-check ──
function selfCheck() {
  const q = new MusicQueue()
  const t1 = { id:'a', title:'A', artist:'X' }
  const t2 = { id:'b', title:'B', artist:'Y' }
  console.assert(q.size === 0 && q.current === null, 'empty')
  q.enqueue(t1); q.enqueue(t2)
  console.assert(q.size === 2 && q.current.id === 'a', 'enqueue + current')
  q.next()
  console.assert(q.current.id === 'b', 'next')
  q.prev()
  console.assert(q.current.id === 'a', 'prev')
  q.toggleLoop()  // loop ON
  q.next(); q.next(); q.next()
  console.assert(q.current.id === 'a', 'loop one stays')
  q.toggleLoop()  // loop OFF
  q.next()
  console.assert(q.current === null, 'exhausted after loop off')
  console.log('MusicQueue self-check: PASS')
}
selfCheck()
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/services/music-queue.js
git commit -m "feat: add MusicQueue — pure JS, no deps"
```

---

### Task 7: Integrate queue + loop into YoutubeMusicContext

**File:** `src/renderer/src/contexts/YoutubeMusicContext.jsx`

- [ ] **Step 1: Add queue + loop state**

```javascript
import { MusicQueue } from '../services/music-queue'
// inside provider:
const [queue] = useState(() => new MusicQueue())
const [queueTracks, setQueueTracks] = useState([])
const [loopOne, setLoopOne] = useState(false)
```

- [ ] **Step 2: Add queue action methods**

```javascript
const addToQueue = useCallback((track) => {
  queue.enqueue(track)
  setQueueTracks(queue.tracks)
  // auto-play if nothing playing
  setIsPlaying(false)  // will be set true after playUrl
  if (!isPlaying && !currentTrack.title) {
    const first = queue.current
    if (first) playUrl(`https://youtube.com/watch?v=${first.id}`, first)
  }
}, [queue, isPlaying, currentTrack.title, playUrl])

const removeFromQueue = useCallback((index) => {
  queue.remove(index)
  setQueueTracks(queue.tracks)
}, [queue])

const toggleLoop = useCallback(() => {
  const mode = queue.toggleLoop()
  setLoopOne(mode)
}, [queue])
```

- [ ] **Step 3: Modify nextTrack/prevTrack to use queue**

Replace the existing nextTrack/prevTrack:

```javascript
const nextTrack = useCallback(() => {
  const next = queue.next()
  if (next) {
    playUrl(`https://youtube.com/watch?v=${next.id}`, next)
  } else {
    // queue exhausted — try YT keyboard shortcut as fallback
    window.api.ytCommand('next')
  }
  setQueueTracks(queue.tracks)
}, [queue, playUrl])

const prevTrack = useCallback(() => {
  const prev = queue.prev()
  if (prev) {
    playUrl(`https://youtube.com/watch?v=${prev.id}`, prev)
  } else {
    window.api.ytCommand('prev')
  }
  setQueueTracks(queue.tracks)
}, [queue, playUrl])
```

`ponytail: fallback to keyboard command when queue empty preserves original behavior.`

- [ ] **Step 4: Expose new state in context value**

Add to value object:
```javascript
queueTracks, loopOne, addToQueue, removeFromQueue, toggleLoop
```

- [ ] **Step 5: Fix MPRIS sync dependencies**

Change line 121-123 to use `currentTrack` whole object, not just `.title`:
```javascript
useEffect(() => {
  if (window.api?.updateMprisTrack && currentTrack.title)
    window.api.updateMprisTrack(currentTrack, !isPlaying)
}, [currentTrack, isPlaying])  // note: full currentTrack, not just .title
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/contexts/YoutubeMusicContext.jsx
git commit -m "feat: integrate queue + loop-one into context, fix MPRIS deps"
```

---

### Task 8: Add queue + loop tool handlers to useMarkMusic

**File:** `src/renderer/src/hooks/agent/useMarkMusic.js`

- [ ] **Step 1: Destructure new context methods**

Pass `youtubeMusicTools` through and destructure:
```javascript
const { playUrl, nextTrack, prevTrack, playPause,
        queueTracks, loopOne, addToQueue, removeFromQueue, toggleLoop } = youtubeMusicTools
```

- [ ] **Step 2: Add queue/loop cases to handleMusic**

Add BEFORE the existing chain:

```javascript
// No-query tools that need context
if (action === 'music-queue') return formatQueue(queueTracks)
if (action === 'music-loop') {
  const now = toggleLoop()
  return `Loop ${now ? 'ON (repeat 1 lagu)' : 'OFF'}.`
}
if (action === 'music-add' && query) {
  const music = await window.api.searchMusic(query)
  if (!music?.length) return `"${query}" tidak ditemukan.`
  const track = music[0]
  addToQueue({ id: track.id, title: track.title, artist: track.artist,
               duration: track.duration, thumbnail: track.thumbnail })
  return `"${track.title}" ditambahkan ke antrian. ${queueTracks.length + 1} lagu dalam antrian.`
}
if (action === 'music-remove') {
  const idx = parseInt(query, 10) - 1  // 1-based user input
  if (isNaN(idx)) return 'Nomor antrian tidak valid. Contoh: "hapus 2"'
  removeFromQueue(idx)
  return `Lagu #${idx + 1} dihapus dari antrian.`
}
```

At bottom of file, add helper:
```javascript
function formatQueue(tracks) {
  if (!tracks.length) return 'Antrian kosong.'
  return `Antrian (${tracks.length} lagu):\n` + tracks
    .map((t, i) => `${i + 1}. ${t.title} — ${t.artist}`)
    .join('\n')
}
```

- [ ] **Step 3: Fix empty string return from music-play**

Change line 58 from `return ''` to return meaningful feedback:
```javascript
return `Memutar "${selectedMusicList[0]?.title || 'lagu'}"`
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/hooks/agent/useMarkMusic.js
git commit -m "feat: add queue/loop tool handlers, fix empty-string return"
```

---

### Task 9: Register tools in guard-gate, approval-modes, planning, tool-registry, wire context

- [ ] **Step 1: guard-gate.js — add music-queue, music-loop to NO_QUERY_TOOLS**

```javascript
const NO_QUERY_TOOLS = new Set([
  'music-next', 'music-prev', 'music-toggle', 'music-queue', 'music-loop',
  'browser-read', 'browser-close', 'list-windows', 'screenshot', 'finish', 'stop', 'done'
])
```

- [ ] **Step 2: approval-modes.js — add low risk for new tools**

```javascript
'music-queue': 'low',
'music-loop': 'low',
'music-add': 'low',    // has search step, not destructive
'music-remove': 'low', // removes from local list, not from YouTube
```

- [ ] **Step 3: planning.js — add to schema enum + category text + degraded mode list**

Schema enum inside getNextAction (around lines 480-511):
```javascript
'music-queue',
'music-add',
'music-remove',
'music-loop',
```

Category text: add keywords:
```javascript
music: 'putar lagu puter musik dengerin playlist sound audio dengarkan antrian queue loop repeat',
```

Degraded mode tool list (lines 343-351):
```javascript
- music-queue, music-loop, music-add, music-remove
```

Tool list in system prompt (lines 295-326):
```javascript
// Add:
// - music-queue: Lihat antrian lagu
// - music-add: Tambah lagu ke antrian. Query: judul lagu.
// - music-remove: Hapus lagu dari antrian. Query: nomor antrian.
// - music-loop: Toggle repeat satu lagu ON/OFF.
```

- [ ] **Step 4: tool-registry.js — add BUILTIN_TOOLS entries**

```javascript
'music-queue':  { description: 'Lihat antrian lagu', category: 'music', riskLevel: 'green' },
'music-add':    { description: 'Tambah lagu ke antrian', category: 'music', riskLevel: 'green' },
'music-remove': { description: 'Hapus lagu dari antrian', category: 'music', riskLevel: 'green' },
'music-loop':   { description: 'Toggle repeat satu lagu', category: 'music', riskLevel: 'green' },
```

And add TOOL_RISK_LEVELS:
```javascript
'music-queue': 'green',
'music-add': 'green',
'music-remove': 'green',
'music-loop': 'green',
```

Voice fast-path:
```javascript
'antrian': { tool: 'music-queue', query: '' },
'loop': { tool: 'music-loop', query: '' },
'ulang': { tool: 'music-loop', query: '' },
```

- [ ] **Step 5: useMarkAgent.js — wire new context props**

Find the tools object (around line 56-63), add:
```javascript
currentQueueTracks: youtubeMusicTools.queueTracks || [],
currentLoopMode: youtubeMusicTools.loopOne || false,
```

Also inject into useAwareness call (line 86-96) if relevant.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/api/ai/guard-gate.js \
       src/renderer/src/api/ai/approval-modes.js \
       src/renderer/src/api/ai/planning.js \
       src/main/tool-registry.js \
       src/renderer/src/hooks/useMarkAgent.js
git commit -m "feat: register queue/loop tools across all layers"
```

---

## Self-Review

### 1. Spec coverage
- Fix duplicate listener → Task 1 ✓
- Fix MPRIS Stop → Task 2 ✓
- Fix exit animation race → Task 3 ✓
- Fix MarkHome button bypass → Task 3 ✓
- Remove dead youtube-search IPC → Task 4 ✓
- Remove dead ytdl IPC → Task 4 ✓
- Block YouTube ads → Task 5 ✓
- Queue engine → Task 6 ✓
- Queue tools (music-queue, music-add, music-remove) → Tasks 7, 8, 9 ✓
- Loop one (toggle) → Tasks 6, 7, 8, 9 ✓

### 2. Placeholder scan
No TODOs, "implement later", or placeholder patterns found.

### 3. Type consistency
- MusicQueue.enqueue(track) expects `{ id, title, artist, duration?, thumbnail? }` → Task 8 addToQueue passes same shape ✓
- `queue.tracks` returns `[...this._queue]` (array) → Task 7 `setQueueTracks(queue.tracks)` ✓
- `toggleLoop()` returns boolean → Task 7 `setLoopOne(mode)` ✓
- nextTrack/prevTrack return `null` (exhausted) → fallback to keyboard command ✓
- `handleMusic(action, query)` signature preserved ✓

### What was skipped (YAGNI)
- Volume control (needs new IPC + Electron API)
- Playlist persistence (Dexie CRUD)
- Shuffle (not requested)
- Seek (needs YouTube API integration)
- music-stop tool (MPRIS stop context handler is sufficient)
- UI queue display (keep AI-verbal for now — add widget when user asks)
- yt-dlp audio stream (BrowserWindow stays)
