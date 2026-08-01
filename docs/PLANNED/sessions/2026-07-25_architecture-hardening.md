# Session: Architecture Hardening — 25 Juli 2026

## Ringkasan
Sesi full-day refactor arsitektur untuk Mark agent — turn governor, granular guardrails, prompt compressor, output sanitizer, fallback serializer, CSP fix. Total **7 new files + 11 modified files**.

---

## Changes

### New Files (7)

| File | Deskripsi |
|------|-----------|
| `src/renderer/src/api/ai/output-sanitizer.js` | Tool output pre-processor. Strip HTML/JSON/ANSI dari raw output browser, CLI, read-file sebelum masuk LLM |
| `src/renderer/src/api/ai/fallback-serializer.js` | 3-strategy parser: JSON → XML tags → key-value lines. Break retry death spiral kalo model gak bisa JSON |
| `src/renderer/src/api/ai/guard-gate.js` | Circuit breaker: pre-flight + post-flight check. 3x failure → open → degraded mode (60s recovery) |
| `src/renderer/src/api/ai/prompt-compressor.js` | Hermes-style context compressor. Threshold 0.75 → target 20%. Protect first 3 + last 20 messages |
| `src/renderer/src/api/ai/input-architecture.js` | Input translation layer |
| `src/renderer/src/api/ai/verification-service.js` | Verification service |
| `.hermes/plans/2026-07-25_120000-architecture-hardening.md` | Plan |

### Modified Files (11)

| File | Issues Fixed |
|------|--------------|
| `src/renderer/src/hooks/agent/useMarkPlan.js` | **Turn governor** (max 10 turns), **per-turn timeout** (5s→30s), **granular guardrails** (Hermes-style: exact_failure / same_tool_failure / idempotent_no_progress), **tool failure tracking** → force /s setelah 2x gagal |
| `src/renderer/src/api/ai/planning.js` | **Fallback serializer** integrate, **prompt compressor** integrate, **FALLBACK_PROMPT_SUFFIX** di retry, **degradedMode** di system prompt |
| `src/renderer/src/api/ai/core.js` | Updated |
| `src/main/ai-bridge.js` | **Error message fix**: "LM Studio mati di port 1234" → "Server AI (endpoint) tidak merespons", **auto-retry improvements** |
| `src/renderer/src/api/ai/chatSummarizer.js` | Updated |
| `src/renderer/index.html` | **CSP fix**: tambah `blob:` ke `script-src` (unblock @huggingface/transformers WASM) |
| `src/renderer/src/api/vectorMemory.js` | **vectorDisabled failover**: pas CSP block wasm, skip all vector ops (gak blocking tiap turn) |
| `src/main/browser-agent.js` | **await bug fix**: callback `page-title-updated` missing `async` |
| `.gitignore` | Updated |

---

## Architectural Decisions

### Turn Governor (Hermes-inspired)
```
MAX_TURNS = 10
PER_TURN_TIMEOUT = 30s

GUARDRAIL_WARN  = { exact_failure: 2, same_tool_failure: 3, idempotent_no_progress: 2 }
GUARDRAIL_STOP = { exact_failure: 5, same_tool_failure: 8, idempotent_no_progress: 5 }
```
- Tool gagal 2x berturut → inject `/s` force-switch prompt
- Tool gagal 8x → hard stop, tool blacklist
- Idempotent no progress 5x → force answer

### Context Compression
```
threshold: 0.75   → compress when >75% of 128K
target_ratio: 0.2 → compress to 20%
protect_last_n: 20
protect_first_n: 3
```
- Hermes juga punya `prompt_caching.cache_ttl: 5m` — kita gak punya server-side caching, jadi compression lebih penting
- Kepicu setelah ~25+ turn dalam satu workflow

### Error Messages
- `ai-bridge.js` offline error sekarang tampilin endpoint aktual, bukan hardcode `localhost:1234`
- Helpful debugging: "Server AI (http://localhost:20128/v1/...) tidak merespons"

---

## Lessons Learned
1. **5s timeout terlalu agresif** untuk model gede — DeepSeek V4 butuh waktu reasoning. Naikin ke 30s
2. **Client-side WASM transformer** (Xenova) rentan CSP — perlu `blob:` di CSP atau pindah ke server-side
3. **Hermes architecture gak kena masalah ini** karena renderer tipis, logic di gateway/server. Vector embedding jalan di server.
4. **Event callback missing async** — pre-existing bug di `browser-agent.js:86` yang ke-detect pas build
5. **Compressor threshold default terlalu tinggi** (0.75 dari 128K = 96K) — perlu turunin atau prompt caching biar efektif

---

## Open Items
- [ ] Prompt compression threshold turunin (0.75 → 0.4) biar aktif lebih awal
- [ ] Server-side prompt caching (9-router support?)
- [ ] Awareness engine port — udah di-diagnosis (error message misleading), tapi engine sendiri "fitur core gabisa diubah"
- [ ] YouTube webview gagal (ERR_ABORTED -3) — perlu riset komunitas
