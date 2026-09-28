# Session 2026-09-28 — TUI 8-poin user: 4 stream paralel + merge + review

## Ringkasan 5W1H
- **What:** 8 laporan user (style tak full-terminal, `!` bash, popup slash,
  shift+enter, paste/drop image, plan/build+working, bug ctrl+p+`/`, kerja
  paralel) dikerjakan 4 stream di worktree terpisah, digabung ke
  `feat/tui-merge`, diverifikasi code-reviewer + e2e PTY.
- **Why:** Parity TUI vs opencode + bug fungsional input/gambar/mode.
- **Who:** 3 subagent (A/C/D) + controller langsung (B, subagent gagal 3x transport 502) + reviewer + re-verify.
- **When:** 2026-09-28 sore.
- **Where:** `.worktrees/tui-{a,b,c,d,merge}`, branch `feat/tui-merge`.
- **How:** Merge sekuensial A→B→C→D (1 konflik manual engine.mjs),
  review → 6 temuan → fix → re-verify → e2e.

## Keputusan
- Stream B langsung oleh controller (subagent transport 502 x3, hasil kosong x1).
- `!` ternyata BUKAN bug engine (verified shell OK); shift+enter akar di
  `useKittyKeyboard` kosong (pola opencode app.tsx:199).
- Plan = prefix jujur (disableTools tak sampai classifier; fix src/ 1 baris didokumentasikan, tak dieksekusi — boundary).
- v1 (abelink-tui.mjs) diwire ringan imageRefs + plan-prefix (tak dibekukan).
- Ctrl+V bitmap mentah tak sampai ke TUI (batas terminal) — follow-up: dokumentasikan di help.

## Verifikasi
- typecheck 0, vitest 167 pass, lint 0 error, suite penuh 1810 pass (pre-merge).
- Reviewer: NEEDS-FIXES (1 Critical @file×gambar + 5 Warning) → semua fix
  + re-verify 5/5 + 1 dead-path v1 tambahan diperbaiki.
- E2E PTY: /plan+/build+jujur, shift+enter 2 baris, ctrl+p+/ tunggal,
  `!echo` shell — lolos.

## Batasan dikenal
- Vision describe butuh sidecar + 9Router; live E2E belum jalan.
- Suggestion reviewer #7-11 opsional (redundan /plan intercept, union mode,
  popup h-6, vision cache) — susulan.
