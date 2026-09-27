# Adopsi Hermes ke Engine CLI/TUI — Matriks Terverifikasi + Urutan Eksekusi

Tanggal: 2026-09-26
Status: PLAN (menggantikan tabel kasar di `2026-09-22_cli-engine-roadmap.md` §Pemetaan kini)
Sumber primer: hermes-agent.nousresearch.com/docs (+ repo NousResearch/hermes-agent)

## 0. Kenapa plan lama terasa tidak jelas

1. Status kabur: "Ada / Ada, tersebar / Belum" tanpa bukti file, dan tidak
   membedakan **kode ada** vs **ter-wire** (contoh: `gateway.mjs` ada + 16 test,
   tapi tidak diimpor siapa pun).
2. Klaim "satu inti banyak host" tidak akurat: GUI punya loop SENDIRI
   (`src/hooks/agent/useAbelinkPlan.js` baris ~670, `loopMessages`), sedangkan
   `runAgentLoop` hanya dipakai CLI/TUI/bench.
3. Tidak ada acceptance test per item, tidak ada dependensi/urutan, tidak ada
   daftar "yang sengaja TIDAK diadopsi".

Dokumen ini memperbaiki ketiganya.

## 1. Kosakata status (wajib dipakai apa adanya)

| Status | Arti |
| --- | --- |
| DONE | implementasi + ter-wire + ada test; bukti ditulis |
| KODE-ADA (UNWIRED) | modul + test ada, tapi tidak diimpor/dipanggil runtime |
| PARTIAL | sebagian jalur saja (mis. hanya GUI) |
| PLANNED | belum ada, tugas + acceptance ditulis |
| REJECTED | sengaja tidak diadopsi + alasan |

## 2. Matriks adopsi (H1..H12)

### H1 — Satu inti, banyak host (platform-agnostic core)
- Sumber: Hermes runs CLI + desktop + messaging + IDE dari satu core.
- Target: `src/api/ai/agentRunner.js` `runAgentLoop`.
- Status: **DONE (via ADR, 2026-09-26 — M3)**. Keputusan D1: `docs/ADR-001-loop-divergence.md`
  — GUI mempertahankan loop sendiri; paritas dikunci lewat modul governance
  BERSAMA (objectiveVerifier + trajectorySupervisor + planStepBudget +
  classifier) dan test `tests/loopParity.test.mjs` yang gagal bila salah satu
  loop berhenti memanggil gerbang. Bukti pengukuran: kedua loop sudah
  memanggil modul yang sama, jadi "satu core" diwujudkan di lapisan governance,
  bukan di lapisan loop.
- Acceptance (versi ADR): `docs/ADR-001-loop-divergence.md` ada + test paritas
  gagal bila salah satu loop melewatkan gerbang verifikasi. ✅
- Blocked-by: tidak ada.

### H2 — Provider runtime (precedence + key scoped per base URL + fallback)
- Target: `src/api/ai/headlessCli.js` (`resolveCliAuth`) + `shared.json`.
- Status: **PARTIAL**. Precedence flags>env>file sudah ada; key belum di-scope
  per base URL; fallback model **dilarang** (keputusan owner — jangan adopsi
  fallback chain).
- Task H2: peta key per endpoint (`keysByEndpoint[endpoint]`) agar ganti
  endpoint tidak memakai key lama; tanam di `resolveCliAuth` + GUI.
- Acceptance: test unit "endpoint A pakai key A, endpoint B pakai key B, tanpa
  key B -> error jujur (bukan pakai key A)".

### H3 — Session storage (SQLite WAL + FTS + isolasi profil)
- Target: `~/.config/abelink/cli-sessions/*.json` (CLI/TUI) vs Dexie (GUI).
- Status: **PARTIAL**. File store ada; tanpa FTS/lineage; GUID tidak terpisah
  (profil = HOME yang sama).
- Task H3: evaluasi migrasi ke SQLite (bun:sqlite sudah dipakai `loadNineRouterKey`)
  + FTS5 untuk `/sessions <query>`; tambah isolasi profil (1 dir per workspace)
  sebelum bikin FTS.
- Acceptance: `/sessions cari-teks` menemukan sesi berdasarkan isi pesan, dan
  test migrasi JSON->SQLite idempoten.

### H4 — Turn lifecycle: interruptible + compression lindungi N pesan terakhir
- Target: `cli/tui/engine.mjs` (`/compact` naive `slice(-10)`), GUI
  `src/api/ai/sessionCompactor.js`.
- Status: **PARTIAL**. AbortController per turn ADA di TUI
  (`createTuiTurn`); kompaksi hanya di GUI.
- Task H4: pakai `sessionCompactor` di TUI/CLI (bukan slice buta), dan jaga
  kontrak "20 pesan terakhir tidak dipangkas".
- Acceptance: test `/compact` TUI mempertahankan 20 pesan terakhir + menurunkan
  estimasi token (fungsi murni diuji).

### H5 — Tool gateway + hooks (pre/post tool)
- Target: `sidecar/main/node-tools.js` (`NATIVE_TOOLS`).
- Status: **DONE (jalur headless, M2c 2026-09-26)**. Choke point dipilih di
  HOST (bukan di dalam `node-tools.js`): `cli/core/tool-hooks.mjs`
  `executeToolWithHooks` membungkus `environment.executeTool` di ketiga host
  (`bin/abelink.mjs`, `bin/abelink-tui.mjs`, `cli/tui/engine.mjs`) — mencakup
  SEMUA dispatch headless (NATIVE_TOOLS lokal + fallback RPC sidecar),
  dikawal `createToolAuditLogger` (audit JSONL via harness writer PLAN-T1 +
  patch sesi). `onBeforeTool` = block, `onAfterTool` = redaksi (tak bisa
  mengubah audit yang sudah ditulis), hook error tak pernah fatal.
- Sisa jujur: dispatch INTERNAL sidecar (`engine/channels/*`) belum ber-hook —
  disentuh saat M4 (registry bertipe), bukan sekarang.
- Acceptance: ✅ test `tests/toolHooks.test.mjs` — "hook after menerima
  {tool, ok, ms}" + audit JSONL bertambah (termasuk tool yang di-deny).

### H6 — Skills + self-improvement (learning loop)
- Sumber: Hermes "creates skills from experience, improves them during use".
- Target: `sidecar/engine/channels/skills.mjs`, `src/api/ai/skillSynthesizer.js`,
  `src/api/ai/skillMiniEval.js`, `learnedSkills` (Dexie).
- Status: **PARTIAL**: store SKILL.md + sintesis + mini-eval ada di GUI; CLI/TUI
  hanya bisa `read-skill` (tanpa sintesis/eval).
- Task H6: expose sintesis+eval lewat channel yang sama sehingga sesi TUI bisa
  memanen skill; tetap di belakang approval (skills:* sudah di APPROVAL_ACTIONS).
- Acceptance: sesi TUI dengan 2 kegagalan+sukses menghasilkan 1 kandidat skill
  di `learnedSkills` (test E2E mock).

### H7 — Memory tool
- Target: `src/api/ai/memoryTool.js`.
- Status: **PARTIAL**: dipakai `knowledgeTools.js` + `subagentExecutor.js`
  (GUI/subagent), tidak di CLI/TUI.
- Task H7: daftarkan `memory` sebagai tool headless (TUI/CLI) dengan store
  `working-memory.json` yang sudah ada.
- Acceptance: `abelink "ingat: X" --json` menulis entri yang terbaca
  `loadHeadlessMemories`.

### H8 — Delegation / subagents
- Target: `spawn_subagent` (headless: `runHeadlessSubagent`, depth 2/3 per task)
  + GUI `subagentExecutor`.
- Status: **DONE (headless)** untuk spawn; `delegate_coding` **belum ada di
  TUI/CLI** (hanya renderer) — dikunci ke opencode/hermes.
- Task H8: channel `coding:delegate` di sidecar memakai `codingAgentBridge`
  agar GUI + TUI/CLI satu jalur (lihat dokumen paritas §E5).
- Acceptance: `abelink "..." --json` bisa memanggil `coding:delegate` dan
  menolak agen di luar opencode/hermes.

### H9 — Gateway adapter (MessageEvent + session key + auth berlapis)
- Target: `sidecar/main/telegram/gateway.mjs` + `telegram-service.js`.
- Status: **KODE-ADA (UNWIRED)**. Bukti: `gateway.mjs` mengekspor
  `normalizeTelegramUpdate/sessionKeyForEvent/isAllowed/createTelegramGateway`;
  `telegram-gateway.test.mjs` 16 test; TAPI `telegram-service.js` &
  `channels/telegram.mjs` **tidak mengimpornya**.
- Task H9: sambungkan `createTelegramGateway` ke service (normalisasi ->
  allowlist -> guard -> `runAgentLoop` -> reply), atau hapus kode bila tak jadi
  dipakai (jangan biarkan zombie).
- Acceptance: pesan Telegram nyata (atau mock update) menghasilkan
  `runAgentLoop` terpanggil + balasan; test lama `telegramStart` tetap hijau.

### H10 — Cron scheduler (jobs.json, at-most-once, recursion guard)
- Target: `bin/abelink-cron.mjs`, `tests/cron-scheduler.test.mjs` (27 test).
- Status: **KODE-ADA (UNWIRED secara operasional)**: tidak ada script
  `package.json` (`grep cron package.json` = kosong), tidak ada unit systemd,
  jadi hanya bisa dijalankan manual.
- Task H10: tambah script `cron:daemon` + unit systemd user + dokumentasi
  "cara hidupkan"; ledger + delivery `log` dulu (telegram opt-in).
- Acceptance: `bun run cron:daemon` menjalankan job interval 1 menit sekali
  (uji manual 2 tick) dan `abelink cron list` menampilkan `nextRunAt`.

### H11 — Approval / permission (two-level guard)
- Target: `src/api/ai/headlessSecurity.js` + `resolveApprovalDecision` + GUI
  `ApprovalContext` + Rust `APPROVAL_ACTIONS`.
- Status: **DONE** (headless default auto + hardline never relay + native rfd
  untuk aksi destruktif).
- Sisa: paritas mode di TUI/CLI (`--permission-mode` hanya di CLI headless;
  TUI belum menyediakan switch selain label `auto`).
- Acceptance: `/permission auto|manual|dont-ask` di TUI mengubah relay
  (test + label berubah).

### H12 — MCP (tools dinamis dari server MCP)
- Sumber: Hermes "can load tools dynamically from MCP servers" (tools-reference).
- Target: BELUM ADA di Abelink. `capabilities/*` bukan MCP (itu catalog internal).
- Status: **PLANNED (evaluasi dulu)**.
- Task H12: spike 1 sesi — MCP client stdio (JSON-RPC) -> daftarkan tool ke
  `NATIVE_TOOLS` sebagai namespace `mcp:<server>:<tool>`; policy approval
  mengikuti H11. Jangan adopsi sebelum ada server MCP nyata untuk diuji.
- Acceptance: 1 server MCP lokal (mis. filesystem) mengekspos tool yang bisa
  dipanggil TUI/CLI dengan approval.

## 3. Urutan eksekusi (wave) + dependensi

| Wave | Isi | Dependensi | Kenapa duluan |
| --- | --- | --- | --- |
| W0 | H9 (wire gateway) + H10 (ops cron) | — | Menyelesaikan kode-ada-unwired; murah, menghapus ambiguitas |
| W1 | Trajectory headless (dok. paritas PLAN-T1) + H5 (tool hooks) | W0 tidak wajib | Tanpa observability, item lain tak bisa divalidasi |
| W2 | H1 (satu inti atau ADR) + H3 (FTS/profil) | W1 | Keputusan inti menyentuh semua host |
| W3 | H4 (compactor TUI) + H7 (memory headless) + H8 (coding:delegate) | W2 | Fitur sesi |
| W4 | H2 (key per endpoint) + H6 (skill learning headless) + H11 sisa | W3 | Kualitas & keamanan |
| W5 | H12 (MCP spike) | W4 | Eksperimen, butuh base stabil |

## 4. Yang sengaja TIDAK diadopsi

| Pola Hermes | Alasan |
| --- | --- |
| Fallback chain model/provider | Keputusan owner: **tanpa fallback model**; gagal = pesan jujur |
| Isolasi profil per-agent (banyak agent 1 mesin) | Abelink single-user desktop; TUI/CLI = host produk yang sama, bukan multi-tenant |
| 20+ platform messaging | Abelink butuh Telegram saja; platform lain = permintaan terpisah |
| Docker/server deployment | Abelink Linux desktop-first |

## 5. Gate verifikasi
- Tiap item: test target hijau + `bun run lint` 0 error + bukti run (PTY/CLI).
- Per wave: `bunx vitest run` penuh hijau + session log.
- Aturan tetap: tanpa emoji/Sparkles, boundary coding-agent (delegasi bukan
  duplikasi), `delegate_coding` terkunci ke opencode/hermes.
