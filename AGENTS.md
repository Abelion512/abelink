# AI Context & Planning (AGENTS.md)

## CRITICAL RULES — PERMANENT MEMORY
1. **NEVER push to GitHub without explicit user approval.** Local commits are fine. `git push` requires user to say "push" first. No exceptions.
2. **NEVER run destructive operations** (force push, filter-branch, delete branch) without asking first.
3. **Security audit before push** — at minimum: syntax check, build pass, no hardcoded secrets.

## 1. Project Overview

**Project Name:** MARK (Metacognitive Artificial Relational Knowledge) — v5.0.0
**Description:** A privacy-first, local-based autonomous AI OS companion designed to assist user productivity, automate tasks, and provide lifelike companionship. It uses a hybrid AI engine (Local LLM via LM Studio or Cloud via Groq API / Gemini / Cerebras / Custom OpenAI-compatible endpoint) and features agentic planning with ReAct loop execution, autonomous physical browser automation, a hybrid Full-Text & Vector Memory Management System (MMS) with Orama & Dexie, document RAG pipeline, OS-level Awareness Engine, dynamic 4D Relational Growth, a native Plugin System with Monaco Editor, WhatsApp Bot integration via Baileys, Voice Activity Detection with Groq Whisper STT, Edge-TTS, and webcam vision capabilities.
**Environment:** Electron 39 desktop application optimized for Linux (Ubuntu 22.04+, Fedora, Arch)
**Author:** Mazees (upstream) | **Linux Fork:** Abelion512
**Homepage:** https://github.com/Abelion512/mark-agent
**Feature Spec:** [`docs/FEATURES.md`](docs/FEATURES.md) — Full specification, constants, file inventory, IPC contract
**Task Breakdown:** [`docs/TASK_ANALYSIS.md`](docs/TASK_ANALYSIS.md) — Phased roadmap (P0-P4), effort estimates, verification criteria

## 2. Technology Stack & Core Dependencies

- **Framework:** Electron 39, React 19, Vite 7, electron-vite 5
- **UI/Styling:** Tailwind CSS 4 (via `@tailwindcss/vite`), DaisyUI 5 (theme: `forest`), Poppins + Inter fonts, React Markdown, React Syntax Highlighter (Prism, oneDark), Monaco Editor (`@monaco-editor/react`), Driver.js (guided tours), Lucide React, React Icons
- **AI Backend:** LM Studio (Local, `localhost:1234`) / Groq API / Cerebras / Custom OpenAI-compatible Endpoint
- **Embeddings/Memory:** `@huggingface/transformers` (Transformers.js) for fully local embeddings via WASM (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`, 384 dimensions)
- **Local Database & Vector Search:** `dexie` (IndexedDB wrapper, v14 schema with 6 stores) and `@orama/orama` for Hybrid Full-Text & Vector search
- **Web Capabilities:** Physical background `BrowserWindow` automation (`src/main/browser-agent.js`) with DOM parsing, animated cursor injection, and React-compatible input binding
- **Voice/Audio:** Groq API (Speech-to-Text via `whisper-large-v3`), Edge-TTS (`msedge-tts`, voice: `id-ID-ArdiNeural`), Web Audio API (Voice Activity Detection via `useVAD.js`, 16kHz sample rate, RMS threshold 0.015)
- **Media/Integrations:** `youtube-transcript-plus`, `ytmusic-api` (YouTube Music with ad-blaster), `yt-search`, `youtube-dl-exec` + `ffmpeg-static` (audio download for WA)
- **Communication:** `@whiskeysockets/baileys` (WhatsApp Web WebSocket)
- **Packaging:** `electron-builder` (NSIS installer, `appId: com.mark.agent`, `asarUnpack` for ffmpeg/yt-dlp binaries)

## 3. Project Architecture

Full file inventory, constants table, and model selection guidelines moved to [`docs/ARCHITECTURE-INTERNALS.md`](docs/ARCHITECTURE-INTERNALS.md).

Key architectural facts (TL;DR):
- **Main process** (`src/main/index.js`): 40+ IPC handlers, window management, system tray, global shortcut `Ctrl+Alt+M`.
- **AI bridge** (`src/main/ai-bridge.js`): multi-provider routing, 3-tier JSON fallback, rate limiting, backoff with model swap, `cleanAndParse` shared with renderer via `src/shared/cleanAndParse.js`.
- **Agent loop** (`src/renderer/src/hooks/agent/useMarkPlan.js`): hand-rolled ReAct loop; tool dispatch extracted into `hooks/agent/tools/` modules (youtube, music, vision, wa, native, pc, plugin, misc). Guardrails: guard-gate circuit breaker + per-tool failure counters + turn governor.
- **Permission system:** 5 approval modes (`strict/selective/auto/bypass/plan`) via `api/ai/approval-modes.js`, inspired by Claude Code. Pre-flight guard always runs regardless of mode (Claude invariant: hooks fire even in bypass).
- **Memory:** Dexie v14 (6 stores) + Orama vector search + Transformers.js embeddings (384d). Dual-save pattern (Dexie + Orama).
- **Pages** are lazy-loaded via `React.lazy` + `Suspense` (see `src/renderer/src/App.jsx`).

## 4. Key Implementation Invariants & Gotchas

Critical constants (thresholds, cooldowns, buffer sizes): see [`docs/ARCHITECTURE-INTERNALS.md`](docs/ARCHITECTURE-INTERNALS.md#key-implementation-invariants--gotchas).

### Model Selection & Persona Guidelines

- **Model Registry:** 100% JSON-driven at `~/.config/mark-agent/model-registry.json`. Zero hardcoded models in code. Add new models = edit JSON only.
- **Vision Routing (dual-path):** `deep` role → Mimo v2.5 (OCR, screenshots); `realtime` role → Gemini Flash Lite (camera). Routing via `vision-service.js` → IPC `vision:resolve-model`.
- **Primary AI Endpoint:** 9Router (`http://localhost:20128`), model `abelink` combo. **Fallback:** LM Studio (`http://localhost:1234`).
- **Recommended Models for Indonesian Persona:** ✅ Llama 3 (3.1/3.3) — best slang/banter; ✅ Qwen 2.5 — natural Indonesian; ⚠️ **Mistral NOT recommended** — butler bias + repetition loops.
- **Single-Session Design:** Mark uses a persistent single-session chat (never auto-resets). If the AI becomes repetitive/kaku, `clearChat` is the remedy.

### JSON Parsing Resilience

`ai-bridge.js` implements a 3-tier JSON response format fallback: `json_schema` → `json_object` → unrestricted with schema in prompt. `cleanAndParse` (now single-source in `src/shared/cleanAndParse.js`) applies: fast-path raw parse → strip markdown fences → jsonrepair → `{...}` substring extraction. **Do not remove these fallback parsers.**

### Browser Automation Architecture

- Physical hidden Chromium window (`show: false`), NOT headless.
- `DOM_PARSER_SCRIPT` tags up to 80 interactive elements with `data-mark-id` + glassmorphism blocking overlay.
- Type actions use prototype property descriptors for React 18+ compatibility.
- `browser-ask-user` unblocks via `document.title = 'MARK_UNBLOCK_DONE:...'`.
- Popup blocking via `setWindowOpenHandler` returning `{ action: 'deny' }`.

### Plugin System

- Plugins live in `~/Documents/Mark Plugins/` with `plugin.json` + `index.js`.
- Dynamic ESM import with `?t=Date.now()` cache-busting.
- Plugin actions exposed to AI planner via vector similarity matching against `CATEGORY_TEXTS`.

## 5. Development Guidelines for AI Agents

- **Read Before Modify:** Always read the corresponding `api/` or `hooks/` file entirely before changing state or UI logic. The codebase has deep interconnections (e.g., `useMarkPlan.js` orchestrates 15+ tool types via `tools/` dispatch modules).
- **Maintain Privacy-First Paradigm:** Avoid adding third-party tracking, analytics, or mandatory cloud dependencies. Everything must be able to fall back to a 100% offline local state.
- **Robust Error Handling:** Do not assume APIs will always return `200 OK`. Implement robust error handling, especially for rate limits (429), traffic errors (503), and offline scenarios. The existing retry logic in `ai-bridge.js` handles exponential backoff with automatic model swapping.
- **Formatting:** Write clean, consistent code and preserve any existing user comments and docstrings.
- **Electron Process Boundary:** Never mix Node.js native APIs (like `fs`, `path`) directly in the `renderer/` folder. All OS-level interactions must pass through `preload/index.js` → IPC → `main/`.
- **UI Design System:** The UI uses Tailwind CSS 4 + DaisyUI 5 (`forest` theme) with custom glassmorphism/holographic design tokens defined in `main.css`. Do not introduce ad-hoc CSS files. Use existing design tokens (`--glass-bg`, `--glass-border`, `--color-holo-border`).
- **Single-Session Chat:** Mark's chat is persistent and never auto-resets. Be cautious about operations that could corrupt the main thread in Dexie (`sessions` table, id: 1).
- **Config page structure:** `Configuration.jsx` is a shell (tabs, tour, shared state); per-section components live in `src/renderer/src/pages/config/sections/` (ConfigAI, ConfigVoice, ConfigCamera, ConfigMemory, ConfigAdmin, ConfigChat). Add new settings in the matching section.
- **Agent tool dispatch:** new tools = new module in `src/renderer/src/hooks/agent/tools/` + wire in `tools/index.js` dispatcher. Do not inline tool logic back into `useMarkPlan.js`.
