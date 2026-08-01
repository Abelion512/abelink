# MARK Agent Fork — Research Reference Map

> **Goal:** Mapping every Linux adaptation & improvement in mark-agent-fork to external references (repos, blogs, journals, docs, specs).
>
> **Project:** [Mazees/mark-agent](https://github.com/Mazees/mark-agent) → Abelion/mark-agent-fork (Linux-only)
> **Path:** `/media/abelion/Isaf/ican/project/AGENT/mark-agent-fork/`

---


# P0: ATM Hermes Agent Official (Primary Reference)

| Source | Link | Coverage |
|--------|------|----------|
| Hermes Agent Docs | `hermes-agent.nousresearch.com/docs` | Skills system, profiles, MCP native client, cron, gateway config, security hardening — source of truth for agentic patterns |
| Hermes Agent (GitHub) | `github.com/NousResearch/hermes-agent` | Reference implementation: skills_tool.py (progressive disclosure), orchestrator-worker, SOUL.md ego system |
| Hermes Skills System | `/docs/user-guide/features/skills` | SKILL.md format, progressive disclosure L0→L2, bundles, blueprint cron |
| Hermes CEO → Codex CTO | `github.com/pawel-cell/Hermes-CEO` | Orchestrator-worker playbook: handoff files, delegation loop, parallel worktrees |
| Hermes Agent Skills Guide | `/docs/guides/work-with-skills` | skills_list → skill_view → file_path pattern, token-efficient loading |

**ATM Pattern:** The entire mark-agent-fork `agent-skills-loader.js` (YAML frontmatter, lazy load via IPC) is directly adapted from Hermes progressive disclosure. The `planning.js` RSI section (`run-cli` → Claude Code / Hermes / Z.ai) mirrors Hermes CEO orchestrator pattern.

---

## P0b: Anthropic & Claude Official (ATM Reference)

| Source | Link | Coverage for Mark Agent |
|--------|------|------------------------|
| **Building Effective Agents** (Anthropic blog) | `anthropic.com/engineering/building-effective-agents` | Orchestrator-workers workflow, prompt chaining, routing, evaluator-optimizer, agents vs workflows. Core reference for Mark's planning loop. |
| **Claude Cookbook: Orchestrator-Workers** | `github.com/anthropics/claude-cookbooks/tree/main/patterns/agents` | Canonical impl: orchestrator LLM → worker LLMs → synthesis. Flexible subtask decomposition at runtime. Mark's `getNextAction()` + tool loop mirrors this pattern. |
| **Claude Code — Hooks System** | `code.claude.com/docs/en/hooks-guide` | Deterministic lifecycle hooks: `PreToolUse` (validate), `PostToolUse` (format/lint), `SessionStart` (load context), `Stop` (notify). Mark's `useMarkPlan.js` agent loop uses equivalent manual checks — Claude's hook architecture is a more structured version. |
| **Claude Code — CLAUDE.md / Memory** | `code.claude.com/docs/en/claude-md` | Project-level `CLAUDE.md` + auto memory + path-scoped `.claude/rules/` + custom slash commands. Direct relation: Mark's `agent-skills-loader.js` follows same `SKILL.md` frontmatter pattern. |
| **Claude Code — Sub-agents** | `code.claude.com/docs/en/sub-agents` | Custom subagent definitions with specific system prompts. Mark's `planning.js` already delegates to Claude Code / Hermes / Z.ai via `run-cli`. |
| **Anthropic Tool Use** | `docs.anthropic.com/en/docs/build-with-claude/tool-use/overview` | Parallel tool calls, structured tool definitions, thinking blocks, strict tool use. Mark's `NATIVE_TOOLS` in `native-tools.js` follows the same tool-as-function pattern. |
| **MCP (Model Context Protocol)** | `docs.anthropic.com/en/docs/agents-and-tools/mcp-connector` | Standardized tool discovery/registration protocol. Mark's IPC-based tool system (`native-tool:execute`, `native-tool:needs-approval`) is a simpler version of MCP's tool server concept. |
| **Claude Code — Hooks Reference** | `code.claude.com/docs/en/hooks` | Full event schema: 28+ hook events with JSON I/O format. Reference for what a production-grade agent lifecycle looks like. |

**What's directly applicable to Mark improvement:**

| Claude Feature | Mark Counterpart | ATM Opportunity |
|----------------|-----------------|----------------|
| `PostToolUse` hooks (auto-format) | `useMarkPlan.js` tool dispatch (line 407-500) | Add post-tool validation: auto-parse JSON output, validate against schema before injecting to context |
| `PreToolUse` hooks (block dangerous) | `isDangerousCommand()` in native-tools.js | Deterministic pre-tool guard (not just LLM-dependent) |
| `CLAUDE.md` path-scoped rules | `agent-skills-loader.js` | Add path-based skill activation (`platforms` field, `requires_tools` filter) |
| Sub-agent orchestration | RSI section in planning.js (line 221-246) | Use `.claude/agents/`-style agent definitions for specialized workers (reviewer, tester, security) |
| Structured tool defs (JSON Schema) | `NATIVE_TOOLS` handler functions | Add `input_schema` field to each tool for LLM to generate exact params |
| `SessionStart` hook | `getUnifiedContext()` in useMarkPlan.js (line 148-168) | Deterministic context injection per session type |

---

## 1. Linux Desktop Environment Detection

**Files:** `src/main/awareness/window-tracker.js:26-51`

**Code:** `detectLinuxDesktop()` reads `XDG_SESSION_TYPE`, `XDG_CURRENT_DESKTOP`, `WAYLAND_DISPLAY`.

### References:
| Source | Link | What it provides |
|--------|------|------------------|
| HPR Activity Tracker (DEV blog) | `dev.to/plexescor/...native-wayland-window-tracking...` | **Direct inspiration.** Covers X11 → Wayland fragmentation, per-compositor detection via `$XDG_CURRENT_DESKTOP`, Hyprland `hyprctl activewindow -j`, GNOME DBus, KWin qdbus. |
| Hyprland Discussion #416 | `github.com/hyprwm/Hyprland/discussions/416` | JSON output format for `hyprctl clients -j`: `.workspace.id`, `.at`, `.size`, `.class`. |
| xdotool man page (Arch) | `man.archlinux.org/man/xdotool.1` | `getactivewindow` uses `_NET_ACTIVE_WINDOW` (EWMH standard) — more reliable than `getwindowfocus`. |

---

## 2. xdotool Active Window Tracking (Linux X11)

**Files:** `src/main/awareness/window-tracker.js:56-73`

**Code:** `getLinuxActiveWindow()` → `xdotool getactivewindow getwindowname` + `xdotool getactivewindow getclass`

### References:
| Source | Link | What it provides |
|--------|------|------------------|
| xdotool source (cmd_getactivewindow.c) | `github.com/jordansissel/xdotool/blob/master/cmd_getactivewindow.c` | Uses `_NET_ACTIVE_WINDOW` atom — EWMH spec |
| Unix SE: getactivewindow vs getwindowfocus | `unix.stackexchange.com/questions/707630/...` | Confirms `getactivewindow` returns expected top-level window, not intermediate X window |

---

## 3. MPRIS D-Bus Service (Linux Media Keys)

**Files:** `src/main/mpris-service.js`

**Code:** Full MPRIS 2.1 via `mpris-service` npm. `safeSetProperty()` handles D-Bus stream death.

### References:
| Source | Link | What it provides |
|--------|------|------------------|
| dbusjs/mpris-service | `github.com/dbusjs/mpris-service` | Core npm library — MPRIS 2.1 in pure Node.js |
| MPRIS D-Bus Spec v2.2 | `specifications.freedesktop.org/mpris/latest/` | Official spec: `org.mpris.MediaPlayer2`, `org.mpris.MediaPlayer2.Player`, length in microseconds |
| mpris-service Issue #6 | `github.com/dbusjs/mpris-service/issues/6` | **Electron + D-Bus stream death bug** — `safeSetProperty()` is direct fix for `Cannot send message` after hibernate |
| mpris-service npm | `npmjs.com/package/mpris-service` | API docs: `canGoNext`, `canPause`, `playbackStatus` |

---

## 4. Ad-blockade Engine (@cliqz/adblocker-electron)

**Files:** `src/main/index.js:275-285`

**Code:** `ElectronBlocker.fromPrebuiltAdsAndTracking(fetch)` → dual session blocking.

### References:
| Source | Link | What it provides |
|--------|------|------------------|
| @cliqz/adblocker-electron | `npmjs.com/package/@cliqz/adblocker-electron` | Rust/WASM engine, EasyList-compatible, uBlock Origin filters |
| Ghostery Adblocker (GitHub) | `github.com/ghostery/adblocker` | Docs: `fromPrebuiltAdsOnly`, `fromLists`, serialization caching |

---

## 5. RAF-Batched Thinking Updates (React Performance)

**Files:** `src/renderer/src/hooks/agent/useMarkPlan.js:43-63`

**Code:** `scheduleThinkingUpdate()` / `flushThinkingUpdate()` — rAF replaces setInterval(300ms).

### References:
| Source | Link | What it provides |
|--------|------|------------------|
| ReactUse Blog: useRafFn/useRafState | `reactuse.com/blog/react-timer-hooks/` | Why rAF > setInterval: syncs to paint, auto-pause on bg tab, no drift |
| Streaming Backends & React (SitePoint) | `sitepoint.com/streaming-backends-react-controlling-re-render-chaos/` | **Benchmark:** RAF batching → renders drop from 30/s → 16/s, commit time 18ms → 3ms |
| Tokens w/o Layout Thrash | `anmshpndy.com/cases/streaming-tokens-ui-buffer/` | `if (!rafId)` guard — only one rAF queued regardless of arrival rate |
| Animating React w/o Render Loop | `dev.to/childrentime/animating-react-without-fighting-the-render-loop...` | cancelAnimationFrame on unmount pattern |

---

## 6. AI Provider Routing: Custom/9Router Endpoint

**Files:** `src/main/ai-bridge.js:86-97`, `ai-bridge.js:335-357`

**Code:** Custom provider endpoint + JSON extraction from router garbage (`extractJSON` brace balancer).

### References:
| Source | Link | What it provides |
|--------|------|------------------|
| 9Router Official | `9router.com` | Smart 3-tier router: Subscription → Cheap → Free. RTK token saver (-40%). Format translation. |
| 9Router GitHub | `github.com/decolua/9router` | RTK compression, multi-account, 40+ providers |
| LLM Gateway: Custom Providers | `docs.llmgateway.io/features/custom-providers` | OpenAI-compatible pattern: endpoint + Bearer auth + model routing |
| AI SDK Custom Provider | `ai-sdk.dev/v7/providers/openai-compatible-providers/custom-providers` | Official pattern for wrapping non-OpenAI APIs in OpenAI format |

---

## 7. JSON Schema Fallback Chain

**Files:** `src/main/ai-bridge.js:181-240`, `ai-bridge.js:370-398`

**Code:** 3-tier: `json_schema` → `json_object` → unconstrained.

### References:
| Source | Link | What it provides |
|--------|------|------------------|
| OpenAI Structured Outputs | `developers.openai.com/api/docs/guides/structured-outputs` | `json_schema` vs `json_object` — `additionalProperties: false` required |
| Requesty: 244 Models Tested | `requesty.ai/blog/structured-outputs-across-llm-providers...` | **Validates fallback chain:** DeepSeek → "unavailable" for json_schema. Groq → json_object only. Cerebras → json_object only. |
| LLM Schema Validator | `github.com/ashwinpaulallen/llm-schema-validator` | `createCustomProvider` pattern for non-OpenAI backends |

---

## 8. Cache-Aside Pattern with Dedup

**Files:** `src/renderer/src/api/ai/planning.js:7-25`

**Code:** `_configCache` + `_configCachePromise` → concurrent dedup + `config-updated` invalidation.

### References:
| Source | Link | What it provides |
|--------|------|------------------|
| Redis Cache-Aside Node.js | `redis.io/docs/latest/develop/use-cases/cache-aside/nodejs/` | Definitive pattern: check → miss → fetch → store → return |
| Azure Cache-Aside | `learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside` | Invalidate on write, don't update in place |
| Promise Memoization | `jonmellman.com/posts/promise-memoization/` | **Why `_configCachePromise`:** cache promise not result → stampede protection |

---

## 9. Agent Skills Loader (Hermes-Style)

**Files:** `src/main/agent-skills-loader.js`

**Code:** Scan `~/.agents/skills/*/SKILL.md` → YAML frontmatter → lazy load via IPC.

### References:
| Source | Link | What it provides |
|--------|------|------------------|
| **Hermes Skills System** | `hermes-agent.nousresearch.com/docs/user-guide/features/skills` | **ATM source.** Progressive disclosure: L0 (name+desc) → L1 (SKILL.md) → L2 (references). Identical architecture. |
| **Hermes Creating Skills** | `hermes-agent.nousresearch.com/docs/developer-guide/creating-skills` | SKILL.md format: `name`, `description`, `version`, `platforms`, `metadata.hermes.tags` |
| **Hermes Work w/ Skills** | `hermes-agent.nousresearch.com/docs/guides/work-with-skills` | skills_list → skill_view(name) → skill_view(name, file_path) pipeline |
| agentskills.io Spec | `agentskills.io/specification` | Open standard: frontmatter, naming rules (max 64 chars, lowercase+hyphens) |

---

## 10. Baileys WhatsApp Multi-Device

**Files:** `src/main/whatsapp/baileys-service.js`, `media-downloader.js`

**Code:** WebSocket-based WA. yt-dlp + ffmpeg cross-platform binary resolution.

### References:
| Source | Link | What it provides |
|--------|------|------------------|
| @whiskeysockets/baileys | `github.com/whiskeysockets/baileys` | Core library: `makeWASocket`, `useMultiFileAuthState`, messages.upsert |
| Baileys Mintlify Docs | `whiskeysockets-baileys-85.mintlify.app/...` | QR pairing, `Browsers.macOS('Desktop')`, `syncFullHistory: true` |
| Baileys Electron Example | `github.com/whatsera/Baileys_electron` | Same architecture: baileys embedded in Electron main process |

---

## 11. Subprocess Safety: Dangerous Command + Safe Env

**Files:** `src/main/native-tools.js:36-55`

**Code:** `safeEnv()` filters env vars to `HOME|PATH|SHELL|DISPLAY|...`. `isDangerousCommand()` blocks `rm -rf`, `dd if=`, `> /dev/sda`.

### References:
| Source | Link | What it provides |
|--------|------|------------------|
| OWASP Agentic Top 10 (2026) | (Hermes SOUL.md OWASP A07) | Max 3 parallel, max 30 iterasi, hard stop 5 failures |
| Electron Security | `electronjs.org/docs/latest/tutorial/security` | Principle of least privilege for subprocesses |

---

## 12. Browser DOM Parser & Automation

**Files:** `src/main/browser-dom-parser.js`, `browser-agent.js`

**Code:** `data-mark-id` injection, user blocker overlay, cursor animation, React controlled input via native value setter + event chain.

### References:
| Source | Link | What it provides |
|--------|------|------------------|
| Electron BrowserWindow API | `electronjs.org/docs/latest/api/browser-window` | `executeJavaScript`, `capturePage`, `loadURL`, event lifecycle |
| React controlled components | (DOM spec) | `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set` — bypass React synthetic events |

---

### 12b. CAPTCHA Solving (NopeCHA Integration)

**Files:** `src/main/native-tools.js:386` (`browser-unblock` tool), `src/main/browser-agent.js:410-494` (user intervention overlay)

**Code:** Saat Mark nemu login/CAPTCHA form, `browser-unblock` pause automation, tunjukkin blocker overlay, tunggu input manual. Skrg **manual-only**.

**ATM Opportunity ⭐:** Ganti manual pause → NopeCHA API call:
1. Detect CAPTCHA iframe/widget di page DOM
2. Call NopeCHA API (Node.js lib) solve
3. Inject token ke page → resume automation
4. Fallback ke manual kalo NopeCHA fail

**Self-hostable:** Deploy sendiri → zero 3rd party dependency.

**References:**
| Source | Link | What it provides |
|--------|------|------------------|
| NopeCHA Repo (10K⭐) | `github.com/NopeCHALLC/nopecha-extension` | Open-source CAPTCHA solver, ML model, Chrome/Firefox ext |
| NopeCHA API | `nopecha.com` | REST API + Node.js/Python SDKs. reCAPTCHA v2/v3, hCaptcha, Turnstile, GeeTest, FunCAPTCHA |
| NopeCHA Node.js | `github.com/NopeCHALLC/nopecha-nodejs` | npm package — direct integration ke Electron main process |
| NopeCHA Intro Article | `www.opensourceprojects.dev/post/nopecha-extension` | Overview: why it's useful, how it works, self-hosting |

---

## 13. YouTube Ad-Blast + Webview Isolation

**Files:** `src/renderer/src/components/YoutubeMusicPlayer.jsx:88-109`, `src/main/index.js:46-58`

**Code:** 2-layer ad-block: network (adblocker) + in-page (16x speed, mute, skip button click). Referer/Origin spoof to `localhost`.

### References:
| Source | Link | What it provides |
|--------|------|------------------|
| @cliqz/adblocker-electron | Same as #4 | Network-layer blocking |
| Chrome Autoplay Policy | `developer.chrome.com/blog/autoplay/` | `no-user-gesture-required` for webview playback |

---

## 14. RSI (Recursive Self Improvement) / Coding Tool Orchestration

**Files:** `src/renderer/src/api/ai/planning.js:221-246`

**Code:** `run-cli` → Claude Code / Z.ai / Hermes. Git, build, test. Error → save as "learn" memory.

### References:
| Source | Link | What it provides |
|--------|------|------------------|
| **Hermes → Claude Code Skill** | `hermes-agent.nousresearch.com/docs/...claude-code` | **ATM source.** Hermes orchestrator + Claude Code coder. `claude -p "task" --bare` pattern. |
| **Hermes CEO → Codex CTO** | `github.com/pawel-cell/Hermes-CEO` | Handoff docs: `.agents/CTO_HANDOFF.md` out, `.agents/last_report.md` back |
| Dual-Stack Hermes+Claude | `wowhow.cloud/blogs/hermes-claude-code-dual-stack-orchestrator-coder-architecture-2026` | 6 production patterns: TG→Hermes→Codex, Cron→Hermes→Codex |

---

## 15. Electron GPU Crash Prevention (Linux)

**Files:** `src/main/index.js:29-43`

**Code:** Headless detection → disable-gpu. Flags: `disable-background-timer-throttling`, `disable-backgrounding-occluded-windows`, `CalculateNativeWinOcclusion`, `disable-gpu-process-crash-limit`.

### References:
| Source | Link | What it provides |
|--------|------|------------------|
| Electron commandLine API | `electronjs.org/docs/latest/api/command-line` | `appendSwitch()` reference |
| Chromium GPU Process Crash | `chromium.org/developers/...` | `CalculateNativeWinOcclusion` → GPU state invalid in hidden webviews |

---

## 16. Input History (Arrow Up/Down)

**Files:** `src/renderer/src/components/core/InputBar.jsx:21-105`

**Code:** `historyStackRef` (max 50), `historyIndexRef`, `savedInputRef`.

### References:
| Source | Link | What it provides |
|--------|------|------------------|
| Node.js readline source | `github.com/nodejs/node/blob/main/lib/readline.js` | Proven pattern: cyclic array + index pointer + saved line buffer (since Node v0.x) |

---

## 17. MPRIS Safe Property Setter

**Files:** `src/main/mpris-service.js:33-45`

**Code:** `safeSetProperty()` catches D-Bus stream death.

### References:
| Source | Link | What it provides |
|--------|------|------------------|
| mpris-service Issue #6 | Same as #3 | Known Electron + D-Bus issue after sleep/hibernate |

---

## 18. Project Vision & Architecture Review (ChatGPT Discussion)

**Date:** 2026-07-25
**Source:** `chatgpt.com/share/6a675109-0ee4-83ec-858d-ba07a27e94b5`

**Key Architectural Shifts (per ChatGPT review):**

| Old Framing | Revised Framing |
|-------------|-----------------|
| "Memiliki emosi" | "Simulates affective state" |
| "Bertindak selayaknya manusia" | "Autonomous software agent" |
| "Personal AI Assistant" | "Personal Autonomous Operating System (PAOS)" |
| Chat → Tool → Answer | Goal → Planning → Execution → Verification → Approval → Completion |
| "Infinite Memory" | "Persistent Vector Memory" |
| "Injection Knowledge RAG" | "Knowledge Retrieval → Context Assembly → Memory Retrieval" |
| "Live Thought Process" | "Execution Flow / Reasoning Trace" |
| "Deep Web Search" | "Autonomous Research / Multi-step Web Research" |
| Plugin (no sandbox) | Plugin → Manifest → Permission → Sandbox → Execution |
| "Agentic Planning" | "Execution Graph / Planner → Tool Runtime → Verification" |

**Key Product Reference:** J.A.R.V.I.S (Marvel) as benchmark — voice-first, seamless, persona-driven.
**Key Technical Reference:** Anthropic Computer Use (`computer.type`, `computer.open`), MCP/Artifacts customization.

**ATM Relevance:** This conversation documents the strategic pivot from "chatbot with tools" to "goal-oriented autonomous agent runtime." Future implementation should reflect this architecture in the fork.

---




## Summary: 49+ References × 18 Areas

| Area | Ref # | Top Improvement |
|------|:-----:|----------------|
| Hermes Official (P0) | 5 | ATM source for skills loader & orchestrator patterns |
| Linux DE detection | 3 | GNOME `window-calls-extended` extension over raw dbus-send |
| xdotool tracking | 2 | Add `getwindowpid` + `readlink /proc/PID/exe` |
| MPRIS D-Bus | 4 | Reconnect after system suspend (logind PrepareForSleep) |
| Adblocker | 2 | Serialization caching via `ElectronBlocker.serialize()` |
| RAF batching | 4 | Extend to activity buffer polling loop |
| 9Router/Custom API | 4 | Add HTTP-Provider header for upstream routing |
| JSON schema fallback | 3 | Add `jsonrepair` in executeFetch path |
| Cache-aside config | 3 | Add TTL safety net (60s) alongside event invalidation |
| Skills loader | 4 | Add platform filtering + bundle support |
| Baileys WA | 3 | Linux browser identity + offline presence |
| Subprocess safety | 2 | Extend `execFile` pattern to all shell tools |
| Browser automation + CAPTCHA | 6 | Make MAX_ELEMENTS configurable, NopeCHA auto-solve integration |
| Anthropic/Claude (P0b) | 8 | Hooks-style agent lifecycle, structured tool defs |
| YT ad-blaster | 2 | Clean up zombie intervals on track change |
| RSI orchestration | 3 | Add handoff document pattern (CTO_HANDOFF.md) |
| GPU crash prevention | 2 | PipeWire Wayland capture awareness |
| Input history | 1 | Persist history across sessions |
| Project Vision (P1) | 1 | Architecture shift: Goal→Plan→Execute→Verify→Complete |
| **Total** | **50+** | **19 opportunities identified** |
