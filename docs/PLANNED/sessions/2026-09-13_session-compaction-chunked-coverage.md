# Session Log — Session Compaction: Chunked Coverage Summarizer (PR #4 adversarial fix)

## Ringkasan
**Keywords:** session compaction, chunked summarization, buildSummaryChunks, coverage, pointer invariant, lastCompactedMessageId, tail truncation 90k, MAX_SUMMARY_CHUNKS_PER_RUN, summarizeMiddleWithCoverage, kompaksi sesi, pointer palsu, invariant pointer, kompaksi parsial, partial compaction

- **Tanggal:** 2026-09-13 | **Branch:** `chore/fix-codebase-and-docs`
- **Files touched:** `src/api/ai/sessionCompactor.js`, `tests/sessionCompactor.test.mjs` (+ working-tree fixes yang sudah ada: `src/api/db.js`, `src/hooks/agent/useAbelinkPlan.js`, `src/hooks/useManualCompaction.js`)
- **Apa:** Adversarial review PR #4 (d92538b) menemukan BLOCKER yang lolos 3 review sebelumnya: review prompt mengklaim fix `buildSummaryChunks()` capacity-bounded, tapi fungsi itu TIDAK ADA di kode — `summarizeMiddle()` masih `messagesText.slice(-90000)` (tail-truncation membuang pesan terlama diam-diam) sementara pointer `lastCompactedMessageId` disimpan di pesan TERAKHIR range. Hasil: pointer > konten terangkum; pesan awal hilang permanen dari summary DAN window.
- **Fix:** Implementasi chunked summarization sesungguhnya: `buildSummaryChunks()` (oldest-first, tanpa gap, kapasitas 80k/chunk, clip per-pesan dihitung SEBELUM akuntansi) + `summarizeChunk()` (return `{text, ok}`, tanpa stub "N pesan dikompaksi") + `summarizeMiddleWithCoverage()` (max 4 chunk/run, berhenti di chunk gagal, return `coveredCount`). Orchestrator memetakan `coveredCount` -> index pesan asli terakhir yang tercakup; pointer dan `tailMessages` dihitung dari situ. Return baru: `summarizedCount` + `pendingSummarizeCount`.

## Audit Trail
- `grep -rln "compaction|lastCompactedMessageId|sessionCompacts" docs/` → hanya AGENTS.md (tabel modul) + sesi lama lint-gate; TIDAK ada patch chunked-coverage sebelumnya.
- `git log --grep` → commit `2ce723c` (fix pointer/dedup) dan `f2d1684` (trajectory staleRun, avo removal, adapter async) adalah PR-fix sebelumnya di scope berbeda; tidak ada yang menyentuh akuntansi chunk 90k.
- Semantic check: sesi 2026-09-11 pr2-long-horizon membahas trajLineage/effort, bukan compactor coverage. Patch ini benar-benar baru.

## Temuan dan Fix
| Finding | File | Root Cause | Fix | Status |
|---|---|---|---|---|
| BLOCKER: pointer maju melebihi konten terangkum | `sessionCompactor.js` | tail-truncation `slice(-90000)` + pointer di pesan terakhir | chunked coverage; pointer = pesan terakhir chunk sukses | FIXED |
| Summary+pointer tersimpan walau persist gagal | `sessionCompactor.js` | `saveSessionCompact` di-swallow | return `success:false` bila persist gagal | FIXED (working tree) |
| Summary tanpa pointer ikut dihitung budget | `sessionCompactor.js` | `calculateSessionChars` menghitung summary tanpa cut | summary tanpa pointer = 0 char | FIXED (working tree) |
| Ringkasan stale bocor lintas sesi | `db.js` | `deleteSession(1)` tidak buang `sessionCompacts['1']` | hapus compact saat delete | FIXED (working tree) |
| `msg.id` tidak stabil di plan hook | `useAbelinkPlan.js` | pesan tanpa id -> timestamp collision | `createMessageId()` + `currentPromptMessage` sentinel | FIXED (working tree) |
| Manual compaction menelan `success:false` | `useManualCompaction.js` | tidak cek `res.success` | throw ke banner error | FIXED (working tree) |
| trajectorySupervisor window-sliced staleRun | `trajectorySupervisor.js` | `attempts.length` bukan monotonic | `totalAttempts - lastNewKeyAt` | FIXED di HEAD f2d1684 |

## Verification Checklist
- [x] vitest 679/679 (64 file) — termasuk 5 test coverage/pointer baru dengan fetchAI mock
- [x] eslint 0 error (889 warning = baseline terdaftar)
- [x] vite build OK | cargo check OK
- [x] crypto harness 8/8 | AbelinkBench smoke LOLOS (25+8)
- [x] Invariant diuji eksplisit: `>4 chunk: pointer hanya maju ke pesan chunk terakhir yang sukses; sisanya tetap di window`

## File Invariants
- Pointer `lastCompactedMessageId` TIDAK BOLEH maju melewati pesan yang tidak terwakili di `summaryBlock`. Setiap perubahan di `summarizeMiddle*` wajib mempertahankan return `coveredCount` dan mappingnya di orchestrator.
- `summarizeChunk` dilarang mengembalikan stub teks pada kegagalan AI (dulu menyebabkan pointer palsu).

## CI Saga (pasca-push)
| Push | Hasil | Penyebab | Fix |
|---|---|---|---|
| `84bea87` (merge chunker + integrity layer) | Tauri CI merah: `commands_tools_tasks::tests::group_is_ours_matches_bash_child_only` | Dianggap flake (rasa fork/exec): `spawn()` kembali sebelum `exec()` anak, comm sesaat memuat nama induk | `wait_comm_is` polling 5s — MASIH MERAH di CI |
| `b3122a2` (polling hardening + retry read procfs) | Tauri CI merah lagi, KALI INI di assert polling (baris 268, budget 5s habis) | Bukan race: **bash tail-exec optimization**. `bash -c "sleep 60"` (tunggal) membuat bash `exec` menjadi `sleep` — comm = `sleep`, TIDAK PERNAH `bash` | Trailing builtin `; true` agar bash tetap resident (`0aee7c9`) |
| `0aee7c9` | Tauri CI + Branch Guard HIJAU | - | - |

**Diagnosis empiris (otentik, bukan tebakan):**
```
bash -c 'sleep 2'   -> comm=sleep   (tail-exec: bash digantikan sleep)
bash -c ':; sleep 2'    -> comm=sleep   (tetap tail-exec)
bash -c 'sleep 2; true'  -> comm=bash    (builtin ekor mencegah exec)
bash -c 'sleep 2 & wait' -> comm=bash    (compound, bash resident) <- kenapa test sibling selalu lulus
```
Simpulan: asumsi test "comm = bash setelah spawn" mustahil dipenuhi untuk bentuk perintah tunggal. Polling 5s yang kubuat hanya menyembunyikan kegagalannya di mesin lokal (belum exec) dan kalah di CI (exec cepat). Sibling test lulus karena compound command menonaktifkan tail-exec — asimetri inilah yang menunjuk akar masalah.

**Verifikasi akhir:** 15/15 run lokal `cargo test --lib commands_tools_tasks` hijau, `cargo test --lib` 22/22, clippy `-D warnings` bersih, CI `0aee7c9` hijau (Tauri CI + Branch Guard). Merge `0aee7c9` ke test premis-correct, polling `wait_comm_is` dipertahankan sebagai guard rasu fork/exec sungguhan di CI terbeban.

## Callback
Tail window saat coverage parsial memuat pesan belum-terwakili verbatim (bisa >context biasa bila run-limit tercapai berulang kali tanpa keberhasilan chunk berikutnya). Apakah kita perlu cap tambahan di sisi `useAbelinkPlan` (fallback ke `buildOptimizedChatSession` bila tail > N pesan), atau biarkan demikian karena budget 525k tetap terjaga?