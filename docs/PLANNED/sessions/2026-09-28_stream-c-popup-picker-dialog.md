# 2026-09-28 — Stream C: popup slash parity + picker suppress + dialog honesty

## Keputusan
- Paritas popup ikut opencode `autocomplete.tsx` (selectedForeground=background, fallback empty-state, footer hint, tinggi dinamis) tanpa mouse/frecency (deferred).
- Suppress inline penuh (render + logika) saat picker/dialog terbuka, bukan cuma render.
- Footer dialog disatukan via `dialogFooterText()` cermin format picker bawah; error selalu tampil.
- `num()` guard null/'' di kedua normalizer; dedup custom self-merge di curate + merge.

## Berkas berubah (commit 80cabd9, feat/tui-c)
- `cli/tui/theme.ts`: `selectedForeground`, `popupHeight`, `dialogFooterText`.
- `cli/tui/components/PromptRow.tsx`: trigger-based render, suppress picker, popup JSX parity; fix TDZ `pickerOpen`.
- `cli/tui/components/CenterDialog.tsx`, `cli/tui/types.ts`, `cli/tui/App.tsx`: props stale/total + footer jujur.
- `cli/tui/modelCatalog.mjs`: num guard + dedup.
- `tests/cli-tui-v2.test.mjs`, `tests/cli-model-catalog.test.mjs`: +8 test.
- Report: `.superpowers/sdd/tui-gaps-plan/stream-C-report.md`.

## Hasil verifikasi
- typecheck bersih, vitest 94/94, eslint 0 error.
- PTY tmux: home OK; ctrl+p+/ daftar tunggal; / popup parity + empty-state. Live smoke skip (9Router mati).

## Batasan dikenal
- Footer popup inline hardcode ID; cap dialogVisibleRows lama; mouse/frecency deferred.
