# Session Log: V3 + Fase 2 ingatan + compact gap + Hermes iterasi 1

Tanggal: 2026-09-18 | Branch: `feat/memory-verify-round2` | Status: selesai, siap merge

## Keputusan
- V3: [SEARCH-ERROR] meracuni batch — sources-found unresolved + label "senjata riset rusak".
- Fase 2: context 10->20, tool-log lama 2 baris, observasi raksasa dipotong, fakta sesi disuntik.
- Compact: ambang progresif 75/90 + gauge informatif; persist manual tetap false (risiko prune-write).
- Hermes-1: StepBudget + wrapUpNotice + MEMORY_TOOL_SPEC (spec saja, tanpa wiring).

## Berkas berubah
- `objectiveVerifier.js`: SEARCH_ERROR_RE + cabang research.
- `contextCompactor.js`: default 20, 2-baris, truncateGiantObservation.
- `Configuration.jsx` + `App.jsx`: default context 20.
- `workspaceRag.js` + `planning.js`: sessionFactsText / FAKTA SESAAT.
- `sessionCompactor.js`: COMPACT_WARN/SUGGEST_AT + compactZone.
- `ContextGauge.jsx`: title/label/tombol per zona.
- `effortSystem.js` (+37 aditif): StepBudget. BARU budgetNotice.js, memoryTool.js.
- Tests: session-memory (8), compact-gap, budget-notice + memory-tool-spec (13).

## Hasil verifikasi
- 7 file paket: 104/104 hijau. Regresi: 58/58.
- ESLint: 0 error (warnings pre-existing).
- Aturan KLAIM FAKTA WEB (V1) terverifikasi ada di planning.js:230.

## Batasan dikenal
- MEMORY_TOOL_SPEC belum di-wire ke planner (sengaja, iterasi berikut).
- fetchViaRouter belum dipakai handler search (siap untuk extract-via-fetch).
- Manual compact persist:false (keputusan sadar, didokumentasi inline).
