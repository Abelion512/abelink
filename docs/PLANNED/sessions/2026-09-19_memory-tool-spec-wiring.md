# Session Log: 2026-09-19 — MEMORY_TOOL_SPEC Wiring & Atomic Engine (#8)

## 1. Tujuan Sesi
Mengadopsi item backlog #8 dari `docs/OPERATING-ADOPTION.md`:
- Melakukan wiring `MEMORY_TOOL_SPEC` (Hermes pattern c) ke eksekusi runtime Abelink.
- Menyediakan single unified memory tool (`memory`) yang mendukung operasi `add`, `replace`, `remove`, dan `batch` atomik.
- Menegakkan `perTurnFailureCap: 3` agar agent yang mengalami kegagalan validasi atau lookup berulang pada giliran yang sama dibatasi secara deterministik untuk mencegah spinning loop.
- Mendaftarkan tool `memory` ke `core_tools`, `toolCatalog` (`CORE_TOOL_SPECS`), `toolDispatcher` (`NON_NATIVE_TOOL_RE`), `knowledgeTools` (`runKnowledgeTool`), `subagentExecutor`, serta aturan pembaruan di `memoryRouter`.

## 2. File yang Dibuat / Dimodifikasi
- `src/api/ai/memoryTool.js`:
  - `parseMemoryQuery(query)`: parser fleksibel yang mendukung JSON object, JSON array (batch), maupun format pipa (`action||target||new_text` / `old_text||new_text`).
  - `findMemoryTarget(memories, oldText)`: pencocokan target toleran via ID numerik, exact match, dan substring search.
  - `executeMemoryOp(op, options)`: eksekutor operasi dengan jaminan atomicity (semua sub-op dalam batch divalidasi dan targetnya diverifikasi sebelum DB diubah; kegagalan satu sub-op membatalkan seluruh batch).
  - `recordMemoryFailure`, `resetMemoryFailureCount`, `isMemoryFailureCapped`: state tracker per-turn untuk menegakkan batas failure cap (maksimal 3 kali kegagalan).
  - `executeMemoryTool(rawQuery, options)`: entry point utama yang mengembalikan output terminal konfirmasi (`[MEMORY-SUCCESS]`, `[MEMORY-ERROR]`, `[MEMORY-FAILURE-CAP]`).
- `tests/memory-tool-spec.test.mjs`:
  - 18 pengujian unit untuk: bentuk kanonis spec, validasi schema op, parsing query (JSON & pipa), target matching, eksekusi add/replace/remove dengan mock DB, atomicity batch rollback saat ada kegagalan, serta per-turn failure cap 3x.
- `src/api/tools/core-tools.js`:
  - Mendaftarkan entri tool `memory` di daftar `core_tools`.
- `src/api/tools/toolCatalog.js`:
  - Mendaftarkan definisi `memory` di `CORE_TOOL_SPECS` lengkap dengan contoh query JSON & pipa serta tags.
- `src/hooks/agent/plan/toolDispatcher.js`:
  - Menambahkan `memory` ke regex `NON_NATIVE_TOOL_RE` dan meneruskan `ctx` ke `runKnowledgeTool`.
- `src/hooks/agent/plan/knowledgeTools.js`:
  - Menangani pemanggilan `tool === 'memory'` via `executeMemoryTool(query, ctx)`.
- `src/api/subagent/subagentExecutor.js`:
  - Menangani eksekusi `act.tool === 'memory'` dan pencatatan harness logging.
- `src/api/ai/memoryRouter.js`:
  - Memperbarui `buildMemoryRulesSection()` untuk menginstruksikan LLM menggunakan tool `memory` (add, replace, remove, batch).
- `docs/OPERATING-ADOPTION.md`:
  - Menandai backlog #8 sebagai SELESAI (`feat/memory-tool-spec-wiring`) dan menambahkannya ke tabel adopsi hijau.

## 3. Hasil Verifikasi
- Unit test: `bunx vitest run tests/memory-tool-spec.test.mjs tests/memoryRouter.test.mjs tests/toolSearchDeferred.test.mjs tests/skillMiniEval.test.mjs tests/handoffContract.test.mjs`
  - 5 test files, 58/58 tests lulus (100%).
- Linting: `bunx eslint` pada file-file terkait menghasilkan 0 error dan 0 warning pada `memoryTool.js`.
