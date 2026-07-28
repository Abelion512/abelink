# MARK Agent — Feature Specification

> **Version:** 4.0.0 (Linux fork)
> **Target:** PAOS — Personal Autonomous OS
> **Author:** Abelion512
> **Updated:** 2026-07-28

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        UI LAYER (Renderer)                   │
│  React 19 + Tailwind 4 + DaisyUI 5                           │
│  Pages: MarkHome, Config, Plugins, LiveAudio, Guidebook,     │
│         Knowledge, RelationalGrowth, WhatsappBot             │
├─────────────────────────────────────────────────────────────┤
│                    AGENT LOOP (Renderer)                      │
│  useMarkPlan.js (898 lines) — ReAct loop                     │
│  planning.js (599 lines) — tool dispatch, vector routing     │
│  guard-gate.js — circuit breaker, pre/post-flight            │
│  fallback-serializer.js — JSON/XML/KV parser                 │
│  prompt-compressor.js — context compression                  │
│  output-sanitizer.js — tool output normalization             │
│  tool-registry.js — structured tool defs [FUTURE]            │
│  vision-service.js — dual-path vision [FUTURE]               │
├─────────────────────────────────────────────────────────────┤
│                     AI PIPELINE (Main)                        │
│  ai-bridge.js (483 lines) — multi-provider HTTP client       │
│  9Router / Groq / Cerebras / LM Studio / Custom              │
│  retry 10x, exponential backoff, model fallback              │
│  model-registry.json — dynamic model combo registry          │
├─────────────────────────────────────────────────────────────┤
│                    OS INTERFACE (Main)                        │
│  index.js (532 lines) — 35 IPC handlers, window mgmt, tray   │
│  native-tools.js — file ops, shell, grep, registry           │
│  browser-agent.js — physical BrowserWindow automation        │
│  browser-dom-parser.js — DOM parser (extracted)              │
│  agent-skills-loader.js — SKILL.md loader                    │
│  plugin-loader.js — plugin lifecycle manager                 │
│  mpris-service.js — D-Bus MPRIS media keys                   │
│  lastfm-service.js — Last.fm scrobbling                      │
│  ytdl-service.js — YouTube download                          │
├─────────────────────────────────────────────────────────────┤
│                    MEMORY SYSTEM (Renderer)                    │
│  db.js — Dexie (IndexedDB) 6 stores                          │
│  vectorMemory.js — Transformers.js WASM embeddings (384d)    │
│  oramaStore.js — Hybrid vector + full-text search            │
│  ragPipeline.js — Document ingestion (.pdf/.docx/.txt/.md)   │
├─────────────────────────────────────────────────────────────┤
│                    COMMUNICATION (Main)                        │
│  baileys-service.js — WhatsApp Web via WebSocket             │
│  message-store.js — WA chat memory (50/JID)                  │
│  media-downloader.js — yt-dlp + ffmpeg for WA                │
│  VAD (Web Audio API) + Groq Whisper STT + Edge-TTS          │
└─────────────────────────────────────────────────────────────┘
```

**Kritis:** Agent loop ada di renderer. State mati jika refresh. Ini tradeoff yang disadari — Dexie/Orama/WASM cuma available di renderer.

---

## 2. Capabilities (Current)

### 2.1 AI Provider
| Provider | Model | Routing |
|----------|-------|---------|
| 9Router | Dynamic (primary) | JSON schema → json_object → free |
| Groq | llama-4-scout, deepseek-r1-distill, qwen-2.5-32b | Same routing |
| Cerebras | llama-3.3-70b | Same routing |
| LM Studio | Local (localhost:1234) | Same routing |
| Custom | Any OpenAI-compatible | Same routing |

Fallback: 10x retry → model swap → degraded mode.

### 2.2 Tool Categories (7 vector-routed)
| Category | Tools |
|----------|-------|
| **Coding** | read/write/edit/delete file, grep, shell/terminal |
| **Files** | File ops + directory listing |
| **Music** | YouTube search, play, next/prev/toggle, AI ranker |
| **Search** | Web search (scrapeGoogle), deepSearch |
| **System** | Screenshot, WhatsApp send/screenshot, desktop control |
| **Browser** | Physical BrowserWindow: navigate/read/click/type/scroll/ask-user/close |
| **Capabilities** | Plugin listing, tool introspection |

### 2.3 Memory System
| Layer | Storage | Search | Purpose |
|-------|---------|--------|---------|
| Core (profile/preference) | Dexie | Vector (0.3 threshold) | Identity + preferences |
| Extended (notes/learn) | Dexie + Orama | Hybrid (0.25 threshold) | Facts + learning |
| Archives | Dexie + Orama | Hybrid (0.25 threshold) | Chat history summarization |
| Documents | Dexie + Orama | Hybrid (0.25 threshold) | RAG pipeline |
| Relationships | Dexie | Direct key lookup | 4D trait (warmth, sarcasm, trust, energy) |

### 2.4 Voice Pipeline
```
Microphone → Web Audio API (16kHz) → VAD (RMS > 0.015, 2s silence) → 
Groq Whisper STT (whisper-large-v3) → Agent → Edge-TTS (id-ID-ArdiNeural) → Speaker
```
- Barge-in detection (interrupts AI speech)
- 1.5s trailing silence trim (prevents Whisper hallucinations)

### 2.5 Browser Automation
- **Engine:** Physical Electron BrowserWindow (show:false)
- **DOM Parser:** Up to 80 interactive elements tagged with `data-mark-id`
- **Actions:** Navigate, click, type (React-compatible), scroll, screenshot
- **Unblock mode:** Shows hidden window for CAPTCHA/login — title-based handoff
- **Adblock:** Hybrid (`@cliqz/adblocker-electron` + CSS/JS injection)

### 2.6 Plugin System
- **Location:** `~/Documents/Mark Plugins/`
- **Format:** `plugin.json` + `index.js` (ESM)
- **Editor:** Monaco Editor in UI
- **Discovery:** Vector similarity matching against `CATEGORY_TEXTS`
- **Lifecycle:** Create, toggle, edit, reload, delete via IPC

### 2.7 Agent Skills
- **Location:** `~/.agents/skills/`, `~/.zcode/skills/`, `$AGENT_SKILLS_DIR`
- **Format:** Hermes-style SKILL.md (frontmatter + body)
- **Discovery:** Vector similarity matching

### 2.8 Awareness Engine
- **Check-in:** Every 10 min (9 min cooldown)
- **Inputs:** Window activity buffer (30 entries, 60s polling), vector memory, time, music state
- **Output:** Autonomous message + mood + optional tool invocation
- **Sensors:** Mic (VAD), Camera (vision), Screen (screenshot via awareness)

### 2.9 Relational Growth
| Trait | Range | Floor | Max Drift/Step |
|-------|-------|-------|----------------|
| Warmth | 0-1 | 0.15 | 0.01 |
| Sarcasm Level | 0-1 | 0 | 0.01 |
| Trust | 0-1 | 0.15 | 0.01 |
| Energy | 0-1 | 0 | 0.01 |

Trigger: every 15 clean messages.

---

## 3. Constants & Thresholds (Source of Truth)

Setiap agent WAJIB baca dari file sumber sebelum mengubah. Jangan hapus tanpa verifikasi.

| Constant | Value | File | Line |
|----------|-------|------|------|
| `PER_TURN_TIMEOUT_MS` | 90000 | `useMarkPlan.js` | 220 |
| `MAX_TURNS` | 10 | `useMarkPlan.js` | 219 |
| `CLOUD_DELAY_MS` | 3000 | `ai-bridge.js` | main |
| `CHECKIN_INTERVAL` | 600000 | `useAwareness.js` | 6 |
| `INITIAL_DELAY` | 60000 | `useAwareness.js` | 7 |
| `MIN_MESSAGES_TO_ARCHIVE` | 10 | `useChatArchiver.js` | 4 |
| `MAX_RETRIES` | 2 | `planning.js` | 531 |
| `VALID_TYPES` | profile/preference/notes/learn | `db.js` | 85 |
| `DEFAULT_TRAITS` | all 0.5 | `db.js` | 303 |
| `TRAIT_KEYS` | warmth/sarcasm_level/trust/energy | `relationship.js` | 73 |
| `MAX_DRIFT` | 0.01 | `relationship.js` | 74 |
| `FLOOR` | warmth:0.15, trust:0.15 | `relationship.js` | 75 |
| `guard-gate failureThreshold` | 3 | `guard-gate.js` | 7 |
| `guard-gate recoveryTimeout` | 60000 | `guard-gate.js` | 8 |
| `Vector threshold (memory)` | 0.3 | `vectorMemory.js` | — |
| `Vector threshold (orama)` | 0.25 | `oramaStore.js` | — |
| `Category router threshold` | 0.35 | `planning.js` | — |
| `VAD detection threshold` | RMS > 0.015 | `useVAD.js` | — |
| `VAD silence timeout` | 2000ms | `useVAD.js` | — |

---

## 4. File Inventory (Source of Truth)

### src/main/ — Electron Main Process
| File | Lines | Purpose | Dependencies |
|------|-------|---------|-------------|
| `index.js` | 532 | 35 IPC handlers, window, tray, TTS | Electron, msedge-tts |
| `ai-bridge.js` | 483 | Multi-provider AI HTTP client | node:fetch |
| `browser-agent.js` | ~300 | Physical BrowserWindow automation | Electron BrowserWindow |
| `browser-dom-parser.js` | 125 | DOM parser engine | — |
| `native-tools.js` | ~200 | File ops, shell, grep (Linux) | node:fs, child_process |
| `agent-skills-loader.js` | 121 | SKILL.md loader | node:fs |
| `plugin-loader.js` | ~200 | Plugin lifecycle manager | ESM import |
| `mpris-service.js` | 141 | D-Bus MPRIS media keys | mpris-service |
| `lastfm-service.js` | 94 | Last.fm scrobbling | — |
| `ytdl-service.js` | 150 | YouTube download | yt-dlp, ffmpeg |
| `model-registry.json` | 46 | Dynamic model combos | — |
| `window-tracker.js` | ~50 | Activity monitoring (60s) | active-win (fallback xdotool) |

### src/preload/index.js — IPC Bridge
- 60+ methods exposed via contextBridge
- All OS interactions pass through here

### src/renderer/src/api/ — Core Logic
| File | Lines | Purpose |
|------|-------|---------|
| `db.js` | ~200 | Dexie 6 stores + 19 exported functions |
| `vectorMemory.js` | ~200 | Embeddings + hybrid search |
| `oramaStore.js` | ~200 | Orama orchestration |
| `ragPipeline.js` | ~150 | Document ingestion + chunking |
| `scraping.js` | ~100 | Google scraping + deepSearch |
| `groq.js` | ~100 | Groq Whisper STT |
| `waAgent.js` | ~100 | WA-specific persona |

### src/renderer/src/api/ai/ — AI Brain
| File | Lines | Purpose | Status |
|------|-------|---------|--------|
| `core.js` | ~200 | fetchAI IPC wrapper + cleanAndParse | ✅ Active |
| `planning.js` | 599 | Vector routing, tool dispatch, memory | ✅ Active |
| `utils.js` | ~100 | TTS, time info, WA formatting | ✅ Active |
| `persona.js` | ~200 | Personality prompt builder | ✅ Active |
| `relationship.js` | ~100 | Trait drift evaluation | ✅ Active |
| `awareness.js` | ~50 | Autonomous check-in prompt | ✅ Active |
| `tools.js` | ~100 | YouTube summary, music ranker | ✅ Active |
| `chatSummarizer.js` | ~80 | Chat archival LLM | ✅ Active |
| **`guard-gate.js`** | 80 | Circuit breaker | ✅ Active, singleton |
| **`fallback-serializer.js`** | 94 | JSON/XML/KV parser | ✅ Active |
| **`output-sanitizer.js`** | 69 | Tool output normalization | ✅ Active |
| **`prompt-compressor.js`** | 91 | Context compression | ✅ Active |
| **`tool-registry.js`** | 343 | Structured tool defs | 🟡 Restored, **NOT WIRED** |
| **`vision-service.js`** | 88 | Dual-path vision (Gemini/MiMo) | 🟡 Restored, **NOT WIRED** |

### src/renderer/src/hooks/ — Agent Orchestration
| File | Lines | Purpose |
|------|-------|---------|
| `useMarkPlan.js` | 898 | Core agent loop, 15+ tool dispatchers |
| `useMarkAgent.js` | ~50 | Top-level facade |
| `useMarkState.js` | ~100 | Centralized state (15 vars) |
| `useMarkMusic.js` | ~50 | Music player control |
| `useMarkYoutube.js` | ~80 | YouTube search + summary |
| `useRelationalGrowth.js` | ~50 | Trait eval trigger |
| `useAwareness.js` | ~150 | Periodic check-in |
| `useChatArchiver.js` | ~50 | Auto-archival |
| `useVAD.js` | ~100 | Voice Activity Detection |
| `useWhatsappBot.js` | ~50 | WA bot UI state |

### src/renderer/src/pages/ — Application Pages
| Page | Lines | Purpose |
|------|-------|---------|
| `Configuration.jsx` | 1430 | Settings, provider/keys, TTS, camera, memory |
| `Guidebook.jsx` | 915 | 7-section documentation |
| `MarkHome.jsx` | 304 | Main dashboard |
| `Plugins.jsx` | 598 | Plugin manager with Monaco Editor |
| `LiveAudio.jsx` | 464 | Voice interface |
| `Knowledge.jsx` | 236 | Document RAG |
| `RelationalGrowth.jsx` | 295 | Trait visualization |
| `WhatsappBot.jsx` | 157 | WA bot dashboard |

---

## 5. IPC Contract (Main → Renderer)

### 5.1 Main Process Handles (35 handlers)
```
ai:fetch, ai:abort, ai:sync-config
screenshot, notification, get-activity-buffer
tts:speak
youtube:search, youtube:get-data, youtube:get-transcript
music:search, music:play-url, music:next, music:prev
wa:start, wa:stop, wa:logout, wa:send-message, wa:take-screenshot
lastfm:now-playing, lastfm:get-recent-tracks
mpris:update-track, mpris:set-status
native-tools:execute, native-tools:check-approval
plugins:get-all, plugins:get-one, plugins:create, plugins:toggle, plugins:delete, plugins:reload, plugins:get-code, plugins:save-code
browser:action
parse-document
config:get-all, config:updated, config:on-changed
```

### 5.2 Renderer Exposed (via preload — 60+ methods)
```
window.api:
  fetchAI(), abortFetchAI(), syncConfig()
  takeScreenshot(), notification(), getActivityBuffer()
  speak(), searchYoutube(), getYoutubeData(), getYoutubeTranscript()
  searchMusic(), playUrl(), nextTrack(), prevTrack()
  startWhatsappBot(), stopWhatsappBot(), logoutWhatsappBot(), sendWaMessage(), waTakeScreenshot()
  getNowPlaying(), getRecentTracks()
  executeNativeTool(), checkToolApproval()
  getPlugins(), getPlugin(), createPlugin(), togglePlugin(), deletePlugin(), reloadPlugin(), getPluginCode(), savePluginCode()
  browserAction(), parseDocument()
  onConfigUpdated(), onAiStatus(), onWaQR(), onWaConnection(), onWaMessage(), onWaReply(), onWaAdminRequest()
```

---

## 6. PAOS Roadmap (from all planning docs)

### Level 1 — Native OS API (current)
| Capability | Status |
|-----------|--------|
| File read/write/edit/delete | ✅ |
| Shell execution (Linux) | ✅ |
| Window focus, click, type (xdotool) | ✅ |
| Screenshot (desktopCapturer) | ✅ |
| Linux DE detection (GNOME/KDE/Sway) | ✅ |
| MPRIS D-Bus media keys | ✅ |
| Notifications (notify-send) | ✅ |

### Level 2 — Tri-Layer Tools (in progress)
| Layer | Backend | Status |
|-------|---------|--------|
| Skills | SKILL.md (Hermes-style) | ✅ Loader, needs rediscovery |
| MCP | @modelcontextprotocol/sdk | 🟡 SDK installed, **ZERO CODE** |
| Plugins | JS ESM + plugin.json | ✅ Working |

### Level 3 — Multi-Model Orchestration (planned)
| Component | Status |
|-----------|--------|
| Model router | ❌ Planned |
| Dual-path vision (Gemini + MiMo) | 🟡 vision-service.js restored, not wired |
| Sub-agent pool | ❌ Planned |
| Orchestrator | ❌ Planned |
| Error log | ❌ Planned |

### Level 4 — Safety + Privacy (planned)
| Component | Status |
|-----------|--------|
| Guard gate (circuit breaker) | ✅ Active (renderer) |
| Tool output sanitizer | ✅ Active (renderer) |
| Fallback serializer | ✅ Active (planning) |
| Prompt compressor | ✅ Active (planning) |
| Scoped permissions | ❌ Planned |
| Privacy zones (4-level data) | ❌ Planned |
| Quarantine system | ❌ Planned |
| Audit log (~/.mark/audit/) | ❌ Planned |
| Sensor indicators (mic/cam/screen) | ❌ Planned |

---

## 7. Development Rules

### 7.1 JSON Parsing — NEVER REMOVE FALLBACK CHAIN
```javascript
// ai-bridge.js — 3-tier format fallback:
1. json_schema (structured output)
2. json_object (response format)
3. Unrestricted + schema in system prompt

// cleanAndParse() — multi-stage:
1. JSON.parse()
2. Strip markdown fences
3. Extract {} substring
4. Clean control chars / trailing commas
5. jsonrepair
```

### 7.2 Electron Process Boundary
```
OS interaction → preload/index.js (contextBridge) → IPC → main process
NEVER: fs, path, child_process directly in renderer/
```

### 7.3 Memory Thresholds — DON'T CHANGE WITHOUT CROSS-REF
```
memory vector threshold: 0.3  (vectorMemory.js)
orama archive threshold: 0.25 (oramaStore.js)
orama document threshold: 0.25 (oramaStore.js)
category routing threshold: 0.35 (planning.js)
```

### 7.4 VAD Parameters — TUNED FOR INDONESIAN SPEECH
```
sampleRate: 16000
bufferSize: 4096
speechThreshold (RMS): 0.015
silenceTimeout: 2000ms
minSpeechSamples: 8000 (0.5s)
trailingSilenceSamples: 24000 (1.5s, prevents Whisper hallucinations)
```

### 7.5 Relational Growth — FLOOR ENFORCED
```javascript
// warmth dan trust tidak boleh < 0.15
// MAX_DRIFT = 0.01 per evaluation (15 messages)
// All traits clamped 0-1
```

### 7.6 Recommended Models for Indonesian Persona
- ✅ **Llama 3 (3.1 / 3.3)** — Best for slang ("lu/gue"), banter, sarcasm
- ✅ **Qwen 2.5** — Excellent Asian language understanding
- ⚠️ **Mistral** — NOT recommended (butler/formal bias, autoregressive repetition loops)