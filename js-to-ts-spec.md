# SPEC: Penyelesaian Migrasi JS → TS 100% (Abelink)

> CATATAN EPISTEMIK: §5–§9, §12, dan §15 dokumen ini adalah rencana kerja
> agen pelaksana, BUKAN standar yang ditetapkan owner. Keputusan yang menyentuh
> alur kerja owner wajib ditelusuri ke dokumen owner atau primary source
> upstream — preseden: koreksi W8 memakai dokumentasi resmi Chrome tentang
> extension service worker (https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics).

Tanggal: 2026-09-28
Status: **EKSEKUSI BERJALAN** — W0 ✓ (PR #87), W1 ✓ (PR #88–#92, sidecar/engine 100% .ts, 9/9 channel); W2 boundary src/api berikutnya; sisanya belum.
Pemilik keputusan: Abelion512 (via interview 2026-09-28)
Akar hukum: melanjutkan `docs/PLANNED/2026-09-26_master-migration-program.md` (P1) + `docs/PLANNED/2026-09-26_js-to-ts-migration.md`; dokumen ini menjadi peta jalan tunggal sisa migrasi dan men-SUPERSEDE dokumen migrasi lama (lihat W0).

---

## 1. Ringkasan 5W1H

- **What:** Menyelesaikan migrasi seluruh kode JS/JSX/MJS Abelink ke TypeScript hingga **100% tanpa sisa** (nol file `.js`/`.jsx`/`.mjs` produktif), termasuk config tooling di root dan source extension.
- **Why:** Menutup program P1 yang sudah berjalan sejak 2026-09-26 (M0–M3 selesai, Fase 2–3 belum dimulai); type safety penuh memperkuat batas arsitektur (Tauri boundary, kontrak frame sidecar) dan menghilangkan dualisme JSDoc/TS.
- **Who:** Agent otonom (mode penuh, tanpa intervensi per langkah), di bawah aturan branch/PR repo.
- **When:** Dieksekusi bertahap per wave (W0..W9), sekuensial, satu slice = satu PR.
- **Where:** Seluruh zona migrasi: `src/`, `sidecar/`, `cli/`, `bin/`, `scripts/`, `evaluation/`, `tests/`, config root, `extension/`.
- **How:** Strangler pattern eksisting (terbukti di M1–M2): rename + annotate tanpa ubah perilaku, zona bersih via `allowJs`/`checkJs:false`, ukur error → nolkan → masukkan gate, ratchet no-regresi.

## 2. Keputusan Interview (LOCKED)

| # | Keputusan | Pilihan owner |
| --- | --- | --- |
| K1 | End state | **100% TS tanpa sisa** — semua file produktif termasuk scripts/evaluation/tests; tanpa pengecualian `.mjs` |
| K2 | Scope urutan | Ikut rekomendasi agent; goal tetap semua ke TS (peta lama Fase 2→3 dipakai sebagai tulang punggung, dilonggarkan jadi wave) |
| K3 | Role dokumen | Spec baru jadi roadmap induk pengganti; dokumen lama diarsipkan bertanda SUPERSEDED |
| K4 | Cadence | **Eksekusi otonom penuh** — spec harus bisa dijalankan agent tanpa tanya per langkah |
| K5 | Extension | Ikut standar (konversi ke TS source + build step MV3) |
| K6 | Config root | **Semua ke TS** (vite, eslint, vitest, vitest.live) |
| K7 | Runtime | **Semua entry `node` → `bun`** (selaras AGENTS.md: script first-party = bun) |
| K8 | Any policy | Keputusan agent: **error di zona kontrak, warn di zona UI** |
| K9 | Tests | **Ikut .ts penuh** (semua 174 file) |
| K10 | Handoff marker | **Hapus + arsipkan** — tidak boleh ada dua "pemilik" dokumen migrasi |
| K11 | PR cadence | Keputusan agent: minim konflik + standar kerja → **satu slice = satu PR, sekuensial, merge sebelum slice berikut** |
| K12 | Anti-tabrakan | Keputusan agent: pre-flight abort signal + namespace branch |
| K13 | verify.sh | **Tambah tsc sekarang** (wave pertama) |
| K14 | Kedalaman tipe | **Tiered** — penuh di boundary/kontrak, minimum di UI |

## 3. State Saat Ini (terukur 2026-09-28)

### 3.1 Sudah selesai (jangan diulang)

- Toolchain: `typescript@^5.9.3` (pin, B-19), `typescript-eslint@8`, `@types/{react,react-dom,node}`; `tsconfig.base.json` + `tsconfig.json` (gate payung) + `tsconfig.node.json` (sub-gate node). `bun run typecheck` + `typecheck:node` exit 0.
- ESLint sudah lint `**/*.{ts,tsx,mts,cts}` (blok typescript-eslint, M0).
- Vitest `include` sudah `tests/**/*.{test,spec}.{js,mjs,ts,tsx}` (B-4 tertutup M0); test live terpisah `*.live.test.*` + `test:live` (B-8).
- CI `tauri.yml`: `Typecheck (tsc)` **BLOK** sejak M2a (baris ~57–64): `bun run typecheck` + `bun run typecheck:node`.
- Fase 1 selesai: `cli/core/{schema,protocol}.ts`, `cli/tui/{theme.ts,types.ts,App.tsx,components/PromptRow.tsx}`, `bin/abelink-tui-v2.tsx` — 0 error tsc, masuk gate blok.
- M0–M3 master program selesai (clearing, toolchain, CLI/TUI bertipe, ADR-001 loop divergence).

### 3.2 Sisa permukaan JS (hitungan aktual)

| Zona | .js | .jsx | .mjs | .ts/.tsx (ada) | Catatan |
| --- | --- | --- | --- | --- | --- |
| `src/` | 114 | 73 | 0 | 0 | Renderer + core logic; jantung runtime di `src/api/` |
| `sidecar/` | 18 | 0 | 44 | 0 | `engine.mjs` entry + `engine/` + `main/` |
| `scripts/` | 0 | 0 | 17 | 0 | Termasuk `sync-version.mjs`, `verify.sh` helper |
| `evaluation/` | 0 | 0 | 31 | 0 | Bench harness + PR46 measurement plane |
| `tests/` | 174 | 0 | (termasuk) | 1 | Volume rename terbesar |
| `cli/` | 18 | 0 | — | 6 | Sisa `.mjs` di `cli/core`, `cli/tui` |
| `bin/` | 3 | 0 | — | 1 | `abelink.mjs`, `abelink-tui.mjs`, `abelink-cron.mjs` |
| Root configs | 2 | 0 | 2 | 0 | `vite.config.js`, `eslint.config.mjs`, `vitest*.config.mjs` |
| `extension/` | ~4 | 0 | 0 | 0 | `background.js`, content scripts, `manifest.json` (bukan JS biasa — MV3) |

Catatan: `src-tauri/**` tidak punya JS produktif (63 hitungan lama hanyalah artefak `target/`, ter-ignore).

### 3.3 Fakta integrasi kritis (ditemukan saat riset)

1. **Entry plain `node`** (tidak bisa mengeksekusi `.ts`): `sync-version`, `harness:export`, `harness:diagnose`, `benchmark:echo/run/deepeval/adapter`, `test:harness` → semua wajib pindah `bun` (K7).
2. **Impor lintas-zona** ke `src/api/*` dari `scripts/semver-lite.mjs`, `sidecar/engine/channels/media.mjs`, `sidecar/main/{legacy-provider-shim.mjs,ai-bridge.js}`, `cli/core/{provider-runtime,engine-session}.mjs`, `cli/tui/modelEffort.mjs` — saat file sumber dikonversi, semua importer wajib ikut disesuaikan (ekstensi/resolve) dalam PR yang sama.
3. **Dexie schema kini v30** (`src/api/db.js` versi(28)/(29)/(30)) — bukan v22 seperti tertulis AGENTS.md. Pengetikan `db.ts` wajib memakai v30 sebagai baseline.
4. **`verify.sh` belum menjalankan tsc** — gap antara release gate lokal vs CI (K13 menutup ini).
5. **`tsconfig.renderer.json` belum ada** karena B-20 (TS18003 bila tanpa input `.ts`) — dibuat saat file `.ts` pertama mendarat di `src/**` (W2/W3).
6. **Bun compile sidecar**: `build:sidecar` memakai `bun build sidecar/engine.mjs --compile` — input path berubah saat `engine.mjs` → `.ts`; cek juga referensi resource di `tauri.conf.json`, `scripts/dev.sh`, unit systemd (`scripts/systemd/abelink-cron.service`), dan `package.json` `"bin"`.
7. **Extension MV3**: Chrome memuat plain JS; konversi = source `.ts` + bundler emit (K5). `manifest.json` tidak dikonversi (JSON), tapi `sync-version`/`ext-version.mjs` tetap menyinkronkan versinya.
8. `allowImportingTsExtensions: true` + `noEmit: true` sudah aktif di base — konsisten dengan pola Bun mengeksekusi `.ts` langsung.

## 4. Definisi "100% TS" (DoD akhir program)

1. `grep -r --include=*.js --include=*.jsx --include=*.mjs` di zona migrasi (`src`, `sidecar`, `cli`, `bin`, `scripts`, `evaluation`, `tests`, `extension` source, config root) menghasilkan **nol file** — kecuali daftar pengecualian eksplisit di §4.1.
2. Empat tsconfig (base, root payung, node, renderer) + sub-config extension exit 0; semua masuk `bun run typecheck` gabungan.
3. `scripts/verify.sh` hijau **termasuk step tsc**; CI `tauri.yml` tetap blok menyeluruh.
4. Vitest: nol file test `.js/.mjs`; jumlah test tidak boleh turun dari baseline (1788 pass per 2026-09-28).
5. `bun run lint` exit 0; warning tidak melebihi baseline tercatat di session log wave terakhir.
6. Tidak ada file produktif yang runtime-nya dijalankan plain `node`.
7. `docs/ARCHITECTURE.md` + AGENTS.md diperbarui (layout & konvensi .ts) pada wave terakhir.

### 4.1 Pengecualian permanen (bukan bagian zona migrasi)

`node_modules/**`, `dist/**`, `dist-sidecar/**`, `out/**`, `src-tauri/target/**`, `coverage/**`, `graphify-out/**`, `opencode/**` (clone referensi, di-ignore total), `.git/**`. Vendor/third-party JS yang di-vendor di dalam `extension/` (bila ada) dicatat sebagai pengecualian per-file di session log, bukan dihapus diam-diam.

## 5. Arsitektur Toolchain Target

```
tsconfig.base.json          # strict, ES2022, bundler resolution, allowJs+checkJs:false (tetap)
tsconfig.json               # gate payung: seluruh zona (src, sidecar, cli, bin, scripts, evaluation, tests)
tsconfig.node.json          # sub-gate node: lib TANPA DOM, types:["node"] (sidecar/scripts/evaluation/tests)
tsconfig.renderer.json      # BARU (saat .ts pertama di src/): lib DOM, types TANPA node (src/**)
tsconfig.extension.json     # BARU (W8): include extension/src/**, lib DOM+MV3, emit via esbuild
```

- Konvensi ekstensi target: file runtime Node/Bun sidecar/scripts → **`.ts`** (Bun menjalankan langsung; TIDAK `.mts` — keputusan D3 lama "tetap .mjs" dibatalkan oleh K1). Renderer → `.tsx`/`.ts`. Test → `.ts` (vitest config sudah mendukung).
- Import style: pertahankan ekstensi eksplisit `.ts`/`.tsx` di entry Bun (pola eksisting `bin/abelink-tui-v2.tsx`), ekstensi-less untuk sisanya sesuai `moduleResolution: bundler`. Konsisten per-zona; jangan campur dalam satu direktori.
- `types: []` di base tetap; per-subconfig mempersempit (node vs renderer) — guardrail boundary Tauri.
- Any policy (K8): override ESLint `no-explicit-any: 'error'` untuk zona kontrak (`sidecar/engine/**`, `src/api/**`, `cli/core/**`, `bin/**`, `src/api/harnessCore*`); `'warn'` untuk zona UI (`src/components/**`, `src/pages/**`, `src/hooks/**`, `tests/**`).

## 6. Wave Plan (W0..W9)

Aturan global per wave: branch `refactor/ts-w<N>-<slug>` dari `main` terbaru; satu slice satu PR; rename+annotate murni (perubahan logika = PR terpisah, larangan absolut); gates wajib hijau sebelum merge: `bun run typecheck` + `typecheck:node` + `lint` + `vitest run` + smoke entry terdampak; session log `docs/PLANNED/sessions/YYYY-MM-DD_<topik>.md` per wave.

### W0 — Governance & Gates (tanpa rename)

1. **Hapus marker handoff** `<!-- OPENCODE AMBIL ALIH -->` + paragraf HANDOFF di `docs/PLANNED/2026-09-26_js-to-ts-migration.md` (K10). Tandai dokumen itu **SUPERSEDED** mengarah ke spec ini. Master program: bagian P1 diperbarui menunjuk spec ini (P2 Hermes tetap hidup di dokumennya sendiri).
2. **verify.sh**: tambahkan `bun run typecheck` + `bun run typecheck:node` sebelum vite build (K13).
3. **Hard gate CI no-new-JS (ratchet)**: step/script kecil di `tauri.yml` (atau `scripts/ci/no-new-js.sh`) yang gagalkan PR bila ada file `.js/.jsx/.mjs` BARU di zona migrasi — dibandingkan `git diff --diff-filter=A --name-only origin/main...HEAD` (K-rgc). Update gate itu sendiri seiring zona menyusut.
4. **Pre-flight autonomous protocol** ditulis di spec ini (§8) dan dirujuk CI/session-log template.
5. Baseline dicatat: jumlah file per zona (tabel §3.2) + jumlah test — jadi acuan anti-regresi.

DoD: semua gate hijau, dokumen lama tidak lagi "aktif", tidak ada rename.

### W1 — Fase 2a: `sidecar/engine` registry + channels

- `sidecar/engine.mjs` → `engine.ts`; `sidecar/engine/registry.mjs` → `.ts` dengan tipe `Request`/`Response` generik, `on(action, fn)` ter-tipe, peta channel ter-tipe.
- `sidecar/engine/channels/*.mjs` (`ai`, `media`, `telegram`, `services`, `music`, `skills`, `os`, `browser`, `capabilities`) → `.ts` satu PR per channel-cluster (2–3 channel) agar review tetap kecil.
- Kontrak frame (`cli/core/protocol.ts` jadi sumber tipe bersama bila memungkinkan; hindari duplikasi tipe — single source di sisi engine, CLI mengimpor).
- `legacy-provider-shim.mjs` + `ai-bridge.js` menyentuh `src/api/*` — sesuaikan importer lintas-zona (fakta §3.3.2) di PR yang sama.
- Perilaku: kontrak frame JSON-over-stdio BEKU — nol perubahan wire format.

### W2 — Fase 2b: boundary `src/api` (nilai tertinggi)

- Buat `tsconfig.renderer.json` (B-20: dibuat sekarang karena input `.ts` mulai ada).
- Urutan dalam wave (satu PR masing-masing): (1) `src/api/tauri-bridge.js` → `.ts` + deklarasi `Window['api']` + tipe payload `node_invoke` per aksi; (2) `src/api/db.js` → `.ts` (tipe baris Dexie per store, schema v30, AppConfig); (3) `src/api/ai/headlessCli.js` + `agentRunner.js` → `.ts` (kontrak `AgentOptions`/`RunResult`/`Environment`); (4) sisa `src/api/*.js` per-cluster (`vectorMemory`+`vectorCore`+`vectorLoader`, `oramaStore`+`ragPipeline`+`turnPairMigrator`, `taskStore`+`taskExecutor`, `subagent/*`, `ai/*` sisanya, `tools/*`, `harness*`, `semverLite`, `workspaceRag`, `groq`+`localWhisper`+`whisperWorker`, `scraping`, `sttRouter`, `locale`).
- Dexie: test round-trip Dexie wajib hijau; jangan sentuh upgrade path v28→v30 (rename + tipe saja).
- `planning.js` (B-11, freeze): boleh disentuh DI SINI dan seminimal mungkin — rename + annotate, larangan refactor logika/prompt.

### W3 — Renderer core: `src/hooks` + `src/api/*` tuntas

- `src/hooks/**` → `.ts/.tsx` per-hook (`useAbelinkAgent`, `useAwareness`, `useVAD`, `useChatArchiver`, `useMemoryGroomer`, `agent/*`, `telegram/*`).
- Sisa `.js` di `src/api` tuntas bila ada sisa; `src/utils`, `src/contexts`, file pendukung lain.
- Kedalaman: tipe props hooks + return values; pola M2a (`@ts-expect-error` berkomentar, tanpa cast tersebar) untuk gap pihak ketiga.

### W4 — Renderer UI: `src/components` + `src/pages` + `main.jsx`/`App.jsx`

- Rename `.jsx` → `.tsx` per halaman/komponen-cluster; mulai dari yang paling stabil (STABLE dulu), `Chat/` + `InputBar` di akhir (paling sering bergerak — catatan peta lama).
- Kedalaman minimum (K14): cukup lolos tsc strict; props interface sederhana; tanpa refactor.
- `main.jsx`, `App.jsx` → `.tsx`; `index.html` script src disesuaikan bila perlu (Vite resolve otomatis; verifikasi build).

### W5 — `sidecar/main` penuh

- `sidecar/main/**` (ai-bridge, node-tools, browser/*, awareness/*, plugins/*, telegram/*, services/*, skills/*, google/*, git-service, syntax-validator, workspace-rag, task-daemon, utils/*, pc-agent*) → `.ts` per-cluster.
- `main/browser/` menyentuh extension bridge: kontrak long-poll/token dianotasi; JANGAN ubah protokol token/port (49712 prod / 49713 dev).
- `NATIVE_TOOLS` (node-tools.js): registry ter-tipe dengan metadata `needsApproval`/`approvalMessage` — struktur delimiter double-pipe tetap.
- `engine.mjs` build path: `build:sidecar` → `bun build sidecar/engine.ts --compile`; cek `tauri.conf.json` resources + `scripts/dev.sh`.

### W6 — scripts + evaluation + bin + runtime switch penuh (K7)

- `scripts/**.mjs` → `.ts`; `bin/abelink.mjs`, `abelink-tui.mjs`, `abelink-cron.mjs` → `.ts` (host-only, sudah tipis pasca M2b).
- `package.json`: SEMUA entry `node <file>.mjs` → `bun <file>.ts`; `cron`, `harness`, `benchmark:*`, `harness:*`, `sync-version`, `test:harness`, `"bin": {"abelink": "bin/abelink.ts"}`.
- `evaluation/**` → `.ts` per-cluster (measurement plane PR46: `evidence`, `metrics`, `pr46-*`, adapter, terminal-bench, run, smoke, perf/bench gates).
- Integrasi wajib dicek: `.github/workflows/*` (invoke scripts), systemd unit `ExecStart`, `scripts/dev.sh`, `scripts/install-cron-daemon.sh`, smoke `bun run` tiap entry yang berubah.
- CI smoke: jalankan `bun bin/abelink.ts --help` (atau padanannya) sebagai proof entry hidup.

### W7 — Tests .ts penuh (K9)

- 174 file test → `.ts` per-cluster (cli-tui, harness, dexie/db, provider, benchmark, subagent, dst). Rename + minimal typing; SEMANTIK TEST TIDAK BOLEH BERUBAH (prinsip parity-first: ekspektasi test = kontrak).
- Test live `*.live.test.*` tetap terpisah (`test:live`), tidak masuk gate default.
- `tests/harness/*.mjs` (stress harness, dijalankan `node` → `bun`) ikut konversi.
- Baseline jumlah test diverifikasi: pass count ≥ baseline W0 (16 skip tetap skip).

### W8 — Config root + Extension (K6, K5)

- `vite.config.js` → `vite.config.ts`; `vitest.config.mjs`/`vitest.live.config.mjs` → `.ts` (native); `eslint.config.mjs` → `eslint.config.ts` (ESLint 9 + `jiti` bila dibutuhkan; verifikasi `bun run lint` tetap exit 0).
- Extension: source `extension/src/**.ts` (background, content, popup) + pipeline bundel MV3 (`esbuild` devDep, script `build:extension`, output ke folder yang dimuat Chrome; `manifest.json` tetap JSON, versi tetap disinkronkan `sync-version`/`ext-version.mjs`). Kontrak `taggerFn`/`data-abelink-id` (max 80 elemen) dianotasi — perilaku tagging tidak berubah. Update README/AGENTS untuk alur load-extension dev.
- Pengecualian vendor di extension dicatat eksplisit (§4.1) bila ada.

### W9 — Eskalasi any-policy + final gates + dokumentasi

- ESLint: aktifkan blok `no-explicit-any: 'error'` zona kontrak (§5); nol-kan pelanggaran (atau `@ts-expect-error` berkomentar, pola M2a).
- Final sweep: `grep` zona migrasi = 0 file JS (§4.1); hapus/sesuaikan hard gate W0#3 menjadi "repo bersih" mode; semua tsconfig masuk `bun run typecheck` tunggal.
- `docs/ARCHITECTURE.md` + `AGENTS.md` diperbarui: konvensi `.ts`, toolchain map, hapus klaim basi (mis. "schema v22"), tabel konstanta yang menyebut `.js`.
- Session log penutup + bukti DoD lengkap (§4).

## 7. Urutan & Dependencies Antar-Wave

```
W0 (governance/gates) ──► W1 (engine) ──► W2 (src/api boundary) ──► W3 (hooks) ──► W4 (UI)
                                                            │
                                                            ├──► W5 (sidecar/main)  [butuh W1]
                                                            ├──► W6 (scripts/eval/bin) [butuh W1+W5 utk engine path]
                                                            └──► W7 (tests) [setelah zona kontrak stabil]
                                                                      │
                                                                      ▼
                                                                      W8 (configs+extension) ──► W9 (final)
```

W5/W6/W7 boleh berjalan segera setelah dependensinya hijau; TIDAK boleh paralel dalam satu working tree (K11/K12: sekuensial, merge dulu baru lanjut).

## 8. Protokol Eksekusi Otonom (K4, K11, K12)

### 8.1 Pre-flight (sebelum SETIAP wave)

1. `git status --porcelain` HARUS kosong; bila ada perubahan uncommitted → ABORT + laporkan (jangan stash milik orang lain).
2. `git branch --list 'refactor/*'` + `git fetch origin && git log HEAD..origin/main --oneline`: bila ada branch `refactor/*` lain aktif ATAU main maju signifikan → rebase dulu; bila ada tanda sesi paralel baru-baru ini (reflog < 30 menit) → ABORT + laporkan. (Pelajaran insiden 2026-09-28.)
3. `bun run typecheck && bun run typecheck:node && bun run lint && bunx vitest run` hijau di baseline SEBELUM menyentuh apa pun; catat jumlah pass.

### 8.2 Loop per slice

1. `git checkout main && git pull --ff-only` → branch baru `refactor/ts-w<N>-<slug>`.
2. Konversi slice (rename `git mv` + annotate + update importer; JANGAN edit logika).
3. Gates: typecheck + typecheck:node + lint + vitest + smoke spesifik slice (entry Bun, PTY TUI, dexie round-trip, dsb.).
4. Commit (pesan jelas, satu topik), push, buka PR; bila semua gate CI hijau dan tidak ada konflik → merge sesuai kebijakan otonomi; hapus branch lokal setelah merge (aturan repo).
5. Session log wave diperbarui (keputusan, file, bukti, batasan).

### 8.3 Trigger berhenti (halt conditions)

- Test merah tak terjelaskan > 1 jam kerja slice → rollback PR, catat di register risiko, lanjut slice lain yang tidak bergantung.
- Error tsc baru > 200 di satu subtree → kecilkan `include`, pecah slice.
- Konflik merge berulang di file sama → hentikan wave, eskalasi ke owner dengan laporan 5W1H.

## 9. Risk Register

| Risiko | L | I | Mitigasi | Trigger berhenti | Rollback |
| --- | --- | --- | --- | --- | --- |
| Rename massal → regresi halus | S | T | Parity-first, jaring 1788 test, 1 slice 1 PR | test merah misterius | revert PR |
| `strict` membanjiri di src/ | T | S | include per-cluster, W2 dulu bukan W4 | >200 error | kecilkan include |
| Dexie typing merusak upgrade v28–v30 | R | T | rename+tipe saja, round-trip test | test DB merah | revert PR |
| Bun vs tsc resolusi beda | S | M | `moduleResolution: bundler`, smoke entry | entry gagal jalan | perbaiki import di PR sama |
| Entry `node`→`bun` merusak CI/workflow | M | T | grep semua workflow + smoke tiap entry | CI merah | kembalikan script sementara |
| Extension bundel merusak MV3/CSP | M | T | esbuild + verifikasi load unpacked + CSP match | extension gagal load | tinggal di JS sementara, catat |
| Konflik sesi paralel | S | T | pre-flight abort + namespace branch | reflog < 30 mnt | abort bersih |
| Hybrid selamanya (mogok di tengah) | S | R | wave eksplisit + hard gate no-new-JS | >1 wave tanpa progres | selesaikan wave |

## 10. Pertanyaan Terbuka Lama — Status

| # | Pertanyaan | Status |
| --- | --- | --- |
| D2 | Level strict | Terjawab: `strict: true` untuk semua `.ts` (sudah berjalan di base) |
| D3 | `.mjs` → `.mts` atau tetap | **DIBATALKAN oleh K1**: semua jadi `.ts`, tidak ada `.mts` |
| D5/D6/D7 | Cron delivery / trajectory writer / MCP | Di luar scope spec ini (domain P2); tidak diubah oleh migrasi |
| B-11 | planning.js freeze | Tetap: hanya rename+annotate di W2, refactor logika tetap dilarang |
| B-14 | Dexie v22→v29 | Update: baseline kini **v30**; pengetikan mengikuti v30 |

## 11. Kontrak Beku Selama Migrasi (dilarang diubah oleh PR migrasi)

- Protokol frame sidecar JSON-over-stdio; `cli.json`/`shared.json`/`jobs.json`; skema sesi `v:1`.
- Wire format `node_invoke` + daftar `APPROVAL_ACTIONS` (isi boleh bertipe, tidak boleh berubah perilaku).
- Skema Dexie v28→v30 upgrade path.
- Browser bridge: token auth, port 49712/49713, kontrak long-poll, `data-abelink-id` tagging.
- Harness log: root XDG sama GUI/headless, envelope skema v1.
- Konvensi test live `*.live.test.*` terpisah dari gate default.

## 12. Bukti yang Wajib Ada di Session Log Tiap Wave

1. Output gates: typecheck (2 config), lint, vitest (jumlah pass/skip), smoke spesifik slice.
2. Delta file: jumlah `.js/.jsx/.mjs` per zona sebelum → sesudah.
3. Daftar importer lintas-zona yang diupdate.
4. Keputusan lokal (mis. gap tipe pihak ketiga + cara dilokalisasi).
5. Konfirmasi tidak ada perubahan logika (diff review: rename+anotasi saja).

---

## 13. Lampiran W1 — Daftar PR Konkret (sidecar/engine)

Inventaris terverifikasi (wc -l, 2026-09-28):

| File | Baris |
| --- | --- |
| `sidecar/engine.mjs` | 81 |
| `sidecar/engine/registry.mjs` | 26 |
| `sidecar/engine/pdf-parse-shim.mjs` | 36 |
| `sidecar/engine/channels/os.mjs` | 39 |
| `sidecar/engine/channels/telegram.mjs` | 68 |
| `sidecar/engine/channels/services.mjs` | 78 |
| `sidecar/engine/channels/music.mjs` | 84 |
| `sidecar/engine/channels/ai.mjs` | 112 |
| `sidecar/engine/channels/media.mjs` | 115 |
| `sidecar/engine/channels/capabilities.mjs` | 124 |
| `sidecar/engine/channels/browser.mjs` | 222 |
| `sidecar/engine/channels/skills.mjs` | 595 |

Total 1.580 baris. Konvensi specifier zona bun-run (sidecar, cli, bin): impor relatif antar-file TS memakai **ekstensi eksplisit `.ts`** (`from './registry.ts'`) — melanjutkan konvensi eksisting eksplisit `.mjs` di cli/core; diizinkan oleh `allowImportingTsExtensions`. Zona renderer (`src/`) tetap **extensionless** (`from './db'`) sesuai gaya eksisting.

### PR W1-1 — Engine core bertipe (registry + entry + shim)

**File dikonversi (3):** `registry.mjs`→`registry.ts`, `engine.mjs`→`engine.ts`, `pdf-parse-shim.mjs`→`pdf-parse-shim.ts`.

**Tipe baru:**
- `registry.ts`: tipe `FrameRequest {id, action, payload}`, `FrameResponse {id, success, data?, error?}`, `FrameEvent {event, payload}`; generik `on(action, fn)`; `handlers: Record<string, Handler>`; `lazy<T>(loader)`.
- Keputusan struktur (usulan, konfirmasi di PR): pindahkan kontrak frame ke `sidecar/engine/protocol.ts` sebagai single source; `cli/core/protocol.ts` jadi re-export shim agar semua importer CLI lama stabil. Alternatif (tolak): engine mengimpor dari `cli/core` — arah dependensi terbalik.
- `engine.ts`: tipe minimal di main loop; `MAX_FRAME_LENGTH` tetap 32MB; urutan import channel tetap (sinkronisasi config ai→telegram tidak boleh berubah).

**Importer yang wajib diupdate di PR yang sama:**
1. `sidecar/engine.mjs` → entry; semua `import './engine/channels/*.mjs'` → `.ts'` **per syarat: channel yang belum dikonversi tetap `.mjs'`** — PR ini hanya menyentuh core, jadi engine.ts mengimpor channel `.mjs` lama sampai W1-2..W1-5 selesai; sebaliknya channel yang sudah `.ts` mengimpor `'../registry.ts'`.
2. Spawn/konstanta path engine (string, bukan import): `cli/core/paths.mjs` (`SIDECAR_ENTRY`), `bin/abelink.mjs` (`SIDECAR_ENTRY` lokal), `evaluation/abelink-adapter.mjs` (`SIDECAR`), `scripts/e2e-browser-live.mjs` (spawn `bun`), `package.json` (`"harness": "bun sidecar/engine.mjs"` → `engine.ts`; `build:sidecar` input `sidecar/engine.mjs` → `engine.ts`).
3. `src-tauri/tauri.conf.json` TIDAK berubah (resource = `dist-sidecar/abelink-engine`, artefak build; nama output tetap).
4. Test yang mereferensi `sidecar/engine` path: `tests/browser-e2e.test.mjs`, `browser-snapshot.test.mjs`, `capability-registry.test.mjs`, `dataHome.test.mjs`, `pdfParseShim.test.mjs`, `skill-descriptor.test.mjs`, `skillFolder.test.mjs` (7 file) — update specifier/path yang hardcode `.mjs`.

**Gate khusus:** smoke `bun sidecar/engine.ts` (frame `engine:ready` terkirim), `bun run harness` (script package.json), `bunx vitest run` (termasuk 7 test spawn), `bun evaluation/smoke.mjs` (adapter RPC end-to-end), `tsc` + `typecheck:node` (registry.ts masuk zona).

### PR W1-2 — Channels ringan (os, telegram, services, music)

**File (4, 269 baris):** `channels/{os,telegram,services,music}.mjs` → `.ts`.
- `os.mjs`: alias colon → `NATIVE_TOOLS` dash; tipe payload min; **JANGAN sentuh** semantik emergency-stop.
- `telegram.mjs`: kontrak `setTelegramHeadlessRunner` (M0/D4) dianotasi; flag `ABELINK_TELEGRAM_HEADLESS` perilaku tetap.
- Semua: `import { on } from '../registry.ts'`.

**Importer terdampak:** tidak ada lintas-zona (channel didaftarkan via side-effect import di engine.ts — sudah `.ts` di W1-1, cukup ganti 4 baris import di engine.ts).

**Gate:** smoke `bun sidecar/engine.ts` + `engine:ready` payload memuat 9 action-namespace sama; vitest.

### PR W1-3 — Channels AI (ai, media, capabilities)

**File (3, 351 baris):** `channels/{ai,media,capabilities}.mjs` → `.ts`.
- `media.mjs` **impor lintas-zona**: `canonicalizeEndpointUrl` dari `../../../src/api/ai/providerRegistry.js` — **BIARKAN specifier `.js`** (file sumber belum dikonversi; allowJs membuat tsc membacanya tanpa check); specifier diupdate lagi di PR W2-4 saat providerRegistry jadi `.ts`.
- `ai.mjs`: sinkronisasi config ke telegram (coupling terdokumentasi) dianotasi; 3-tier format fallback tidak disentuh.

**Importer terdampak:** engine.ts (3 baris import).

**Gate:** smoke engine; vitest (termasuk `providerOffline`/`providerRegistry` suite yang menyentuh jalur ini).

### PR W1-4 — Channel browser

**File (1, 222 baris):** `channels/browser.mjs` → `.ts`.
- Kontrak extension bridge (long-poll, token auth, `browser:*` fail-fast + hint install) dianotasi; **JANGAN ubah** protokol token/port; fail-fast semantics tetap (anti-fabrikasi).
- Interaksi dengan `sidecar/main/tools/browserTools.mjs` (masih `.js` sampai W5):specifier antar-file tetap `.mjs`/`.js` sampai masing-masing dikonversi.

**Importer terdampak:** engine.ts (1 baris); cleanup handler `engine:exit` tetap.

**Gate:** smoke engine + vitest `browser-snapshot` + `browser-e2e` (hermetik; live tetap `test:live`).

### PR W1-5 — Channel skills

**File (1, 595 baris — channel terbesar):** `channels/skills.mjs` → `.ts`.
- Aksi approval-gated (`skills:save/delete/save-file/create-item/delete-item/rename-item/install`) dianotasi eksplisit — daftar ini kontrak beku (§11); interaksi `sidecar/main/skills/skill-manager.js` (masih `.js` sampai W5) via specifier lama.
- Gate fs XDG skills dir tidak berubah.

**Importer terdampak:** engine.ts (1 baris).

**Gate:** smoke engine + vitest `skill-descriptor` + `skillFolder` + `learnedSkills*`.

**DoD W1 keseluruhan:** `grep -c "\.mjs" sidecar/engine*` = 0 (kecuali komentar); `sidecar/engine` seluruhnya `.ts` masuk gate blok; kontrak frame beku terverifikasi (test kontrak frame tidak berubah ekspektasi); `verify.sh` hijau.

---

## 14. Lampiran W2 — Daftar PR Konkret (src/api boundary)

Inventaris terverifikasi: `src/api` root = 29 file `.js` (termasuk 2 worker) + 6 sub-direktori (`ai/` 41 file, `tools/` 4, `subagent/` 3, `skills/` 1, `trading/` 2, `engine/` 1) ≈ **80 file**. Empat file boundary inti: `tauri-bridge.js` 709 baris, `db.js` 1.228, `agentRunner.js` 639, `headlessCli.js` 402.

Konvensi specifier zona `src/`: **extensionless** (`from './db'`) — sudah eksisting.

### PR W2-0 — tsconfig.renderer.json (tooling, tanpa rename)

- Buat `tsconfig.renderer.json`: `include: ["src/**/*.ts", "src/**/*.tsx"]`, `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `types: []` (TANPA node — guardrail boundary). Masuk script `typecheck` payung.
- B-20 terpenuhi karena W2-1 mengirim `.ts` pertama ke `src/**` — urutan: PR ini merge SEBELUM/sama hari dengan W2-1 (config tanpa input = TS18003 bila didahulukan sendirian; aman bila W2-1 menyertakan file ts pertama ATAU PR ini menyertakan 1 file `.ts` trivial). Keputusan praktis: **gabungkan ke PR W2-1** agar tidak ada config kosong di main.

### PR W2-1 — tauri-bridge.ts + deklarasi Window.api (W2-0 digabung di sini)

**File (1, 709 baris):** `src/api/tauri-bridge.js` → `.ts`.
- Tipe: deklarasi global `Window['api']` (file `src/api/global.d.ts` atau ekspor interface); payload `node_invoke` per action union; clamp 20k tool output dianotasi; facade fs/misc/event tidak berubah perilaku.
- Renderer isolation tetap: file ini satu-satunya pemilik `invoke`.

**Importer terdampak (terverifikasi, hanya 2):** `src/main.jsx`, `src/hooks/agent/plan/toolDispatcher.js` (specifier extensionless — tidak berubah saat rename; tsc melalui allowJs).
- Test: 0 file test mengimpor tauri-bridge (terverifikasi).

**Gate:** `bun run build` (vite) sukses; vitest penuh; tsc renderer zone aktif pertama kali — ukur + catat error, nolkan di PR ini (wajib 0 sebelum merge).

### PR W2-2 — db.ts (Dexie schema v30)

**File (1, 1.228 baris):** `src/api/db.js` → `.ts`.
- Tipe baris per store (memory, sessions, config, chatArchive, documents, relationships, agentTasks, agentTaskSteps, subagents, subagent_messages, learnedSkills, chatTurns, sessionCompacts, provider-related stores); `AppConfig` union.
- **Upgrade path v28→v30 BEKU** — hanya tipe baris, JANGAN sentuh `db.version(...).upgrade(...)`.
- `db.ts` mengimpor `providerRegistry.js` (masih `.js`) — specifier tetap sampai W2-4.

**Importer terdampak:** 22 file di `src/**` (extensionless, tak perlu edit specifier; tsc via allowJs) + **11 test** dengan specifier eksplisit `.js` (`tests/sttGuard.test.mjs`, `learnedSkillsTelemetry.test.mjs`, `memoryWriteDedup.test.mjs` (dynamic import), dst.) — temukan via `grep -rln "api/db" tests` dan update ke `.ts` di PR ini.

**Gate:** vitest cluster DB (fake-indexeddb) hijau tanpa ubah ekspektasi; round-trip Dexie; tsc 0 di zona baru.

### PR W2-3 — headlessCli.ts + agentRunner.ts (kontrak agent)

**File (2, 1.041 baris):** `src/api/ai/{headlessCli,agentRunner}.js` → `.ts`.
- Tipe kontrak: `AgentOptions`, `RunResult {outcome, terminalReason, executedToolsCount}`, `Environment {fetchAI, executeTool, onStep, onThought}`; mapping `result`→`fullResult` tidak berubah (kontrak benchmark).
- ADR-001: GUI loop TIDAK disentuh; `loopParity` test = kontrak.

**Importer lintas-zona (wajib update specifier di PR ini):**
1. `cli/core/engine-session.mjs`: `import { runAgentLoop } from '../../src/api/ai/agentRunner.js'` → `.ts`.
2. `cli/core/session-store.mjs`: dynamic import `'../../src/api/ai/headlessCli.js'` → `.ts` (path relatif sudah benar sejak M2b).
3. `cli/tui/modelEffort.mjs`: `MODEL_ALIASES` dari `'../../src/api/ai/headlessCli.js'` → `.ts`.
4. Tests (11): headlessCli → `cliHeadless`, `cron-scheduler`, `cli-model-effort`, `e2eHeadlessWiring`, `cli-tui`; agentRunner → `agentRunner`, `loopParity`, `verifierRecovery`, `longHorizonBudget`, `adaptiveStagnation`, `cliHeadless`.

**Gate:** PTY TUI smoke v1+v2; `bun evaluation/abelink-adapter.mjs` exit 0 (adapter RPC pakai runAgentLoop via engine-session); vitest penuh.

### PR W2-4 — Inti runtime AI (core + provider + arch)

**File (7):** `src/api/ai/{core,providerRegistry,providerDetect,circuitBreaker,fetchError,archPolicy,benchArch}.js` → `.ts`.
- `providerRegistry` = simpul lintas-zona TERPADAT: setelah jadi `.ts`, 3 specifier sidecar wajib update di PR ini: `sidecar/engine/channels/media.ts` (`canonicalizeEndpointUrl`), `sidecar/main/legacy-provider-shim.mjs` (4 import), `sidecar/main/ai-bridge.js` (`resolveChatEndpoint, suggestProtocol, presetEndpoint, normalizeLegacyProviderConfig`). Juga importer internal: `src/api/db.ts` (dari W2-2), `src/api/sttRouter.js`.
- `ARCH_VALUES` (`vanilla`/`basic`), fail-fast `--arch avo` dianotasi; jangan sentuh semantik.

**Gate:** vitest `providerRegistry`/`providerOffline`/`trading.*` (endpoint resolvers); smoke `bun sidecar/engine.ts` (channel ai via ai-bridge tetap jalan — specifier lintas sudah `.ts`).

### PR W2-5 — Perencanaan & governance (B-11: rename+annotate MINIMAL)

**File (11):** `src/api/ai/{planning,persona,strategyLib,trajectorySupervisor,progressEvaluator,agentDecision,objectiveVerifier,budgetNotice,planStepBudget,effortEstimator,effortSystem}.js` → `.ts`.
- `planning.js` (907 baris, B-11 freeze): **rename + annotate saja**; prompt string & urutan assembly TIDAK BOLEH berubah (diff review baris-per-baris pada string literal).
- Kontrak governance: `MAX_VERIFY_REPLANS=2`, `MAX_DRIFT=0.05`, ladder strategyLib — jadi tipe literal union, bukan refactor.

**Importer:** mayoritas dari `src/hooks/` (masih `.js` — extensionless aman); tests: `loopParity`, `verifierRecovery`, dst. update specifier.

**Gate:** vitest penuh; klaim parity `loopParity.test.mjs` hijau tanpa edit ekspektasi.

### PR W2-6 — Memory & compaction cluster

**File (9):** `src/api/ai/{memoryGroomer,memoryRouter,memoryTool,contextCompactor,sessionCompactor,trajectoryLearning,selfHealingEngine,skillSynthesizer,skillMiniEval}.js` → `.ts` + `src/api/selfModel.js` → `.ts`.
- Delineasi compactor (jendela kerja) vs archiver (memori jangka panjang) dianotasi di tipe; budget 525K / pointer `lastCompactedMessageId` tidak berubah.

**Gate:** vitest memory/groomer/compactor suites.

### PR W2-7 — Vector + RAG cluster (termasuk 2 worker)

**File (9):** `src/api/{vectorMemory,vectorCore,vectorLoader,oramaStore,ragPipeline,turnPairMigrator}.js` → `.ts` + `src/api/embedding.worker.js` → `embedding.worker.ts` + `src/api/{localWhisper,whisperWorker}.js` → `{localWhisper,whisperWorker}.ts`.
- **Worker URL**: `vectorMemory.ts` baris ~78 `new Worker(new URL('./embedding.worker.js', import.meta.url))` → `'./embedding.worker.ts'`; `localWhisper.ts` baris ~19 pola sama. Vite meng-compile worker TS (dev+build) — verifikasi `bun run build`.
- Threshold terkunci (konstanta §AGENTS): extended default 0.5 / turn pairs 0.3, Orama 0.25, chunk 500/50 — jadi konstanta ter-tipe, nilai tetap.

**Importer:** `src/api/db.ts` (hydrate), hooks memory; tests vector/rag update specifier.

**Gate:** `bun run build` (chunk vendor-db tidak berubah); vitest vector/orama suites; smoke worker (vitest env sudah ada fake-indexeddb).

### PR W2-8 — Sisa src/api root + sub-direktori (penutup wave)

**File (sisa ~20):** root: `harnessCore.js`, `harness.js`, `semverLite.js`, `locale.js`, `sttRouter.js`, `sttGuard.js`, `choiceBus.js`, `appIdentity.js`, `groq.js`, `scraping.js`, `workspaceRag.js`, `taskStore.js`, `taskExecutor.js`, `trajectory.js`, `skillsCache.js`, `mic.js`; sub-dir: `tools/{index,core-tools,group-tools,toolCatalog}.js`, `subagent/{subagentStore,subagentExecutor,subagentPrompt}.js`, `skills/skillFolder.js`, `trading/{budgetMonitor,wallet}.js`, `engine/taskRuntime.js`.
- Pecah jadi 2-3 PR bila diff > ribuan baris: (a) harness+semver+misc, (b) tools+subagent+skills+trading+engine.
- **Cross-zone:** `scripts/semver-lite.mjs` (impor + re-export dari `../src/api/semverLite.js`) → specifier `.ts`; `cli/core/provider-runtime.mjs` (impor `fetchAI` dari `src/api/ai/core.js`) → sudah `.ts` sejak W2-4, cek specifier; `src/api/harnessCore` diimpor `cli/core/harness-writer.mjs` → specifier `.ts`.
- Kontrak beku: APPROVAL_ACTIONS tidak berubah; delimiter double-pipe NATIVE_TOOLS tidak berubah (itu W5).

**Gate:** vitest penuh + `bun scripts/semver-lite.mjs --help` smoke + verify.sh.

**DoD W2 keseluruhan:** `src/api` nol `.js` (kecuali komentar); `tsconfig.renderer.json` blok di CI; 4 file boundary bertipe penuh (tiered: penuh di sini); Dexie round-trip hijau; jumlah test ≥ baseline; session log memuat delta per PR (§12).

---

## 15. Keputusan Eng Review (2026-09-28, plan-eng-review)

| # | Temuan | Keputusan |
| --- | --- | --- |
| D1 | Skala ~360 file / 20+ PR di atas ambang kompleksitas | Lanjut as-is — mitigasi lewat struktur (1 PR 1 slice, gate per PR, halt conditions §8.3) |
| D2 | `release.yml` tidak punya pipeline extension (grep extension/zip/esbuild = kosong) | W8 WAJIB menambah job: esbuild extension + zip + upload ke GitHub Release di samping binary Tauri |
| D3 | `verify.sh` hanya smoke jalur COLD (binary compile, baris 24-25); entry hot (`bun engine.ts`) tak ter-smoke | verify.sh men-smoke KEDUA jalur — ditambah di W0 (engine.mjs), path diupdate W1-1 (engine.ts) |
| koreksi | Asumsi spec §13-W1-1: kontrak frame duplikat di `cli/core/protocol.ts` | TIDAK duplikat — `cli/core/protocol.ts` = kontrak client-engine (session/commands/events), registry = wire frame stdio. Tidak ada perpindahan protocol.ts; W1-1 mengetikkan registry di tempat |

Horizon pasca-P1 (owner, 2026-09-28): **Agents -> Loops -> Graphs -> Self Improving Systems** — program susulan setelah P1 tuntas, spec terpisah.

---

## 16. Status Eksekusi (update berjalan)

Updated: 2026-09-30, mode otonom. **Arahan owner 2026-09-30 (masuk PLAN, bukan wave migrasi):** (1) MCP harus bisa lepas-pasang, transport stdio + Streamable HTTP — jadikan TODO/PLAN; (2) fix extension sampai connect tanpa delay connection — PLAN setelah migrasi; (3) prioritas arsitektur = infrastruktur agentic + self-improvement system (bukan tuning model cloud); (4) referensi mutlak bila tanpa wawancara: amati-tiru-modifikasi Anthropic, OpenAI, hermes-agent, NVIDIA, Moonshot Research, Google Research, Muse Research, DeepSeek quantization.

### W0 — Governance (DONE, PR #87)
`scripts/ci/no-new-js.sh` (hard gate CI) + tsc masuk verify.sh + marker handoff lama dihapus + siklus kerja agent & ponytail penuh terdokumentasi di AGENT_CONTRIBUTION_GUIDELINES.

### W1 — sidecar/engine (DONE, 5 PR: #88..#92)
engine + registry + 9 channel (1.580 baris) 100% TS. Smoke dual-path (hot + cold binary) hijau; wire frame utuh (86 aksi).

### W2 — boundary src/api (8 dari 10 PR selesai)

| PR | Isi | Status |
| --- | --- | --- |
| #93 W2-1 | tauri-bridge.ts + tsconfig.renderer.json (B-20) | MERGED |
| #94 W2-2 | db.ts (Dexie v30 frozen) | MERGED |
| #96 W2-3 | headlessCli + agentRunner (kontrak agent) | MERGED |
| #97 W2-4 | core/providerRegistry/archPolicy/benchArch/circuitBreaker/providerDetect/fetchError | MERGED |
| #99 W2-5 | planning.ts (912 brs, prompt dikunci B-11) | MERGED |
| #100 W2-6 | contextCompactor/memoryGroomer/sessionCompactor | MERGED |
| #101 W2-7a | vectorCore/vectorLoader/vectorMemory + 2 worker (URL refs diupdate, vite build ok) | MERGED |
| #102 W2-7b | oramaStore/ragPipeline/turnPairMigrator | MERGED |
| #103 W2-8a | 13 file root api (locale/choiceBus/localWhisper/workspaceRag/harness/harnessCore/semverLite/selfModel/mic/scraping/sttGuard/skillsCache/appIdentity) | MERGED |
| #105 W2-8b | groq/sttRouter/taskExecutor/taskStore/trajectory — root src/api kini 0 .js | MERGED |
| W2-8c | 28 file sisa `src/api/ai/*` (~5.882 brs) | MERGED (#109) |
| W3 | hooks+utils+contexts 100% TS | MERGED (#110) |
| W4 | components+pages 100% TS | MERGED (#114) |
| W5 | sidecar core 38 file: infra leaf (11) + capabilities/google (18) + browser/tools/telegram/plugins/pc-agent/ai-bridge (20, 892 err tsc ditutup) | MERGED (#115, squash 651774dc) |
| W6 | scripts/evaluation/bin → .ts + entry node→bun | MERGED (#116, squash b5b57c03) |
| W7 | tests → .ts (174 file; 173 rename + 1 pre-existing) + sub-gate `typecheck:tests` | MERGED (#117, squash ddbb8d65) |
| W8 | configs root + extension → .ts, service worker ESM (Chrome >= 91) | MERGED (#118, squash 698aef2d) |
| W9 | ratchet any-policy (baseline 2369, per zona) + sinkronisasi AGENTS.md/ARCHITECTURE.md + laporan 5W1H | DONE |

## 4. DoD program (2026-10-02, TERPENUHI)

1. Grep zona migrasi = **nol** file `.js`/`.jsx`/`.mjs`/`.cjs`. ✅
2. `tsconfig.base` + payung + node + renderer + extension + tests, semua exit 0. ✅
3. `scripts/verify.sh` hijau termasuk step tsc (5 program) + any-ratchet. ✅
4. Vitest: **nol** file test `.js`/`.mjs`; jumlah test **1836 pass / 16 skip**,
   tidak pernah turun dari baseline sejak W5. ✅
5. `bun run lint` exit 0. ✅
6. Tidak ada file .ts yang dijalankan `node`. ✅
7. `AGENTS.md` + `docs/ARCHITECTURE.md` diperbarui: setiap path yang disebut
   diverifikasi ada di `git ls-files`. ✅

Pengecualian yang dicatat (§4.1): artefak build `extension/**/*.js` (gitignored,
hasil transpile) dan vendor di `sidecar/node_modules/`.

**Any-policy: kenapa tidak `error`.** Spec awal mengira targetnya `error`. Setelah
dihitung ada 2369 pelanggaran di zona kontrak produksi; mengaktifkannya jadi error
berarti gate selalu merah, dan gate yang selalu merah sama saja dengan gate yang
tidak ada. Dipakai bentuk yang sudah ada di repo ini
(`no-new-js.sh` W0): ratchet baseline per zona. Boleh turun, tidak boleh bertambah.

### Baseline pengukuran (anti-klaim-kosong, permintaan owner)
- Test: 1788 → 1810 → **1836 pass / 16 skip** dan tetap persis 1836/16 sampai W7 (nol regresi di setiap PR; rename + cast W7 tidak boleh mengubah satu pun ekspektasi — K9).
- Files: sisa .js produktif pasca-W7 hanya configs root + `extension/` (W8).
- Gate per PR: **5x** tsc exit 0 (payung + node + renderer + tests sejak W7 + extension sejak W8) + lint 0 error (warning no-explicit-any zona kontrak = recorded W9) + vitest + vite build + evaluation smoke + engine:ready = 1 (86 aksi).
- Lint warning: 599 (W5) → 2342 (W7) → 2478 (W8). Kenaikan ini artefak cakupan, bukan regresi: `.mjs`/`.js` tidak pernah masuk scope `typescript-eslint`, begitu di-`.ts` ikut di-lint. Tetap recorded debt untuk W9.
- Files: pasca-W8 tidak ada lagi file JS sumber di zona migrasi. Sisa yang tersisa adalah artefak build `extension/*.js` (hasil transpile, gitignored) dan satu file vendor `sidecar/node_modules/`.

### Koreksi W8: jangan pakai dokumen ini sebagai standar

Rencana W8 di §W8 (`extension/src/**.ts` + bundel esbuild + folder output
`dist-extension/`) adalah hasil karangan sendiri, BUKAN standar Abelink. Owner
menegur hal ini dengan tepat saat wave itu berjalan. Yang menggantikan:

1. `docs/REFERENCE-LIBRARY.md` — peta referensi yang sebenarnya ditetapkan owner
   (entri #15 `ChromeDevTools/chrome-devtools-mcp`).
2. Dokumentasi resmi Chrome untuk extension service worker.

Temuan yang membatalkan desain bundel: extension service worker boleh **modul
ES** (`"background": {"type": "module"}`, Chrome >= 91). Aturan lama "background.js
wajib klasik tanpa import" di `verify.sh` adalah batasan warisan kita sendiri.
Karena ESM diizinkan, bundel tidak perlu — cukup transpile `.ts` → `.js` dengan
struktur modul dipertahankan, dan target "Load unpacked" tetap `extension/`.

**Pelajaran governance:** dokumen hasil kerja agen (spec ini) adalah catatan
rencana, bukan rujukan berwenang. Keputusan yang menyentuh alur kerja owner
harus ditelusuri ke dokumen yang owner tetapkan atau ke primary source upstream.

### Catatan arsitektur ATM (bukan wave migrasi — masuk antrean setelah W9)

**Client-server split, bukan CLI-as-engine.** Referensi mutlak owner (hermes-agent, opencode) memakai pemisahan: satu proses engine terpisah yang bisa `serve` (STDIO atau socket), lalu client tipis di atasnya — TUI, GUI, gateway, SDK. Abelink saat ini masih memosisikan CLI/entry sebagai proses engine itu sendiri; switch runtime node ke bun di W6 hanya menyangkut runtime binary, bukan pemisahan proses.

Implikasi kalau nanti dikerjakan (harus jadi PLAN terpisah, tidak dicampur ke migrasi TS):
- Sidecar engine sudah paling dekat ke peran "server" (dispatcher stdio + 86 aksi pada wire frame). Yang belum ada adalah mode `serve` yang bisa diaklamai lewat alamat, ditambah client tipis di atasnya.
- Kontrak beku yang harus dihormati: wire frame engine, delimiter double-pipe `NATIVE_TOOLS`, serta `APPROVAL_ACTIONS` di `cmd_node_bridge.rs`. Dialog approval native ada di sisi Rust, jadi memindahkan client ke proses lain tidak boleh menghilangkan kemampuan approval.
- Bukti verifikasi harus tetap sama: pakai harness lokal (`harness_append`) supaya perbandingan GUI vs headless memakai bukti yang sama.

Arahan owner lain (MCP stdio + Streamable HTTP, fix extension connect tanpa delay) tetap TODO/PLAN pascamigrasi.

### Pola teknis yang stabil (utk W2-8c + W3)
1. Augmentasi Window.api tak terlihat di program node-zone → cast lokal `{ api?: ... }`.
2. CFA reset try/catch → anotasi eksplisit di deklarasi `let`.
3. JSDoc sempit modul tetangga → cast `Parameters<typeof fn>[n]` di call-site.
4. Rename file ber-marker ponytail → PONYTAIL.md wajib ikut (P-01/03/05 sudah).
5. Template string schema Orama → cast boundary `Parameters<typeof search>[0..1]`.
6. Verifikasi lokal wajib echo exit code eksplisit per program tsc (pelajaran CI #103).
