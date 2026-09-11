# PR2 — Long-Horizon Abelink (gaya AVO)

Keputusan terkunci 2026-09-11: merge PR1 dulu (`a472781`) sebagai checkpoint,
long-horizon sebagai PR2 dari branch baru `feat/long-horizon`.
Tesis: model sama, sistem lebih baik — tanpa klaim persen sebelum data.

## Konteks (baca dulu)

- Spesifikasi Fase 2: commit `f4af085` (cognitive runtime — trajectory search).
- Primitif ada: `src/api/ai/trajectorySupervisor.js` (Fase 1),
  `trajLineage.js`, `scoring.js`, `strategyLib.js`, `benchArch.js`
  (axis `vanilla/basic/avo` via `MARK_BENCH_ARCH`, default `basic` = produksi stabil).
- Bench task real-activity + world-state verifier: `evaluation/` (lihat commit
  `1e363c2`, `a8273c0`).

## Scope (tidak lebih, tidak kurang)

### Fase A — Fondasi offline (agent, tanpa LLM)
1. **Budget skala-effort**: `MAX_PLAN_STEPS=25` hardcoded di `useMarkPlan` →
   baca policy `effortSystem` (target ~50 langkah task kompleks). Lineage
   window ikut skala. Unit test.
2. **Resume durable terverifikasi**: audit `taskStore`/`taskExecutor` —
   pause → restart → resume konsisten (test offline). Perbaiki yang bocor.
3. **Trace injeksi strategi**: buktikan `nextStrategy` mengubah aksi berikutnya
   (simulasi: stagnasi → direktif → observasi → aksi beda). Bukan sekadar log.
4. **Harness siap jalan**: perintah bench arch-axis + format tabel hasil.

### Fase B — Pengukuran (USER menjalankan, agent tidak bisa)
Bench butuh LLM sungguhan (biaya + waktu) dan repo belum support CLI —
hanya user yang bisa run. Perintah eksak + estimasi ditulis saat Fase A selesai.
User paste tabel hasil: `task | arch | pass/fail | turns | token`.

### Fase C — Tuning dari data (agent)
Ambang stagnasi, redaksi hint, BACKTRACK vs RETRIEVE_MEMORY, promosi pola
sukses lineage → `learnedSkills` (self-improvement lintas-sesi).

### Fase D — Non-goal PR2
Model baru, provider baru, rewrite arsitektur.

## Kriteria terima

- [ ] Task 50-langkah selesai tanpa kehabisan konteks.
- [ ] Pause → restart app → resume checkpoint identik.
- [ ] Skor `avo` ≥ `basic` ≥ `vanilla` di bench real-activity (diukur).
- [ ] `bunx vitest run`, `verify.sh`, CI PR hijau.

## Jejak keputusan

- Anti-duplication gate 2026-09-11: grep `long-horizon|trajectory supervisor`
  → hanya MODEL-MATRIX.md (matriks model, tak duplikat); git log tak ada plan
  serupa. Rencana ini baru.
