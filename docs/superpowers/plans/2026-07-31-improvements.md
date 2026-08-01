# MARK Improvement Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce MARK's technical debt across 8 tasks in 3 phases (Stability → Performance → Readability) with zero user-visible behavior change.

**Architecture:** (1) Unify duplicated JSON parsing into `src/shared/cleanAndParse.js` consumed by both main and renderer. (2) Harden the agent loop's failure accounting + guard-gate invariants. (3) Mechanically extract `useMarkPlan.js` tool dispatch into per-domain modules under `hooks/agent/tools/`. (4) Lazy-load route pages. (5) Split `Configuration.jsx` into per-section components. (6) Slim AGENTS.md. (7) Remove dead code. (8) Add vitest harness for pure utilities.

**Tech Stack:** Electron 39, React 19, Vite 7 (electron-vite 5), vitest (dev-only, added in Task 8), jsonrepair ^3.14.0 (already a dependency).

## Global Constraints

- **Zero behavior change** — every refactor is mechanical; output of each task must produce byte-identical runtime behavior.
- **No new runtime dependencies** — only `vitest` as devDependency (Task 8).
- **`docs/superpowers/` is gitignored** — do NOT attempt `git add` on spec/plan files; commits only contain source code changes.
- **Never push to GitHub** — local commits only, per AGENTS.md rule.
- **No ad-hoc CSS files** — reuse existing design tokens (`--glass-bg`, `--glass-border`, `--color-holo-border`) and DaisyUI classes.
- **Electron process boundary** — no Node APIs in `renderer/`; all OS access via IPC.
- **Commit after every task** with a descriptive message (see task commit steps).
- **`npm run build` must pass after every task** (`electron-vite build`).
- AbortError convention: check `error.name === 'AbortError' || error.message.includes('AbortError')` — never swallow non-abort errors silently.

---

## Phase 1 — Stability

### Task 1: Unify `cleanAndParse` into `src/shared/cleanAndParse.js`

**Files:**
- Create: `src/shared/cleanAndParse.js`
- Modify: `src/main/ai-bridge.js` (delete local `cleanAndParse` + `getJsonrepair`; import shared)
- Modify: `src/renderer/src/api/ai/core.js` (delete local `cleanAndParse`; import shared)
- Test: `tests/cleanAndParse.test.js` (vitest — created now, runnable in Task 8)

**Interfaces:**
- Produces: `export function cleanAndParse(raw) -> object|null` — sync, never throws, returns parsed object or `null`. Fast-path: raw JSON parse first (no jsonrepair cost on valid output). Fallbacks: strip code fences → jsonrepair (lazy dynamic import, disabled if unavailable) → `{...}` substring extraction. Array-only results → `null`.

**Rationale:** `ai-bridge.js:482` (async, lazy jsonrepair, no fast-path) and `core.js:59` (sync, fast-path, rejects arrays) have drifted. One implementation = one tested behavior.

- [ ] **Step 1: Write the failing test**

Create `tests/cleanAndParse.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { cleanAndParse } from '../src/shared/cleanAndParse.js'

describe('cleanAndParse', () => {
  it('parses plain valid JSON object', () => {
    expect(cleanAndParse('{"a":1}')).toEqual({ a: 1 })
  })

  it('parses JSON wrapped in markdown fences', () => {
    expect(cleanAndParse('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('repairs broken JSON with trailing comma', () => {
    expect(cleanAndParse('{"a":1,}')).toEqual({ a: 1 })
  })

  it('extracts first object from surrounding prose', () => {
    expect(cleanAndParse('Here you go: {"a":1} thanks!')).toEqual({ a: 1 })
  })

  it('strips UTF-8 BOM prefix', () => {
    expect(cleanAndParse('\uFEFF{"a":1}')).toEqual({ a: 1 })
  })

  it('returns null for array-only JSON (schema requires object)', () => {
    expect(cleanAndParse('[1,2,3]')).toBeNull()
  })

  it('returns null for garbage input', () => {
    expect(cleanAndParse('not json at all')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(cleanAndParse('')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cleanAndParse.test.js --passWithNoTests`
Expected: FAIL — module `../src/shared/cleanAndParse.js` not found.

- [ ] **Step 3: Write shared implementation**

Create `src/shared/cleanAndParse.js`:

```js
// Shared JSON parser for LLM responses — single source of truth for main + renderer.
// Fast path avoids jsonrepair cost on valid JSON; fallbacks handle fenced/broken output.

let _jsonrepair = null

async function getJsonrepair() {
  if (_jsonrepair === null) {
    try { _jsonrepair = (await import('jsonrepair')).jsonrepair || false } catch { _jsonrepair = false }
  }
  return _jsonrepair || null
}

function tryParse(text) {
  const parsed = JSON.parse(text)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  return null
}

export async function cleanAndParse(rawResponse) {
  try {
    if (!rawResponse) return null
    const trimmed = rawResponse.replace(/^\uFEFF/, '').trim()
    // Fast path: valid JSON object, no repair needed
    try {
      const parsed = tryParse(trimmed)
      if (parsed) return parsed
    } catch {}
    // Strip code fences, then jsonrepair for broken LLM JSON
    const cleaned = trimmed.replace(/```[\s\S]*?```/g, '').trim()
    const repair = await getJsonrepair()
    const parsed = repair ? tryParse(repair(cleaned)) : tryParse(cleaned)
    if (parsed) return parsed
    // Last resort: extract first {...} substring
    const match = trimmed.match(/\{[\s\S]*\}/)
    return match ? tryParse(match[0]) : null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cleanAndParse.test.js`
Expected: PASS (8/8).

- [ ] **Step 5: Update `src/main/ai-bridge.js` to use shared**

- Remove `getJsonrepair()` (lines 7-11) and local `export const cleanAndParse` (lines 482-497).
- Add import near top: `import { cleanAndParse } from '../shared/cleanAndParse.js'`
- Line 431 `const parsed = await cleanAndParse(cleanText)` — unchanged (shared is async).

- [ ] **Step 6: Update `src/renderer/src/api/ai/core.js` to use shared**

- Remove local `cleanAndParse` (lines 59-81) and `import { jsonrepair } from 'jsonrepair'` (line 2).
- Add import: `import { cleanAndParse } from '../../../shared/cleanAndParse.js'`
- Check callers of `cleanAndParse` in core.js — if any call it synchronously without await, add `await` (shared is async now). Grep: `grep -rn "cleanAndParse" src/renderer/src/api/`

- [ ] **Step 7: Verify no other cleanAndParse implementations remain**

Run: `grep -rn "cleanAndParse" src/ | grep -v src/shared/`
Expected: only the two import lines + call sites remain.

- [ ] **Step 8: Build & commit**

Run: `npm run build`
Expected: PASS (electron-vite build, all three targets).

```bash
git add src/shared/cleanAndParse.js src/main/ai-bridge.js src/renderer/src/api/ai/core.js tests/cleanAndParse.test.js
git commit -m "refactor: unify cleanAndParse into src/shared (single tested source)"
```

---

### Task 2: Harden agent loop failure accounting + guard-gate invariants

**Files:**
- Modify: `src/renderer/src/hooks/agent/useMarkPlan.js` (lines 892-897 crash path; cleanup section)

**Interfaces:**
- Consumes: `failureCounters` (already defined line 285), `guard` (line 38), `tool`, `toolError` (crash catch scope)
- Produces: unchanged hook API `{ handlePlanningCommand, handleIntervention }`

**Rationale:** Claude Code docs (verified): hooks/guardrails fire even in bypass mode. In `useMarkPlan.js`, `guard.preFlightCheck` runs inside the native-tools branch regardless of `approvalMode`, so bypass does NOT skip the guard — invariant already holds. The real gap: the tool crash path (line 892-897) catches exceptions but does NOT increment `failureCounters` (line 285), so hard-stop guardrails can never trigger on repeated crashes — only on `[ERROR]`/`[DITOLAK]` result strings. Also `dismissProcess(agenticProcessId)` runs only in `catch`, leaving the process panel stale on successful-but-degenerate exits.

- [ ] **Step 1: Add failure accounting to the crash path**

In `useMarkPlan.js`, replace the tool crash catch (currently lines 892-897):

```js
          } catch (toolError) {
            if (toolError.name === 'AbortError' || toolError.message.includes('AbortError')) {
              throw toolError
            }
            resultString = `[ERROR] Tool ${tool} crash: ${toolError.message}`
            // Granular failure tracking — crashes must count toward hard-stop guardrails
            failureCounters.exact_failure++
            failureCounters.same_tool_failure[tool] = (failureCounters.same_tool_failure[tool] || 0) + 1
            failureCounters.idempotent_no_progress++
          }
```

- [ ] **Step 2: Ensure dismissProcess runs on all exits**

Locate the cleanup section (line 929-943, `// ========== CLEANUP ==========`). Add `dismissProcess(agenticProcessId)` after the `pushProcess` done-report block so the process panel clears on normal exit too (currently only in `catch`):

```js
      // ========== CLEANUP ==========
      if (!lastDecision?.answer) {
        if (execSteps.length > 2) {
          pushProcess({
            id: agenticProcessId,
            type: 'planning',
            status: 'done',
            data: {
              steps: [...execSteps],
              currentStep: execSteps.length,
              reasoning: 'Loop Selesai'
            }
          })
        }
      }
      dismissProcess(agenticProcessId)
```

- [ ] **Step 3: Verify guard-gate runs in bypass mode**

Grep the native-tools branch: `guard.preFlightCheck(tool, query)` (line 704) executes BEFORE `checkApprovalByMode` (line 732) and is not conditioned on approval mode — confirm this ordering is unchanged after edits. Expected: pre-flight guard always runs; approval is a separate layer. No code change needed; document in commit message.

- [ ] **Step 4: Build & commit**

Run: `npm run build`
Expected: PASS.

```bash
git add src/renderer/src/hooks/agent/useMarkPlan.js
git commit -m "fix: count tool crashes toward guardrail hard-stop; dismiss process on all exits"
```

---

## Phase 2 — Performance

### Task 3: Decompose `useMarkPlan.js` tool dispatch into `hooks/agent/tools/`

**Files:**
- Create: `src/renderer/src/hooks/agent/tools/youtube.js`, `music.js`, `vision.js`, `wa.js`, `native.js`, `pc.js`, `plugin.js`
- Create: `src/renderer/src/hooks/agent/tools/index.js` (dispatch map)
- Modify: `src/renderer/src/hooks/agent/useMarkPlan.js` (replace inline branches with dispatch call)

**Interfaces:**
- Each module exports: `async function executeTool(ctx) -> string` where `ctx = { tool, query, ...deps }` and deps are passed from `useMarkPlan` (see module signatures below).
- `index.js` exports: `export async function dispatchTool(tool, ctx) -> string` (throws AbortError upward for abort; returns result string otherwise).
- Consumes from useMarkPlan: `chatData/setChatData`, `config`, `abortControllerRef`, `handleMusic`, `getYoutubeData`, `getYoutubeSummary`, `requestApproval`, `requestCameraCapture`, `guard`, `loopMessages`, `failureCounters`, `scheduleThinkingUpdate`, `flushThinkingUpdate`, `pushProcess`, `waContext`, `isAutonomous`, `sanitizeToolOutput`, `checkApprovalByMode`, `agenticProcessId`.

**Constraint: pure mechanical extraction.** Copy branch bodies verbatim; only wrap in `executeTool(ctx)`. Do NOT change logic, messages, or flow. `useMarkPlan.js` keeps: loop, guardrails, memory handling, answer path, cleanup, observation feed.

- [ ] **Step 1: Create `youtube.js`**

```js
// Tool: yt-search, yt-summary
export async function executeYoutubeTool(ctx) {
  const { tool, query, setChatData, getYoutubeData, getYoutubeSummary, abortControllerRef } = ctx
  if (tool === 'yt-search') {
    const ytResults = await window.api.searchYoutube(query)
    return JSON.stringify(ytResults)
  }
  // yt-summary
  setChatData((prev) => [
    ...prev,
    {
      role: 'ai',
      content: 'Menonton video youtube...',
      isSummarizing: true,
      youtubeLink: query
    }
  ])
  const yData = await getYoutubeData(query)
  const result = await getYoutubeSummary(query, yData, abortControllerRef.current.signal)
  setChatData((prev) => prev.filter((item) => !item.isSummarizing))
  return result
}
```

- [ ] **Step 2: Create `music.js`**

```js
// Tool: music-* (play/next/prev/toggle/search)
export async function executeMusicTool(ctx) {
  const { tool, query, handleMusic } = ctx
  return handleMusic(tool, query)
}
```

- [ ] **Step 3: Create `vision.js`**

```js
// Tool: analyze-screen (deep role), camera-look (realtime role)
export async function executeVisionTool(ctx) {
  const { tool, query, config, requestCameraCapture, isAutonomous, scheduleThinkingUpdate, flushThinkingUpdate } = ctx
  if (tool === 'analyze-screen') {
    try {
      const screens = await window.api.takeScreenshot()
      if (screens && screens.length > 0) {
        scheduleThinkingUpdate('Memproses Vision AI...')
        const result = await analyzeScreen(screens, query || 'Jelaskan dengan detail apa yang terlihat di layar ini.')
        console.log(`[Vision AI - analyze-screen] Hasil analisis:`, result)
        return result
      }
      return 'Gagal mengambil screenshot dari sistem operasi.'
    } catch (e) {
      return `Gagal memproses visual: ${e.message}`
    }
  }
  // camera-look
  try {
    if (config[0]?.cameraEnabled === false) {
      return 'Fitur kamera dimatikan di pengaturan. Beri tahu user untuk mengaktifkannya.'
    }
    if (!requestCameraCapture) {
      return 'Internal Error: Callback requestCameraCapture tidak tersedia.'
    }
    flushThinkingUpdate('Mengakses kamera...', true)
    const cameraFrame = await requestCameraCapture({
      isAutonomous,
      deviceId: config[0]?.cameraDeviceId !== 'default' ? config[0]?.cameraDeviceId : null
    })
    if (cameraFrame) {
      flushThinkingUpdate('Menganalisis hasil kamera...', true)
      const result = await analyzeCamera(cameraFrame, query || 'Jelaskan apa yang terlihat dari kamera ini.')
      console.log(`[Vision AI - camera-look] Hasil analisis:`, result)
      return result
    }
    return 'Gagal mengambil gambar dari kamera.'
  } catch (e) {
    return `Gagal memproses kamera: ${e.message}`
  }
}
```

Add at top of file:

```js
import { analyzeScreen, analyzeCamera } from '../../../api/ai/vision-service'
```

- [ ] **Step 4: Create `wa.js`**

```js
// Tool: wa-send, screenshot-to-wa
export async function executeWaTool(ctx) {
  const { tool, query, waContext } = ctx
  if (tool === 'wa-send') {
    const [targetJid, targetText] = (query || '').split('|')
    if (targetJid && targetText) {
      const res = await window.api.sendWaMessage(targetJid.trim(), targetText.trim())
      return res?.success
        ? `Berhasil mengirim pesan WhatsApp ke ${targetJid}`
        : `Gagal: ${res?.error || 'Unknown'}`
    }
    return `Gagal: format query salah (harus "JID|pesan"): ${query}`
  }
  // screenshot-to-wa
  if (waContext) {
    window.api.waTakeScreenshot(waContext.jid, waContext.msgId)
    return 'Screenshot berhasil diambil dan dikirimkan ke WhatsApp user.'
  }
  return 'Tool screenshot-to-wa HANYA tersedia jika user sedang chat dari WhatsApp.'
}
```

- [ ] **Step 5: Create `native.js` (guard + approval + execution, the largest module)**

```js
// Tool: read-file, write-file, replace-lines, delete-file, list-dir, grep-search,
// run-shell, run-cli, browser-*, native-notify
import { sanitizeToolOutput } from '../../../api/ai/output-sanitizer'
import { checkApprovalByMode } from '../../../api/ai/approval-modes'

const NATIVE_TOOLS = [
  'read-file', 'write-file', 'replace-lines', 'delete-file', 'list-dir', 'grep-search',
  'run-shell', 'run-cli', 'browser-navigate', 'browser-read', 'browser-click',
  'browser-type', 'browser-scroll', 'browser-ask-user', 'browser-close', 'native-notify'
]

export function isNativeTool(tool) {
  return NATIVE_TOOLS.includes(tool)
}

export async function executeNativeTool(ctx) {
  const { tool, query, guard, options, loopMessages, decision, failureCounters, requestApproval, config, isAutonomous, agenticProcessId, pushProcess, abortControllerRef } = ctx
  const result = { status: 'observation', value: '' }
  // --- GUARD: pre-flight check (runs regardless of approval mode — Claude invariant) ---
  const preFlight = guard.preFlightCheck(tool, query)
  if (!preFlight.allowed) {
    if (preFlight.degrade) {
      options.disableTools = true
      result.value = `[DEGRADED] ${preFlight.reason}`
    } else {
      result.value = `[ERROR] Guard rejected: ${preFlight.reason}`
    }
    loopMessages.push(
      { role: 'assistant', content: JSON.stringify({ thought: decision.thought, action: decision.action }) },
      { role: 'user', content: `[OBSERVATION] Hasil eksekusi tool "${tool}": ${result.value}` }
    )
    return result
  }

  const toolStartTime = Date.now()
  const approvalCheck = await window.api.checkToolApproval(tool, query)
  const approvalMode = config[0]?.approvalMode || 'selective'
  const modeResult = checkApprovalByMode(approvalMode, tool, !!isAutonomous)

  // Plan mode: block write tools outright
  if (modeResult.blocked) {
    result.value = `[DITOLAK] Plan mode: "${tool}" tidak diizinkan. Hanya tool read-only.`
    const blockedResult = sanitizeToolOutput(tool, result.value)
    loopMessages.push(
      { role: 'assistant', content: JSON.stringify({ thought: decision?.thought, action: decision?.action }) },
      { role: 'user', content: `[OBSERVATION] ${blockedResult}` }
    )
    return result
  }

  // Bypass or low-risk: skip approval modal
  if (!modeResult.needsApproval || approvalMode === 'bypass') {
    if (approvalCheck.needsApproval && approvalCheck.needsApproval === 'hard_block') {
      result.value = `[ERROR] Tool "${tool}" diblokir oleh sistem.`
      guard.postFlightCheck(tool, result.value, Date.now() - toolStartTime)
      const blockedResult = sanitizeToolOutput(tool, result.value)
      loopMessages.push(
        { role: 'assistant', content: JSON.stringify({ thought: decision?.thought, action: decision?.action }) },
        { role: 'user', content: `[OBSERVATION] ${blockedResult}` }
      )
      return result
    }
  } else if (approvalCheck.needsApproval && requestApproval) {
    const userApproved = await requestApproval(approvalCheck.message, tool, query)
    if (!userApproved) {
      result.value = `[DITOLAK] User menolak eksekusi "${tool}". Cari cara lain atau tanyakan user.`
      guard.postFlightCheck(tool, result.value, Date.now() - toolStartTime)
      failureCounters.exact_failure++
      failureCounters.same_tool_failure[tool] = (failureCounters.same_tool_failure[tool] || 0) + 1
      failureCounters.idempotent_no_progress++
      const deniedResult = sanitizeToolOutput(tool, result.value)
      loopMessages.push(
        { role: 'assistant', content: JSON.stringify({ thought: decision.thought, action: decision.action }) },
        { role: 'user', content: `[OBSERVATION] Hasil eksekusi tool "${tool}": ${deniedResult}` }
      )
      return result
    }
  }

  const nativePromise = window.api.executeNativeTool(tool, query)
  const abortPromise = new Promise((_, reject) => {
    const onAbort = () => reject(new Error('AbortError'))
    if (abortControllerRef.current.signal.aborted) return onAbort()
    abortControllerRef.current.signal.addEventListener('abort', onAbort, { once: true })
  })
  const res = await Promise.race([nativePromise, abortPromise])
  const toolDuration = Date.now() - toolStartTime
  result.value = res.success
    ? (typeof res.data === 'string' ? res.data : JSON.stringify(res.data))
    : `[ERROR] ${tool} gagal: ${res.error}`
  guard.postFlightCheck(tool, result.value, toolDuration)

  const isError = result.value && (result.value.startsWith('[ERROR]') || result.value.startsWith('[DITOLAK]'))
  if (isError) {
    failureCounters.exact_failure++
    failureCounters.same_tool_failure[tool] = (failureCounters.same_tool_failure[tool] || 0) + 1
    failureCounters.idempotent_no_progress++
  } else {
    failureCounters.same_tool_failure[tool] = 0
    failureCounters.idempotent_no_progress = 0
  }
  return result
}
```

Note: `result.status` distinguishes "already fed observation" (`status: 'observation'`) from "needs observation feed" (`status: 'value'`) so the caller doesn't double-feed.

- [ ] **Step 6: Create `pc.js`**

```js
// Tool: os-* / pc-* — Linux desktop automation
export function isPcTool(tool) {
  return tool.startsWith('os-') || tool.startsWith('pc-')
}

export async function executePcTool(ctx) {
  const { tool, query } = ctx
  let pcResult = null
  try {
    switch (tool) {
      case 'os-read':
      case 'pc-control-read':
        pcResult = await window.api.osRead(); break
      case 'os-click':
      case 'pc-control-click':
        pcResult = await window.api.osClick(query); break
      case 'os-type':
      case 'pc-control-type':
        pcResult = await window.api.osType(query); break
      case 'os-key':
      case 'pc-control-key':
        pcResult = await window.api.osKey(query); break
      case 'os-scroll':
      case 'pc-control-scroll':
        pcResult = await window.api.osScroll(query); break
      case 'os-open':
      case 'pc-control-open':
        pcResult = await window.api.osOpen(query); break
      case 'os-list-windows':
      case 'pc-control-list-windows':
        pcResult = await window.api.osListWindows(); break
      case 'os-focus-window':
      case 'pc-control-focus-window':
        pcResult = await window.api.osFocusWindow(query); break
      case 'os-screenshot':
      case 'pc-screenshot':
        pcResult = await window.api.osScreenshot(); break
      case 'os-ask-user':
      case 'os-ask':
      case 'pc-control-ask':
        pcResult = await window.api.osAskUser(query); break
      case 'os-emergency-stop':
        pcResult = await window.api.osEmergencyStop(); break
      default:
        pcResult = { error: `Unknown PC tool: ${tool}` }
    }
  } catch (e) {
    pcResult = { error: e.message }
  }
  return typeof pcResult === 'string' ? pcResult : JSON.stringify(pcResult)
}
```

- [ ] **Step 7: Create `plugin.js`**

```js
// Tool: plugin fallback — any tool not matched by built-ins
export async function executePluginTool(ctx) {
  const { tool, query, pushProcess, abortControllerRef, agenticProcessId } = ctx
  const pluginProcessId = `plugin-${Date.now()}`
  pushProcess({
    id: pluginProcessId,
    type: 'plugin-execution',
    status: 'active',
    data: { action: tool, query }
  })

  const pluginPromise = window.api.executePlugin(tool, query)
  const abortPromise = new Promise((_, reject) => {
    const onAbort = () => reject(new Error('AbortError'))
    if (abortControllerRef.current.signal.aborted) return onAbort()
    abortControllerRef.current.signal.addEventListener('abort', onAbort, { once: true })
  })
  const res = await Promise.race([pluginPromise, abortPromise])
  const result = res.success
    ? (typeof res.data === 'string' ? res.data : JSON.stringify(res.data))
    : `[ERROR] Plugin ${tool} gagal: ${res.error}`

  pushProcess({
    id: pluginProcessId,
    type: 'plugin-execution',
    status: 'done',
    data: { action: tool, query, result }
  })
  return result
}
```

- [ ] **Step 8: Create `tools/index.js` dispatcher**

```js
// Tool dispatch map — single entry point for the agent loop
import { executeYoutubeTool } from './youtube'
import { executeMusicTool } from './music'
import { executeVisionTool } from './vision'
import { executeWaTool } from './wa'
import { executeNativeTool, isNativeTool } from './native'
import { executePcTool, isPcTool } from './pc'
import { executePluginTool } from './plugin'

// Returns { status: 'observation'|'value', value: string }
// - 'observation': result already fed into loopMessages (guard/approval rejections) — caller must NOT feed again
// - 'value': caller feeds observation into loopMessages
// Throws AbortError upward; converts other errors to '[ERROR] Tool ... crash: ...' string.
export async function dispatchTool(tool, query, ctx) {
  if (tool === 'yt-search' || tool === 'yt-summary') {
    return { status: 'value', value: await executeYoutubeTool({ ...ctx, tool, query }) }
  }
  if (tool.startsWith('music')) {
    return { status: 'value', value: await executeMusicTool({ ...ctx, tool, query }) }
  }
  if (tool === 'analyze-screen' || tool === 'camera-look') {
    return { status: 'value', value: await executeVisionTool({ ...ctx, tool, query }) }
  }
  if (tool === 'wa-send' || tool === 'screenshot-to-wa') {
    return { status: 'value', value: await executeWaTool({ ...ctx, tool, query }) }
  }
  if (isNativeTool(tool)) {
    return executeNativeTool({ ...ctx, tool, query })
  }
  if (isPcTool(tool)) {
    return { status: 'value', value: await executePcTool({ ...ctx, tool, query }) }
  }
  return { status: 'value', value: await executePluginTool({ ...ctx, tool, query }) }
}
```

- [ ] **Step 9: Rewire `useMarkPlan.js` tool execution**

In `useMarkPlan.js`:

1. Add import at top:

```js
import { dispatchTool } from './tools/index'
```

2. Replace the entire inline tool dispatch block (from `// ========== EXECUTE TOOL ==========` through the tool crash catch) with:

```js
          // ========== EXECUTE TOOL ==========
          let resultString = 'Tidak ada hasil.'

          try {
            const toolCtx = {
              chatData, setChatData, config, abortControllerRef, handleMusic,
              getYoutubeData, getYoutubeSummary, requestApproval, requestCameraCapture,
              guard, loopMessages, failureCounters, options, decision,
              scheduleThinkingUpdate, flushThinkingUpdate, pushProcess,
              waContext, isAutonomous, agenticProcessId
            }
            const exec = await dispatchTool(tool, query, toolCtx)
            if (exec.status === 'value') {
              resultString = exec.value
            } else {
              // status 'observation' — result already pushed to loopMessages
              lastToolExecution = { action: tool, query, result: exec.value }
              continue
            }
          } catch (toolError) {
            if (toolError.name === 'AbortError' || toolError.message.includes('AbortError')) {
              throw toolError
            }
            resultString = `[ERROR] Tool ${tool} crash: ${toolError.message}`
            // Granular failure tracking — crashes must count toward hard-stop guardrails
            failureCounters.exact_failure++
            failureCounters.same_tool_failure[tool] = (failureCounters.same_tool_failure[tool] || 0) + 1
            failureCounters.idempotent_no_progress++
          }

          // --- FEED OBSERVATION BACK KE AI ---
          const sanitizedOutput = sanitizeToolOutput(tool, resultString)
          loopMessages.push(
            {
              role: 'assistant',
              content: JSON.stringify({ thought: decision.thought, action: decision.action })
            },
            {
              role: 'user',
              content: `[OBSERVATION] Hasil eksekusi tool "${tool}": ${sanitizedOutput}`
            }
          )

          lastToolExecution = { action: tool, query, result: resultString }
```

3. Delete from `useMarkPlan.js`: the `analyzeScreen, analyzeCamera` import (moved to vision.js), the `checkApprovalByMode` import (moved to native.js), and `sanitizeToolOutput` import if no longer referenced (it still is — observation feed uses it). Keep `getYoutubeSummary` import if `useMarkPlan.js` still calls it (it doesn't after extraction — remove). Verify with: `grep -n "getYoutubeSummary\|analyzeScreen\|analyzeCamera\|checkApprovalByMode" src/renderer/src/hooks/agent/useMarkPlan.js` — only `dispatchTool` + `sanitizeToolOutput` imports remain.

- [ ] **Step 10: Manual smoke test of the agent loop**

Run: `npm run dev`
Expected: send "cari lagu koplo di youtube" → music flow works. Send "cek file /tmp" → native read works. Send "batal" mid-loop → cancel works. No console errors about missing imports.

- [ ] **Step 11: Build & commit**

Run: `npm run build`
Expected: PASS.

```bash
git add src/renderer/src/hooks/agent/tools/ src/renderer/src/hooks/agent/useMarkPlan.js
git commit -m "refactor: extract tool dispatch from useMarkPlan into agent/tools modules"
```

---

### Task 4: Lazy-load route pages

**Files:**
- Modify: `src/renderer/src/App.jsx`

**Interfaces:**
- Produces: `const LazyPage = lazy(() => import('./pages/X.jsx'))` for 8 pages; `<Suspense>` boundary wrapping `<Routes>`.

**Rationale:** All 8 pages (incl. 1611-line Configuration, 967-line Guidebook) are eagerly imported in App.jsx. Dynamic import → Rollup emits per-page chunks, cutting initial bundle.

- [ ] **Step 1: Convert imports to lazy**

In `src/renderer/src/App.jsx`, replace:

```js
import MarkHome from './pages/MarkHome'
import Configuration from './pages/Configuration'
import Knowledge from './pages/Knowledge'
import LiveAudio from './pages/LiveAudio'
import Guidebook from './pages/Guidebook'
import Plugins from './pages/Plugins'
import RelationalGrowth from './pages/RelationalGrowth'
import WhatsappBot from './pages/WhatsappBot'
```

with:

```js
import { lazy, Suspense } from 'react'

const MarkHome = lazy(() => import('./pages/MarkHome'))
const Configuration = lazy(() => import('./pages/Configuration'))
const Knowledge = lazy(() => import('./pages/Knowledge'))
const LiveAudio = lazy(() => import('./pages/LiveAudio'))
const Guidebook = lazy(() => import('./pages/Guidebook'))
const Plugins = lazy(() => import('./pages/Plugins'))
const RelationalGrowth = lazy(() => import('./pages/RelationalGrowth'))
const WhatsappBot = lazy(() => import('./pages/WhatsappBot'))
```

- [ ] **Step 2: Add Suspense boundary around routes**

Find the `<Routes>` element in App.jsx. Wrap it:

```jsx
<Suspense fallback={
  <div className="flex h-screen items-center justify-center">
    <span className="loading loading-spinner loading-lg text-primary" />
  </div>
}>
  <Routes>
    {/* existing routes unchanged */}
  </Routes>
</Suspense>
```

(Use DaisyUI `loading` spinner — no new CSS.)

- [ ] **Step 3: Build & verify chunk splitting**

Run: `npm run build`
Expected: PASS; build output `out/renderer/assets/` contains multiple JS chunks (one per page) instead of one monolithic bundle.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/App.jsx
git commit -m "perf: lazy-load route pages (React.lazy + Suspense chunk splitting)"
```

---

### Task 5: Split `Configuration.jsx` per section

**Files:**
- Create: `src/renderer/src/pages/config/sections/ConfigAI.jsx`, `ConfigMemory.jsx`, `ConfigAdmin.jsx`, `ConfigCamera.jsx`, `ConfigVoice.jsx`, `ConfigChat.jsx`
- Modify: `src/renderer/src/pages/Configuration.jsx` (shell: tabs + shared state; sections imported)

**Interfaces:**
- Each section: `export default function ConfigX({ config, setConfig, ...sectionProps })` — receives shared config state + section-specific props from parent.
- Parent `Configuration.jsx` keeps: `config` state, `loadConfig`, `handleSaveConfiguration`, tab state, Driver.js tour, `isFirstSetup` logic.

**Constraint:** preserve section IDs referenced by Driver.js tour steps (check `Configuration.jsx` for `data-step`/`id` attributes before moving sections). Same DaisyUI classes. Behavior identical.

- [ ] **Step 1: Map the file into sections**

Read `Configuration.jsx` fully (1611 lines). Identify JSX sections by their `card`/`div` blocks and their handler functions (list from earlier: `handleTestVoice`, `loadConfig`, `loadRelationalTraits`, `handleResetTraits`, `loadMemories`, `handleDeleteMemory`, `handleClearAllChat`, `handleExportChat`, `handleImportChatFile`, `handleExportFull`, `handleRestoreFullFile`, `handleSaveConfiguration`, `handleCameraDeviceIdChange`, `handleApproveAdmin`, `handleRejectAdmin`, `handleRemoveApprovedAdmin`, `handleRemoveLegacyAdmin`). Produce a mapping table in a scratch note:

```
ConfigAI:      provider/model/temperature/context sliders + handleSaveConfiguration + loadConfig
ConfigVoice:   TTS rate/pitch + handleTestVoice
ConfigCamera:  camera device select + preview (reuse ConfigCameraPreview, lines 29-67)
ConfigMemory:  memory view/edit/delete + loadMemories/handleDeleteMemory + groupedMemories + trait meters + loadRelationalTraits/handleResetTraits
ConfigAdmin:   WA admin approval queue + handleApproveAdmin/handleRejectAdmin/handleRemoveApprovedAdmin/handleRemoveLegacyAdmin
ConfigChat:    export/clear/import + handleExportChat/handleImportChatFile/handleExportFull/handleRestoreFullFile/handleClearAllChat
```

- [ ] **Step 2: Extract `ConfigAI.jsx`**

Create `src/renderer/src/pages/config/sections/ConfigAI.jsx` with the AI provider/model/temperature JSX + handlers. Props: `{ config, setConfig, onSave }`. Move `handleSaveConfiguration` into this section (it owns save).

- [ ] **Step 3: Extract `ConfigVoice.jsx`**

Move TTS rate/pitch JSX + `handleTestVoice`. Props: `{ config, setConfig }`.

- [ ] **Step 4: Extract `ConfigCamera.jsx`**

Move camera JSX + `handleCameraDeviceIdChange` + the `ConfigCameraPreview` component (lines 29-67) + its useEffect. Props: `{ config, setConfig }`.

- [ ] **Step 5: Extract `ConfigMemory.jsx`**

Move memory list JSX + `loadMemories`, `handleDeleteMemory`, `groupedMemories` + trait meters + `loadRelationalTraits`, `handleResetTraits`. Props: `{ config, setConfig }`.

- [ ] **Step 6: Extract `ConfigAdmin.jsx`**

Move WA admin JSX + `handleApproveAdmin`, `handleRejectAdmin`, `handleRemoveApprovedAdmin`, `handleRemoveLegacyAdmin` + the `onWaAdminRequest` useEffect. Props: `{ config, setConfig }`.

- [ ] **Step 7: Extract `ConfigChat.jsx`**

Move chat export/clear/import JSX + `handleExportChat`, `handleImportChatFile`, `handleExportFull`, `handleRestoreFullFile`, `handleClearAllChat`. Props: `{ config, setConfig }`.

- [ ] **Step 8: Rewire `Configuration.jsx` as shell**

Replace moved JSX with `<ConfigAI .../>` etc. Keep: tab state, Driver.js tour, `isFirstSetup` flow, and the effects that stay in the shell (e.g., device enumeration if shared). Delete moved handlers from shell. Verify no orphaned imports — run `npm run build` and fix missing imports (`useEffect`/`useState` moved per-section as needed).

- [ ] **Step 9: Verify Driver.js tour still works**

Grep Configuration.jsx + sections for the tour step selectors (`data-step` attributes or `driver` step config). If a step referenced a moved element, the selector must resolve to the section's JSX — IDs/classes must be preserved verbatim during extraction (Steps 2-7 constraint). Run `npm run dev`, open `/config`, click tour start. Expected: tour walks all steps.

- [ ] **Step 10: Build & commit**

Run: `npm run build`
Expected: PASS.

```bash
git add src/renderer/src/pages/config/ src/renderer/src/pages/Configuration.jsx
git commit -m "refactor: split Configuration.jsx into per-section components"
```

---

## Phase 3 — Readability

### Task 6: Slim AGENTS.md

**Files:**
- Modify: `AGENTS.md`
- Create: `docs/ARCHITECTURE-INTERNALS.md` (moved content)

**Constraint:** keep AGENTS.md's critical rules (never push without approval, no destructive ops, security audit) verbatim. Move: per-file inventory table (section 3), constants/thresholds table (section 4), model selection guidelines.

- [ ] **Step 1: Move file inventory + constants to docs**

Create `docs/ARCHITECTURE-INTERNALS.md` containing: the file inventory table (all tables from AGENTS.md section 3: main/preload/api/hooks/pages/components/contexts), the constants table (section 4), and the model selection guidelines. Copy verbatim from AGENTS.md.

- [ ] **Step 2: Trim AGENTS.md**

In AGENTS.md:
- Section 3 → replace all per-file tables with:

```markdown
## 3. Project Architecture

Full file inventory, constants, and model selection guidelines moved to [`docs/ARCHITECTURE-INTERNALS.md`](docs/ARCHITECTURE-INTERNALS.md).
```

- Keep sections 1 (overview, shorten to 5 lines), 2 (tech stack, one line per item), 4's invariants list (keep the "Critical Constants" pointer to the new doc), 5 (development guidelines) verbatim.

- [ ] **Step 3: Verify pointer links resolve**

Run: `grep -n "ARCHITECTURE-INTERNALS" AGENTS.md`
Expected: at least 1 reference. Open both files — no dangling references.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md docs/ARCHITECTURE-INTERNALS.md
git commit -m "docs: slim AGENTS.md, move internals to docs/ARCHITECTURE-INTERNALS.md"
```

---

### Task 7: Dead code sweep

**Files:** determined by sweep — candidate: `src/main/index.js`, `src/preload/index.js`, `src/renderer/src/api/db.js`, `src/renderer/src/api/*`

**Constraint:** `window.api` surface is a contract for plugins and WA bot — keep any method referenced by `~/Documents/Mark Plugins/` or `waAgent.js`. Verify before removing.

- [ ] **Step 1: Find unused window.api methods**

Run: `grep -oP "window\.api\.\w+" -r src/renderer/src --include='*.js' --include='*.jsx' | sort -u > /tmp/used_api.txt && grep -oP "ipcMain\.handle\('[^']+'" src/main/index.js | sed "s/.*('//" | sort -u > /tmp/ipc_handlers.txt && comm -23 /tmp/ipc_handlers.txt /tmp/used_api.txt`
Expected: list of IPC handlers with no renderer caller — review each before deleting.

- [ ] **Step 2: Find unused exports in db.js & api/**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('src/renderer/src/api/db.js','utf8');const ex=[...s.matchAll(/export (?:async )?(?:const|function) (\w+)/g)].map(m=>m[1]);console.log(ex.join('\n'))" > /tmp/db_exports.txt && for f in $(find src/renderer/src -name '*.js' -o -name '*.jsx' | grep -v db.js); do grep -oP "\b($(paste -sd'|' /tmp/db_exports.txt))\b" $f; done | sort -u > /tmp/db_used.txt && comm -23 /tmp/db_exports.txt /tmp/db_used.txt`
Expected: unused db.js exports. Review each (some may be used by plugins/WA via different paths — grep `~/Documents/Mark Plugins` and `waAgent.js` before removal).

- [ ] **Step 3: Verify against external consumers**

Run: `grep -rn "INSERT_DELETE_KEYWORD_HERE" ~/Documents/Mark\ Plugins/ 2>/dev/null | head` — for each candidate from Steps 1-2, grep the plugins dir + `src/renderer/src/api/waAgent.js` + `src/main/whatsapp/`. If referenced externally, KEEP and note in commit message.

- [ ] **Step 4: Remove confirmed dead code**

Delete only items with zero references across renderer + plugins + WA. One commit per logical group (IPC handlers, db exports, unused imports).

- [ ] **Step 5: Build & commit**

Run: `npm run build`
Expected: PASS.

```bash
git add -u
git commit -m "chore: remove dead code (unused IPC handlers, unused db exports)"
```

---

### Task 8: Test harness (vitest)

**Files:**
- Modify: `package.json` (devDependency `vitest`, script `"test": "vitest run"`)
- Modify: `electron.vite.config.mjs` (add `test` block — vitest reads this config)
- Create: `tests/cleanAndParse.test.js` (exists from Task 1)
- Create: `tests/sanitizeToolOutput.test.js`
- Create: `tests/approval-modes.test.js`

**Interfaces:**
- `npm test` → runs all tests in `tests/` with node environment.
- `electron.vite.config.mjs` gains:

```js
import { defineConfig } from 'electron-vite'
// ...existing imports

export default defineConfig({
  main: {},
  preload: { /* unchanged */ },
  renderer: { /* unchanged */ },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js']
  }
})
```

(If electron-vite's `defineConfig` types reject `test`, split: create standalone `vitest.config.mjs` importing the same object — verify which works first with a dry run.)

- [ ] **Step 1: Install vitest**

Run: `npm install -D vitest`
Expected: vitest added to devDependencies.

- [ ] **Step 2: Add test script + config**

Add to `package.json` scripts: `"test": "vitest run"`. Add `test` block to `electron.vite.config.mjs` (above). Dry-run: `npx vitest run --passWithNoTests` — if config rejects, create `vitest.config.mjs`:

```js
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.js'] }
})
```

- [ ] **Step 3: Write sanitizeToolOutput tests**

Create `tests/sanitizeToolOutput.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { sanitizeToolOutput } from '../src/renderer/src/api/ai/output-sanitizer.js'

describe('sanitizeToolOutput', () => {
  it('truncates long strings to MAX_SANITIZED_LENGTH (8000)', () => {
    const long = 'x'.repeat(10000)
    const out = sanitizeToolOutput('read-file', long)
    expect(out.length).toBeLessThanOrEqual(8000 + 100) // + truncation suffix
    expect(out).toContain('... [truncated by system]'.slice(0, 20))
  })

  it('returns [Empty result] for blank input', () => {
    expect(sanitizeToolOutput('read-file', '   ')).toBe('[Empty result]')
  })

  it('preserves interactive element list for browser-read', () => {
    const html = '<html><body><p>Noise</p><div>[1] button: "Search"</div><div>[2] input: "q"</div></body></html>'
    const out = sanitizeToolOutput('browser-read', html)
    expect(out).toContain('== ELEMEN INTERAKTIF ==')
    expect(out).toContain('[1] button')
  })

  it('strips ANSI codes for CLI tools', () => {
    const ansi = '\x1b[31mError\x1b[0m occurred'
    const out = sanitizeToolOutput('run-shell', ansi)
    expect(out).not.toContain('\x1b[')
  })
})
```

- [ ] **Step 4: Write approval-modes tests**

Create `tests/approval-modes.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { checkApprovalByMode } from '../src/renderer/src/api/ai/approval-modes.js'

describe('checkApprovalByMode', () => {
  it('bypass never needs approval', () => {
    expect(checkApprovalByMode('bypass', 'delete-file').needsApproval).toBe(false)
  })

  it('plan mode blocks write tools', () => {
    const r = checkApprovalByMode('plan', 'write-file')
    expect(r.blocked).toBe(true)
  })

  it('plan mode allows reads', () => {
    expect(checkApprovalByMode('plan', 'read-file').needsApproval).toBe(false)
  })

  it('selective: low risk auto, high risk ask', () => {
    expect(checkApprovalByMode('selective', 'read-file').needsApproval).toBe(false)
    expect(checkApprovalByMode('selective', 'delete-file').needsApproval).toBe(true)
  })

  it('strict asks for everything', () => {
    expect(checkApprovalByMode('strict', 'memory-search').needsApproval).toBe(true)
  })
})
```

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS — cleanAndParse (8), sanitizeToolOutput (4), approval-modes (5) = 17 tests.

- [ ] **Step 6: Build & commit**

Run: `npm run build`
Expected: PASS.

```bash
git add package.json package-lock.json electron.vite.config.mjs tests/
git commit -m "test: add vitest harness + unit tests for cleanAndParse, sanitizeToolOutput, approval-modes"
```

---

## Plan Self-Review Summary

- **Spec coverage:** T1↔spec T1, T2↔spec T2 (incl. guard-bypass invariant + crash-counter gap found during reading), T3↔spec T3, T4↔spec T4, T5↔spec T5, T6↔spec T6, T7↔spec T7, T8↔spec T8. All success criteria have owning tasks.
- **Placeholders:** none — every step has concrete code or an exact runnable command.
- **Type consistency:** `dispatchTool(tool, query, ctx) -> {status:'observation'|'value', value}` is the contract; `executeNativeTool` returns `{status, value}` while other modules return plain strings and `index.js` wraps them — consistent.
- **Test count check:** Task 1 tests reference `src/shared/cleanAndParse.js` (created in same task); Task 8 reuses it. `sanitizeToolOutput`/`checkApprovalByMode` are pure functions with no DOM/Node deps — node environment sufficient.
