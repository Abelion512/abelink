# AI Context & Planning (AGENTS.md)

## 1. Project Overview

**Project Name:** MARK (Metacognitive Artificial Relational Knowledge) — MARK Linux fork, independent version line 1.x (current: **1.0.0-alpha.1**, single source of truth: `src-tauri/tauri.conf.json`)

**Branch Strategy:**
- `linux` (main) — Linux Tauri v2 branch, receives all new features and fixes
- `master` — tracks official `Mazees/mark-agent` upstream for sync purposes only
- Pull requests target: `linux`
- Version bumping: run `bun run sync-version` after bumping in `tauri.conf.json`
**Description:** A privacy-first, local-based autonomous AI OS companion designed to assist user productivity, automate tasks, and provide lifelike companionship. It uses a hybrid AI engine (Local LLM via LM Studio or Cloud API, plus a native Gemini Web RPC Engine) and features agentic planning with ReAct loop execution, **Autonomous Multi-Agent Sub-Agent Engine** (UI: **Sub-Agents**, branding: **Mission Control**) with concurrent isolated browser sessions, **Durable Agent Tasks** (UI: **Agent Workflows**) for persistent multi-step work, autonomous physical browser automation with multi-session support, a persistent OS-level desktop automation daemon, a hybrid Full-Text & Vector Memory Management System (MMS) with Orama & Dexie, document RAG pipeline, OS-level Awareness Engine, dynamic 4D Relational Growth, a native Plugin System with Monaco Editor, Telegram Bot integration via Telegraf, Voice Activity Detection with Groq Whisper STT plus local Whisper, Edge-TTS, and webcam vision capabilities.
**Environment:** Linux-only Tauri v2 desktop application ("MARK Linux") — a fork of Mazees/mark-agent, mid-migration from Electron to the Tauri shell + Node sidecar layout.
**Maintainer:** Abelion512 | **Homepage:** https://github.com/Abelion512/mark-agent-linux | **Upstream:** https://github.com/Mazees/mark-agent/

## 2. Technology Stack & Core Dependencies

- **Framework:** Tauri 2 (Rust shell in `src-tauri/`; plugins: single-instance, global-shortcut, log), React 19, Vite 7 (`index.html` + `vite.config.js` at repo root, standard Tauri layout), Bun as script/runtime runner (`bun run harness`, `bunx vitest`)
- **UI/Styling:** Tailwind CSS 4 (via `@tailwindcss/vite`), DaisyUI 5 (theme: `forest`), Poppins + Inter fonts, React Markdown, React Syntax Highlighter (Prism, oneDark), Monaco Editor (`@monaco-editor/react`), Driver.js (guided tours), Lucide React, React Icons
- **Desktop Shell Security:** `rfd` 0.15 native approval dialogs rendered on the Rust main thread, deny-by-default IPC allowlist (`cmd_node_bridge.rs`), CSP declared in both `tauri.conf.json` and `index.html`
- **AI Backend:** Gemini Web RPC (Native Bridge, `sidecar/main/services/gemini-web.js`) / Groq API / LM Studio (Local, `localhost:1234`) / Cerebras / Custom OpenAI-compatible Endpoint
- **Embeddings/Memory:** `@huggingface/transformers` (Transformers.js) fully local embeddings via WASM inside a Web Worker (`embedding.worker.js`; model `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, 384 dimensions, hash-model fallback in lite mode)
- **Local Database & Vector Search:** `dexie` (IndexedDB wrapper, schema version 22, 12 stores) and `@orama/orama` for Hybrid Full-Text & Vector search (memory/archive/document/turn-pair indexes)
- **Voice/Audio:** Groq API Speech-to-Text (`whisper-large-v3`, optional `whisper-large-v3-turbo`) plus a local Whisper worker (`whisperWorker.js`), Edge-TTS (`msedge-tts`, voice: `id-ID-ArdiNeural`, served by the sidecar `tts-speak` channel), Web Audio API Voice Activity Detection via `useVAD.js`
- **Media/Integrations:** `youtube-transcript-plus`, `ytmusic-api` (YouTube Music), `yt-search`, `youtube-dl-exec` + `ffmpeg-static`, `googleapis` (Calendar/Drive/Gmail via sidecar `google:*` channels)
- **Communication:** `telegraf` (Telegram Bot Framework, `sidecar/main/telegram/telegram-service.js`)
- **Document Parsing:** `mammoth` (.docx) + `pdf-parse` (.pdf) behind the sidecar `parse-document` channel
- **Packaging & CI:** Tauri bundler (`bundle.targets: "all"`, sidecar engine shipped as bundled resources); GitHub Actions workflows `tauri.yml`, `release.yml`, `codeql.yml`, `upstream-sync.yml`

## 3. Project Architecture & File Structure

Standard Tauri v2 split, mid-migration: React renderer, Rust shell, Node/Bun sidecar engine carrying the legacy main-process modules. Renderer entry points live at the repo root.

```
mark-agent/
├── index.html           # Renderer entry (Vite) + strict CSP meta tag
├── vite.config.js       # Renderer build config (repo root, standard Tauri layout)
├── src/                 # React 19 renderer: UI + core logic (no Node APIs)
├── src-tauri/           # Rust shell: window/tray/shortcuts + native commands
├── sidecar/             # Node engine (fase A/B): stdio dispatcher + migrated modules
└── scripts/             # sync-version.mjs, verify.sh, release helpers
```

### `src/` — React 19 Renderer (UI + Core Logic)

| File / Folder                          | Purpose                                                                                                                                                                                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.jsx`, `App.jsx`                  | App bootstrap and routing (react-router-dom).                                                                                                                                                                                                                           |
| `api/tauri-bridge.js`                  | `window.api` facade over Tauri invoke: fs tools and light misc calls (save-temp-file, open-external, notification, documents path, lite mode) routed to native Rust commands (`fs_*`, `misc_*`), remaining engine channels via `node_invoke`, events via the Tauri event system; clamps oversized tool output (~20k chars) before it enters the AI context.                                                 |
| `api/db.js`                            | Dexie database (schema v22): memory, sessions, config, chatArchive, documents, relationships, agentTasks, agentTaskSteps, subagents, subagent_messages, learnedSkills, chatTurns.                                                                                        |
| `api/vectorMemory.js` (+ `vectorCore.js`, `vectorLoader.js`, `embedding.worker.js`) | Embedding engine running Transformers.js off the main thread inside a Web Worker: `generateVector()`, `cosineSimilarity()`, `getRelevantMemory()`, `searchExtendedMemory()`, `getUnifiedContext()`; hash-model fallback in lite mode.                                    |
| `api/oramaStore.js`                    | Hybrid vector+fulltext search: archive/document/turn-pair indexes, similarity threshold 0.25, `hydrateFromDexie()`.                                                                                                                                                      |
| `api/ragPipeline.js`                   | Document ingestion: max 50MB, `.pdf`/`.docx` via `parse-document`, `.txt`/`.md` raw read, chunking 500 chars / 50 overlap, dual-save Dexie + Orama.                                                                                                                      |
| `api/turnPairMigrator.js`              | Backfills existing chat sessions into vectorized `chatTurns` turn pairs (Dexie + Orama).                                                                                                                                                                                |
| `api/scraping.js`                      | Web scraping engine: `scrapeGoogle()` + `deepSearch()`, DOM cleanup, article text extraction, 1500 char cap.                                                                                                                                                            |
| `api/taskStore.js` + `taskExecutor.js` | Durable Agent Tasks persistence + step checkpoint validation/content-hash dedup (statuses pending through completed).                                                                                                                                                    |
| `api/harness.js`                       | Opt-in dev JSONL logging client -> Rust `harness_append` (toggle from Configuration > Developer).                                                                                                                                                                       |
| `api/workspaceRag.js`                  | Workspace `.mark/` codebase RAG + working-memory injection into system prompts (sidecar `workspace:*`).                                                                                                                                                                 |
| `api/groq.js` + `localWhisper.js` / `whisperWorker.js` | Speech-to-text engines: Groq cloud Whisper or local Whisper running in a worker.                                                                                                                                                                         |
| `api/tools/` (`index.js`, `core-tools.js`, `group-tools.js`) | Tool catalog + tool-group expansion (`read-tools`) used during prompt assembly.                                                                                                                                                                     |
| `api/subagent/subagentStore.js`        | Dexie-backed reactive CRUD + subscriptions for Sub-Agents and their message streams (`createSubagent`, `addMessage`, live UI updates).                                                                                                                                   |
| `api/subagent/subagentExecutor.js`     | Autonomous ReAct runner per sub-agent without artificial turn limits; intercepts `read-tools` for dynamic group expansion; cleans up on complete or abort (`killSubagentExecution`).                                                                                     |
| `api/subagent/subagentPrompt.js`       | Goal-oriented Sub-Agent system prompt generator; enforces strict JSON `{ thought, action, answer }` responses.                                                                                                                                                          |
| `api/ai/core.js`                       | `fetchAI()` wrapper with AbortSignal support; `cleanAndParse()` multi-stage JSON parser (strip fences -> extract object -> clean trailing commas -> `jsonrepair`).                                                                                                      |
| `api/ai/planning.js`                   | Agentic planner/router: `getNextAction()` assembles persona/tools/plugins/memory prompts with Multi-Agent Orchestration rules (`spawn_subagent`, `wait_subagents`, `send_message`) and batch actions arrays.                                                            |
| `api/ai/persona.js`                    | Character & personality: Linux PC companion identity, sarcasm scaling (`<0.65` subtle, `>=0.65` roasting), adaptive tone (lu/gue vs Saya/Anda), TTS formatting, mood types; injects trait context.                                                                       |
| `api/ai/relationship.js`               | Relational growth evaluator: 5 trait keys (warmth/sarcasm_level/trust/energy/obedience), `MAX_DRIFT=0.05` per step, floors warmth/trust at 0.15, clamps 0-1.                                                                                                            |
| `api/ai/awareness.js`                  | Autonomous awareness AI over the OS activity buffer; JSON output: `should_act`, `message`, `autonomous_prompt`, `mood`.                                                                                                                                                 |
| `api/ai/chatSummarizer.js`             | Distills recent chats into archived summaries with embedding vectors (dual-save Dexie + Orama).                                                                                                                                                                         |
| `api/ai/memoryGroomer.js`              | Batch consolidation merging profile/preference memories without losing history.                                                                                                                                                                                        |
| `api/ai/contextCompactor.js`           | Compacts long conversation context before planner calls.                                                                                                                                                                                                               |
| `api/ai/skillSynthesizer.js`           | Synthesizes learned skills into the `learnedSkills` store.                                                                                                                                                                                                             |
| `api/ai/taskPlanner.js`                | Step planner for Durable Agent Tasks (Agent Workflows).                                                                                                                                                                                                                |
| `api/ai/tools.js`                      | YouTube & music AI: transcript summarization (4000-char chunks, 12s cooldown), best-match song ranker.                                                                                                                                                                  |
| `api/ai/utils.js`                      | Shared utilities: Indonesian locale time info, voice playback helpers.                                                                                                                                                                                                 |
| `hooks/`                               | `useMarkAgent.js` orchestrator, `useAwareness.js`, `useVAD.js`, `useChatArchiver.js`, `useMemoryGroomer.js`, `agent/*` (plan/state/music/youtube/relational growth), `telegram/useTelegramBot.js`.                                                                        |
| `pages/`                               | `Subagents.jsx` (**Mission Control** dashboard), `RelationalGrowth.jsx`, `Skills.jsx` / `SkillEditor.jsx`, `Plugins.jsx`, `TelegramBot.jsx`, `GoogleWorkspace.jsx`, `Knowledge.jsx`, `ChatStudio.jsx`, `Configuration.jsx`, and more.                                     |
| `components/subagent/`                 | `SubagentIntercom.jsx` (**live intercom & HUD**: thought/execution dropdowns, markdown answers), `SubagentTopologyMap.jsx`.                                                                                                                                              |
| `components/core/`                     | `BrowserPreviewWidget.jsx` (multi-card holo preview, kept for Fase C), `HoloCard.jsx`, `InputBar.jsx`, `MemoryVisualizer.jsx`, and other core UI pieces.                                                                                                                 |

### `src-tauri/` — Rust Shell (Tauri v2)

| File                   | Purpose                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib.rs`           | App builder: single-instance focus, tray menu (Linux AppIndicator), global shortcuts `Ctrl+Alt+M` (toggle window) and `Ctrl+Shift+S` (emergency-stop event broadcast), invoke_handler registration, kills the sidecar on exit. |
| `src/main.rs`          | Binary entry point calling the app `run()`.                                                                                                                                                                              |
| `src/cmd_fs.rs`        | Workspace-contained fs commands (`fs_read_file`, `fs_write_file`, `fs_delete_file`, `fs_list_dir`, `fs_grep_search`, legacy-profile detect/import): absolute paths, `..`, and `~` rejected; symlink escape checked via canonicalize + prefix; 10MB read cap. |
| `src/cmd_harness.rs`   | `harness_append`: structured JSONL dev logging per kind/day under the XDG data dir; strict kind validation, 50MB rotation.                                                                                                |
| `src/cmd_node_bridge.rs` | Stdio bridge to the sidecar engine: DENY-BY-DEFAULT `ALLOWED_ACTIONS` gate; approval-gated actions/tools confirmed via a NATIVE `rfd` dialog on the main thread; drains pending requests when the engine dies.             |
| `src/cmd_misc.rs`      | Fase B0 port of five light sidecar channels to native commands: `misc_save_temp_file`, `misc_open_external` (http/https/mailto only + native rfd approval), `misc_show_notification`, `misc_get_documents_path`, `misc_get_lite_mode` (/proc/meminfo threshold). |
| `tauri.conf.json`      | Window config, CSP, bundle targets "all", sidecar bundled resources; SINGLE SOURCE OF TRUTH for the app version.                                                                                                          |
| `Cargo.toml`           | Crate manifest: tauri 2 (+tray-icon/image-png), plugins log/single-instance/global-shortcut, rfd 0.15, tokio.                                                                                                             |
| `capabilities/`        | Tauri capability/permission definitions.                                                                                                                                                                                 |

### `sidecar/` — Node Engine (fase A/B)

| File / Folder                        | Purpose                                                                                                                                                                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine.mjs`                         | JSON-over-stdio dispatcher (`{id, action, payload}` frames): registers channels `ai:fetch`, `native-tool:execute`/`native-tool:needs-approval`, `parse-document`, `save-temp-file`, `tts-speak`, YouTube transcript/search, `tg:*`, `google:*`, `workspace:*`, `awareness:*`, `skills:*`, notifications; `browser:*` / `os:*` / screenshot / dialog channels return explicit unsupported until Fase B/C. Headless run: `bun run harness`. |
| `main/ai-bridge.js`                  | Centralized AI HTTP client: multi-provider routing, 3-tier JSON format fallback (`json_schema` -> `json_object` -> unrestricted), `CLOUD_DELAY_MS=3000` throttle, backoff with auto model swap, DeepSeek `<think>` extraction, `cleanAndParse()` with jsonrepair. |
| `main/node-tools.js`                 | `NATIVE_TOOLS` registry with `needsApproval`/`approvalMessage` metadata: fs CRUD, `run-powershell` (dangerous-keyword check), `git-commit`/`git-revert`, os-* desktop tools, browser-* dispatchers. Delimiter: double-pipe `\|\|`.                                     |
| `main/browser-agent.js`              | Multi-session Chromium automation engine (max 80 tagged elements, `data-mark-id`, animated cursor) — dormant until the Fase C port.                                                                                                                                   |
| `main/pc-agent.js` + `pc-agent-scripts/` | Desktop automation engine + Linux primitives (`linux-daemon.py`, `linux-action.sh`, `read-ui.sh`, `ocr-region.sh`) — dormant until the Fase B port; emergency stop via global `Ctrl+Shift+S`.                                                                      |
| `main/awareness/window-tracker.js`   | OS activity monitoring: active-win poll every 60s, idle filter >180s, 30-entry ring buffer, `id-ID` timestamps.                                                                                                                                                       |
| `main/plugins/plugin-loader.js`      | Plugin lifecycle manager: scans the plugin directory, dynamic ESM import with cache-busting (`?t=Date.now()`), auto npm install on creation, CRUD/toggle/reload endpoints.                                                                                            |
| `main/telegram/telegram-service.js`  | Telegraf bot engine: polling mode, `/start` and `/register` admin approval flow, text/media processing, direct UI notification bridge.                                                                                                                                |
| `main/services/gemini-web.js`        | Gemini Web RPC engine integrated into ai-bridge.                                                                                                                                                                                                                     |
| `main/skills/skill-manager.js`       | Learned-skills storage behind the `skills:*` channels (XDG skills dir, `<name>/SKILL.md` layout).                                                                                                                                                                    |
| `main/google/`                       | Google service core + Calendar/Drive/Gmail integrations.                                                                                                                                                                                                             |
| `main/git-service.js`                | Git operations service (commit/revert gated behind approval).                                                                                                                                                                                                        |
| `main/syntax-validator.js`           | Syntax validation for generated JS code.                                                                                                                                                                                                                            |
| `main/workspace-rag.js`              | Workspace index/query + working-memory persistence (implementation of the `workspace:*` channels).                                                                                                                                                                   |
| `main/task-daemon.js`                | Background daemon supporting durable agent tasks.                                                                                                                                                                                                                    |
| `main/utils/`                        | `fsGuard.js` path guard helpers, `systemInfo.js`.                                                                                                                                                                                                                    |

### Build, Verify & CI

- `scripts/sync-version.mjs` — propagates the version from `src-tauri/tauri.conf.json` into package.json/Cargo.toml (single source of truth for versioning).
- `scripts/verify.sh` — release gate, must be green before push: vitest -> crypto watermark harness -> vite build -> cargo check.
- `.github/workflows/` — `tauri.yml` (build/check), `release.yml` (tagged releases), `codeql.yml` (security scan), `upstream-sync.yml` (upstream tracker).

## 4. Key Implementation Invariants & Gotchas

### Multi-Agent Sub-Agent Architecture
- **No Turn Limit (`maxTurns`)**: Sub-agents execute autonomously until their goal is fulfilled (action: null, answer provided) or until explicitly aborted/killed.
- **Session-Isolated Browser Sessions (design invariant)**: each sub-agent is designed to operate its own isolated browser session keyed by its unique id, without cross-agent contamination. Today the engine-side `browser:*` channels are stubbed explicit-unsupported until Fase C3, so browser actions fail fast instead of opening windows — keep the sessionId propagation intact so the port can slot in.
- **Proactive Orchestration**: Lead Agent (Mark) is instructed to proactively split multi-topic research into parallel batch spawns (`spawn_subagent` in batch array) and gather aggregated insights via `wait_subagents`.

### Critical Constants & Thresholds (verified against current files)

| Constant                        | Value                                        | Location                                   | Purpose                                  |
| ------------------------------- | -------------------------------------------- | ------------------------------------------ | ---------------------------------------- |
| Extended Memory Search Threshold | default **0.5**; turn pairs pinned **0.3**  | `vectorMemory.js`                          | Filter irrelevant memories & turn pairs  |
| Vector Similarity (Orama)       | **0.25**                                     | `oramaStore.js`                            | Archive & document search threshold      |
| Trait Drift                     | **0.05** max per step (`MAX_DRIFT`)          | `relationship.js`                          | Max trait change per evaluation          |
| Trait Floor                     | **0.15** (warmth, trust)                     | `relationship.js`                          | Minimum allowed trait values             |
| Awareness Cooldown              | **9 minutes** (540000ms)                     | `useAwareness.js`                          | Prevents check-in spam                   |
| Awareness Interval              | **10 minutes** (`CHECKIN_INTERVAL`)          | `useAwareness.js`                          | Check-in loop period                     |
| Relational Eval Interval        | **15 clean messages**                        | `hooks/agent/useRelationalGrowth.js`       | Trait evaluation trigger                 |
| Cloud Rate Limit Delay          | **3000ms** (`CLOUD_DELAY_MS`)                | `sidecar/main/ai-bridge.js`                | Min gap between cloud API calls          |
| Activity Buffer Size            | **30 entries**                               | `sidecar/main/awareness/window-tracker.js` | Ring buffer cap                          |
| Activity Poll Interval          | **60s**, idle filter **>180s**               | `sidecar/main/awareness/window-tracker.js` | OS activity sampling                     |
| DOM Parser Elements             | **80 max** (`MAX_ELEMENTS`)                  | `sidecar/main/browser-agent.js`            | Max interactive elements tagged          |
| RAG Chunk Size                  | **500 chars, 50 overlap**, file max **50MB** | `ragPipeline.js`                           | Document chunking params                 |
| YT Summary Chunk                | **4000 chars**, 12s cooldown between chunks  | `ai/tools.js`                              | Transcript processing boundary           |
| VAD Speech Threshold            | **RMS > 0.01**                               | `useVAD.js`                                | Voice detection sensitivity              |
| VAD Silence Cut                 | **8 silence frames (~2s)**                   | `useVAD.js`                                | Auto-cut after silence                   |
| FS Read Cap                     | **10MB** per file                            | `cmd_fs.rs`                                | Native read boundary                     |
| Bridge Output Clamp             | **~20000 chars**                             | `tauri-bridge.js`                          | Truncation before output enters AI context |
| Harness Log Rotation            | **50MB** per kind                            | `cmd_harness.rs`                           | JSONL dev log files                      |

Removed from the old table: Category Router threshold 0.35 (`CATEGORY_TEXTS` no longer exists in `planning.js`); VAD RMS corrected from 0.015 to 0.01; trait drift corrected from 0.01 to 0.05.

## 5. Development Guidelines for AI Agents

- **Read Before Modify:** Always read the corresponding `src/api/`, `src/hooks/`, `sidecar/main/`, or `src-tauri/src/` file entirely before modifying state or logic.
- **Maintain Privacy-First Paradigm:** Avoid adding third-party tracking, analytics, or mandatory cloud dependencies. Everything must be able to fall back to 100% offline local state.
- **Renderer Isolation (Tauri Boundary):** Never touch Node APIs directly in `src/`. All OS access goes through the `window.api` facade (`src/api/tauri-bridge.js`) -> Tauri IPC: either a Rust command (`fs_*`, `misc_*`, `harness_append`, window controls) or the `node_invoke` sidecar channel.
- **Security Gates (non-negotiable):**
  - `cmd_fs.rs` confines every path to the XDG workspace root: absolute paths, `..`, and `~` are rejected, and symlink escapes are caught by canonicalize + prefix check. Never bypass `resolve_contained`.
  - `node_invoke` is DENY-BY-DEFAULT: only actions listed in `ALLOWED_ACTIONS` pass through. Approval-required actions (`skills:save`, `skills:delete`, `tg:start`, `tg:stop`, `google:connect`, `google:disconnect`, `open-external`) and dangerous tools (`run-powershell`, `git-commit`, `git-revert`) trigger a NATIVE `rfd` confirmation dialog on the Rust main thread — the decision happens outside the renderer.
  - CSP is declared twice: `src-tauri/tauri.conf.json` and the meta tag in `index.html`. Keep both in sync whenever connect-src/script-src change.
- **Adding Sidecar Tools:** register the tool in `NATIVE_TOOLS` (`sidecar/main/node-tools.js`) with `needsApproval`/`approvalMessage` metadata AND, if it needs a new dedicated channel instead of reusing `native-tool:execute`, add that action to `ALLOWED_ACTIONS`/`APPROVAL_ACTIONS` in `cmd_node_bridge.rs`. The `browser:*`/`os:*` channels intentionally return explicit unsupported until Fase B6/C3 — do not fake success responses for them.
- **Build & Version Gate:** run `bash scripts/verify.sh` (vitest + crypto watermark harness + vite build + cargo check) before pushing; bump versions ONLY in `src-tauri/tauri.conf.json`, then run `bun run sync-version`.
- **UI Design System:** The UI uses Tailwind CSS 4 + DaisyUI 5 (`forest` theme) with custom holographic/glassmorphic design tokens in `src/assets/main.css`.
- **Strict Emoji Rule:** Dilarang keras menggunakan emoji apapun di dalam respon output, dialog, maupun UI.
