# Session Log — 2026-08-26: Renderer ReAct Loop Termination Guards

## Ringkasan

**Keywords:** MAX_PLAN_STEPS, batas langkah ReAct, no-progress guard, tanpa kemajuan, loop tanpa henti, intervensi per sesi, intervention buffer keyed, browserClose signature, abort listener leak, subagent double-run, format respons invalid, wait_subagents signal

- **Tanggal:** 2026-08-26 | **Branch:** 5.5.0 | **Pemicu:** audit renderer P0 (loop tanpa turn cap) + P2 cross-talk antar sesi.
- Loop `while (!isDone)` di useMarkPlan menghitung `stepCount` tapi tidak pernah menegakkannya; mode degenerat `{answer, is_done:false}` tanpa aksi memicu re-prompt "[LANJUTKAN]" tanpa batas ke API berbayar.

**Audit Trail:** grep docs/PLANNED untuk MAX_PLAN_STEPS|noActionStreak|interventionBuffer -> hanya source; git log -i --grep loop/cap -> tidak ada patch serupa. Scope BARU.

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
|---|---|---|---|---|
| P0 loop tanpa terminasi | useMarkPlan.js | stepCount tak pernah dicek | MAX_PLAN_STEPS=25; paksa decision is_done TANPA memanggil getNextAction di giliran terakhir; finish path normal tetap jalan | DONE |
| P0b no-action streak tak berujung | useMarkPlan.js | Kasus 1 continue tanpa penghitung | noActionStreak>=3 force-finish dengan jawaban model terakhir | DONE |
| P2 cross-talk sesi: wait_subagents baca signal sesi 1; buffer intervensi global | useMarkPlan.js | abortControllerRef hanya diisi sesi 1 | pakai local signal (`currentSignal?.aborted ?? false`); interventionBufferRef = map per sessionId ('main'/String(id)), param opsional kompatibel | DONE |
| P2 browserClose signature salah (objek vs string) | useMarkPlan.js:169-185 + ChatStudio.jsx:238 + ChatStudioModal.jsx:248 | facade menerima string id | kirim `'default'`/String(id); catch dilog bukan ditelan | DONE |
| P3 abort listener numpuk per tool call | useMarkPlan.js (3 titik race) | listener tak dilepas setelah Promise.race | try/finally removeEventListener di semua titik | DONE |
| P3 tight-loop balasan tanpa skema | subagentExecutor.js | reply `{}` jatuh ke iterasi identik selamanya | corrective observation di streak 3; gagal terkontrol di >=6 via path catch standar | DONE |
| P3 AbortController tertimpa run ganda | subagentExecutor.js | set() menimpa controller hidup -> kill tak berfungsi | tolak run konkuren (warn + pesan system + early return); finally hapus key hanya jika pemiliknya | DONE |
| P2 crash null-deref saat retry habis | planning.js:532-547 | logReasoning baca data.thought tanpa guard | optional chaining + ?? null; graceful fallback kini tercapai | DONE |

## Files Modified

src/hooks/agent/useMarkPlan.js, src/api/subagent/subagentExecutor.js, src/api/ai/planning.js, src/pages/ChatStudio.jsx, src/components/core/ChatStudioModal.jsx.

## Agent Learnings

- "No turn limit" pada desain sub-agent TETAP butuh guard no-progress: limit giliran dan limit kemajuan adalah dua hal beda; yang membakar token adalah yang kedua.
- Guard force-finish harus menempati posisi SEBELUM evaluasi hasAction/isDoneSignal supaya tidak salah jalur ke fallback Kasus-4.
- Verifikasi lint dengan diff warning vs HEAD (bukan angka mentah) — refactor rapi bisa mengurangi warning pre-existing tanpa menambah baru.

## File Invariants

| File | Invariant |
|---|---|
| src/hooks/agent/useMarkPlan.js | Jangan hapus MAX_PLAN_STEPS/MAX_NO_PROGRESS_STREAK; decision paksa harus skip getNextAction (hemat API) tapi tetap lewat finish path (TTS/arsip). |
| src/api/subagent/subagentExecutor.js | Entry guard run ganda wajib sebelum set controller; cleanup key only-if-owner. |

## Verification Checklist

- [x] eslint 0 error, net warning turun (65->55) pada 3 file inti
- [x] vitest 10/10
- [x] browserClose konsisten di 3 file
- [ ] E2E: simulasi model bandel ({} terus) -> subagent gagal di <=6 iterasi, main loop berhenti di 25 langkah

## Callback

Batas 25 langkah / streak 3 saya pilih konservatif. Mau diekspos jadi konfigurasi per-user (mis. maxSteps di config store) atau biarkan konstanta modul saja?
