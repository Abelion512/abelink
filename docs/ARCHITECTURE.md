# ABELINK Linux — Architecture (agent-oriented)

Dokumen ini referensi utama untuk AI agent (dan manusia) yang menulis kode di
repo ini. Aturan membacanya: pahami dulu peta modul dan alur data di bawah,
baru buka file spesifik. Jangan mengubah perilaku tanpa membaca file tujuan
secara penuh (aturan `AGENTS.md` § Development Guidelines tetap berlaku).

## 1. Peta Runtime (tiga dunia)

```
┌────────────────────────── Renderer (src/, React 19) ──────────────────────────┐
│  UI (pages/, components/)  +  hooks/ (orchestrator useAbelinkAgent)              │
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
| `registry.mjs` | — | `send`/`emit`/`ok`/`fail`, map `handlers`, `on()`, `lazy()` (helper `unsupported()` sudah dibuang; channel yang belum jalan mengembalikan `success: false` eksplisit atau `throw`) |
| `channels/ai.mjs` | `ai:fetch`, `ai:abort-fetch`, `ai:list-models`, `sync-config`, `native-tool:*`, `parse-document` | `sync-config` juga menyalin config ke modul telegram (auto-start bot) |
| `channels/media.mjs` | `tts-speak`, `get-youtube-transcript`, `youtube-search` | Edge-TTS + youtube-transcript-plus + yt-search (lazy) |
| `channels/telegram.mjs` | `tg:*`, `benchmark:telegram`, `remote-music-command` | Dashboard benchmark + broadcast admin (config via `setLatestConfig`) |
| `channels/services.mjs` | `plugin:*`, `plugins:list`, `google:*`, `workspace:*`, `awareness:*` | Plugin loader tanpa Electron; workspace RAG `.abelink/` |
| `channels/music.mjs` | `yt:*`, `search-music`, `ping` | ytmusic-api + yt-search (lazy). `yt:load/show/hide/command/get-duration` butuh Tauri WebviewWindow: respons `success: false` jujur, bukan sukses palsu |
| `channels/os.mjs` | `os:read/click/type/key/scroll/open/list-windows/focus-window/ask-user` | Fase B6: namespace colon alias ke implementasi dash yang LIVE di `NATIVE_TOOLS` (`node-tools.js` -> `pc-agent.js` + primitif Linux), lazy import; gagal = `throw`, bukan stub |
| `channels/browser.mjs` | `browser:navigate/read-dom/action/close/show/status` | Fase C3 Jalur A (ekstensi browser + bridge): perintah nyata via `main/browser/` — long-poll HTTP 127.0.0.1 token-auth ke ekstensi Abelink; tanpa ekstensi = error eksplisit + petunjuk pemasangan |
| `channels/skills.mjs` | `skills:*` (15 channel) | Agent Skills store: SKILL.md + anti path-traversal; `skills:open-folder` (xdg-open ter-kontinemen) untuk workflow drop folder skill + auto-scan |
| `channels/capabilities.mjs` | `capabilities:list/inspect/guide/execute/connections/authorize/revoke/audit` | Capability Manager (fase Kapabilitas, referensi OpenConnector): catalog connector → policy → eksekusi ter-audit. Connector built-in: `weather` (Open-Meteo), `time` (offline), `fs` (workspace via fsGuard), `shell-tool` (run-shell; dynamic dangerous-keyword check saat runtime). `capabilities:execute` WAJIB di `APPROVAL_ACTIONS` (rfd native). Kredensial koneksi di XDG mode 0600; audit JSONL append-only (trim 1MB). Implementasi: `main/capabilities/` (lazy import) |

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
   mengembalikan sukses palsu: handler mengembalikan `success: false` dengan
   `message`/`error` eksplisit (atau melempar) agar konsumen tahu batas
   kemampuan, bukan diam-diam percaya fitur jalan.

## 4. General Agentic Runtime Contract

The agent runtime is domain-general rather than coding-specific. Opencode and Hermes remain the preferred external coding/delegation systems; Abelink focuses on orchestration, browser/OS automation, research, learning, memory, and long-horizon recovery.

New runtime primitives:

- `src/api/ai/autonomyContract.js` — compact model-facing protocol for research, browser, OS automation, code, learning, and general tasks. This is context/protocol engineering, not a replacement for model reasoning.
- `src/api/ai/progressEvaluator.js` — deterministic comparison of consecutive observations. It distinguishes verification improvement, new evidence, semantic stagnation, regression, and neutral exploration.
- `src/api/ai/trajectoryLearning.js` — bounds and separates successful trajectory evidence from failure diagnostics before model-based skill synthesis.

Runtime flow:

```
objective
  -> micro-plan / next hypothesis
  -> policy + budget
  -> tool execution
  -> observation
  -> objective verifier + progress evaluator
  -> trajectory supervisor
  -> continue / modify / explore / retrieve / stop
  -> grounded trajectory learning
```

The objective verifier remains authoritative for completion. Progress evaluation must never bypass approval, watchdog, or budget guards.

### Browser Observation Contract

Browser observations are a reasoning interface, not a raw UI dump.

The preferred payload order is:

1. page identity (title, URL, session/tab identity)
2. main semantic text
3. relevant structured state
4. task-relevant interactive elements
5. visual/screenshot evidence only when text/DOM is insufficient

`extension/background.js` now includes main-page text in the DOM observation. `extension/browser-observation.mjs` formats that payload with semantic text first and bounds the interactive control list before it reaches the model. This is intended to reduce context distraction on UI-heavy pages while preserving enough controls for the next action.

### Research Reference Hierarchy

Primary references for agent-runtime changes:

- Anthropic context engineering and agent engineering: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- OpenAI platform / agents / observability: https://platform.openai.com/docs
- OpenAI Cookbook: https://cookbook.openai.com/
- Hermes Agent docs and source: https://hermes-agent.nousresearch.com/docs/ and https://github.com/NousResearch/hermes-agent

Secondary material is for discovery. Implementation decisions should be traceable to primary documentation, repository code, benchmarks, or reproducible tests.

## 4. Alur Data Kritis

- **Chat/plan:** renderer `useAbelinkAgent` → `planning.js` → `node_invoke('ai:fetch')`
  → bridge → `channels/ai.mjs` → `main/ai-bridge.js` (multi-provider) →
  status event `ai:status` mengalir balik via `emit()`.
- **Tool berbahaya:** model memutuskan → renderer `node_invoke('native-tool:execute')`
  → Rust cek `APPROVAL_ACTIONS`/`needsApproval` → dialog rfd native →
  baru diteruskan ke sidecar `main/node-tools.js`.
- **Benchmark (AbelinkBench):** `evaluation/run.mjs` (orchestrator multi-run:
  averaging 3x per task ala Terminal-Bench 2.1/Kimi K3, anti-cheat sentinel
  acak per run, laporan JSON `schemaVersion: 1`, regression gate `--compare`)
  → `evaluation/terminal-bench.mjs` (registry task + verifier deterministik +
  `maxTurns`, script `bun run benchmark:run`/`benchmark:echo`) →
  `abelink-adapter.mjs` (spawn sidecar persisten, multiplex per id, turn budget
  per task) → jawaban diverifier predikat yang dieksekusi → laporan JSON.
   Smoke tanpa network: `bun evaluation/smoke.mjs` (registry, verifier
   PASS/FAIL, agregasi + anti-cheat).
- **Effort/budget:** `src/api/ai/effortSystem.js` (policy kanonis LOW–ULTRA +
  AUTO resolver, immutable) → `applyLimits()` (min dari kanonis, runtime,
  provider, `SYSTEM_HARD_LIMITS`) → `BudgetState` (konsumsi mutable) →
  `BudgetSnapshot` (sisa, tidak pernah negatif). Estimasi awal per turn:
  `src/api/ai/effortEstimator.js` (deterministik, tanpa LLM call). ULTRA =
  MAX + orkestrasi workflow; hanya ULTRA yang punya `workflow_node_budget`
  (32). Spesifikasi: `docs/effort-system-spec.md`.
- **Benchmark arsitektur:** `evaluation/bench/` menilai perilaku sistem
  (planning, tool, memory, verifikasi, disiplin loop), bukan kualitas teks:
  `contract.mjs` (skema trajectory) → `tasks.mjs` (probe brain/logic/body/
  soul/planning/io) → `capture.mjs` (kontrak boundary
  `startRun`/`sendPrompt`/`endRun`/`abortRun` + normalisasi) →
  `evaluator.mjs` (rubrik 0/1 deterministik) → `runner-stub.mjs`
  (otomatisasi penuh menunggu boundary ABELINK nyata, lihat
  `boundary-spec.mjs`). Fixtures deterministik effort:
  `evaluation/effort-fixtures.mjs` + `tests/effort-fixtures.test.mjs`.
- **Knowledge:** dokumen → `ragPipeline.js` (chunk 500/50) → Dexie + Orama;
  workspace `.abelink/` → `workspace:*` channel → working memory disuntikkan ke
  system prompt.

## 5. Batasan yang Masih Sengaja Dibiarkan (jangan "perbaiki" diam-diam)

- `browser:*` → LIVE (Fase C3 Jalur A): `engine/channels/browser.mjs` + `main/browser/{bridge-core,server}.mjs` + ekstensi MV3 di `extension/`. Jalur B (spawn Chromium per profil) menyusul sebagai fallback; smoke frame end-to-end dengan browser sungguhan belum dijalankan — lihat `extension/README.md`.
- **Browser autonomy (2026-09-20, `apple-design`):** observasi tab beridentitas (`_tab={tabId,url,title,reused}`, `sessionFocusedUrl`, tolak primer yang URL-nya drift); tagger main-first cap 200/teks 120; `adoptUserTab` eksplisit (default: hanya blank/tab baru, tidak pernah curi tab user); `takeNext` tanpa drain lintas-sesi; HITL co-pilot = pause-state + pill pasif tanpa veil + resume `browser-read` tab sama (tanpa deadline); popup hijau hanya bila loop jalan; eval `hitl_discipline` (needs_user tanpa artefak = 0); validator lewati prosa `.md/.txt`. Detail: `docs/superpowers/plans/2026-09-20-browser-autonomy-restoration.md`, sesi: `docs/PLANNED/sessions/2026-09-20_browser-autonomy.md`.
- `os:*` di sidecar sudah LIVE (Fase B6, `engine/channels/os.mjs`): alias tipis ke `NATIVE_TOOLS` dash; renderer tetap memakai Rust native `os_*` commands untuk jalur utamanya.
- Dead code era Electron (skill-manager.js + 3 handler `ipcMain.on`
  telegram) sudah dibuang 2026-09-03 — lihat `docs/MIGRATION-GAPS.md` §
  Dead code.
- `yt:load/show/hide/command` butuh WebviewWindow; respons stub aman.

Rencana fase: `docs/MIGRATION-PLAN.md` (status per fase + verifikasi).
Audit gap lengkap: `docs/MIGRATION-GAPS.md`. Triage risiko dependency:
`docs/SECURITY-TRIAGE.md`.

## 6. Namespace Dev/Prod (pemisahan total)

Satu prinsip: **`ABELINK_DATA_HOME` menang atas `XDG_DATA_HOME`**
(`scripts/dev.sh` men-set-nya ke `~/.local/share/abelink-dev`; prod tidak
pernah melihat var ini). Brand `abelink` di-append SEKALI oleh helper
terpusat: Rust `data_home()` (`src-tauri/src/lib.rs:38`) + join brand di
tiap pemakai; sidecar `brandDir()` (`sidecar/main/utils/dataHome.mjs`).
JANGAN append brand manual di modul pemanggil (pernah jadi bug
double-brand + reader salah dir; bukti: `git log fix/vad-hallucination-guard`).

| Lapisan | Prod | Dev |
| --- | --- | --- |
| Data root | `$XDG_DATA_HOME/abelink/` | `$ABELINK_DATA_HOME/abelink/` |
| Harness | `.../abelink/harness/<tgl>/` (Rust selalu append brand) | `.../abelink-dev/abelink/harness/<tgl>/` |
| Workspace/skills/capabilities/google-tokens | `.../abelink/...` | `...-dev/abelink/...` |
| Bridge token | `<xdg>/abelink/browser-bridge-token` (tak pernah override) | `<override>/browser-bridge-token` (strict-flavor, `tokenPathFor`) |
| Telegram unduhan | `~/Documents/Abelink Workspace/Telegram/` | `.../Telegram-dev/` |
| Plugins | `~/Documents/Abelink Plugins/` | `~/Documents/Abelink Plugins-dev/` |
| /tmp | `abelink-attachments/`, `abelink-screenshots/` | `*-dev/` (`tmp_flavored`, `cmd_misc.rs`) |
| WebView/IndexedDB/cache/log | identifier `abelink-linux` (otomatis Tauri) | identifier `abelink.linux.dev` (`tauri.dev.json`) |

PENGECUALIAN by OS design (sengaja bersama, jangan "diperbaiki"):
root `~/Documents`, cache WebKit di luar identifier, file `/tmp` tanpa
prefix abelink.

## 7. Pipeline VAD/STT Anti-Halusinasi

`useVAD.js` → `sttGuard.js` → `sttRouter.js` (endpoint 9router
`127.0.0.1:20128`, model default `groq/whisper-large-v3-turbo`,
Groq cloud cadangan; `src/api/groq.js` legacy). Bahasa id/en/zh lewat
param `language` - prompt teks SELALU kosong (prompt kalimat intro terbukti
memandu Whisper mengarang pada audio sunyi; insiden: noise 65536 sampel →
intro asisten).

Pertahanan berlapis (standar OpenAI Whisper + faster-whisper + verbose_json):
pre-gate `isSpeechValid` (peak RMS, rasio speech-frame, durasi vokal) →
request `temperature=0`, coba `verbose_json` lalu fallback `json` →
`filterSegments` (`no_speech_prob>0.6`, `avg_logprob<-1`,
`compression_ratio>2.4`) → `isHallucinationText` (denylist id/en/zh +
heuristik cps>30). Anti-loopback TTS: `echoCancellation`/`noiseSuppression`
aktif + cooldown 800ms pasca `isAbelinkSpeaking` (`AbelinkHome.jsx` voice
auto-restart + `utils.js` stempel `abelinkTtsEndedAt`).

## 8. Kontrak Path Harness (reader = writer)

Writer tunggal: Rust `cmd_harness.rs` (`data_home()/abelink/harness/<tgl>/`,
rotasi 50MB x 3). Reader WAJIB rumus sama: `scripts/harness-common.mjs`
(`parseArgs` + `harnessRoot` bersama untuk export + diagnose).
Evaluasi: `evaluation/run.mjs` `sidecarWorkspaceRoot()` = rumus sama +
`workspace`. Kategori log baca langsung dari file (`bun run
harness:diagnose`), bukan copas user.

## 9. Engine Task Runtime Boundary (taskRuntime.js)

Durable task/session execution punya batas engine-owned yang bisa dikonsumsi
Tauri GUI, sidecar, dan CLI/API mendatang — tanpa GUI memiliki state eksekusi.

```
                    Abelink Engine Runtime
                         taskRuntime.js
               (src/api/engine/taskRuntime.js)
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
        React GUI     sidecar tasks:*       future CLI
  (useAbelinkPlan,    (DITUNDA — kembali     (belum ada)
   App startup)        bersama headless
                       store permanen)
             │                │
             └────────────────┼────────────────┘
                              ▼
                         taskStore.js
                 (otoritatif: persistensi +
                  transisi state, 7 status)
                              │
                     storage adapter
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
                 Dexie/DB        future headless storage
              (default GUI)       (via configureTaskRuntime)
```

Dan terpisah, jalur approval tidak pernah lewat runtime:

```
toolDispatcher → node_invoke → Rust APPROVAL_ACTIONS (rfd) → native tool
```

- **Delegate-only (mengikat):** `taskRuntime.js` meneruskan ke
  `taskStore.js`/`taskExecutor.js` 1:1 — tanpa state machine kedua, tanpa
  persistensi baru, tanpa logika verifikasi baru. `taskStore.js` tetap
  otoritatif selama ekstraksi ini.
- **Headless (dua bukti terpisah):** facade tanpa top-level import; default
  Dexie lazy-load hanya bila IndexedDB ada. Tanpa IndexedDB dan tanpa adapter
  → error eksplisit, bukan sukses palsu. Bukti 1 (import murni):
  `bun scripts/headless-task-runtime.mjs`. Bukti 2 (lifecycle + storage
  kompatibel via shim test): `bun scripts/headless-task-runtime-lifecycle.mjs`.
  Keduanya bukan klaim "Bun production siap" — itu butuh headless store permanen.
- **Event:** hanya yang didukung — `task.created/updated/progress/completed/
  failed/cancelled` via `emit()` sidecar / sink injeksi. `waiting_user` dan
  `approval_required` BELUM ada (tanpa stream palsu sebelum wiring dispatcher).
- **Result:** `getResult(taskId)` = derived view (status, steps, text) — tanpa
  rekontruksi dari chat history, tanpa perubahan skema.
- **Approval:** runtime tidak mengeksekusi tool dan tidak meng-approve.
  Destruktif tetap lewat `node_invoke` → dialog rfd Rust.
- **Cancel kooperatif:** `cancelTask` = persist `cancelled` + event. Operasi
  native in-flight TIDAK di-kill (tanpa abort propagation; timeout bridge 300s).
  Penelepon tetap abort loop/signal sendiri.

## 10. Kebijakan Toolchain Linux-Only

Stdlib/platform dulu sebelum kode baru (`AbortSignal.timeout` ditunda
sampai WebKitGTK target terverifikasi - lihat `ponytail:` di
`sttRouter.js`). Tanpa cabang `win32`, tanpa keyword Windows-era di
deteksi perintah (alias `run-powershell` tetap sebagai alias).
Deferral sadar ditandai `ponytail: <ceiling>, <upgrade>` (ledger:
`eslint.config.mjs:46`, `effort-fixtures.mjs:153`,
`window_tracker.rs:61`, `sttRouter.js` AbortSignal).

## 11. Operating Model & Autonomy Subsystems (Hermes × Anthropic Adoption)

Adopsi pola operasi mandiri dan batasan keamanan (merujuk `docs/OPERATING-MODEL.md` & `docs/OPERATING-ADOPTION.md`):

1. **Sensitive-Write Hardline (Hermes 3-tier):**
   - Boundary penjaga di Rust shell (`src-tauri/src/hardline.rs`) dan Node sidecar (`sidecar/main/tools/_shared.mjs`).
   - Melindungi path sensitif user (`~/.ssh`, `.env`, `.bashrc`, `.zshrc`, credentials) dengan penolakan langsung atau wajib rfd approval.
2. **Explicit Memory Router Subsystem:**
   - Pemilihan dan perakitan konteks terpusat (`src/api/ai/memoryRouter.js`) memisahkan budget prompt dari long-term memory.
   - Groundedness guard mutlak: jika pencarian kosong atau parsial, LLM dilarang keras mengarang fakta historis fiktif.
3. **Unified Memory Tool & Atomic Engine:**
   - Single tool `memory` (`src/api/ai/memoryTool.js`) untuk mutasi ingatan (`add`, `replace`, `remove`, `batch`).
   - Sifat transaksi atomic (all-or-nothing pada batch) dan penegakan `perTurnFailureCap: 3` untuk memutus loop spinning model.
4. **Deferred Tool Search Catalog:**
   - `src/api/tools/toolCatalog.js`: registry kaya metadata dengan deskripsi, query format, tags, dan contoh pemakaian.
   - Mengurangi overhead prompt dengan pemuatan definisi on-demand via `read-tools`.
5. **Skill Folder Bundle & Manifest Traversal:**
   - `src/api/skills/skillFolder.js` + `sidecar/engine/channels/skills.mjs`: mendukung struktur folder skill penuh (`SKILL.md`, `references/`, `scripts/`).
   - Query format `nama_skill||subpath` dengan proteksi fail-closed path traversal (`sanitizeSkillRelPath`).
6. **Durable Handoff Contract JSON:**
   - `src/api/ai/handoffContract.js`: kontrak terstruktur 7 field kanonis (`objective`, `done`, `remaining`, `blocked`, `artifacts`, `verified`, `next_action`) yang ter-persist di checkpoint step dan `taskRuntime`.
7. **RSI Telemetry, Nudge, & Mini Evaluation Engine:**
   - `src/api/ai/skillMiniEval.js`: evaluasi kualitas skill (substansi, struktur, tindakan, sanitasi pola berbahaya).
   - Auto-graduation empiris: promosi status skill dari `trial` ke `active` saat digunakan kembali (`read-skill` use count > 0) atau saat evaluasi mini lolos, menutup siklus Recursive Self-Improvement.

