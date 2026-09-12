# Session 2026-09-11 — Vision-bloat fix, capabilities overhaul, modularisasi agentic (F0–F5)

## Ringkasan

**Keywords:** vision bloat, prompt bloat, base64 history, sanitasi konteks, context sanitization, vision 9router, STT gateway lock, STT router, TTS facade, capabilities audit, capability tiering, MCP transport, MCP client, custom MCP connector, os automation Fase B6, os.mjs channel, bundle optimization, optimasi bundle, manualChunks, useAbelinkPlan split, god hook refactor, node-tools split, db orama cycle, variation operators, stopping policy, graphify knowledge graph

- **Tanggal:** 2026-09-11 · **Branch:** main · **Mode:** plan → build
- **Audit Trail:** `ls docs/PLANNED/sessions/` → kosong (0 file); `git log --grep vision|modular` → commit lama beda scope (vision-service era, channel registry #18) — tidak ada patch serupa. Patch sesi ini benar-benar baru.
- Bermula dari error `Gemini Web gagal ekstrak jawaban` saat share screen. Root cause berlapis: (1) `gemini-web` RPC drop image by design; (2) base64 screenshot bocor ke history Dexie → prompt ~1M token → semua provider gagal; (3) STT bootstrap groq+groq; (4) tombol Uji Suara manggil API tak ada; (5) custom MCP vapor (UI-only); (6) `os:*` stub sukses-semu; (7) god-file `useAbelinkPlan` 2705 + `node-tools` 2135 baris.
- Dieksekusi 6 fase (F0 graphify → F1 MCP register → F2 bedah hook → F3 MCP transport → F4 split registry → F5 reasoning operators). Semua hijau.

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
|---|---|---|---|---|
| Chat aman, share screen `wrb.fr` kosong | `ai-bridge.js:118-119` | gemini-web RPC tidak support vision, image di-drop | Route vision ke 9router (`fetchVisionAI`, chain 3 model) | ✅ |
| `AI fetch gagal` massal, ~1M est. tokens | `useAbelinkPlan.js`, `contextCompactor.js` | dataURL persist di Dexie + dikirim ulang tiap turn | `stripImageContent`/`stripDataUrls`, persist placeholder, guard `core.js` | ✅ (12k token) |
| `TypeError error.message.includes` | `useAbelinkPlan.js:2600`, `planning.js:814` | error bisa string tanpa `.message` | Optional chaining + `errorMsg` | ✅ |
| STT groq primary + groq fallback | `db.js`, `sttRouter.js` | default ikut `groqApiKey` | Migrasi v26: primary kunci `127.0.0.1:20128`, groq cadangan | ✅ |
| Uji Suara no-op | `tauri-bridge.js`, `VoiceVideoSection.jsx` | `speakTTS` tak ada di bridge | Alias `speakTTS` + label online-only | ✅ |
| Whisper tiny diabaikan | `whisperWorker.js`, `localWhisper.js` | model hardcode `whisper-small` | Param model diteruskan dari config | ✅ |
| Otorisasi custom MCP "tidak dikenal" | `catalog.mjs`, `CapabilitiesHub.jsx` | custom cuma di localStorage, sidecar tak kenal | `registerConnector` + channel `register-custom` + headers | ✅ |
| MCP tanpa transport | `manager.mjs` (baru `mcp-client.mjs`) | tidak ada client | Streamable HTTP client (init/list/call, SSE, timeout 20s) | ✅ |
| `os:*` stub sukses-semu | `music.mjs:93-105` | `unsupported()` bungkus `ok()` | `os.mjs` alias ke NATIVE_TOOLS dash (LIVE), spike 763ms | ✅ |
| Capabilities over-gate | `cmd_node_bridge.rs` | blanket `capabilities:execute` | Tiering `is_readonly_capability` (weather/time/fs-read lolos) | ✅ |
| os-open xdg-open arbitrer | `node-tools.js` os-open | tanpa batas ekstensi | Denylist executable/script di luar sesi | ✅ |
| Crash HMR AutomationHUD | `AutomationHUD.jsx:6` | `useChat()` null saat refresh | `\|\| {}` guard | ✅ |
| `httpPost` gemini tanpa timeout | `gemini-web.js` | gantung → Rust kill 300s | Timeout 120s + pesan jelas | ✅ |
| Entry 2.4MB | `vectorMemory.js`, `vite.config.js` | impor statis transformers | Dynamic import + manualChunks → 937kB | ✅ |
| Audit sync + refetch full | `connections.mjs`, `CapabilitiesHub.jsx` | fs sync, UI refetch katalog | Async + throttle trim + pagination offset + refresh ringan | ✅ |
| Retry prompt sama 3x | `planning.js` | tanpa variasi strategi | Variation operators per-attempt + budget hint 7 langkah | ✅ |

## Files Modified

- Baru: `src/hooks/agent/plan/{mediaTools,visionTools,knowledgeTools,agentTools,toolDispatcher}.js`, `sidecar/engine/channels/os.mjs`, `sidecar/main/capabilities/mcp-client.mjs`, `sidecar/main/tools/{_shared,fsTools,shellTools,browserTools,osTools,googleTools,commsTools}.mjs`, `tests/visionBloat.test.js`, `graphify-out/` (graph 2713 node, queryable)
- Ubah: `useAbelinkPlan.js` (2705→1851), `node-tools.js` (2135→index), `db.js` (migrasi v26 + lazy orama), `contextCompactor.js`, `core.js`, `planning.js`, `awareness.js`, `useAwareness.js`, `useRelationalGrowth.js`, `sttRouter.js`, `localWhisper.js`, `whisperWorker.js`, `tauri-bridge.js`, `catalog.mjs`, `manager.mjs`, `connections.mjs`, `capabilities.mjs`, `music.mjs`, `engine.mjs`, `media.mjs` (tidak), `CapabilitiesHub.jsx`, `VoiceVideoSection.jsx`, `DropAnywhere.jsx` (drag-drop native `tauri://drag-drop`), `AutomationHUD.jsx`, `vite.config.js`, `AGENTS.md`, `cmd_node_bridge.rs`, `tests/capabilities.test.mjs`

## Agent Learnings

- Bun `bun -e` tanpa `process.exit` menggantung bila daemon stdio terbuka — selalu close sesi + exit di spike script.
- `on()` registry spread payload array — channel multi-arg (limit, offset) langsung cocok tanpa wrapper.
- Shrink-guard graphify melindungi graf kemarin yang lebih kaya (2713 vs 2268 node) — jangan force; beda = 58 gambar aset yang sengaja di-skip.
- Surgery file god via python marker-index: assert tiap batas SEBELUM write; off-by-one paling sering dari komentar separator.
- `await` pada non-promise harmless — boleh untuk API yang berubah sync→async bertahap.
- Rust `approval_reason` menerima payload — tiering tanpa ubah caller.

## File Invariants

- `sidecar/main/node-tools.js` = index komposisi SAJA; definisi tool di `sidecar/main/tools/*`; helper di `_shared.mjs`.
- `src/hooks/agent/useAbelinkPlan.js` = ReAct loop SAJA; eksekutor di `src/hooks/agent/plan/`.
- `CONNECTORS` boleh di-extend runtime via `registerConnector` — jangan hardcode custom di `catalog.mjs`.
- Kredensial MCP (headers) hanya di `connections.json` 0600 + memori — tidak ke renderer/log.
- Dexie `sessions.data` TIDAK boleh berisi dataURL >10k char (invariant anti-bloat).

## Verification Checklist

- [x] vitest 506 passed / 1 skipped (termasuk `visionBloat` 6 + `capabilities` 24)
- [x] `vite build` sukses (entry 937kB)
- [x] `cargo check` sukses (tiering + gate Rust)
- [x] Spike `os:*` live: open→read→list→close 763ms; `os:read` via channel 194ms
- [x] Bench-gate: 13/13 dimensi PASS (latensi verifier = noise mesin, bukan regresi)
- [ ] E2E manual: `ss` → analisis via 9router; otorisasi Context7 dengan API key asli; drag file dari Dolphin/Nautilus

## Callback

E2E manual di atas butuh gateway 9router + API key di tangan kamu — setelah kamu coba `ss` dan otorisasi Context7, laporkan hasilnya agar sisa backlog (TTS router butuh path API dashboard, sandbox daemon, overlay window) diprioritaskan berdasarkan bukti lapangan, bukan asumsi?
