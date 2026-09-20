# Sesi Kerja: 2026-09-19 — Tool Search Deferred Penuh (#4)

## Konteks & Tujuan
Adopsi Backlog #4 dari `docs/OPERATING-ADOPTION.md`:
Mengadopsi pola Tool Search / Deferred Tool Loading ala Hermes (`tools/tool_search.py`, `tools/tool_search_catalog.py`) dan Anthropic Tool Search:
- Sebelumnya: `core-tools.js` mengekspor registry 1-baris string kasar; tool grup di `group-tools.js` hanya dibaca manual per-grup nama persis. Model tidak bisa mencari berdasarkan keyword fungsionalitas, tidak ada spesifikasi parameter terstruktur per tool, dan tidak ada contoh konkret pemakaian (`examples`).
- Sekarang: Katalog terpadu kaya metadata (`toolCatalog.js`), mendukung `defer_loading` boolean (core vs deferred groups), queryFormat, tags, dan contoh pemakaian nyata (`examples: [{ query, description }]`) per tool.
- Resolver `resolveReadToolsQuery` dan `loadGroupToolsText` mendukung:
  1. Nama grup (misal: "git_vcs", "advanced_browser") -> mengembalikan seluruh tools grup + contoh.
  2. Nama tool (misal: "browser-click", "replace-content") -> mengembalikan detail tool tunggal + contoh.
  3. Query pencarian ("search: keyword" atau "?keyword" atau fallback lexical search) -> mengembalikan hasil pencarian relevan + petunjuk / available_sources ala Hermes.

## Perubahan Kode
1. **`src/api/tools/toolCatalog.js` (Baru)**:
   - Mendefinisikan `CORE_TOOL_SPECS` (core tools, `defer_loading: false`).
   - Mendefinisikan `DEFERRED_GROUP_SPECS` (group tools, `defer_loading: true`).
   - `buildUnifiedToolCatalog()` -> `UNIFIED_TOOL_CATALOG` flat map.
   - `getToolSpec(toolName)`: lookup O(1).
   - `searchTools(query, options)`: pencarian lexical multi-faktor (exact name, partial name, group, tags, summary, description).
   - `formatToolDocumentation(tool)`: formatting rapi menyajikan fungsi, query format, dan contoh nyata.
   - `formatGroupDocumentation(groupName, toolsList)`: formatting seluruh tool dalam grup.
   - `resolveReadToolsQuery(query, options)`: resolver pintar untuk `read-tools`.
2. **`src/api/tools/core-tools.js`**:
   - Memperbarui deskripsi `read-tools` agar mengedukasi planner tentang dukungan nama_grup, nama_tool, atau `search: kata_kunci`.
   - Mengekspor utilitas dari `toolCatalog.js`.
3. **`src/api/tools/group-tools.js`**:
   - Mengintegrasikan `resolveReadToolsQuery` ke dalam `loadGroupToolsText`.
   - Menambahkan safe window check pada `window.api?.getPlugins`.
   - Mengekspor `resolveReadToolsQuery`.
4. **`src/hooks/agent/plan/agentTools.js`**:
   - Handler `read-tools` memanggil `resolveReadToolsQuery` dan menyajikan dokumentasi lengkap + contoh pemakaian konkret.
5. **`src/api/ai/planning.js` & `src/api/subagent/subagentPrompt.js`**:
   - Memperbarui instruksi prompt ReAct planner & subagent agar mengetahui kapabilitas deferred loading dan search pada `read-tools`.
6. **`tests/toolSearchDeferred.test.mjs` (Baru)**:
   - 16 test komprehensif menguji integritas catalog, format spec, `searchTools`, `resolveReadToolsQuery`, dan integrasi `loadGroupToolsText`.

## Verifikasi
- `bunx vitest run tests/toolSearchDeferred.test.mjs tests/toolCatalog.test.js tests/toolCallCoverage.test.mjs tests/planStepBudget.test.mjs tests/memoryRouter.test.mjs`: 41/41 lolos (100% passed).
- `bunx eslint`: 0 error.
