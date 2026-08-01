# UI Overhaul: Glassmorphism + Fluid Layout + Blue/Amber Theme (Fase A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace forest green theme with monochrome/amber. Flatten layout to fluid stream. Add glassmorphism. Add 4-mode button bar (UI only, no backend).

**Architecture:** DaisyUI CSS variables override. Layout changes in `MarkHome.jsx`. Color changes in `OrbVisualizer.jsx` + `YoutubeMusicPlayer.jsx`. 4-mode bar is pure JSX/CSS — click to expand/collapse only.

**Tech Stack:** Tailwind CSS v4, DaisyUI `forest` override, `backdrop-blur`, Poppins.

## Global Constraints

- DaisyUI `forest` → override `:root` CSS variables. NOT new theme.
- Hardcoded green classes → replace: `from-emerald`, `to-green`, `bg-green`, `border-green`, `text-green`
- Zero JS logic changes. Pure visual + layout only.
- Orb: fixed size (w-36 h-36), no scale animation, always center
- Glass: `bg-white/5 backdrop-blur-xl border border-white/10`
- Colors: base = charcoal/silver, accent = amber/gold (#F5A623)
- 4-mode bar: 4 circle buttons. `[💬]` expand/collapse chat. Others: UI-only.
- Remove `holo-project-in`, `holo-dismiss`, `music-bar` keyframes
- Keep `holo-enter` (used by FloatingMenu)
- Music controls: inline below orb as thin text+buttons, no separate card
- Remove: `showMusicWidget`, `isMusicAnimatingOut` state + exit animation useEffect

---
## File Structure

| File | Action |
|------|--------|
| `src/renderer/src/assets/main.css` | Modify: theme vars, remove 2 keyframes |
| `src/renderer/src/components/core/OrbVisualizer.jsx` | Modify: green→sky/amber |
| `src/renderer/src/components/YoutubeMusicPlayer.jsx` | Modify: green→amber |
| `src/renderer/src/pages/MarkHome.jsx` | Modify: fluid layout, inline music, 4-mode bar |
| `src/renderer/src/pages/Guidebook.jsx` | Modify: green→amber |
| `src/renderer/src/components/core/InputBar.jsx` | Modify: border color |
| `src/renderer/src/components/core/FloatingMenu.jsx` | Modify: primary → amber |
| `src/renderer/src/components/core/HistoryDrawer.jsx` | Modify: glass |
| `src/renderer/src/components/Chat/CodeBlock.jsx` | Modify: glass |

### Task 1: DaisyUI Theme Override

**File:** `src/renderer/src/assets/main.css`

- [ ] **Step 1: Add theme override after line 8**

```css
/* ===== THEME OVERRIDE: Forest → Crystal/Amber ===== */
:root {
  --p: 0.78 0.13 75;       /* primary amber */
  --pc: 0.95 0.01 75;      /* primary content */
  --s: 0.55 0.02 240;      /* secondary silver */
  --sc: 0.95 0.01 240;
  --a: 0.75 0.06 65;       /* accent warm */
  --ac: 0.15 0.02 240;
  --n: 0.12 0.02 240;      /* neutral */
  --nc: 0.85 0.01 240;
  --b1: 0.07 0.01 240;     /* base-100 */
  --b2: 0.10 0.015 240;    /* base-200 */
  --b3: 0.13 0.02 240;     /* base-300 */
  --bc: 0.85 0.01 240;     /* base content */
  --in: 0.55 0.08 240;     /* info blue */
  --inc: 0.95 0.01 240;
  --su: 0.55 0.08 150;     /* success */
  --suc: 0.95 0.01 150;
  --wa: 0.78 0.13 75;      /* warning amber */
  --wac: 0.15 0.02 240;
  --er: 0.60 0.15 25;      /* error */
  --erc: 0.95 0.01 25;
  --color-holo-border: linear-gradient(90deg, oklch(var(--p)), oklch(var(--b2)), oklch(var(--p)));
}
```

- [ ] **Step 2: Replace holo-project-in/dismiss/music-bar with simplified fade**

Replace lines 355-470 (holo section) with:
```css
/* === SIMPLE FADE ANIMATIONS === */
@keyframes fade-up {
  0%   { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes fade-down {
  0%   { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(8px); }
}
/* Keep holo-enter — used by FloatingMenu */
```

- [ ] **Step 3: Remove unused CSS classes that reference green**

Remove lines 312-318 comment (`/* === TAMBAHAN UNTUK ORB & HOLOGRAM (HIJAU SEIRAMA) === */`) — the `--color-holo-border` and `--glass-*` vars stay but the comment is misleading.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/assets/main.css
git commit -m "refactor(ui): theme → monochrome+amber, fade animations"
```

---

### Task 2: OrbVisualizer — Green to Sky/Amber

**File:** `src/renderer/src/components/core/OrbVisualizer.jsx`

- [ ] **Step 1: Replace defaults + all green/emerald**

```javascript
// Lines 4-6 — defaults:
const [glassClass, setGlassClass] = useState('from-sky-400/30 to-blue-500/10');
const [glowClass, setGlowClass] = useState('bg-sky-500/40');
const [borderClass, setBorderClass] = useState('border-sky-400/40');

// 'playing' status (line 13-16):
setGlassClass('from-amber-400/40 to-yellow-600/10');
setGlowClass('bg-amber-500/50');
setBorderClass('border-amber-400/50');

// 'disgust' mood (line 40-42) — teal, not green:
setGlassClass('from-teal-400/30 to-cyan-600/10');
setGlowClass('bg-teal-500/40');
setBorderClass('border-teal-400/40');

// default neutral (line 65-67) — blue/sky:
setGlassClass('from-sky-400/30 to-blue-500/10');
setGlowClass('bg-sky-500/40');
setBorderClass('border-sky-400/40');
```

- [ ] **Step 2: Remove 'playing' scale**

Change line 78 `else if (status === 'playing') targetScale = 1.03;` → `// playing: no scale change (default 1)`

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/core/OrbVisualizer.jsx
git commit -m "refactor(ui): orb → sky+amber palette, no playing scale"
```

---

### Task 3: MarkHome — Fluid Layout + Inline Music + 4-Mode Bar

**File:** `src/renderer/src/pages/MarkHome.jsx`

- [ ] **Step 1: Remove unused state and imports**

Remove line 14 `import musicCoverFallback from '../assets/music-cover.png'`
Remove lines 45-46: `showMusicWidget`, `isMusicAnimatingOut` states
Remove lines 77-92: exit animation useEffect
Keep lines 113-118: music→orbStatus override effect (needed for orb purple/amber)

- [ ] **Step 2: Replace orb container (lines 214-222)**

```jsx
{/* Orb — fixed size, always center-top */}
<div className="relative flex flex-col items-center justify-center w-full max-w-3xl my-4">
  <div className="relative flex items-center justify-center">
    <ThoughtNeuralFlow processes={activeProcesses} />
    <OrbVisualizer
      status={orbStatus}
      intensity={0.5}
      mood={currentResponse?.mood || 'neutral'}
    />
  </div>
  {/* Now Playing — inline text below orb */}
  {isPlaying && currentTrack?.title && (
    <div className="animate-[fade-up_0.4s_ease-out_forwards] text-center mt-2">
      <p className="text-white/80 text-sm font-light tracking-wide">
        ♪ {currentTrack.title}
      </p>
      {currentTrack.artist && (
        <p className="text-white/40 text-xs font-extralight">{currentTrack.artist}</p>
      )}
    </div>
  )}
</div>
```

- [ ] **Step 3: Replace response + music widget (lines 224-284)**

```jsx
{/* Response Area + Inline Controls + 4-Mode Bar */}
<div className="w-full max-w-2xl flex flex-col items-center gap-4 px-4">
  {/* Response bubble — glass card */}
  {currentResponse && (
    <div className="w-full animate-[fade-up_0.4s_ease-out_forwards] bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-lg">
      <ResponseArea currentResponse={currentResponse} />
    </div>
  )}

  {/* Music Controls — inline, thin, only when playing */}
  {isPlaying && currentTrack?.title && (
    <div className="animate-[fade-up_0.4s_ease-out_forwards] flex items-center gap-3 py-2">
      <button onClick={prevTrack} className="text-white/40 hover:text-white/80 transition-colors p-1" title="Previous">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
      </button>
      <button onClick={playPause} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors" title="Play/Pause">
        {isPlaying ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
        )}
      </button>
      <button onClick={nextTrack} className="text-white/40 hover:text-white/80 transition-colors p-1" title="Next">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
      </button>
      <button onClick={togglePlayer} className={`text-white/30 hover:text-white/60 transition-colors p-1 ${isPlayerOpen ? 'text-amber-400/60' : ''}`} title={isPlayerOpen ? 'Tutup Video' : 'Lihat Video'}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m10 8 6 4-6 4V8z"/></svg>
      </button>
    </div>
  )}
</div>
```

- [ ] **Step 4: Add 4-Mode Bottom Bar before InputBar**

Insert between response div and InputBar (before line 287):

```jsx
{/* 4-Mode Bottom Bar */}
<div className="w-full max-w-2xl px-4 mb-2">
  <div className="flex items-center justify-center gap-3">
    {/* Chat Mode */}
    <button
      onClick={() => { /* future: toggle chat mode */ }}
      className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300
        bg-white/10 hover:bg-white/20 border border-white/10 hover:border-amber-400/50
        active:scale-90`}
      title="Chat Mode"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/70">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    </button>

    {/* Voice Mode */}
    <button
      onClick={() => { /* future: voice conversation mode */ }}
      className="w-12 h-12 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 hover:border-amber-400/50 transition-all duration-300 active:scale-90"
      title="Voice Mode"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/70">
        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
    </button>

    {/* Camera Mode */}
    <button
      onClick={() => { /* future: camera preview */ }}
      className="w-12 h-12 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 hover:border-amber-400/50 transition-all duration-300 active:scale-90"
      title="Camera Mode"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/70">
        <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
      </svg>
    </button>

    {/* Share Screen Mode */}
    <button
      onClick={() => { /* future: screen share */ }}
      className="w-12 h-12 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 hover:border-amber-400/50 transition-all duration-300 active:scale-90"
      title="Share Screen"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/70">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
    </button>
  </div>
</div>
```

- [ ] **Step 5: Destructure prevTrack, nextTrack, playPause from context**

Change line 40 from:
```javascript
const { isPlaying, currentTrack, isPlayerOpen, togglePlayer } = useYoutubeMusic()
```
To:
```javascript
const { isPlaying, currentTrack, isPlayerOpen, togglePlayer,
        prevTrack, nextTrack, playPause } = useYoutubeMusic()
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/pages/MarkHome.jsx
git commit -m "refactor(ui): fluid layout, inline music controls, 4-mode bar placeholder"
```

---

### Task 4: YoutubeMusicPlayer — Dot to Amber

**File:** `src/renderer/src/components/YoutubeMusicPlayer.jsx`

- [ ] **Step 1: bg-green-500 → bg-amber-400**

Line 15: change `bg-green-500 animate-pulse` → `bg-amber-400 animate-pulse`

- [ ] **Step 2: Remove ping halo**

Line 62: delete the `<span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping...">` element

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/YoutubeMusicPlayer.jsx
git commit -m "refactor(ui): dot amber-400, remove ping halo"
```

---

### Task 5: Guidebook Green → Amber

**File:** `src/renderer/src/pages/Guidebook.jsx`

- [ ] **Step 1: Replace text-green-400**

```jsx
<pre className="text-sm bg-black/60 p-4 rounded-xl text-amber-400 overflow-x-auto whitespace-pre-wrap">
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/pages/Guidebook.jsx
git commit -m "refactor(ui): guidebook code block amber-400"
```

---

### Task 6: Glassmorphism + Amber Icons

**Files:** InputBar, FloatingMenu, HistoryDrawer, CodeBlock

- [ ] **Step 1: InputBar — update border/shadow**

Line 116: change `focus-within:border-primary/50 focus-within:shadow-[0_0_20px_oklch(var(--su)/0.2)]` to:
```jsx
focus-within:border-amber-500/40 focus-within:shadow-[0_0_20px_rgba(245,166,35,0.1)]
```

- [ ] **Step 2: FloatingMenu — text-primary → text-amber-400**

Change all 8 `className="text-primary"` instances in FloatingMenu.jsx to `className="text-amber-400"`

- [ ] **Step 3: HistoryDrawer — glass**

Line 79: `bg-base-300` → `bg-base-300/90 backdrop-blur-xl`
Line 123: `bg-base-300/95` → `bg-base-300/80`

- [ ] **Step 4: CodeBlock — glass**

Line 17: `bg-base-200/50` → `bg-white/5 backdrop-blur-sm`

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/core/InputBar.jsx \
       src/renderer/src/components/core/FloatingMenu.jsx \
       src/renderer/src/components/core/HistoryDrawer.jsx \
       src/renderer/src/components/Chat/CodeBlock.jsx
git commit -m "refactor(ui): glassmorphism pass + amber icons"
```
