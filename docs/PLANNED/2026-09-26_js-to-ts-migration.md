# Rencana Migrasi JS -> TS (bertahap, tanpa freeze fitur)

Tanggal: 2026-09-26
Status: PLANNING (belum ada perubahan kode yang mengikat; ini peta jalan)
Pemilik: Abelion512

## 1. Masalah yang mau diselesaikan

Repo hari ini tidak punya typecheck sama sekali untuk jalur baru. Fakta
terukur (2026-09-26):

| Item | Nilai |
| --- | --- |
| `src/**`, `sidecar/**`, `cli/**`, `bin/**`, `scripts/**`, `tests/**`, `evaluation/**` | `.js` 153, `.jsx` 74, `.mjs` 224, `.tsx` 3, `.ts` 0 |
| `tsconfig.json` | **tidak ada** |
| `typescript` di `package.json` | **tidak dideklarasikan** (5.9.3 hanya transitif di `node_modules`) |
| `typescript-eslint` / `@typescript-eslint/parser` | **tidak terpasang** |
| Cakupan ESLint | hanya `**/*.{js,jsx}` — `.tsx` **nol lint, nol typecheck** |
| CI | `tauri.yml` (vitest + lint + clippy), tanpa `tsc` |

Konsekuensi: file `.tsx` yang sudah ada (`cli/tui/App.tsx`,
`cli/tui/components/PromptRow.tsx`, `bin/abelink-tui-v2.tsx`) lolos review
tanpa gerbang apa pun. Ini gap yang dicatat di beberapa session log dan belum
ditutup.

## 2. Prinsip (referensi primer)

1. **TypeScript official "Migrating from JavaScript"** — migrasi bertahap:
   mulai `allowJs` + `checkJs: false`, naikkan permukaan tipe per direktori,
   jangan rewrite serentak.
   https://www.typescriptlang.org/docs/handbook/migrating-from-javascript.html
2. **`allowJs` / `checkJs` / `@ts-check`** — mengadopsi file `.js` ke proyek TS
   tanpa rename; `checkJs` bisa per-file via `// @ts-check`.
   https://www.typescriptlang.org/tsconfig#allowJs
   https://www.typescriptlang.org/tsconfig#checkJs
3. **`tsc --noEmit` sebagai gerbang** — tipe bukan pengganti test; jalankan
   typecheck sebagai gate CI tambahan, bukan pengganti vitest.
4. **Boundary repo (AGENTS.md)**: renderer (`src/`) TIDAK boleh menyentuh Node
   API; tipe yang diadopsi harus memperkuat batas itu, bukan mengaburkannya.
5. **Jangan ubah perilaku runtime saat migrasi.** Langkah migrasi default =
   rename + annotate; perbaikan logika dipisah ke PR sendiri.

## 3. Definisi "selesai" per fase

Setiap fase LOLOS hanya bila: `bunx tsc --noEmit -p <tsconfig>` exit 0,
`bun run lint` exit 0, `bunx vitest run` hijau, dan tidak ada `any` baru yang
tak beralasan (dilacak via `@typescript-eslint/no-explicit-any` = `warn`).

## 4. Fase 0 — Fondasi toolchain (1 sesi, prasyarat semua)

Tujuan: typecheck bisa dijalankan, tapi belum menahan file apa pun.

- [ ] Tambah devDependency (versi terkunci via `bun.lock`):
  `typescript`, `typescript-eslint`, `@types/react`, `@types/react-dom`,
  `@types/node`, `@types/bun` (opsional), `@types/ws` bila dipakai.
- [ ] `tsconfig.json` root (base, tanpa `include` agresif):
  - `"target": "ES2022"`, `"module": "ESNext"`, `"moduleResolution": "bundler"`
  - `"jsx": "react-jsx"`
  - `"strict": true`, `"noEmit": true`, `"skipLibCheck": true`
  - `"allowJs": true`, `"checkJs": false`, `"resolveJsonModule": true`
  - `"isolatedModules": true`, `"verbatimModuleSyntax": true`
  - `"types": []` di base; `types` per-subproject.
- [ ] `tsconfig.renderer.json` (`include: ["src/**/*.js","src/**/*.jsx"]`,
  `types` untuk DOM/Vite), `tsconfig.node.json`
  (`sidecar/`, `scripts/`, `bin/`, `cli/` — `types: ["node","bun"]`).
  Pakai `references` (TS project references) agar CI bisa jalan paralel.
- [ ] ESLint: tambah `typescript-eslint` flat config untuk `**/*.{ts,tsx}`;
  `files` baru (JANGAN rebase aturan `.jsx` lama di langkah yang sama).
- [ ] CI `tauri.yml` (frontend job): `bunx tsc --noEmit -p tsconfig.json`
  setelah lint, sebelum vitest. Soft-fail hanya pada fase 0 (lihat §8).

Gate fase 0: `tsc --noEmit` berjalan dan exit 0 pada baseline (karena `checkJs`
mati, node runtime di `.mjs` belum masuk `include`).

## 5. Fase 1 — `.tsx` dulu (paling berisiko, paling kecil)

Alasan urutan: hanya 3 file, sudah TSX, sudah punya test (`cli-tui-v2`), dan
nol lint hari ini. Ini quick win terbesar.

- [ ] `cli/tui/theme.mjs` -> `cli/tui/theme.ts` (murni, tipe ekspor `Theme`).
- [ ] `cli/tui/App.tsx`, `cli/tui/components/PromptRow.tsx`,
  `bin/abelink-tui-v2.tsx`: annotate props, hapus `any` implisit.
- [ ] Ekstrak `cli/core/` (parser/session-store/sidecar-client dari
  `bin/abelink-tui.mjs`) ke modul bertipe — menghapus impor lintas-`bin` yang
  rapuh (`bin/` bukan library).
- [ ] `eval`-tipe: `schema.ts` untuk kontrak frame sidecar.

Gate fase 1: `tsc` meng-`include` `cli/**` + `bin/**/*.tsx`; `noImplicitAny`
aktif untuk subtree ini via `tsconfig.cli.json`.

## 6. Fase 2 — Boundary & kontrak (nilai tertinggi, biaya menengah)

Tujuan: tipe memperkuat batas arsitektur, bukan sekadar anotasi.

- [ ] `sidecar/engine/registry.mjs` -> `.ts`: tipe `Request`, `Response`,
  `on(action, fn)` generik, daftar channel ter-tipe. Ini single source frame
  protokol; semua channel ikut menikmati tipe.
- [ ] `src/api/tauri-bridge.js` -> `.ts`: tipe façade `window.api` (satu
  deklarasi `Window['api']`) + payload `node_invoke` per aksi.
- [ ] `src/api/db.js` -> `.ts`: tipe baris Dexie per store (schema v22/v29),
  plus tipe config bersama (`AppConfig`).
- [ ] `src/api/ai/headlessCli.js` + `agentRunner.js` -> `.ts`: kontrak
  `AgentOptions`, `RunResult`, `Environment` (`fetchAI`/`executeTool`).
  Ini yang mengunci invarian (tanpa fallback model, dll) di level tipe.

Gate fase 2: `checkJs` diaktifkan bertahap per folder (`sidecar/engine` ->
`src/api`), satu folder per PR.

## 7. Fase 3 — Renderer & sisanya

- [ ] `src/hooks/**`, `src/components/**`, `src/pages/**`: rename `.jsx`->`.tsx`
  per halaman, mulai dari yang paling stabil (bukan Chat/InputBar yang masih
  bergerak).
- [ ] `.mjs` runtime (bin/scripts/evaluation): rename ke `.mts` atau `.ts`
  dengan `module: ESNext`; jaga `bun` tetap bisa jalankan (Bun mengeksekusi
  `.ts` langsung).
- [ ] `tests/**`: biarkan `.mjs` (vitest sudah jalan); tambah tipe hanya bila
  kontraknya penting.

## 8. Strategi roll-out & gerbang CI

| Fase | `tsc` di CI | Kegagalan tipe | Catatan |
| --- | --- | --- | --- |
| 0 | jalan, `continue-on-error: true` | tidak memblok | ukur luapan error dulu |
| 1 | jalan, blok untuk subtree `cli/` | memblok | 3 file + `cli/core/` |
| 2 | jalan, blok untuk `sidecar/engine` + `src/api` | memblok | per-folder PR |
| 3 | jalan, blok menyeluruh | memblok | `strict` penuh |

Aturan "ratchet" (cegah regresi tanpa rewrite serentak): setiap PR yang
menyentuh file yang SUDAH bertipe tidak boleh menambah error baru; file yang
belum bertipe tidak boleh diperburuk (dicek via `tsc --noEmit` diff pada
`include` yang sama).

## 9. Risiko & mitigasi

| Risiko | Mitigasi |
| --- | --- |
| Rewrite besar-besaran memicu regresi runtime | Rename + annotate saja; perubahan logika dipisah PR |
| `strict` di awal membanjiri error (224 `.mjs`) | `checkJs:false` + include per-subtree; naikkan per folder |
| Dua sumber kebenaran tipe (JSDoc vs TS) | Pilih satu arah: file `.js` pakai JSDoc `@ts-check`; file baru pakai `.ts` |
| `verbatimModuleSyntax` + impor JSON (`package.json`) | `resolveJsonModule` + impor default; sudah dipakai `appIdentity.js` |
| Bun vs tsc resolusi berbeda | `moduleResolution: "bundler"`, test smoke `bun run` untuk entry `bin/` |
| Lint `.jsx` lama terpukul saat menambah TS | Flat config baru khusus `**/*.{ts,tsx}`; jangan ubah blok lama |

## 10. Urutan PR yang disarankan (satu PR satu fase)

1. PR-A: Fase 0 (devDeps + tsconfig base + CI soft-fail). Tanpa rename.
2. PR-B: Fase 1 (`cli/**`, `bin/*.tsx`) + `cli/core/` ekstraksi.
3. PR-C: Fase 2a (`sidecar/engine` registry + channels ter-tipe).
4. PR-D: Fase 2b (`tauri-bridge`, `db`, `headlessCli`, `agentRunner`).
5. PR-E..: Fase 3 per halaman.

## 11. Catatan aturan repo yang tetap berlaku

- Boundary branch/PR: kerja di branch + PR ke `main`; satu PR satu fase.
- Session log wajib per sesi; update `docs/ARCHITECTURE.md` bila modul berpindah.
- Gerbang rilis `scripts/verify.sh` harus tetap hijau; tambah `tsc --noEmit`
  ke sana SETELAH fase 1 memblok (bukan fase 0).
- Dilarang menambah tooling non-Linux-era (tidak ada PowerShell/PS).
