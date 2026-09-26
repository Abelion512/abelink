# Session log — 2026-09-26 — M2a: cli/tui bertipe (114 error → 0)

Program: P1 (JS->TS), wave M2a
Branch: `refactor/m2a-tui-typed` (di atas `refactor/m1-ts-toolchain`)
Induk: `docs/PLANNED/2026-09-26_master-migration-program.md`

## Target & hasil

| | Sebelum | Sesudah |
| --- | --- | --- |
| error `tsc` di `cli/**` + `bin/**/*.tsx` | **114** | **0** |
| gate CI `tsc` | soft-fail | **BLOK** |
| warning eslint | 46 | 42 |

Sebaran awal error (diukur, bukan diperkirakan): `bin/abelink-tui-v2.tsx` 60,
`cli/tui/App.tsx` 41, `cli/tui/components/PromptRow.tsx` 13 — didominasi
`TS2339` "property does not exist on `{}`" (64) karena props komponen belum
bertipe, plus implicit any (26).

## Pendekatan (dan kenapa bukan cast tersebar)

1. **`cli/tui/types.ts` (baru)** — satu sumber kontrak: `TuiState`, `PickerState`,
   `PickerRow`, `AppProps`, `PromptRowProps`, `TuiKeyBinding`, `SidecarClient`,
   `TuiCliOptions`, `TuiFileConfig`, `TextareaHandle`, `TuiKeyEvent`.
   Alasan: `engine.mjs` tetap JS (keputusan **D3**), jadi tipe harus tinggal di
   satu tempat yang bisa dirujuk `.tsx` maupun entry `.tsx`.
2. **JSDoc pada helper `.mjs` yang sudah ada** — bukan menyalin tipe di sisi TS:
   - `cli/tui/theme.mjs`: `autocompleteTrigger`, `applyCompletion`,
     `filterCompletions`, `moveCompletionIndex`, `PROMPT_KEY_BINDINGS`.
   - `src/api/ai/headlessCli.js`: `loadHeadlessMemories`.
   - `bin/abelink-tui.mjs`: `listTuiSessions`.
   Efeknya: konsumen `.tsx` mendapat tipe nyata dari modul JS **tanpa mengubah
   satu baris pun perilaku runtime**.
3. **Satu gap tipe pihak ketiga, dilokalisasi.** `SpanProps` OpenTUI
   dideklarasikan `ComponentProps<{}, TextNodeRenderable>` sehingga prop `fg`
   tidak ada di tipe walau `TextNodeRenderable` mendukungnya saat runtime (bullet
   berwarna memang tampil di PTY). Ditangani dengan komponen `ColoredSpan` di
   `App.tsx` + SATU `@ts-expect-error` berkomentar — output yang dikirim tetap
   `<span fg=...>` apa adanya, dan bila OpenTUI memperbaiki tipenya, direktif itu
   menjadi error (sinyal bersih-bersih, bukan diam-diam basi).
4. **Tiga cast disengaja** dengan alasan tertulis di kode:
   - `PROMPT_KEY_BINDINGS` → tipe dirujuk dari `@opentui/core` (bukan struktural)
     agar `action` tetap union sempitnya.
   - `sidecar?.dispose()` → objek di-assign lewat closure `getSidecar()` sehingga
     control-flow analysis TS menganggapnya tetap `null`.
   - `loadCliFileConfig(...) as TuiFileConfig` → modul JS belum bertipe (M4).

## Verifikasi

- `bun run typecheck` → exit 0 (gate sekarang mencakup `cli/**` + `bin/**/*.tsx`)
- `bun run typecheck:node` → exit 0
- `bun run lint` → exit 0 (0 error, 42 warning)
- `bunx vitest run` → **148 file / 1695 test hijau**
- `bunx vitest run tests/cli-tui-v2.test.mjs` → 42 test hijau (6.8s)
- **Smoke PTY (tmux 140x36)** → hero `• Abelink v1.1.0-alpha.5`, sidebar
  (Context/MCP/LSP), prompt box `┃` + placeholder, bullet berwarna render normal
  → parity visual terjaga setelah `ColoredSpan`.

## Batasan dikenal

- `bun run test:live` tidak dijalankan di sesi ini (butuh 9Router hidup ~70s);
  sudah diverifikasi di M0.
- M2b (ekstraksi `cli/core` dari `bin/abelink-tui.mjs`, B-9) dan M2c (H5 tool
  hooks + trajectory headless) BELUM dikerjakan.
- `tsconfig.renderer.json` tetap ditunda (B-20): belum ada `.ts` di `src/**`.

## Langkah berikutnya

M2b: pindahkan parser/session-store/sidecar-client ke `cli/core/*` supaya
`cli/tui` tidak lagi mengimpor dari `../bin/`.
