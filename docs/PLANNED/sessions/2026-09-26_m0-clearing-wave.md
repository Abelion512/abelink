# Session log — 2026-09-26 — M0 Clearing (wave pembersihan blocker)

Program: P1 (JS->TS) + P2 (CLI engine adopsi Hermes)
Branch: `refactor/m0-clearing` (di atas snapshot WIP `feat/tui-opentui` @35376f4)
Induk: `docs/PLANNED/2026-09-26_master-migration-program.md`

## Keputusan owner (dikutip)

- UTAMA: JS->TS + CLI engine adopsi arsitektur Hermes. TUI parity = pendukung.
- `opencode/` clone: diabaikan total (referensi TUI saja).
- Jalankan M0 sekarang; commit WIP dulu di `feat/tui-opentui`, lalu branch baru.
- B-6/D4: "follow ur suggest" -> diputuskan **WIRE** (default plan).

## Perubahan (semua tanpa ubah perilaku default)

| Blocker | Aksi | Berkas |
| --- | --- | --- |
| B-19 (baru) | `typescript` di-resolve ke 7.0.2 (compiler Go) -> `typescript-eslint` 8.x menolak jalan; dipin `^5.9.3` | `package.json`, `bun.lock` |
| B-2 | Blok `typescript-eslint` scoped `**/*.{ts,tsx,mts,cts}`; react rules diselaraskan (prop-types off, unknown-property warn) karena OpenTUI/Solid pakai intrinsics terminal | `eslint.config.mjs` |
| B-3 | `**/opencode` + daftar scratch lokal (`.remember` dll) masuk `ignores` | `eslint.config.mjs` |
| B-4 | `include` vitest + `ts,tsx`; probe `tests/ts-probe.test.ts` membuktikan test `.ts` benar-benar jalan | `vitest.config.mjs`, `tests/ts-probe.test.ts` |
| B-6 | `gateway.mjs` diwire opt-in: `ABELINK_TELEGRAM_HEADLESS=1` -> telegram-service pakai `createTelegramGateway`; runner injectable via `setTelegramHeadlessRunner`; default OFF = perilaku lama | `sidecar/main/telegram/gateway.mjs`, `telegram-service.js` |
| B-7 | Script `cron`/`cron:daemon` + template unit user + installer (path absolut diisi installer) | `package.json`, `scripts/systemd/abelink-cron.service`, `scripts/install-cron-daemon.sh` |
| B-8 | Konvensi `*.live.test.*` + config terpisah + `test:live` (timeout 60s); exclude dari gate default. **Bukti nyata ditemukan di CI PR #50**: `tests/cli-tui-v2.test.mjs` menuntut `Katalog` dari 9Router hidup → merah di CI. Varian gate dijadikan hermetik via `ABELINK_MODELS_ENDPOINT` ke port mati (6s, deterministik), asersi jaringan pindah ke `tests/cli-tui-v2.live.test.mjs` | `vitest.live.config.mjs`, `vitest.config.mjs`, `package.json`, `tests/cli-tui-v2.test.mjs` (branch WIP), `tests/cli-tui-v2.live.test.mjs` |
| B-10 | Resolusi binary PATH-first; path absolut maintainer jadi fallback terakhir | `src/api/ai/codingAgentBridge.js` |
| B-1/B-18 | `tsconfig.base.json` (strict, `allowJs`, `checkJs:false`, `moduleResolution: bundler`, `jsx: react-jsx`) + `tsconfig.json` (include sempit) + script `typecheck` | `tsconfig.base.json`, `tsconfig.json`, `package.json` |
| keamanan | `mcp.json` memuat API key polos -> di-gitignore sebelum snapshot WIP | `.gitignore` |

## Hasil verifikasi

- `bun run lint` -> exit 0, **0 error**, 46 warning (semua `react/no-unknown-property`
  untuk intrinsics OpenTUI: `fg`, `focused`, `keyBindings`, ... = tech-debt terdaftar).
- `bunx vitest run` -> **148 file / 1695 test hijau** (sebelumnya 147/1688).
  Termasuk `tests/ts-probe.test.ts` (2 test) yang membuktikan gate `.ts` nyala.
- `bun run typecheck` -> exit 0.
- `bun run test:live` -> **1 file / 1 test hijau** (71s, `cli-tui-v2.live.test.mjs`).
  Saat 9Router mati, test ini SKIP dengan alasan tercetak — bukan lulus palsu.
- Gate default `tests/cli-tui-v2.test.mjs` -> 42 test hijau dalam **6.4s**
  (sebelumnya 38s karena menunggu jaringan).
- `bun run build` -> sukses (37s).
- `bun run cron list` -> jalan (store kosong).

## Batasan dikenal / yang belum

- `tests/bench-boundary-live.test.mjs` bernama "live" tapi murni (stub). Pola
  exclude `*.live.test.*` (titik) sengaja TIDAK mencocokkan `-live.test.mjs`
  (tanda hubung), jadi file itu tetap ikut gate — tidak ada test yang hilang diam-diam.
- Klaim awal "belum ada test yang butuh 9Router" **salah** dan dikoreksi oleh CI:
  `tests/cli-tui-v2.test.mjs` memang menunggu jaringan. Bukti: run 36214333977.
  Akar masalahnya B-21: 9Router `/v1/models` terukur **40.1s** (`curl`), sementara
  `fetchLiveCatalog` timeout 45s — margin tipis yang membuat hasil bergantung beban.
- `gateway.mjs` saat flag ON belum punya runner sidecar nyata: balasannya `[SKIP]`
  jujur (bukan "selesai" palsu). Runner asli menyusul di M5/H9 (satu inti).
- Sub-config `tsconfig.renderer.json`/`tsconfig.node.json` digeser ke M1.
- D1 (GUI -> `runAgentLoop`) masih terbuka sampai M3.
- `scripts/install-cron-daemon.sh` belum diuji jalan (butuh `systemctl --user`
  pada sesi nyata); string unit dihasilkan via `sed` placeholder, belum di-run.

## Langkah berikutnya

M0 selesai. Berikutnya M1 (toolchain TS: pecah tsconfig, lebarkan include
bertahap, CI `tsc` soft-fail) — menunggu keputusan owner untuk melanjutkan.
