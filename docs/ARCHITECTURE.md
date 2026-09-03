# MARK Linux — Architecture (agent-oriented)

Dokumen ini referensi utama untuk AI agent (dan manusia) yang menulis kode di
repo ini. Aturan membacanya: pahami dulu peta modul dan alur data di bawah,
baru buka file spesifik. Jangan mengubah perilaku tanpa membaca file tujuan
secara penuh (aturan `AGENTS.md` § Development Guidelines tetap berlaku).

## 1. Peta Runtime (tiga dunia)

```
┌────────────────────────── Renderer (src/, React 19) ──────────────────────────┐
│  UI (pages/, components/)  +  hooks/ (orchestrator useMarkAgent)              │
│  api/tauri-bridge.js  = SATU-SATUNYA pintu keluar; tanpa Node API langsung    │
└───────┬───────────────────────────────┬───────────────────────────────────────┘
        │ invoke() (Tauri IPC)          │ node_invoke(action, ...args)
┌───────▼───────────────┐   ┌───────────▼──────────────────────────────────────┐
│ Rust shell (src-tauri)│   │ sidecar/engine.mjs (bun, proses child stdio JSON)│
│ cmd_fs / cmd_misc /   │   │  engine/registry.mjs   ← protokol + handler map  │
│ cmd_node_bridge /     │   │  engine/channels/*     ← ai, media, telegram,    │
│ cmd_harness           │   │                          services, music, skills │
│ APPROVAL_ACTIONS gate │   │  main/*                ← modul domain berat      │
└───────────────────────┘   └──────────────────────────────────────────────────┘
```

- **Renderer** tidak pernah menyentuh OS langsung. Semua akses lewat
  `window.api` (`src/api/tauri-bridge.js`).
- **Rust shell** menangani fs ter-kontinemen (`cmd_fs.rs`), perintah ringan
  (`cmd_misc.rs`), bridge sidecar (`cmd_node_bridge.rs`), dan log dev
  (`cmd_harness.rs`). Keputusan approval terjadi di Rust main thread (rfd),
  bukan di renderer.
- **Sidecar engine** (Bun) membawa modul domain era Electron yang sudah
  dipindah ke dalam registry modular. Protokol: JSON lines di stdin/stdout.

## 2. Sidecar Channel Registry (sidecar/engine/)

`engine.mjs` hanyalah **composition root**: memuat modul channel + loop
stdin. Semua handler didaftarkan lewat `registry.mjs`.

| Modul | Channel | Keterangan |
| --- | --- | --- |
| `registry.mjs` | — | `send`/`emit`/`ok`/`fail`, map `handlers`, `on()`, `unsupported()`, `lazy()` |
| `channels/ai.mjs` | `ai:fetch`, `ai:abort-fetch`, `ai:list-models`, `sync-config`, `native-tool:*`, `parse-document` | `sync-config` juga menyalin config ke modul telegram (auto-start bot) |
| `channels/media.mjs` | `tts-speak`, `get-youtube-transcript`, `youtube-search` | Edge-TTS + youtube-transcript-plus + yt-search (lazy) |
| `channels/telegram.mjs` | `tg:*`, `benchmark:telegram`, `remote-music-command` | Dashboard benchmark + broadcast admin (config via `setLatestConfig`) |
| `channels/services.mjs` | `plugin:*`, `plugins:list`, `google:*`, `workspace:*`, `awareness:*` | Plugin loader tanpa Electron; workspace RAG `.mark/` |
| `channels/music.mjs` | `yt:*`, `search-music`, `ping`, stub `browser:*`/`os:*` | Stub eksplisit fase B6/C3 — jangan diberi respons palsu sukses |
| `channels/skills.mjs` | `skills:*` (14 channel) | Agent Skills store: SKILL.md + anti path-traversal |

**Aturan menambah channel baru:** buat/ubah modul di `engine/channels/`,
daftarkan dengan `on('nama:aksi', handler)`, lalu import modulnya di
`engine.mjs`. Jika aksinya destruktif, WAJIB masuk `APPROVAL_ACTIONS` di
`src-tauri/src/cmd_node_bridge.rs`. Jangan pernah menulis stdout langsung dari
modul channel — gunakan `emit()` dari registry.

**Paritas handler dipantau:** smoke test frame (`docs/MIGRATION-GAPS.md`
§ Metode audit) membandingkan daftar channel renderer vs handler engine.
Saat refactor registry ini, paritas 69/69 terverifikasi.

## 3. Pola Arsitektur yang Diadopsi (dari pola Agent Skills / plugin Claude)

Sumber pola: ekosistem plugin/Agent Skills Claude (claude.com/plugins), pola
security solution Claude (claude.com/solutions/cybersecurity: policy
adherence + agentic multi-step di bawah kendali kebijakan), dan praktik
harness benchmark frontier. Bukan salinan kode — prinsipnya yang diadopsi:

1. **Progressive disclosure / load-when-needed.** Modul berat (ai-bridge,
   telegram, plugin-loader, transformers) di-import saat channel-nya pertama
   kali dipakai (`lazy()` di registry). Efek samping (interval polling)
   baru hidup saat benar-benar dibutuhkan. Skill mengikuti pola yang sama:
   listing hanya nama+deskripsi; isi SKILL.md dibaca saat dipakai.
2. **Filesystem-based capability store.** Skills = folder `<nama>/SKILL.md`
   di XDG data dir; plugin = folder + manifest. Tidak ada database opaque —
   agent bisa membaca store langsung dari shell. (Pola plugin directory:
   metadata terkurasi di listing, kode dieksekusi ter-isolasi.)
3. **Registry, bukan monolit.** Satu map handler + modul per domain. Menambah
   kemampuan tidak pernah menyentuh core loop.
4. **Policy adherence di boundary.** Approval (rfd native) dan sanitasi path
   (`resolve_contained`, `sanitizeSkillRelPath`) hidup di lapisan eksekusi,
   bukan di lapisan keputusan AI. Model tidak bisa meng-approve dirinya.
5. **Fail-fast capability signaling.** Channel yang belum di-port tidak
   mengembalikan sukses palsu — `unsupported()` eksplisit agar konsumen tahu
   batas kemampuan, bukan diam-diam percaya fitur jalan.

## 4. Alur Data Kritis

- **Chat/plan:** renderer `useMarkAgent` → `planning.js` → `node_invoke('ai:fetch')`
  → bridge → `channels/ai.mjs` → `main/ai-bridge.js` (multi-provider) →
  status event `ai:status` mengalir balik via `emit()`.
- **Tool berbahaya:** model memutuskan → renderer `node_invoke('native-tool:execute')`
  → Rust cek `APPROVAL_ACTIONS`/`needsApproval` → dialog rfd native →
  baru diteruskan ke sidecar `main/node-tools.js`.
- **Benchmark (MarkBench):** `evaluation/terminal-bench.mjs` (entry
  `runTask`/`runAll`, script `bun run benchmark:echo`) → `mark-adapter.mjs`
  (spawn sidecar persisten, multiplex per id) → jawaban diverifier predikat
  deterministik yang dieksekusi → laporan JSON + opsional Telegram dashboard
  (`benchmark:telegram`). Smoke tanpa network: `bun evaluation/smoke.mjs`.
- **Knowledge:** dokumen → `ragPipeline.js` (chunk 500/50) → Dexie + Orama;
  workspace `.mark/` → `workspace:*` channel → working memory disuntikkan ke
  system prompt.

## 5. Batasan yang Masih Sengaja Dibiarkan (jangan "perbaiki" diam-diam)

- `browser:*` stub → Fase C3 (butuh WebviewWindow multi-session di Rust).
- `os:*` stub di sidecar; renderer memakai Rust native `os_*` commands.
- `main/skill-manager.js` + 3 handler `ipcMain.on` telegram = dead code era
  Electron (paritas fitur sudah pindah); kandidat pembersihan menyusul.
- `yt:load/show/hide/command` butuh WebviewWindow; respons stub aman.

Rencana fase: `docs/MIGRATION-PLAN.md` (status per fase + verifikasi).
Audit gap lengkap: `docs/MIGRATION-GAPS.md`. Triage risiko dependency:
`docs/SECURITY-TRIAGE.md`.
