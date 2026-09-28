# Plan: TUI gaps — popup slash, dialog tengah, model custom, home screen

Approved design (bounded, chat 2026-09-28). Satu slice satu task, sekuensial.
Referensi: `opencode/packages/tui/` (clone baca-saja di repo).

## Global Constraints
- Boundary Tauri: `src/` tidak sentuh Node API; TUI (`cli/`, `bin/`) sisi Node.
- Jangan ubah perilaku runtime selain 4 gap; rename/annotate hati-hati.
- Gate tiap task: `bun run typecheck` exit 0, `bunx vitest run <file-terkait>`
  hijau, `bunx eslint <file-diubah>` 0 error, smoke `bun bin/abelink-tui-v2.tsx --help`.
- Satu PR per slice ke `main`; session log di `docs/PLANNED/sessions/`.
- Kerja di worktree `.worktrees/tui-gaps`, branch `feat/tui-gaps`.

## Task 1 — Slice 1: popup slash floating ala opencode
Files: `cli/tui/components/PromptRow.tsx`, `cli/tui/theme.ts`
(opsional `tests/cli-tui-v2.test.mjs` bila tambah pure logic).
- Popup autocomplete jadi floating absolute di atas prompt (bukan in-flow),
  border + zIndex, tiru `opencode/.../prompt/autocomplete.tsx:724-736`
  (`position absolute`, `top = anchor.y - height`, `zIndex 100`).
- Baris terpilih highlight background, bukan cuma fg.
- Filter fuzzy atas nama + deskripsi (ganti prefix-match di
  `filterCompletions` bila perlu; pure function tetap testable).
- Cap 10 baris. `Esc` tutup popup.
- Tanpa mouse, tanpa frecency (deferred, catat concern bila perlu).
- Acceptance: popup tidak dorong layout saat buka/tutup; Enter pilih/jalankan
  tetap jalan (exact-match rule dipertahankan); vitest slice hijau.

## Task 2 — Slice 3: dialog tengah CenterDialog
Files: baru `cli/tui/components/CenterDialog.tsx`; ubah `cli/tui/App.tsx`,
`cli/tui/engine.mjs` (tambah kind dialog), `bin/abelink-tui-v2.tsx` (wiring).
- Tiru `opencode/.../ui/dialog.tsx`: backdrop dim fullscreen, panel tengah
  lebar 60, zIndex di atas picker bawah.
- Dipakai untuk `/models`, `/effort`, `/sessions`, `/commands` (ctrl+p).
- Picker bawah lama tetap untuk filter inline prompt; dialog tengah untuk
  daftar pilih.
- Acceptance: dialog tengah buka/tutup via Enter/Esc; daftar bisa difilter
  ketikan; tidak merusak picker bawah.

## Task 3 — Slice 2: model custom bebas + cache dynamic + /effort dialog
Files: `cli/tui/modelCatalog.mjs`, `cli/tui/engine.mjs`, `cli/core/schema.ts`
(bila tipe baru), `tests/model-catalog.test.mjs` (atau file test terkait).
- `/model <id-bebas>`: passthrough dipertahankan, warning dirapikan.
- Capability per-ID disimpan di `cli.json → customModels[{id, ctx, maxOut,
  reasoning, lastSeen}]`, dibaca tiap resolve (dynamic).
- Section "Custom" muncul di picker `/models`.
- `/effort` tanpa arg buka dialog pilih level (ganti pesan teks), tetap
  persist `cli.json`.
- Acceptance: ID bebas tersimpan + muncul di picker sesi berikut; effort
  dialog ubah + persist; test katalog hijau.

## Task 4 — Slice 4: HomeView tengah
Files: baru `cli/tui/components/HomeView.tsx`; ubah `cli/tui/App.tsx`.
- Tiru `opencode/.../routes/home.tsx`: saat `messages` kosong tampil kolom
  tengah — logo/teks Abelink, prompt max-width 75, placeholder rotasi,
  shortcut `/sessions` + `/models`, footer versi/workspace.
- Ganti hero kiri-atas sekarang (`App.tsx:97-109`).
- Acceptance: layar awal tengah + simetris; prompt pertama langsung jalan;
  tidak ada regresi saat messages non-kosong.
