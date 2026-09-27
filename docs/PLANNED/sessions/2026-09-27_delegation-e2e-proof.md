# Session Log — P0: Bukti Delegation E2E (Sub-Agent Tugas Nyata)

- **Tanggal:** 2026-09-27
- **Branch:** `fix/bridge-rc3-g1-mv3-keepalive` (di atas PR #64)
- **Pemicu:** P0 halaman 5W1H — "bukti delegation e2e" (sub-agent tugas nyata end-to-end).

## Forensik harness (data, bukan teori)

- `spawn_subagent` 16x **ok** di dev; `wait_subagents` **16/18 FAIL** (2 ok).
- Pola kegagalan: lead spawn 2-6 sub-agent riset lalu menunggu — fail berulang, termasuk retry 7x pada ID yang sama (2026-09-17).
- Baca kode `buildWaitReport`/`getAgentCompleteness` (`agentTools.js`) + `wait_subagents` (`waitWithTimeout`): kegagalan itu **JUJUR by design** — `success:false` saat sub-agent masih RUNNING melebihi timeout, output TERPOTONG, atau FAILED; laporan + petunjuk pemulihan tetap dibawa ke lead. Bukan crash, bukan hilang senyap.
- Akar perilaku: sub-agent riset web berjalan lebih lama dari kesabaran timeout lead (60-120s) + laporan kosong saat model menjawab tanpa tool. Gerbang completeness sengaja menolak laporan tak lengkap (RI-11/12/13).

## Bukti e2e yang dibangun (`tests/delegationE2E.test.mjs`, BARU, 2 test)

**Komponen ASLI:** `runAgentTool` (spawn_subagent + wait_subagents), `runSubagentTurn` (loop ReAct lengkap: system prompt, classify, verifier gate, supervisor, persist), `browserTools['browser-read']` (fetch HTTP + htmlparser2 asli), `subagentStore` (Dexie/fake-indexeddb), server HTTP lokal nyata sebagai target.

**Stub terkendali:** `fetchAI` (JSON keputusan deterministik — dispatch by goal marker di system prompt, BUKAN urutan call; sub-agent berjalan konkuren), `window.api.executeNativeTool` (langsung ke handler browserTools asli, setara channel `native-tool:execute` tanpa IPC Tauri), auto-launch browser OFF.

**Hasil yang dibuktikan:**
1. **Jalur sukses e2e:** lead spawn 2 sub-agent (goals beda) → masing-masing mengeksekusi `browser-read` nyata (konten halaman masuk ke observasi di store) → laporan final berbukti → `wait_subagents` `success:true` + `SEMUA SELESAI` + kedua laporan utuh; status `idle`, turnCount >= 2, finalAnswer terpersist di Dexie.
2. **Kejujuran jalur gagal:** agen yang tak pernah selesai → wait timeout → `success:false` + status RUNNING + petunjuk "panggil kembali 'wait_subagents'"; lalu `killSubagentExecution` membersihkan loop.

## Pelajaran teknis (untuk test delegation berikutnya)

- Namespace ESM tidak bisa dipatch (`core.fetchAI = ...` melempar getter-only) → gunakan `vi.mock`.
- `browser-read` dengan URL memakai fetch nyata → target test = server HTTP lokal, bukan domain palsu (sekaligus menghapus kebutuhan extension palsu + bridge).
- **JANGAN dispatch skrip fetchAI by urutan call** — sub-agent konkuren membuat urutan tak tentu; dispatch by marker goal di system prompt + deteksi turn dari panjang history.
- Auto-launch browser harus OFF di test (kalau tidak, `ensureExtensionUp` membuka browser asli dan menandai sesi gagal).
- Mock fetchAI per-call harus mengekspor `vi.fn`-nya sendiri (eksport `factory()` = plain function tanpa `getMockImplementation`).

## Verifikasi

- `tests/delegationE2E.test.mjs` 2/2 hijau (~5.2s).
- Suite terkait: toolCatalog + objectiveVerifier + browserAskGate + waitSubagents + toolCallCoverage + dormantPcAutomation = **106 passed**.
- Vitest penuh: **1753/1753 (156 file)**.
- `bun run lint`: exit 0, 42 warnings = baseline persis.

## Batasan

- LLM di-stub: bukti ini memverifikasi **jalur mekanis delegation** (spawn → eksekusi tool nyata → laporan → wait), bukan kualitas keputusan model. Kualitas model = domain AbelinkBench (dimensi existing).
- Skenario gagal yang dibuktikan = timeout/never-completes; skenario TRUNCATED dan send_message-recovery sudah ter-cover test unit lain (waitSubagents/toolCallCoverage).
- Auto-launch OFF di test: jalur launch tetap di-cover runbook + test browser terpisah.
