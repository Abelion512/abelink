# Eval Feedback Loop: evaluasi dulu, nol fitur baru

**Status:** Research note (dokumen saja, tanpa perubahan kode)
**Tanggal:** 2026-09-21
**Konteks:** 4 gejala muncul dalam 1 sesi / 1 prompt — tools tak dipakai, `no-handshake` browser, mode chatbot (klaim selesai tanpa bukti), stagnasi strategi.

Dokumen ini suplemen, bukan duplikat. Kajian komprehensif sudah ada di
`docs/RESEARCH/AUTONOMOUS_AGENT_STANDARDS_AND_GAP_AUDIT.md` (CoALA, progressive
disclosure, two-tier state machine, citations). Plan perbaikan browser sudah ada di
`docs/superpowers/plans/2026-09-20-browser-autonomy-restoration.md` (tagger, identitas
tab, extract-kosong, handshake jujur, HITL, anti-chatbot). Dokumen ini hanya mengisi
satu gap: **matriks gejala-ke-verifier dan urutan perbaikan bertahap tanpa fitur baru**.

## 1. Bukti lapangan ( diverifikasi dari file, bukan ingatan)

| Gejala | Bukti kode |
| --- | --- |
| Tools tak dipakai (jawab teks padahal butuh aksi) | `src/api/ai/agentDecision.js:1-100` — bedakan CLAIM vs FINAL; `answer` tanpa `action` runtuh jadi satu sinyal terminasi bila tidak di-gate |
| Klaim selesai tanpa bukti dunia nyata | `src/api/ai/objectiveVerifier.js:1-100,100-250` — `verified / partially_verified / failed / unavailable / not_run`, `classifyObjectiveKind`, `MAX_VERIFY_REPLANS = 2`; blindspot: tool-tak-dipakai, `no-handshake`, extract-kosong |
| Stagnasi tak terdeteksi (ulang tanpa kemajuan) | `src/api/ai/trajectorySupervisor.js:1-120` + `src/api/ai/strategyLib.js:1-23` — ladder MODIFY → EXPLORE → RETRIEVE → STOP; hanya pantau repeat tool+target, bukan answer-only streak |
| Handshake gagal generik | `sidecar/engine/channels/browser.mjs:35-56`, `sidecar/main/browser/bridge-core.mjs:1-120,266-`, `sidecar/main/tools/browserTools.mjs:19-95` — fail-fast + hint sudah ada, tapi reason masih generik `no-handshake` |
| Bench belum cover 4 gejala sekaligus | `evaluation/terminal-bench.mjs:110-150` — `tb-browser-dead / provider-down / subagent-budget` sudah deterministik offline; belum ada task tool-unused, handshake-dishonest, chatbot-final, repeat-stagnan dalam 1 run |

Loop utama yang mengikat semuanya: `src/hooks/agent/useAbelinkPlan.js:1-150`
(CLAIM via `classifyMainDecision`, verifikasi via `evaluateEvidence` /
`gateCompletion`, eksekusi via `plan/toolDispatcher.js`).

## 2. Pola referensi (dipetakan, bukan diadopsi buta)

| Sumber | Pola | Setara di Abelink | Gap |
| --- | --- | --- | --- |
| Anthropic (tool use / citations) | Aksi sampai observasi; klaim bernama wajib kutip verbatim isi observasi, bukan URL/judul | `objectiveVerifier.js`: `BROWSER_CONFIRM_RE`, `MIN_READ_PROOF_CHARS = 50`, `SEARCH_ERROR_RE`, `NO_RESULT_RE` | Extract-kosong masih bisa lolos sebagai proof; klaim tanpa kutip tak selalu picu replan |
| OpenAI (HITL / guardrails / improvement loop) | Pause = bukan terminal; retry bounded dengan alasan eksplisit | `useAbelinkPlan.js`: `capturePausedBrowser`, `shouldAutoCloseBrowser`; `planning.js:196` tangga recovery disconnect | Pause browser masih bisa dibaca sebagai terminal di jalur tertentu; reason handshake tak berjenjang |
| Hermes (guardian 3-tier) | Approval native, watchdog, loop caps | `docs/PLANNED/sessions/2026-09-19_hermes-guardian.md`; `APPROVAL_ACTIONS` di `cmd_node_bridge.rs`; `MAX_VERIFY_REPLANS = 2`, `MODIFY_REPEAT = 3`, `ABANDON_REPEAT = 5` | Answer-only streak (giliran tanpa tool) belum dihitung sebagai repeat oleh supervisor |

## 3. Rekomendasi bertahap (belum dieksekusi, diff kecil)

1. **Task 0 — riset pola (dok saja):** tabel mapping di atas dilengkapi sitasi tiap pola ke modul Abelink. Tanpa kode.
2. **Task 1 — task bench 4 gejala (`evaluation/` saja):** tambah task deterministik offline `tool-unused`, `handshake-dishonest`, `chatbot-final`, `repeat-stagnan` mengikuti kontrak `(output, sentinel, ctx)` ala `tb-browser-dead`. Tanpa LLM, tanpa network. Uji: `bun evaluation/smoke.mjs`, `bunx vitest run tests/abelinkeval.test.mjs`.
3. **Task 2 — kencangkan prompt + verifier:** pertahankan tangga recovery `planning.js:196` (navigate → lanjut → blocked berbukti); larang parafrase error jadi perintah manual. `objectiveVerifier.js`: extract-kosong ≠ proof, handshake-fail ≠ success. Uji: test `agentDecision / objectiveVerifier / trajectorySupervisor` yang ada.
4. **Task 3 — handshake jujur ber-reason:** bedakan `no-handshake / token-stale / timeout / poll-drop` di `bridge-core.mjs`, `server.mjs:100-`, `launcher.mjs:92-139`, `browserTools.mjs:81-95`. Retry otomatis 1x hanya untuk token-stale. Uji: `tests/browser-bridge / browser-e2e / browserLauncher / browser-flavor.test.mjs`.
5. **Task 4 — supervisor hitung answer-only:** giliran tanpa tool dihitung repeat (`MODIFY_REPEAT = 3`, `ABANDON_REPEAT = 5`, silence `stepsLeft <= 7`, maks 2 hint, cooldown 2 turn, hint ≤ 300 char). Tak pernah terminate. Uji: pola `tests/trajectorySupervisor.test.mjs`.

## 4. Out of scope (eksplisit, cegah bloat)

Tanpa Memory Bank vektor baru, tanpa LLM evaluator kedua, tanpa skill
`interview-me / grill-me` permanen, tanpa UI baru, tanpa Jalur B Chromium spawn.
Alasan: tak ada bukti bench membutuhkan itu. Ditambah hanya bila bench gagal
berbukti setelah Task 1–4.

## 5. Verifikasi bila rekomendasi dieksekusi

- `bunx vitest run` pada file yang tersentuh
- `bun evaluation/smoke.mjs`
- `bash scripts/verify.sh` hijau sebelum push (vitest + eslint 0 error + watermark + perf + AbelinkBench quick + vite build + cargo check + clippy `-D warnings`)
- Aturan branch/PR: kerja di branch, PR ke `main`, tutup dengan log `docs/PLANNED/sessions/YYYY-MM-DD_<topik>.md`; perubahan arsitektur update `docs/ARCHITECTURE.md` di PR yang sama
