# Session 2026-09-22 — Bare `abelink` launches TUI (ala opencode)

Mode: build. Branch: feat/headless-agent-cli.

## Masalah user

Bare `abelink` (tanpa arg) print help + exit 3. Opencode: bare `opencode`
= launch TUI. Ekspektasi benar — CLI-engine Fase 2 sudah ada host TUI
(`bin/abelink-tui.mjs`) tapi entry point tak menautkannya.

## Fix

- `parseCliArgs` no-args: TTY (stdin+stdout) → `{command:'tui'}`;
  pipe/non-TTY → help exit 3 (skrip aman, bukan hang nunggu stdin).
- Helper murni `resolveNoArgsCommand({stdinTTY,stdoutTTY})` agar testable
  tanpa mock process.
- `main()`: dispatch `tui` via `spawnSync(BUN_BIN, [bin/abelink-tui.mjs,
  ...argv], {stdio:'inherit'})` — proses diganti, sinyal/TTY utuh.
- Help usage baris 1: `abelink  # TUI interaktif (bila TTY; ala opencode)`.

## Verifikasi

- Target: 81 passed (cli + cliHeadless + cli-tui).
- Lint file tersentuh: 0 errors.
- `echo | abelink` → help (pipe aman). `abelink-tui.mjs` langsung →
  banner + slash help tampil.

## Batasan

- TUI interaktif penuh (loop turn, streaming flag-flip, Fase-1 store
  adapter) milik Fase 2 — wiring ini hanya entry point.
- `bun link abelink` perlu re-link bila user pakai shim global lama
  (shim menunjuk file yang sama, jadi biasanya otomatis ikut).
