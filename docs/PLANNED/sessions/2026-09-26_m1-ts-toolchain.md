# Session log — 2026-09-26 — M1 Toolchain TypeScript

Program: P1 (JS->TS), wave M1 (lanjutan M0)
Branch: `refactor/m1-ts-toolchain` (ditumpuk di atas `refactor/m0-clearing`)
Induk: `docs/PLANNED/2026-09-26_master-migration-program.md`

## Keputusan owner (dikutip)

- "ikut anda, pokoknya latest version for dep yang support di laptop gw.
  Kerjakan bertahap" -> pakai versi terbaru yang **benar-benar didukung**
  tooling di mesin ini, bukan sekadar `latest` di registry.

## Kebijakan versi (diverifikasi, bukan asumsi)

| Paket | Dipasang | Alasan |
| --- | --- | --- |
| `typescript` | **5.9.3** | `latest` registry = **7.0.2** (compiler Go) dan `typescript-eslint` 8.x menolak jalan; `beta` = 6.0.0-beta. **5.9.3 adalah versi STABIL terbaru yang didukung** (5.9.3 juga 5.x terbaru yang terbit). |
| `typescript-eslint` | 8.70.1 | latest |
| `@types/node` | 26.6.3 | latest |
| `@types/react`, `@types/react-dom` | 19.3.0 | latest |

## Perubahan

| Item | Aksi |
| --- | --- |
| Gate utama | `tsconfig.json` dilebarkan ke ZONA BERSIH: `src`, `sidecar`, `scripts`, `evaluation`, `tests` (.ts/.tsx) |
| Sub-gate node | `tsconfig.node.json` baru + script `typecheck:node` (mengunci permukaan Node: sidecar/scripts/evaluation/tests) |
| CI | `.github/workflows/tauri.yml`: langkah `Typecheck (tsc, soft-fail)` dengan `continue-on-error: true` di job `frontend` |

## Pengukuran (bukti, bukan klaim)

`cli/**` + `bin/**.tsx` diukur dengan config sementara:
**114 error TS, 100% dari 3 berkas TUI** (`cli/tui/App.tsx`,
`cli/tui/components/PromptRow.tsx`, `bin/abelink-tui-v2.tsx`) — mayoritas
`TS2339 property does not exist on type '{}'`, `TS7006 implicit any`,
`TS2322` intrinsics OpenTUI. Itu backlog **M2**, jadi subtree ini sengaja
dikeluarkan dari gate sekarang.

`tsconfig.renderer.json` **tidak dibuat**: `src/**` belum punya satu pun berkas
`.ts`, dan tsc menolak config tanpa input dengan **TS18003** (exit 2). Config
kosong bukan "hijau", jadi lebih jujur menundanya sampai berkas pertama
mendarat (dicatat sebagai B-20).

## Hasil verifikasi

- `bun run typecheck` -> exit 0
- `bun run typecheck:node` -> exit 0
- `bun run lint` -> exit 0
- (M0 gates tetap berlaku: vitest 148 file / 1695 test hijau)

## Batasan dikenal

- CI `continue-on-error: true` berarti typecheck **tidak memblokir** PR sampai
  M2 (blok `cli/**`) dan M4 (blok `sidecar/engine` + `src/api`).
- Gate payung hanya "hijau" karena berkas lama masih `.js` dan `checkJs:false`.
  Nilainya baru terasa saat berkas dipindahkan ke `.ts` (M2 ke atas).
- `bin/abelink-tui-v2.tsx` = entry TUI; 114 error itu titik awal M2.

## Langkah berikutnya

M2: ekstraksi `cli/core/*` dari `bin/abelink-tui.mjs` (B-9), lalu bertipekan
`cli/**` + `bin/**.tsx` sampai `tsc` hijau, baru jadikan gate BLOK.
