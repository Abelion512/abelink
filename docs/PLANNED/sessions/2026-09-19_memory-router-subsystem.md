# Session Log: Memory Router Eksplisit (backlog #3)

Tanggal: 2026-09-19 | Branch: `feat/memory-router` | Status: selesai, siap merge

## Masalah
- Logika perakitan dan routing memori tersebar di `planning.js` dan hook `useAbelinkPlan.js`.
- Template string memori pengguna, arsip obrolan lama, turn-pairs, dokumen RAG, dan workspace context tertanam langsung di dalam `systemPrompt` sepanjang >70 baris tanpa modularitas atau testability.
- Tidak ada validasi dan normalisasi eksplisit untuk keputusan memori dari model (anti-duplikasi insert, validasi ID pada update/delete).

## Referensi (diverifikasi dari file)
- Hermes `plugins/memory` & Anthropic "Context Engineering for Agents" (context selection & assembly as dedicated subsystem).
- `docs/smart-orchestrator.md:210, 221`: "Add a memory router that selects context per turn; align vector memory, Orama, Dexie, session state, and workspace RAG under a clearer per-turn selection policy."
- `docs/OPERATING-MODEL.md:246`: "Memory | Persistent memory | Context engineering | Dexie + Orama | Memory router".

## Keputusan
- Dibuat subsistem baru `src/api/ai/memoryRouter.js`:
  - `buildWorkspacePromptSection`: memformat working memory .abelink/, code RAG, dan session facts secara bersih.
  - `buildUserMemorySection`, `buildMemoryRulesSection`, `buildFactsIntegritySection`, `buildArchivesSection`, `buildTurnPairsSection`, `buildDocumentsSection`: builder modular per jenis memori.
  - `composeAllMemorySections`: fungsi komposisi tunggal untuk merakit seluruh blok memori ke system prompt.
  - `routeTurnMemoryContext`: router pemanggilan unified context & workspace RAG dengan dukungan abort signal dan fallback aman.
  - `normalizeMemoryDecision`: validasi dan normalisasi keputusan memori AI (insert/update/delete) dengan pencegahan duplikasi.
- Refaktor `src/api/ai/planning.js`:
  - Menggantikan kode perakitan memori dan workspace inline dengan pemanggilan `buildWorkspacePromptSection` dan `composeAllMemorySections`.

## Berkas Berubah
- BARU `src/api/ai/memoryRouter.js`
- BARU `tests/memoryRouter.test.mjs`
- `src/api/ai/planning.js`
- `docs/OPERATING-ADOPTION.md`

## Hasil Verifikasi
- Vitest: `tests/memoryRouter.test.mjs` 9/9 lolos.
- Regresi vitest: `tests/planStepBudget.test.mjs` + `tests/hermes-guardian.test.mjs` lolos (31/31).
- ESLint: 0 error.
