# 2026-09-26 — Coding-agent dispatch, rencana JS->TS, TUI bergaya opencode

## Permintaan
1. Status "engine di-improve dengan engine claude, codex, dan hermes" — sudah selesai?
2. Dokumentasi planning migrasi JS -> TS.
3. Style TUI belum semirip opencode (clone ada di `opencode/`).

## 1. Status coding-agent engine (jawaban jujur)

Kondisi SEBELUM sesi ini:
- `src/api/ai/codingAgentBridge.js` mendefinisikan 4 kandidat (claude, hermes,
  codex, opencode) dengan `makeArgs`, TAPI `PREFERRED_CODING_AGENTS =
  ['opencode','hermes']` dan `detectInstalledAgents()` men-`continue` kandidat di
  luar daftar itu -> **claude & codex tidak pernah terdeteksi**, jadi tidak
  pernah bisa dipilih oleh tool `delegate_coding`. Wire-nya ada, tapi mati.
- `delegate_coding` (agentTools.js) punya daftar lokal hardcoded sendiri;
  `core-tools.js` + `toolCatalog.js` + `planning.js` menyebut "(opencode, hermes)".

Kondisi SESUDAH (diselesaikan di sesi ini):
- `PREFERRED_CODING_AGENTS` = `['opencode','hermes','codex','claude']` — kini
  **urutan preferensi auto**, bukan whitelist. `detectInstalledAgents()`
  mendeteksi SEMUA kandidat yang benar-benar terpasang (urutan preferensi
  dulu, sisanya menyusul).
- `agentTools.js` mengimpor `PREFERRED_CODING_AGENTS` dari bridge (satu sumber),
  bukan konstanta lokal.
- `core-tools.js`, `toolCatalog.js`, `planning.js` diperbarui menyebut empat agen.
- `opencode`/`hermes` tetap di depan (paling teruji di repo); `codex`/`claude`
  kini benar-benar dapat dipilih (mis. `delegate_coding "codex||instruksi||auto/x"`).

Catatan boundary: AGENTS.md melarang **duplikasi kapabilitas coding**. Perubahan
ini tidak menduplikasi apa pun — masih satu tool `delegate_coding` ke CLI lokal,
hanya daftar host yang diperluas dari 2 -> 4.

Batasan yang tersisa (bukan bug baru): `binaries` masih memuat path absolut
`/home/abelion/...` sebagai fast-path; fallback nama telanjang (`which <bin>`)
sudah ada sehingga user lain tetap terjangkau.

## 2. Rencana migrasi JS -> TS

`docs/PLANNED/2026-09-26_js-to-ts-migration.md` (BARU). Fakta terukur: tidak ada
`tsconfig.json`; `typescript` tak dideklarasikan (5.9.3 hanya transitif); ESLint
hanya mencakup `**/*.{js,jsx}` sehingga `.tsx` nol lint/typecheck; 153 `.js` +
74 `.jsx` + 224 `.mjs` + 3 `.tsx`. Rencana 4 fase (toolchain -> `.tsx`/`cli/core`
-> boundary `sidecar`/`src/api` -> renderer), gate `tsc --noEmit` bertahap ala
"Migrating from JavaScript" + `allowJs`/`checkJs` per direktori, plus tabel
risiko & urutan PR.

## 3. TUI bergaya opencode

Referensi dibaca dari clone: `opencode/packages/tui/src/theme/index.ts`,
`routes/session/{index,sidebar,footer}.tsx`, `component/prompt/index.tsx`.

Perubahan:
- `cli/tui/theme.mjs`: tambah token semantik opencode (`background`,
  `backgroundPanel`, `backgroundElement`, `backgroundMenu`, `text`, `textMuted`,
  `secondary`, `accent`, `info`, `border`, `borderActive`, `borderSubtle`)
  TANPA menghapus token warisan (test + komponen lama tetap jalan). Pewarnaan
  pesan: user=accent, asisten=text netral, meta/tool=textMuted, info=info.
- `cli/tui/App.tsx`: sidebar disusun ala opencode (judul bold + session id
  muted; seksi Context/MCP/LSP; branding footer `• Abelink v<versi>`), footer
  kanan `0 tokens · /help · ctrl+p commands`, background pakai token semantik.
- `cli/tui/components/PromptRow.tsx`: meta row `Abelink · auto · <model>
  <provider>` (label `auto` ala opencode), area prompt `backgroundElement`,
  popup `backgroundMenu`, border kiri `borderActive`.
- `bin/abelink-tui-v2.tsx`: kirim `version`/`sessionId`/`title` ke `App`.

## Berkas berubah
- `src/api/ai/codingAgentBridge.js`, `src/hooks/agent/plan/agentTools.js`,
  `src/api/tools/core-tools.js`, `src/api/tools/toolCatalog.js`,
  `src/api/ai/planning.js`
- `cli/tui/theme.mjs`, `cli/tui/App.tsx`, `cli/tui/components/PromptRow.tsx`,
  `bin/abelink-tui-v2.tsx`
- `cli/tui/modelCatalog.mjs` (timeout discovery 30s -> 45s, kondisi terukur)
- `tests/codingAgentBridge.test.mjs` (4 agen + urutan preferensi)
- `docs/PLANNED/2026-09-26_js-to-ts-migration.md` (BARU)

## Verifikasi
- `bunx vitest run` — **147 files / 1688 tests hijau**.
- `bun run lint` — exit 0.
- `curl /v1/models` 9Router terukur 26.4s (sempat > timeout 30s -> abort);
  setelah timeout 45s, `pipe /models kimi` hijau (25.8s).
- PTY tmux (140x34): sidebar `Abelink` bold + session id muted + seksi +
  `• Abelink v1.1.0-alpha.5`; prompt meta `Abelink · auto ·
  muse-spark-1.3-contributor-free 9router`; footer `/help · ctrl+p commands`.

## Batasan dikenal
- 9Router `/v1/models` sedang lambat (~26s); jalur live tetap bisa abort di
  bawah beban sangat tinggi. Jalur live hanya dipakai opt-in
  (`/models --all`, `/models <filter>`, `/model` saat `loadCatalog`).
- Migrasi JS->TS masih PLAN (belum ada devDependency/tsconfig yang ditambah).
- `.tsx` masih tanpa typecheck (fase 0/1 rencana TS menutup gap ini).
- Path absolut `/home/abelion/...` di bridge tetap ada sebagai fast-path.
