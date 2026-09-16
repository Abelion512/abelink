# Session 2026-09-16 — WS-2 thinking streaming end-to-end

## Keputusan
- Jalur token: sidecar `emit('ai:token', {text, done})` -> Rust event generik
  (tanpa ubah `cmd_node_bridge.rs`: frame `{event}` diteruskan generik,
  `ai:token` naik path yang sama dengan `ai:status`, tanpa oneshot) ->
  `window.api.onAiToken` -> `core.js fetchAI({onToken})` -> `planning.js`
  `options.onToken` -> `useAbelinkPlan` patch reasoning bubble hidup ->
  `ThinkingBubble` autoscroll.
- Opt-in `stream` flag end-to-end; tanpa `onToken` byte-identik jalur lama.
- Supervisor (`trajectorySupervisor`) tidak disentuh (per-turn, sesuai instruksi).
- Rust + `registry.mjs`: arsitektur kompatibel, layer 0-ubah (dokumen kenapa,
  bukan STOP — tidak ada inkompatibilitas).

## Berkas berubah (milik sesi ini; +255/-55)
- `sidecar/main/services/gemini-web.js` (+74/-20): `httpPost` cb `onData`,
  `extractGeminiText` + `diffStreamText` murni (hoisted fn, tanpa TDZ),
  `generateGeminiResponse(..., onToken)` emit delta + `{done:true}`.
- `sidecar/main/ai-bridge.js` (+66/-18): `assembleStreamChunks` murni,
  `readBodyIncremental` (SSE garis-lengkap emit langsung; JSON biasa buffer),
  `fetchAI(..., onToken)`, gemini-web call site + fallback teruskan onToken.
- `sidecar/engine/channels/ai.mjs` (+6/-2): `stream` opt-in -> `emit('ai:token')`.
- `src/api/tauri-bridge.js` (+2/-1 milik sesi; berkas juga disentuh kerja
  sibling workspaceRoot): `fetchAI` teruskan `stream`, `onAiToken` export.
- `src/api/ai/core.js` (+42/-2): `onToken` via options/positional, listener
  `ai:token` dipasang hanya bila ada cb, dilepas di resolve/reject/abort.
- `src/api/ai/planning.js` (+7/-1): teruskan `options.onToken` ke fetchAI.
- `src/hooks/agent/useAbelinkPlan.js` (+25/-1): akumulasi per-turn, patch
  reasoning item `isThinking` hidup; decision.thought final tetap otoritatif.
- `src/components/Chat/ThinkingBubble.jsx` (+13/-2): ref + autoscroll reasoning.
- `tests/tokenStream.test.mjs` (baru): 7 test assembler (tanpa network).

## Hasil verifikasi
- `bunx vitest run tests/tokenStream.test.mjs`: 1 file, 7 test passed.
- Tetangga: tokenStream + geminiWebSorry + providerOffline + geminiWebModels +
  core.parse: 5 file, 25 test passed.
- `bunx eslint` 9 berkas sentuh: 0 errors, 118 warnings (semua pola
  pre-existing: `catch(_)`, `React` unused, prop-types).
- Tidak commit/push/merge — semua uncommitted.

## Batasan dikenal
- Branch punya dirty files milik kerja sibling (cmd_fs.rs, tools/*,
  subagent*, agentTools, workspaceRoot.test.mjs) — tidak disentuh sesi ini.
- Stream SSE hanya untuk provider OpenAI-compatible SSE; JSON biasa +
  gemini-web non-incremental tetap blocking sampai selesai (fallback utuh).
- `diffStreamText` non-prefix (jawaban direvisi) emit ulang seluruh teks.
