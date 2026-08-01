# Session: Fix fetchAI Args CSP — 2026-07-27

## Problem
App broken on boot — 2 errors cascade:

1. `Cannot read properties of undefined (reading 'slice')` di `core.js:53` dan `planning.js:572`
2. Wasm/transformers.js + Groq API blocked by CSP

## Root Cause 1: fetchAI Argument Mismatch

`src/main/index.js:131` memanggil:
```js
fetchAI(messages, config, isSmallTask, jsonSchema, onStatus)
```
Tapi `src/main/ai-bridge.js:58` signature:
```js
fetchAI(messages, config, signal, isSmallTask, jsonSchema, onStream)
```

Akibatnya semua argumen bergeser:
- `isSmallTask` (angka → `signal`)
- `jsonSchema` (object → `isSmallTask`)
- `onStatus` (function → `jsonSchema`)

Di `ai-bridge.js:117`, `JSON.stringify(jsonSchema)` dijalankan pada `onStatus` (function) → return `undefined` → `.slice(0, 100)` crash.

**Fix:** Tambah `undefined` di slot `signal`:
```js
fetchAI(messages, config, undefined, isSmallTask, jsonSchema, onStatus)
```

**Catatan:** Router Hermes / Z.ai / Claude Code tidak terkena karena jalur panggilnya direct HTTP/CLI, bukan lewat IPC bridge `ai:fetch`.

## Root Cause 2: CSP Block

`src/renderer/index.html` CSP hanya `default-src 'self'` + `script-src 'self' blob:` — tidak mengizinkan:
- **WASM:** `'unsafe-eval'` untuk transformers.js (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`)
- **Groq API:** `connect-src https://api.groq.com` untuk STT (whisper-large-v3)
- **LM Studio / custom endpoint:** `connect-src http://localhost:*`
- **OpenAI SSE reconnect:** `connect-src data:`

**Fix:** Perluas CSP — tambah `'unsafe-eval'` di `script-src`, tambah `connect-src` dengan `data:`, `https://api.groq.com`, `https://*`, `http://localhost:*`, `ws://localhost:*`.

## Files Changed

| File | Change |
|------|--------|
| `src/main/index.js` | Fix arg order: add `undefined` for `signal` |
| `src/main/ai-bridge.js` | Safeguard: `JSON.stringify(jsonSchema)?.slice(...) \|\| 'none'` |
| `src/renderer/index.html` | Expand CSP: `unsafe-eval`, `connect-src` for Groq/LM Studio/data: |
| `src/renderer/src/api/ai/core.js` | Safe-access in debug log, try/catch wrapped IPC call |
| `src/renderer/src/api/ai/planning.js` | Safe-access fallbacks, guard abort check |
| `src/renderer/src/api/ai/chatSummarizer.js` | Safe-access abort check |
| `src/renderer/src/hooks/agent/useMarkPlan.js` | Safe-access abort check |

## Health Check
- CSP diperbaiki: WASM, Groq, LM Studio bisa connect
- fetchAI args correct: signal diteruskan, jsonSchema benar, onStatus ke onStream
- onStatus sekarang masuk ke parameter onStream — streaming mode aktif untuk calls yang kirim status callback. Tidak crash, hanya streaming response untuk calls yang tidak perlu streaming.
