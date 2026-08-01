# Architecture Hardening — Tool Output Sanitizer, Fallback Serialization, Guard Gates

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add 3-layer architectural protection so the agent can safely run on heterogeneous LLMs (including models without reliable JSON mode), without crashing on malformed tool output or parser failures.

**Architecture:** Insert a **pre-processing pipeline** between tool execution output and LLM input (`ToolOutputSanitizer`), a **fallback serialization layer** when the LLM fails to produce valid JSON (`FallbackSerializer`), and **guard gates** at critical chokepoints to catch errors before they propagate (circuit breaker, pre-flight validation, degraded-mode fallback). All 3 layers are optional/pluggable — zero-touch on existing flow unless enabled.

**Tech Stack:** Vanilla JS (renderer process). No new dependencies beyond what exists (`jsonrepair` already present). All new code in `src/renderer/src/api/ai/` and `src/renderer/src/hooks/agent/`.

**Files likely touched:**
- `src/renderer/src/api/ai/core.js` (add sanitize/guard exports)
- `src/renderer/src/api/ai/planning.js` (integrate sanitizer + fallback + guard)
- `src/renderer/src/hooks/agent/useMarkPlan.js` (integrate guard gates in tool loop)
- `src/renderer/src/api/ai/tools.js` (optionally pre-sanitize youtube transcript chunks)
- `src/renderer/src/api/ai/guard-gate.js` (NEW — guard gate logic)
- `src/renderer/src/api/ai/output-sanitizer.js` (NEW — tool output sanitizer)
- `src/renderer/src/api/ai/fallback-serializer.js` (NEW — fallback serialization)

---

### Task 1: Create `output-sanitizer.js` — Tool Output Pre-Processor

**Objective:** Normalize raw tool outputs (DOM HTML, JSON blobs, CLI stdout/stderr) into concise, predictable Markdown text that small LLMs can digest.

**File:** Create `src/renderer/src/api/ai/output-sanitizer.js`

**Exports:**
- `sanitizeToolOutput(toolName, rawResult)` → string
- Truncation guard: cap at `MAX_SANITIZED_LENGTH = 8000` chars with `...[truncated]` suffix

**Sanitization rules per tool type:**

| Tool | Rule |
|------|------|
| `browser-navigate`, `browser-read`, `browser-click`, `browser-type`, `browser-scroll` | Strip full HTML/DOM noise. Extract only: page title, visible text content, interactive element list (preserve numbered IDs). Remove `<script>`, `<style>`, massive `innerText` if >6K chars. |
| `run-shell`, `run-cli` | Keep stdout + stderr. Strip ANSI escape codes (`\x1b\[...m`). Cap at 4K chars. Append `...[exit code: N]`. |
| `read-file` | Cap at 6K chars. If truncated, append `...[file truncated at 6K chars]`. |
| `memory-search` | Preserve full result (typically small). |
| `browser-ask-user`, `speak`, `native-notify` | Pass through unchanged. |
| `camera-look`, `analyze-screen` | Pass through unchanged (already textual). |
| Default (plugin/unknown) | JSON.stringify if object, else string. Cap at 4K. |

**Code:**

```js
// src/renderer/src/api/ai/output-sanitizer.js
const MAX_SANITIZED_LENGTH = 8000
const BROWSER_TOOLS = ['browser-navigate', 'browser-read', 'browser-click', 'browser-type', 'browser-scroll']
const CLI_TOOLS = ['run-shell', 'run-cli']

function stripAnsi(str) {
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
}

function stripHtmlTags(str) {
  return str.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#\d+;/g, '')
            .replace(/\s+/g, ' ')
            .trim()
}

function truncate(str, limit) {
  if (!str || str.length <= limit) return str || ''
  return str.substring(0, limit) + '\n...[truncated by system]'
}

export function sanitizeToolOutput(tool, raw) {
  let text = ''
  if (typeof raw === 'string') text = raw
  else if (raw && typeof raw === 'object') text = JSON.stringify(raw, null, 2)
  else text = String(raw || '')

  if (!text.trim()) return '[Empty result]'

  if (BROWSER_TOOLS.includes(tool)) {
    // Preserve interactive elements list (numbered IDs), drop raw HTML noise
    // [ID] lines are critical for browser-click; keep them intact
    const interactivePattern = /(\[[0-9]+\]\s+\S+:\s*"[^"]*")/g
    const interactiveMatches = text.match(interactivePattern)
    const interactiveBlock = interactiveMatches
      ? '\n\n== ELEMEN INTERAKTIF ==\n' + interactiveMatches.join('\n')
      : ''

    // Extract visible page text (after HTML stripping)
    let visibleText = stripHtmlTags(text).substring(0, 4000)

    // Extract page title
    const titleMatch = text.match(/\[Title\]:\s*(.+)/) || text.match(/<title>([^<]+)<\/title>/i)
    const title = titleMatch ? `Title: ${titleMatch[1].trim()}` : ''

    return truncate([title, visibleText, interactiveBlock].filter(Boolean).join('\n'), MAX_SANITIZED_LENGTH)
  }

  if (CLI_TOOLS.includes(tool)) {
    text = stripAnsi(text)
    // Extract exit code if present
    const exitMatch = text.match(/exit code:?\s*(\d+)/i)
    const exitSuffix = exitMatch ? ` [exit code: ${exitMatch[1]}]` : ''
    text = text.replace(/exit code:?\s*\d+/gi, '').trim()
    return truncate(text, 4000) + exitSuffix
  }

  if (tool === 'read-file') {
    return truncate(text, 6000)
  }

  // Default: pass through with truncation
  return truncate(text, MAX_SANITIZED_LENGTH)
}
```

**Step 1:** Create file with above code.

**Step 2:** Verify syntax: `node -c src/renderer/src/api/ai/output-sanitizer.js`

**Step 3:** Commit: `git add src/renderer/src/api/ai/output-sanitizer.js && git commit -m "feat: add ToolOutputSanitizer — normalize raw tool outputs before LLM injection"`

---

### Task 2: Create `fallback-serializer.js` — JSON Output Fallback

**Objective:** When a model fails to produce valid JSON (the primary source of errors in the log), provide an XML-tag serialization strategy as alternative. Models that can't do reliable JSON can often produce `<thought>...</thought><action>...</action>` blocks correctly.

**File:** Create `src/renderer/src/api/ai/fallback-serializer.js`

**Exports:**
- `parseFallbackFormat(rawText)` → object `{ thought, action, answer, mood, active_topic, memory }` or null
- `FALLBACK_PROMPT_SUFFIX` — appended to system prompt when JSON mode is disabled

**Strategy:**
1. Try standard `cleanAndParse` first (existing, in `core.js`)
2. If null, try XML-tag pattern extraction
3. If still null, try line-based heuristic (first `answer:` line, etc.)

**Supported formats by priority:**
1. JSON (via existing `cleanAndParse`)
2. XML tags: `<thought>...</thought>`, `<action tool="..." query="..."/>`, `<answer>...</answer>`, `<mood>...</mood>`
3. Markdown code block with JSON: `\`\`\`json\n{...}\n\`\`\``
4. Simple key-value lines: `thought: ...`, `action: null`, `answer: ...`

**Code:**

```js
// src/renderer/src/api/ai/fallback-serializer.js
import { cleanAndParse } from './core'

export const FALLBACK_PROMPT_SUFFIX = `
# FORMAT OUTPUT (ALTERNATIF — XML TAGS)
Jika kamu TIDAK BISA menghasilkan JSON yang valid, gunakan format XML tags berikut:
<thought>Alasan logika keputusanmu</thought>
<action tool="nama-tool" query="parameter"> atau <action></action> (kosong jika tidak perlu tool)
<answer>Jawaban untuk user</answer> atau <answer></answer>
<mood>neutral</mood>
<active_topic>Topik pembicaraan</active_topic>
<memory type="notes">...</memory> atau <memory></memory>

PENTING: Pilih SALAH SATU — JSON ATAU XML. Jangan campur keduanya.
`

function extractBetween(text, openTag, closeTag) {
  const escapedOpen = openTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedClose = closeTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`${escapedOpen}([\\s\\S]*?)${escapedClose}`, 'i')
  const match = text.match(regex)
  return match ? match[1].trim() : null
}

function parseXml(text) {
  const thought = extractBetween(text, '<thought>', '</thought>')
  const answer = extractBetween(text, '<answer>', '</answer>')
  const mood = extractBetween(text, '<mood>', '</mood>')
  const topic = extractBetween(text, '<active_topic>', '</active_topic>')

  // Parse <action tool="..." query="..."> or <action></action>
  let action = null
  const actionMatch = text.match(/<action\s+(?:tool="([^"]*)"\s+query="([^"]*)")\s*\/?>/i)
  if (actionMatch) {
    action = { tool: actionMatch[1], query: actionMatch[2] }
  }

  // Parse <memory> block
  let memory = null
  const memTag = text.match(/<memory(?:\s+type="([^"]*)")?>([\s\S]*?)<\/memory>/i)
  if (memTag) {
    memory = {
      type: memTag[1] || 'notes',
      memory: memTag[2].trim(),
      action: 'insert'
    }
  }

  if (!thought && !action && !answer) return null // no valid content found

  return {
    thought: thought || '',
    action,
    answer: answer || null,
    mood: mood || 'neutral',
    active_topic: topic || '',
    memory: memory || null
  }
}

function parseKeyValue(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const result = {}
  for (const line of lines) {
    const sep = line.indexOf(':')
    if (sep === -1) continue
    const key = line.substring(0, sep).trim().toLowerCase()
    const val = line.substring(sep + 1).trim()
    if (['thought', 'answer', 'mood', 'active_topic'].includes(key)) {
      result[key] = val === 'null' ? null : val
    } else if (key === 'action') {
      result.action = val === 'null' ? null : { tool: val }
    }
  }
  return result.thought || result.answer ? result : null
}

export function parseFallbackFormat(rawText) {
  if (!rawText || typeof rawText !== 'string') return null

  // Strategy 1: JSON (existing)
  const jsonResult = cleanAndParse(rawText)
  if (jsonResult) return jsonResult

  // Strategy 2: XML tags
  const xmlResult = parseXml(rawText)
  if (xmlResult) return xmlResult

  // Strategy 3: Key-value lines
  const kvResult = parseKeyValue(rawText)
  if (kvResult) return kvResult

  return null
}
```

**Step 1:** Create file with above code.

**Step 2:** Verify syntax: `node -c src/renderer/src/api/ai/fallback-serializer.js`

**Step 3:** Commit.

---

### Task 3: Create `guard-gate.js` — Pre-Flight Checks & Circuit Breaker

**Objective:** Before each tool execution and before each LLM call, run guard checks to prevent cascading failures. Implement a circuit breaker that after N consecutive failures falls back to degraded mode (simpler prompt, no browser, local knowledge only).

**File:** Create `src/renderer/src/api/ai/guard-gate.js`

**Exports:**
- `GUARD_CONFIG` — defaults object
- `createGuardGate()` → `{ preFlightCheck, postFlightCheck, shouldDegrade, getStatus, reset }`

**Guard types:**
1. **Pre-flight (tool):** Validate tool name is known, query is non-empty string, check circuit breaker state
2. **Post-flight (tool):** If tool returned `[ERROR]`, increment consecutive failure counter; if >3, trip circuit breaker
3. **Pre-flight (LLM):** If circuit is OPEN, append degraded-mode suffix to system prompt (disable browser tools, force JSON-simple schema)
4. **Timeout watchdog:** If any single tool execution exceeds 60s, auto-trip the breaker

**Circuit breaker states:** CLOSED (normal) → OPEN (degraded, N failures > threshold) → HALF_OPEN (auto-recover after T time)

**Code:**

```js
// src/renderer/src/api/ai/guard-gate.js
const STATE = { CLOSED: 'closed', OPEN: 'open', HALF_OPEN: 'half_open' }

const DEFAULTS = {
  failureThreshold: 3,        // consecutive failures before OPEN
  recoveryTimeout: 60000,     // ms before HALF_OPEN → CLOSED attempt
  toolTimeout: 60000,         // ms per tool
  maxTrimmedLength: 12000     // max input length before truncation warning
}

export function createGuardGate(config = {}) {
  const cfg = { ...DEFAULTS, ...config }
  let state = STATE.CLOSED
  let failureCount = 0
  let lastFailureTime = 0
  let consecutiveToolTimeouts = 0

  function getStatus() {
    return { state, failureCount, consecutiveToolTimeouts }
  }

  function reset() {
    state = STATE.CLOSED
    failureCount = 0
    consecutiveToolTimeouts = 0
  }

  function trip() {
    state = STATE.OPEN
    lastFailureTime = Date.now()
  }

  function preFlightCheck(tool, query) {
    // Check circuit breaker
    if (state === STATE.OPEN) {
      const elapsed = Date.now() - lastFailureTime
      if (elapsed > cfg.recoveryTimeout) {
        state = STATE.HALF_OPEN
        failureCount = 0  // tentative reset
      } else {
        return { allowed: false, degrade: true, reason: `Circuit breaker OPEN (${Math.round(elapsed / 1000)}s since trip)` }
      }
    }

    if (state === STATE.HALF_OPEN) {
      // Allow one request through to test recovery
      state = STATE.CLOSED
      failureCount = 0
    }

    // Validate tool name
    if (!tool || typeof tool !== 'string') {
      return { allowed: false, degrade: false, reason: `Invalid tool name: ${tool}` }
    }

    // Validate query
    if (typeof query !== 'string' || query.trim().length === 0) {
      return { allowed: false, degrade: false, reason: `Empty query for tool ${tool}` }
    }

    return { allowed: true, degrade: false, reason: null }
  }

  function postFlightCheck(tool, resultString, durationMs) {
    const isError = resultString && (resultString.startsWith('[ERROR]') || resultString.startsWith('[DITOLAK]'))
    const isTimeout = durationMs > cfg.toolTimeout

    if (isTimeout) consecutiveToolTimeouts++
    else consecutiveToolTimeouts = Math.max(0, consecutiveToolTimeouts - 1)

    if (isError || isTimeout) {
      failureCount++
      if (failureCount >= cfg.failureThreshold) trip()
    } else {
      // Success resets counter gradually
      failureCount = Math.max(0, failureCount - 1)
    }

    return { failureCount, isDegraded: state !== STATE.CLOSED }
  }

  return { preFlightCheck, postFlightCheck, getStatus, reset, getConfig: () => cfg }
}
```

**Step 1:** Create file with above code.

**Step 2:** Verify syntax.

**Step 3:** Commit.

---

### Task 4: Integrate Output Sanitizer into `useMarkPlan.js` tool loop

**Objective:** Replace direct `resultString` injection into `[OBSERVATION]` with sanitized output.

**File:** Modify `src/renderer/src/hooks/agent/useMarkPlan.js`

**Change points:**

1. Import `sanitizeToolOutput` at top:
```js
import { sanitizeToolOutput } from '../../api/ai/output-sanitizer'
```

2. In the "Feed observation back to AI" section (currently around line 661–671), replace:
```js
content: `[OBSERVATION] Hasil eksekusi tool "${tool}": ${resultString}`
```
with:
```js
const sanitized = sanitizeToolOutput(tool, resultString)
content: `[OBSERVATION] Hasil eksekusi tool "${tool}": ${sanitized}`
```

3. In the approval-denied path (line 601), same replacement.

**Verification:** The UI should show the same agent behavior. The difference is internal: small models receive cleaner, shorter observation text.

**Step 1:** Apply both edits.

**Step 2:** Run `npm run build` to verify no import issues.

**Step 3:** Commit.

---

### Task 5: Integrate Fallback Serializer into `planning.js` `getNextAction`

**Objective:** After `cleanAndParse` fails, use `parseFallbackFormat` instead of immediately retrying with the same JSON format. This breaks the retry death spiral seen in the log (model produces non-JSON → parse fails → retry → same model produces same non-JSON → death).

**File:** Modify `src/renderer/src/api/ai/planning.js`

**Change points:**

1. Import parseFallbackFormat:
```js
import { parseFallbackFormat } from './fallback-serializer'
```

2. In `getNextAction`, around line 513–516, replace:
```js
const data = cleanAndParse(response.content)
```
with:
```js
const data = parseFallbackFormat(response.content)
```

3. When retrying (Attempt 2+), append the `FALLBACK_PROMPT_SUFFIX` to the system prompt if the model seems to struggle:
```js
if (attempts > 0 && !messages[0].content.includes('ALTERNATIF')) {
  messages[0].content += `\n\n${FALLBACK_PROMPT_SUFFIX}`
}
```

This single change prevents the infinite retry loop: if the model can't produce JSON, it gets told to use XML tags instead, and `parseFallbackFormat` can parse that.

**Step 1:** Apply imports + parse function swap.

**Step 2:** Add fallback prompt append logic.

**Step 3:** Commit.

---

### Task 6: Integrate Guard Gate into `useMarkPlan.js` main loop

**Objective:** Wrap the tool execution and LLM call with guard gates to prevent cascading failures.

**File:** Modify `src/renderer/src/hooks/agent/useMarkPlan.js`

**Change points:**

1. Import at top:
```js
import { createGuardGate } from '../../api/ai/guard-gate'
```

2. Create guard instance once (outside component or in a ref):
```js
// Outside component or useRef()
const guardRef = useRef(null)
if (!guardRef.current) guardRef.current = createGuardGate()
const guard = guardRef.current
```

3. Before tool execution (around line 564–582), wrap with:
```js
const check = guard.preFlightCheck(tool, query)
if (!check.allowed) {
  if (check.degrade) {
    // Degraded mode — skip browser tools, use simpler prompt
    options.disableTools = true
    resultString = `[DEGRADED] ${check.reason}`
  } else {
    resultString = `[ERROR] Guard rejected: ${check.reason}`
  }
  // push to loopMessages and continue
}
```

4. After tool execution, call `guard.postFlightCheck`:
```js
const duration = Date.now() - toolStartTime
guard.postFlightCheck(tool, resultString, duration)
```

5. Before LLM call (before `getNextAction`), if guard status is degraded, pass option:
```js
if (guard.getStatus().state === 'open') {
  options.degradedMode = true
}
```

6. In `planning.js`, when `options.degradedMode` is set, append a degraded-mode system prompt suffix that disables browser tools and forces simpler schema:
```js
if (options.degradedMode) {
  systemPrompt += '\n\n# DEGRADED MODE AKTIF\nBrowser tools dinonaktifkan. Hanya gunakan memory/coding/file tools. Output HARUS JSON atau XML tag.'
}
```

**Step 1:** Apply all guard gate changes.

**Step 2:** Run `npm run build`.

**Step 3:** Commit.

---

### Task 7: Pre-Sanitize Raw DOM in `browser-navigate` native side (optional, if main process controls tool output)

**Objective:** If `browser-navigate` returns raw DOM HTML that is too large, trim it at the source (main process) before sending to renderer. This prevents oversized IPC payloads.

**File:** Check `src/main/native-tools.js` (or wherever `browser-navigate` handler lives).

**Change points:** Add a 50K HTML truncation with intelligent cut (at a safe tag boundary). This is optional — the sanitizer in Task 1 already caps at 8K. But if IPC payload >100K causes lag, trim earlier.

Skip this task if `native-tools.js` already returns reasonable-size data.

**Step 1:** Investigate actual output size of `browser-navigate` in logs.

**Step 2:** If >50K, add HTML truncation. If not, skip.

**Step 3:** Commit or skip.

---

### Verification

1. Start the app, run a simple "cari harga x di tokped" command. Verify agent still navigates and returns results.
2. Run the Level Hard workflow from the log (Smart Multi-Vendor Coupon). Verify it doesn't hit JSON parse death spiral.
3. Simulate failure: inject a wrong model config. Verify guard gate trips and agent enters degraded mode with clear messaging.
4. `npm run build` — must pass without errors.

---

### Risks & Tradeoffs

| Risk | Mitigation |
|------|------------|
| Sanitizer strips too much info, agent loses context | Conservative defaults (preserve interactive element IDs, page title); easy to tune per tool |
| Fallback parser misinterprets XML content as real values | Returns null on ambiguous cases, falls through to retry |
| Guard gate trips too easily on transient errors | Failure threshold at 3 consecutive, HALF_OPEN recovery after 60s |
| New .js file imports not resolved in Electron/Vite | Already use ES module imports; build step verifies |

### Open Questions

- Should guard gate persist state across sessions? (Currently no — resets on app restart)
- Should degraded mode disable Vision/AI camera tools too? (Currently only browser tools)
