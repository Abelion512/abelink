# Session 2026-10-02 — Ratchet any 1/5: `evaluation/pr46-matrix.ts`

Program: turunkan baseline any per zona dengan menangani file terpadat satu per
satu, baseline dikecilkan di PR yang sama (aturan `scripts/ci/any-ratchet.sh`).

## Apa & kenapa

File terpadat di zona kontrak: **132 `any`** (5,7% dari total 2369). Semua
berasal dari satu pola: registry 30 fixture ditulis dengan parameter
`(workdir: any, sentinel: any)` dan `verify: (_output: any, ctx: any)`.

Risk register §9 W9 sudah memperkirakan: payoff terbesar ada di file dengan
`any` paling padat, danbiaya paling murah kalau bentuk datanya seragam. Di
file ini memang seragam — 25 `verify`, 20 `seed(wd, sentinel)`, 4 `seed(wd)`.

## Perubahan

`evaluation/pr46-matrix.ts`: 132 → **0**.

Tipe baru di kepala file:

| Tipe | Definisi | Dipakai untuk |
| --- | --- | --- |
| `ToolCallEntry` | `{tool?, query?, result?, success?, toolCalls?}` | bentuk stepLog yang dibaca oracle |
| `VerifyContext` | `{sentinel: string, workdir: string, stepLog: ToolCallEntry[]}` | argumen kedua `verify` |
| `VerifyFn` | `(output: string, ctx: VerifyContext) => boolean` | bentuk fungsi oracle |
| `Fixture` | field registry + `seed` + `verify` | 30 fixture sebelum default |
| `Task` | `Fixture` + field hasil `withDefaults` | entri `PR46_TASKS` |

Catatan pilihan `unknown` untuk beberapa parameter: `query`, `result`, dan
`success` memang bentuk dinamis dari adapter, dan `isFail` /
`maxAdjacentRepeats` sudah melakukan type guard sendiri (`typeof result ===
'string'`). Menulis `unknown` memaksa pembaca kode melihat bahwa narrowing
sudah dilakukan, bukan disembunyikan di balik `any`.

## Dua koreksi yang diperlukan tsc

1. **`withDefaults` memicu TS2783.** Spread `...fixture` ditulis terakhir,
   sedangkan `requiredTools`/`maxTurns`/`effort`/`long` sudah ditulis sebelum
   spread → tsc menandai "specified more than once, will be overwritten".
   Diperbaiki dengan menaruh spread di tengah lalu menulis ulang empat field
   dengan `??` SESUDAH spread. **Hasil identik** (spread terakhir menang ==
   `??` setelah spread), hanya menghilangkan peringatan tsc. Perilaku `withDefaults`
   tidak berubah; `evaluation/smoke.ts` yang memverifikasi `fx.oracleIndependent`
   dan 30 fixture masih hijau.
2. **`BROWSER_PAGE.seed` jadi implicit any** setelah hapus anotasi parameter:
   object literal tanpa tipe kontekstual tidak memberi tipe ke parameter
   arrow function. Diperbaiki dengan anotasi `{ seed: Fixture['seed'] }`.

## Referensi (sesuai aturan repo: keputusan harus ditelusuri ke primary source)

- TypeScript 3.0 release notes — `unknown`: *"Anything is assignable to
  unknown, but unknown isn't assignable to anything but itself and any without
  a type assertion or a control flow based narrowing."* Dasar pilihan
  `unknown` untuk data adapter yang belum dinarrow.
  <https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-0.html>
- TS2783 (`specified more than once`) — dokumentasi resmi TS mengharuskan
  spread ditulis setelah properti kembar; di siniidiperbaiki dengan
  `??` pasca-spread agar hasil sama.
  <https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-0.html>
- Prinsip anti-`any` repo sendiri: `eslint.config.ts` `no-explicit-any: 'warn'`
  + `scripts/ci/any-ratchet.sh` (W9). Ratchet = boleh turun, tidak boleh naik.

## Baseline

`scripts/ci/any-baseline.json`:

| Zona | Sebelum | Sesudah |
| --- | --- | --- |
| contract | 2161 | **2029** |
| tests | 208 | 208 |
| max | 2369 | **2237** |

## Verifikasi

- `bun run typecheck` exit 0, `typecheck:node` exit 0, `typecheck:tests` exit 0.
- `bunx eslint evaluation/pr46-matrix.ts` → 0 pesan, `no-explicit-any` = 0.
- `bunx vitest run` penuh: **1836 pass / 16 skip** (168 file). Nol regresi dari
  baseline W9.
- `bun evaluation/smoke.ts` **LOLOS** (termasuk 30-fixture emission,
  determinisme byte-per-byte, ablation pair).
- `bash scripts/ci/any-ratchet.sh` → `contract turun 2161 -> 2029`, exit 0
  setelah baseline dikecilkan.
- CJK scan bersih.

## Batasan

- Tidak ada perubahan perilaku. Modul ini murni registry + seeding helper;
  satu-satunya restrukturisasi adalah `withDefaults` yang secara semantik
  identik (dibuktikan smoke + 49 test).
- `hasToolEvidence` di `tasks-student-corporate.ts` masih menerima `any`
  (baris 40-47). Itu file berikutnya di antrean, bukan dalam PR ini.
- `ToolCallEntry.toolCalls?: unknown[]` masih perlu cast saat di-spread ke
  `calls`. Cast itu jujur: isinya sudah dijamin array oleh `Array.isArray`.