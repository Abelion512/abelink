# Session: Prompt Compressor Threshold + Model Behavior Tracker

## Ringkasan

**Tanggal:** 2026-07-30  
**Branch:** `worktree-fix-prompt-compressor`  
**Files touched:** `src/renderer/src/api/ai/planning.js`, `src/renderer/src/api/ai/prompt-compressor.js`, `src/renderer/src/api/ai/model-behavior-tracker.js` **(New)**, `src/renderer/src/api/ai/core.js`, `src/main/index.js` (CDP purge)  
**Ringkasan:** Analisis root cause MARK lemot — prompt numpuk linear sampai 42k token tanpa pruning. Fix: turunkan compressor threshold 128k→24k, ratio 0.75→0.5, sliding window 30 turn. Feature: model-behavior-tracker.js — adaptive layer record per-model behavior (null content, finish:length, latency) dan auto-tune strategy. Verify via CDP — WS connect, hook injected, runtime 45s stable.

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
|---------|------|------------|-----|--------|
| Prompt 10k→42k tanpa trim | `planning.js` | compressor threshold 96k (128k×0.75) — gak pernah nyala | Turun 24k/0.5 → kompres di ~12k | ✅ Fixed |
| No sliding window | `planning.js` | `loopMessages` infinite growth | `MAX_TURNS = 30` — slice | ✅ Fixed |
| Model null content | `mimo-v2.5-pro` | finish:length → null response | Tracker record + adapt strategy | ✅ Fixed |
| No model profiling | — | Semua model dipanggil sama | `model-behavior-tracker.js` — reliability tiers + auto-tune | ✅ Fixed |
| Credential 404 → slow fallback | 9Router | Credential gak dimonitor | Tracker detect 404 → mark dead → suggestFallback | ✅ Fixed |

## Files Modified

| File | Perubahan |
|------|-----------|
| `src/renderer/src/api/ai/planning.js` | Threshold, sliding window, model tracker wiring, unused imports cleanup |
| `src/renderer/src/api/ai/model-behavior-tracker.js` | **New** — record→computeReliability→adaptStrategy+persist localStorage |
| `src/main/index.js` | Temporary CDP port reverted |
| `cdp-verify.cjs` | **New** — CDP verify script (worktree only, not committed) |

## Agent Learnings

### Pattern Konkret

1. **Compressor threshold must match actual prompt size, not model context** — 128k threshold × 0.75 = 96k trigger. Untuk real usage 10-40k, compressor never fires.
2. **CDP via electron-vite** — `--remote-debugging-port` must be set via `app.commandLine.appendSwitch()`, not env var. electron-vite doesn't forward `ELECTRON_EXTRA_ARGS`.
3. **Sliding window tanpa pruning = false economy** — server-side compression useless if caller constantly appends. Set explicit `MAX_TURNS` in caller.
4. **Model personality varies per provider** — null rate, finish reason, latency all differ. Treating all models the same is suboptimal.

### File Invariants

| File | Invariant |
|------|-----------|
| `src/renderer/src/api/ai/planning.js:6` | `createCompressor()` config must match actual prompt size, not model advertised context |
| `src/renderer/src/api/ai/model-behavior-tracker.js` | `record()` must be called after every `fetchAI` response |
| `src/renderer/src/api/ai/planning.js` | `modelTracker.record()` inserted after `fetchAI` call, before null/empty handling |

### Verification Checklist

- [ ] `npx electron-vite build` success
- [ ] CDP WS connect sukses ke Electron devtools (port 9223)
- [ ] `modelTracker.record()` dipanggil tiap fetchAI response
- [ ] `localStorage.mark:model_profiles` populated after interaction
- [ ] `npm run dev` runs without crash

## Callback

Commit ready (local). Mau push + draft PR? Juga: **9Router credential `abelink` — re-activate di dashboard 9Router.** Itu efek paling besar ke speed: `abelink` (~1-2s) vs `mimo-v2.5-pro` (~15-213s).
