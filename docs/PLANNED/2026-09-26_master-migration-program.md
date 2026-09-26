# Program Refactor Abelink — Rencana Induk (Fokus: JS->TS + CLI Engine Hermes)

Tanggal: 2026-09-26
Status: PLAN LENGKAP (belum ada eksekusi kode; dokumen ini yang mengikat)
Prinsip pengikat: **parity-first** — bahasa/struktur boleh berubah, PERILAKU
runtime tidak. Setiap langkah reversible dan terukur.

## 0. Prioritas (ditetapkan owner)

| Prioritas | Program | Beban utama |
| --- | --- | --- |
| **UTAMA** | **P1 — Migrasi JS -> TS** | toolchain, boundary, renderer |
| **UTAMA** | **P2 — CLI engine adopsi arsitektur Hermes** | satu inti, session store, tool gateway, gateway/cron |
| Pendukung | P3 — Paritas TUI (hanya yang dibutuhkan P1/P2) | dialog/palette yang menyentuh `cli/tui` |
| Diabaikan | `opencode/` clone | **referensi TUI saja**, bukan bagian repo: tak di-lint, tak di-typecheck, tak di-build, tak di-test |

Detail per program (tidak diulang di sini kecuali ringkas):
- P1: `docs/PLANNED/2026-09-26_js-to-ts-migration.md`
- P2: `docs/PLANNED/2026-09-26_hermes-cli-engine-adoption.md` (H1..H12)
- P3: `docs/PLANNED/2026-09-26_tui-parity-and-pluggable-migration.md`

---

## 1. Prinsip (locked)

1. **Parity-first.** Satu PR = satu jenis perubahan: (a) rename + annotate, atau
   (b) logika. Jangan dicampur.
2. **Strangler.** Pindahkan di balik adapter; hapus yang lama setelah pengganti
   terbukti, bukan sebelumnya.
3. **Jaring paritas.** 1688 test yang ada = kontrak. Rename tidak boleh mengubah
   ekspektasi test; kalau test harus berubah, itu perubahan perilaku → PR terpisah.
4. **Observability dulu.** Trajectory headless (P2/T1) adalah alat bukti "fungsi
   sama". Tanpanya, klaim parity tidak terverifikasi.
5. **Boundary tetap.** Tanpa fallback model; `delegate_coding` terkunci
   opencode/hermes; renderer tak menyentuh Node API; tanpa emoji/Sparkles.
6. **opencode/ = referensi.** Diabaikan dari git, eslint, tsconfig, vitest, build.

---

## 2. Interlock P1 <-> P2 (kenapa urutannya begini)

```
        M0 Clearing (blocker) ─────────────┐
                                          ▼
   P1/A0  toolchain TS  ────────────►  (syarat) ──►  P2 tiping seam CLI   (H5, trajectory)
        │                                                 │
        ▼                                                 ▼
   P1/A1  cli/**, bin/*.tsx bertipe              P2/H1 satu inti + golden output
        │                                                 │
        ▼                                                 ▼
   P1/A2  boundary (registry, tauri-bridge,       P2/H2,H3,H4,H7,H8 di atas
          db, headlessCli, agentRunner) bertipe     base bertipe
        │                                                 │
        ▼                                                 ▼
   P1/A3  renderer bertipe                        P2/H9,H10,H11,H6 selesai + H12 spike
```

Aturan: P2 yang menyentuh file yang AKAN di-`ts`-kan dikerjakan SETELAH file itu
bertipe (hindari dua kali kerja). P2 yang tidak menyentuh TS (mis. H9 wire
gateway, H10 script cron) boleh di M0.

---

## 3. Blocker Register — "abort semua yang menghalangi"

Keputusan: **ABORT** (hentikan/hapus/kecualikan) · **FREEZE** (bekukan) ·
**MITIGATE** (netralkan). Kolom Track menunjukkan siapa yang menunggu.

| ID | Penghambat | Bukti | Keputusan | Track | Aksi (Wave) | Verifikasi |
| --- | --- | --- | --- | --- | --- | --- |
| B-1 | Tak ada `tsconfig.json`; `typescript` tak dideklarasikan | `find tsconfig*.json` kosong; 5.9.3 hanya transitif | MITIGATE | P1 | M1 | `bunx tsc --noEmit` jalan |
| B-2 | ESLint hanya `**/*.{js,jsx}` → `.ts/.tsx` nol lint | `eslint.config.mjs` | MITIGATE | P1 | M0 | blok `typescript-eslint` untuk `**/*.{ts,tsx}` |
| B-3 | `opencode/` clone berada di repo; ESLint tak baca `.gitignore`; ada `node_modules` di dalamnya | 417 `.js/.jsx` (tanpa node_modules); `eslint.config.mjs` tak menyebut opencode | **ABORT (kecualikan total)** | semua | M0 | `**/opencode` ada di `ignores` eslint + `exclude` tsconfig; `vitest include` hanya `tests/**` (sudah aman) |
| B-4 | `vitest.config.mjs` `include: ['tests/**/*.{test,spec}.{js,mjs}']` → test yang di-rename ke `.ts` **DIAM-DIAM DILEWATI** | `vitest.config.mjs` | MITIGATE **sebelum rename apa pun** | P1 | M0 | test probe `.ts` benar-benar dijalankan |
| B-5 | GUI punya ReAct loop sendiri (`useAbelinkPlan.js` ~baris 670) vs `runAgentLoop` (CLI/TUI) | `grep -rln runAgentLoop src/hooks` = kosong | FREEZE + keputusan (D1) | P2 | M3 | `grep ... src/hooks` ada hasil ATAU ADR + test paritas kontrak |
| B-6 | `telegram/gateway.mjs` kode-ada tapi unwired (+16 test) | tak ada importer | ABORT (wire atau hapus) | P2 | M0 | importer ada & e2e lulus ATAU file+test dihapus |
| B-7 | `bin/abelink-cron.mjs` tanpa script/systemd | `package.json` tanpa script cron | MITIGATE | P2 | M0 | `cron:daemon` + unit + `abelink cron list` |
| B-8 | Test live 9Router flaky (5–27s; pernah abort) | run hari ini | ABORT dari gate default | P1 | M0 | konvensi `*.live.test.mjs` + `test:live` terpisah |
| B-9 | `bin/abelink-tui.mjs` dipakai sebagai library oleh `cli/tui` → siklus, sulit di-`ts` | impor `../bin/` di `cli/tui/engine.mjs` | FREEZE + ekstraksi | P1+P2 | M2 | tak ada impor `../bin/` dari `cli/tui` |
| B-10 | Path absolut `/home/abelion/...` di `codingAgentBridge.js` | konstanta `binaries` | ABORT | P2 | M0 | deteksi via PATH tanpa path user |
| B-11 | `planning.js` 907 baris + prompt ~25k token = risiko tinggi | ukuran/CP | FREEZE | P1+P2 | sampai M4 | PR yang menyentuh `planning.js` sebelum M4 ditolak |
| B-12 | Rencana tersebar (roadmap 09-22 + 3 dokumen) | docs | ABORT (konsolidasi) | semua | M0 | roadmap lama sudah bertanda SUPERSEDED; indeks = dokumen ini |
| B-13 | Surface JS terus membesar (153 `.js` + 74 `.jsx` + 224 `.mjs`) | repo | ABORT (freeze penambahan JS di zona migrasi) | P1 | M2 | file baru di `cli/`, `sidecar/engine`, `src/api/ai` = `.ts` |
| B-14 | Dexie schema v22→v29 (11 migrasi) + `fake-indexeddb/auto` | `src/api/db.js` | MITIGATE | P1 | M4 | test Dexie hijau + `tsc` hijau untuk `db.ts` |
| B-15 | Registry channel dinamis tanpa tipe; typing bisa ubah runtime | `sidecar/engine/registry.mjs` | MITIGATE | P1 | M4 | test kontrak frame tak berubah |
| B-16 | `.tsx` ada tanpa lint/typecheck | gap terdokumentasi | MITIGATE | P1 | M2 (setelah B-1/B-2) | `tsc` block untuk `cli/**`+`bin/**/*.tsx` |
| B-17 | Policy branch/PR: refactor besar wajib lewat branch+PR | AGENTS.md | MITIGATE | semua | semua wave | branch-guard CI hijau |
| B-18 | `.mjs` runtime vs `.ts`: resolusi Bun vs tsc berbeda | 224 `.mjs` | MITIGATE | P1 | M1 | `moduleResolution: bundler` + smoke `bun run` entry `bin/` |

---

## 4. Strategi paritas fungsi dasar

1. **Sebelum** menyentuh file X: jalankan testnya, catat hijau. **Sesudah**:
   hijau tanpa mengubah ekspektasi.
2. **Characterization test lebih dulu** untuk file tanpa test yang akan di-`ts`-kan:
   `sidecar/engine/registry.mjs` (kontrak frame), `cli/tui/App.tsx` +
   `PromptRow.tsx` (render smoke), `bin/abelink-tui.mjs` (parser/store sudah ada).
3. **Golden output** jalur kritis (mulai valid setelah H1/B-5): prompt identik di
   CLI vs TUI vs GUI → bandingkan `{outcome, terminalReason, executedToolsCount}`.
4. **Feature flag** untuk perubahan berisiko: `ABELINK_ONE_CORE=1`,
   `ABELINK_TRAJECTORY_HEADLESS=1`. Default = perilaku lama sampai flag lulus.
5. **Kontrak beku selama migrasi**: protokol frame sidecar, `cli.json`,
   `shared.json`, `jobs.json`, skema sesi `v:1`. Perubahan = version bump + migrasi.
6. **Dual-write opsional** (migrasi session store H3): tulis JSON + SQLite
   berdampingan selama 1 wave, baca dari JSON, lalu tukar.

---

## 5. Risk Register

| Risiko | L | I | Mitigasi | Trigger berhenti | Rollback |
| --- | --- | --- | --- | --- | --- |
| Rename massal → regresi halus | S | T | Strangler + jaring test + 1 PR 1 jenis | test merah tak terjelaskan < 1 jam | revert PR |
| `strict` membanjiri error | T | S | `allowJs` + `checkJs:false`, include per-subtree | >200 error di subtree pertama | kecilkan `include` |
| Typing Dexie merusak migrasi skema | R | T | PR terisolasi + backup | test DB merah | revert PR |
| H1 satu inti mengubah perilaku GUI | S | T | flag + golden output + A/B | golden mismatch >0 dari 10 prompt | matikan flag |
| Trajectory headless membengkakkan disk | S | R | rotasi (tiru 50MB×3 Rust) | >100MB/hari | matikan flag |
| Live test kembali flaky menahan rilis | T | S | B-8 pisah `.live` | gate default merah karena 9Router | `test:live` manual |
| Migrasi berhenti di tengah (hybrid selamanya) | S | R | zona jelas + 1 PR 1 slice | >1 wave tanpa selesai | selesaikan wave dulu |

---

## 6. Wave (M0..M6) — urutan eksekusi tunggal

### M0 — Clearing (tanpa ubah perilaku) · blocker: B-2,B-3,B-4,B-6,B-7,B-8,B-10,B-12
1. `eslint.config.mjs`: + `**/opencode` ke `ignores`; + blok `typescript-eslint`
   untuk `**/*.{ts,tsx}`.
2. `vitest.config.mjs`: `include` → `tests/**/*.{test,spec}.{js,mjs,ts,tsx}`.
3. `gateway.mjs`: **wire ke telegram service ATAU hapus** (+test) — pilih satu (D4).
4. `cron`: script `cron:daemon` + unit systemd user + doc singkat.
5. `codingAgentBridge.js`: resolusi PATH (absolut = fallback terakhir).
6. Konvensi `*.live.test.mjs` + script `test:live`; exclude dari gate default.
7. `tsconfig.base.json` + sub-tsconfig kosong + `typescript` devDep. (P1/A0 awal)
DoD: lint 0 error; vitest hijau **dan** test `.ts` probe benar-benar jalan.

### M1 — Toolchain TS (P1/A0) · blocker: B-1,B-18
- devDeps: `typescript`, `typescript-eslint`, `@types/{react,react-dom,node}`.
- `tsconfig.base.json` (`strict`, `noEmit`, `allowJs`, `checkJs:false`,
  `moduleResolution: bundler`, `jsx: react-jsx`, `resolveJsonModule`) +
  `tsconfig.renderer.json`, `tsconfig.node.json` (references).
- CI: `tsc --noEmit` **soft-fail**.
DoD: `tsc` jalan exit 0 pada baseline; tidak ada rename.

### M2 — CLI/TUI bertipe (P1/A1) + seam P2 · blocker: B-9,B-13,B-16
- Ekstrak `cli/core/{parser,session-store,sidecar-client}.mjs` dari
  `bin/abelink-tui.mjs`; `bin/abelink-tui.mjs` jadi shim.
- `theme.ts` + `App.tsx` + `PromptRow.tsx` + `abelink-tui-v2.tsx` bertipe.
- P2 di sini: H5 (tool hooks) + trajectory headless (T1) di `cli/core`.
DoD: `tsc` **blok** untuk `cli/**` + `bin/**/*.tsx`; test TUI hijau.

### M3 — Satu inti + bukti (P2/H1) · blocker: B-5, keputusan D1
- Pilih: GUI pindah ke `runAgentLoop` **atau** ADR divergensi + test paritas
  kontrak (`objectiveVerifier` + `trajectorySupervisor` + `planStepBudget`).
- Golden output CLI vs TUI vs GUI (10 prompt) sebagai bukti.
DoD: keputusan tertulis + golden test ada.

### M4 — Boundary bertipe (P1/A2) · blocker: B-11,B-14,B-15
- `sidecar/engine/registry.mjs` (+ channels) bertipe (kontrak frame tetap).
- `src/api/tauri-bridge.js`, `src/api/db.js`, `src/api/ai/headlessCli.js`,
  `src/api/ai/agentRunner.js` bertipe.
- `planning.js` baru boleh disentuh DI SINI (dan seminimal mungkin).
DoD: `tsc` **blok** untuk `sidecar/engine` + `src/api`; Dexie round-trip hijau.

### M5 — Fitur Hermes di atas base bertipe (P2) · H2,H3,H4,H6,H7,H8,H9,H10,H11
- H3 dual-write JSON→SQLite/FTS (lihat §4.6); H4 compactor headless;
  H7 memory tool headless; H8 channel `coding:delegate`; H2 key per endpoint;
  H6 skill learning headless; H9/H10 wire; H11 paritas permission mode TUI.
DoD: tiap H punya test + acceptance sesuai dokumen P2.

### M6 — Renderer + MCP (P1/A3 + P2/H12)
- `src/hooks/**`, `src/components/**`, `src/pages/**` bertipe per halaman.
- H12 spike MCP (stdio JSON-RPC → namespace `mcp:<server>:<tool>`).
DoD: `tsc` **blok menyeluruh**.

---

## 7. Gate CI per wave

| Gate | M0 | M1 | M2 | M4 | M6 |
| --- | --- | --- | --- | --- | --- |
| `lint` (js+ts) | wajib | wajib | wajib | wajib | wajib |
| `vitest` (non-live) | wajib | wajib | wajib | wajib | wajib |
| `tsc --noEmit` | — | soft | **blok `cli/**`** | **blok `sidecar/engine`+`src/api`** | **blok semua** |
| `test:live` | manual | manual | manual | manual | manual |
| `verify.sh` | wajib | wajib | wajib | wajib | wajib |

---

## 8. Keputusan yang masih TERBUKA

| # | Pertanyaan | Default bila tak dijawab | Dampak bila salah |
| --- | --- | --- | --- |
| D1 | GUI pindah ke `runAgentLoop`, atau ADR divergensi? | ADR + test paritas (risiko lebih kecil) | salah pilih = migrasi dua kali |
| D2 | Level `strict` untuk file `.ts` baru | `strict: true` untuk `.ts`; `.js` belum dicek | terlalu ketat = lambat mulai |
| D3 | `.mjs` runtime → `.mts` atau tetap? | tetap `.mjs` | rename tanpa nilai |
| D4 | `gateway.mjs` wire atau hapus? | wire (test sudah ada) | kode zombie menetap |
| D5 | Cron delivery: `log` dulu atau Telegram langsung? | `log` dulu | risiko spam platform |
| D6 | Trajectory headless: writer sendiri atau via Rust? | fs sendiri, root sama | duplikasi/inkonsistensi |
| D7 | MCP (H12) sekarang atau tunda? | tunda ke M6 | eksperimen mengganggu P1/P2 |

---

## 9. Rollback

- Satu wave = satu branch (`refactor/m0-clearing`, `refactor/m1-ts-toolchain`, ...)
  → PR ke `main`. Revert satu PR = keadaan prima.
- Tidak mencampur rename + logika dalam satu PR.
- Skema/DB: forward-only + backup file sebelum jalan.
- Bila trigger berhenti aktif: matikan flag, tahan wave, catat di session log,
  lanjutkan hanya setelah blocker dicatat di §3.

## 10. Index
- P1: `docs/PLANNED/2026-09-26_js-to-ts-migration.md`
- P2: `docs/PLANNED/2026-09-26_hermes-cli-engine-adoption.md`
- P3 (pendukung): `docs/PLANNED/2026-09-26_tui-parity-and-pluggable-migration.md`
- Riwayat: `docs/PLANNED/2026-09-22_cli-engine-roadmap.md` (SUPERSEDED)
