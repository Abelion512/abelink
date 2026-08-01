# Fix 4-Mode Bar — Chat Button Morph into InputBar

> **For agentic workers:** Sub-skills not needed — single-file change, 3 steps.

**Goal:** Click chat (💬) → button morphs into InputBar at same position. Other 3 buttons stay visible. Click X → collapse back to 4 buttons.

**Architecture:** InputBar has `fixed bottom-8` self-positioning. Instead of wrapping InputBar in another fixed container, render state branches: (A) chat inactive → 4 buttons at `bottom-8`, (B) chat active → InputBar self-positions + X + 3 buttons float at `bottom-8 right-4`. No nesting. No double position.

**Fixes:** Remove old standalone InputBar from MarkHome (already done). The 4-mode bar section replaces it entirely.

---
## Steps

### Step 1: Read current MarkHome.jsx bottom section

Read lines 228-284 to verify current state before editing.

### Step 2: Replace the 4-mode bar section (lines 228-284)

Replace lines 228-284 with:

```jsx
 {/* 4-Mode Bottom Bar */}
 {activeMode === 'chat' ? (
   /* CHAT ACTIVE: InputBar self-positions + floating buttons */
   <>
     <InputBar
       value={message}
       onChange={(e) => { setMessage(e.target.value); if (isSpeak) setIsSpeak(false) }}
       onSubmit={() => { setIsSpeak(false); handleSubmit() }}
       isLoading={isLoading || isAgentBusy}
       isRecording={isRecording}
       onToggleRecord={toggleRecording}
       onStop={handleStop}
       source={inputSource}
     />
     {/* X + 3 buttons — fixed row at bottom-right */}
     <div className="fixed bottom-8 right-4 z-50 flex items-center gap-2">
       <button onClick={() => setActiveMode(null)}
         className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 hover:border-red-400/50 transition-all duration-300 active:scale-90 text-white/50 hover:text-red-400 shrink-0"
         title="Close Chat">
         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
       </button>
       <button onClick={() => setActiveMode('voice')}
         className="w-12 h-12 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 transition-all duration-300 active:scale-90 text-white/70" title="Voice Mode">
         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
       </button>
       <button onClick={() => setActiveMode('camera')}
         className="w-12 h-12 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 transition-all duration-300 active:scale-90 text-white/70" title="Camera Mode">
         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
       </button>
       <button onClick={() => setActiveMode('screen')}
         className="w-12 h-12 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 transition-all duration-300 active:scale-90 text-white/70" title="Share Screen">
         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
       </button>
     </div>
   </>
 ) : (
   /* CHAT INACTIVE: 4 centered buttons */
   <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2">
     <button onClick={() => setActiveMode('chat')}
       className="w-12 h-12 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 hover:border-green-500/50 transition-all duration-300 active:scale-90 text-white/70" title="Chat Mode">
       <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
     </button>
     <button onClick={() => setActiveMode('voice')}
       className="w-12 h-12 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 transition-all duration-300 active:scale-90 text-white/70" title="Voice Mode">
       <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
     </button>
     <button onClick={() => setActiveMode('camera')}
       className="w-12 h-12 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 transition-all duration-300 active:scale-90 text-white/70" title="Camera Mode">
       <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
     </button>
     <button onClick={() => setActiveMode('screen')}
       className="w-12 h-12 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 transition-all duration-300 active:scale-90 text-white/70" title="Share Screen">
       <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
     </button>
   </div>
 )}
```

### Step 3: Remove the comment and verify

Ensure no old InputBar render remains in the file. Only one InputBar call in the entire JSX.

### Step 4: Commit

```bash
git add src/renderer/src/pages/MarkHome.jsx
git commit -m "fix: 4-mode bar — chat morph replaces self, InputBar self-positions at bottom-8"
```

---

## Self-Review

- InputBar's own `fixed bottom-8` → no double positioning because it's rendered standalone, not inside another fixed container ✓
- chat active → InputBar at center, X+3 buttons at right ✓
- chat inactive → 4 centered buttons ✓
- No old InputBar leftover (was already removed) ✓
- `activeMode` state toggles between `null` → `chat` → `null` ✓
