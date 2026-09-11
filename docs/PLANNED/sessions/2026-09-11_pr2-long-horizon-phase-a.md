# Session Log — PR2: Long-Horizon Fase A (Offline)

## Ringkasan

**Keywords:** PR2, long-horizon, effort budget, effortSystem, MAX_PLAN_STEPS, trajectory lineage, trajLineage, taskStore, taskExecutor, durable resume, state leak, pause restart, strategy trace, trajectory supervisor, nextStrategy, MarkBench, arch axis.

Tanggal: 2026-09-11. Branch: `feat/long-horizon` → PR #3 ke `main`.

Sesi eksekusi Fase A untuk PR2 Long-Horizon (tanpa LLM, tanpa benchmark eksternal):
1. Penggantian hardcoded `MAX_PLAN_STEPS=25` di `useMarkPlan.js` dengan budget dinamis dari `effortSystem` (`low: 8`, `medium: 16`, `high: 32`, `xhigh: 64`, `max: 128`, `ultra: 256`). Lineage window (`maxAttempts`) ikut diskalakan.
2. Audit & perbaikan kebocoran status durable task di `taskStore.js`: step running kini disinkronkan atomik ke pending saat task di-pause atau aplikasi restart (`App.jsx`).
3. Verifikasi trace supervisor ReAct di `trajectorySupervisor.js` + simulasi loop: membuktikan repetisi/stagnasi memicu direktif strategi (`[STRATEGI: BACKTRACK]`) yang mendivergensikan tool call agent berikutnya ke checkpoint restore.
4. Dokumentasi perintah bench arch-axis (`vanilla`, `basic`, `avo`) dan tabel hasil untuk pengujian Fase B oleh user.

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
|---|---|---|---|---|
| Hardcoded step budget 25 | `src/hooks/agent/useMarkPlan.js` | `MAX_PLAN_STEPS = 25` statis memotong task kompleks sebelum konvergen | Dibuat `resolvePlanStepBudget()` berbasis `effortSystem` + `trajLineage.js` menerima `maxAttempts` dinamis | ✅ 8 unit tests passed |
| Leak running step saat pause/restart | `src/api/taskStore.js` | `pauseStaleAgentTasks` dan `transitionAgentTask` hanya mengupdate tabel task; step running tertinggal selamanya | Sinkronisasi atomik step `running` -> `pending` dalam Dexie rw transaction | ✅ 2 unit tests passed |
| ReAct resume pointer kacau | `src/api/taskStore.js` & `useMarkPlan.js` | `resumeAgentTask` tidak memuat step utuh; `useMarkPlan` tidak menyambungkan durable taskId | Return task with steps + resume handler di `useMarkPlan` via `opts.resumeTaskId` | ✅ Verified offline |
| Label strategi supervisor implisit | `src/api/ai/trajectorySupervisor.js` | Hint tidak memuat nama strategi eksplisit; menyulitkan trace divergens | Format `[STRATEGI: <name>]` dan restoreHint disuntikkan ke prompt | ✅ 2 unit tests passed |

## Files Modified

- `src/api/ai/planStepBudget.js` (baru): pure logic resolver effort-to-steps.
- `src/api/ai/trajLineage.js`: lineage window dinamis via `maxAttempts`.
- `src/hooks/agent/useMarkPlan.js`: dynamic budget, lineage budget injection, durable task resume handler.
- `src/api/taskStore.js`: leak prevention step sync saat pause/transition/restart, resume handler step resolver.
- `src/App.jsx`: bootstrap recovery stale tasks saat aplikasi mulai.
- `src/api/ai/trajectorySupervisor.js`: eksplisit label strategi dan checkpoint hint pada prompt direktif.
- `tests/planStepBudget.test.mjs` (baru): 8 tes unit resolusi budget langkah.
- `tests/durableResume.test.mjs` (baru): 2 tes unit pause/restart/resume durable tasks.
- `tests/strategyTrace.test.mjs` (baru): 2 tes unit divergens tool call akibat injeksi strategi supervisor.
- `docs/PLANNED/sessions/2026-09-11_pr2-long-horizon-phase-a.md` (baru): session log.

## Agent Learnings

1. **State Leak di Multi-Store Dexie**: Mengubah status entitas induk (`agentTasks`) tanpa menyinkronkan status anak (`agentTaskSteps`) dalam transaksi yang sama menciptakan state gantung yang merusak invariant resume setelah restart.
2. **Deterministic Strategy Verification**: Menguji pengaruh `nextStrategy` terhadap LLM secara offline dapat dilakukan secara deterministik dengan mengisolasi ReAct simulator di mana fungsi decision membaca `observation` terakhir dari supervisor hint.
3. **Budget Countdown Invariant**: Stopping policy countdown (`stepsLeft <= 7`) harus dihitung terhadap `maxPlanSteps` dinamis agar agent pada budget besar (misal 64 langkah) tidak dipaksa konvergen terlalu dini pada langkah ke-18.

## File Invariants

- `src/api/ai/planStepBudget.js`: pure function tanpa dependensi browser/Node, default fallback `DEFAULT_PLAN_STEPS = 25`.
- `src/api/taskStore.js`: step `running` tidak boleh ada saat task berstatus selain `running`.
- `docs/PLANNED/sessions/*.md`: append session log baru, jangan overwrite sesi lama.
