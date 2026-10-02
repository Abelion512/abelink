# Session Log — W6: cli/bin/scripts/evaluation ke TypeScript (PR #116)

Tanggal: 2026-10-01 | Branch: `refactor/ts-w6-runtime-switch` | Merge squash: `b5b57c03` (149 file, +1597/-1525)

## Keputusan

1. **Switch runtime `node` ke `bun` (K7) harus masuk wave yang sama dengan rename.** Entry `bin/abelink`, `bin/abelink-tui`, `bin/abelink-cron` dan seluruh `scripts/*.mjs` dulu dijalankan dengan `node`. Rename ke `.ts` tanpa switch = runtime break pada launcher Linux dan pada script CI. Prinsip: tidak boleh ada file `.ts` yang dieksekusi `node`.
2. **Zona konvensi specifier dipatahkan sesuai zona, bukan dipaksa satu gaya.** sidecar/cli/bin/scripts/evaluation memakai `.ts` eksplisit (runtime bun/ESM butuh ekstensi); renderer `src/` tetap extensionless (diolah Vite). Dicatat di spec §W6 supaya reviewer tidak menganggap inkonsisten.
3. **Codemod hanya untuk TS7006/TS7031/TS7005; sisanya manual.** Volume error W6 cukup besar untuk tak masuk akal diketik satu per satu, tapi setiap cast harus ditinjau karena cast salah = bug senyap yang lolos gate.
4. **Referensi `.mjs` basi ikut tertuju rename** (ditemukan test tripwire `ponytailLedger`/path assertions, bukan mata): 46 file tests ikut berubah hanya karena path/import string.

## Berkas berubah (ringkas per zona)

- `cli/` 21 file (core parser/store/hooks/writer + tui v2)
- `bin/` 4 file (3 entry + 1 shared)
- `scripts/` 19 file (verify.sh menarik target `.ts`, sync-version, ext-version, release helpers, ci/*)
- `evaluation/` 32 file (adapter, terminal-bench verifier, deepeval dynamic runner, pr46-* measurement plane, smoke)
- `src/` 20 file sisa yang tertinggal dari W3/W4
- `tests/` 46 file (path/import string saja, rename penuh baru W7)
- `package.json` script + `.github/workflows/tauri.yml` 4 step

## Hasil verifikasi

| Gate | Hasil |
| --- | --- |
| `tsc --noEmit` (root) | exit 0 |
| `tsc --noEmit -p tsconfig.node.json` | exit 0 |
| `tsc --noEmit -p tsconfig.renderer.json` | exit 0 |
| `bun run lint` | 0 error |
| `bunx vitest run` | **1836 pass / 16 skip** |
| `bun run build` | OK |
| `bun evaluation/smoke.ts` | LOLOS |
| CI PR #116 | semua job hijau |

## Batasan dikenal

1. **Test masih `.mjs`/`.js`** — sub-gate `typecheck:tests` belum ada; `tests/` tidak pernah dikompilasi tsc. Ini celah verifikasi nyata yang ditutup W7.
2. **`import.meta.dir`** (bun) tetap butuh cast `(import.meta as any).dir`.
3. **Warning `no-explicit-any`** masih teraccumulate; eskalasi kebijakan any = W9.
