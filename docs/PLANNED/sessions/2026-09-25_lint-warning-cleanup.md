# Session 2026-09-25 — lint warning cleanup (1032 → 33) + PDF error fix

Mode: build. Requests: (1) fix `Invalid PDF structure` di Knowledge.jsx, (2) `bun run lint` fix all warnings. No commit/push (per request).

## 1. PDF `Invalid PDF structure` — root cause + fix

- Jejak: `Knowledge.jsx:102` → `ragPipeline.js:40` → `tauri-bridge.js:563`
  (`parse-document`, base64) → `sidecar/engine/channels/ai.mjs:89` →
  `pdf-parse-shim.mjs:5` (`extractPdfText`, tanpa catch).
- Bukti repro: `extractPdfText(Buffer('not a pdf'))` melempar
  `InvalidPDFException: "Invalid PDF structure."` mentah dari pdfjs;
  string tsb tidak ada di kode kita (hanya di `node_modules/pdf-parse`,
  `pdfjs-dist` worker). Test sintetik existing lolos → shim benar untuk
  file valid, bocor untuk file rusak.
- Fix di sumber (`sidecar/engine/pdf-parse-shim.mjs`): catch menerjemahkan
  `InvalidPDFException`/pola corrupt/empty → pesan ID ramah
  ("File rusak atau bukan PDF yang valid — unduh ulang/export ulang…"),
  `PasswordException` → pesan hapus-proteksi, buffer kosong → pesan kosong.
  Test baru `tests/pdfParseShim.test.mjs:37` (gagal sebelum, hijau sesudah).
- Verifikasi: vitest shim 2/2, 4 varian corrupt → pesan ramah, eslint bersih.
- Dihindari: `fsTools.mjs:176` duplikat parser tidak disentuh (jalur
  `read-document` terpisah; diperbaiki bila ada keluhan sama).

## 2. Lint: 1032 warnings → 33 (0 errors, gate hijau)

Baseline: `bunx eslint --no-cache --format json` = 1032 warnings / 0 errors,
117 files. Akhir: **33 warnings / 0 errors**, semua satu rule
(`react-hooks/set-state-in-effect`), terdokumentasi sebagai debt di
`eslint.config.mjs`.

### Config intent-level (1032 → 303, lalu → 240)
- `react/prop-types: off` — 419 hits, adopsi nol (tidak ada `.propTypes` di
  `src/`/`extension/`), dep `prop-types` tidak terinstal, idiom React 19.
- `no-unused-vars` ignore `^_` (args/vars/caughtErrors) — 130 `_` catch
  best-effort + puluhan param `_`.
- `react-refresh/only-export-components: off` — 17 hits, dev-only fast-refresh;
  konvensi repo co-locate helper/hook dengan komponen.
- `no-empty: allowEmptyCatch` — 163 `catch {}` best-effort repo-wide.

### Mekanis via script (terverifikasi re-lint)
- 39 `import React` tak terpakai → dihapus (4 file pemakai `React.memo`
  diverifikasi tetap punya import).
- 16 catch binding tak terpakai → optional `catch` (codemod verifikasi body
  tak referensikan binding; skip bila tidak cocok).
- 19 `react/no-unescaped-entities` → `&apos;`/`&ldquo;`/`&rdquo;`;
  18 `no-useless-escape` regex/string (semantics-preserving);
  4 `react/display-name` → named function di `React.memo`;
  2 `react-hooks/immutability` (TDZ riil: `loadHistory`, `loadMainThread`
  dipakai sebelum deklarasi) → `useCallback` + dep.

### Manual per-file (dipandu lint, verifikasi rg sebelum hapus)
- Dead code dihapus setelah verifikasi unreferenced: 4 fungsi
  `extension/background.js`, `lastStopTime`, `callSafe`, `isDownloadingModel`
  block + state yatim, `MAX_PLAN_STEPS`, `handleCapsuleSubmit`+`mood`,
  `layers`/`policy` mati di effortSystem, dsb.
- Import dipersempit, param tak terpakai → `_`, useState pair → hole
  (`[, setX]`), destructure → `_name`.
- `exhaustive-deps` (14 → 0): handler dimemoize (`useCallback`), dep stabil
  (`chatSetConfig`, `setIsBooting`), guard one-shot didokumentasikan;
  `StatusIndicator` dedup dipindah ke `seenIdsRef` (ditulis di efek, legal);
  `CameraPreview` callback tak-stabil via ref sinkron-efek.
- `handleSaveRename` → `handleSaveRenameSession` (call site memanggil nama
  yang tak ada = bug laten, diperbaiki).
- `ChatStudio.jsx`/`ChatStudioModal.jsx`/`AbelinkHome.jsx`/dsb: puluhan
  import ikon + state mati dibersihkan.

### Sisa 33: `react-hooks/set-state-in-effect`, warn-by-design
- Rule ikut menembak pola resmi React sendiri (call site `useEffectEvent`,
  subscription cleanup) — diverifikasi langsung. "Memperbaiki" 27 file efek
  sinkronisasi-eksternal yang bekerja = churn tanpa perubahan perilaku
  (melanggar ponytail + risiko di tree dengan perubahan sesi lain).
- Tercatat di `eslint.config.mjs` sebagai warn-debt eksplisit.

## Verifikasi akhir
- `bun run lint`: 0 errors, 33 warnings (semua rule di atas).
- `bunx vitest run`: 1585/1586 lolos; 1 gagal
  (`tests/syntax-prose.test.mjs > gmail-list … parsePagination`) lolos saat
  dijalankan isolasi → flaky/order-dependent, bukan dari perubahan ini.
  Test area tersentuh (`pdfParseShim`, `effortEstimator`, `toolCatalog`,
  `progressEvaluator`): 34/34 hijau.

## Batasan dikenal
- Tree berisi ±40 file termodifikasi dari sesi lain (branch
  `feat/tui-opentui`); perubahan lint ini menumpang di atasnya, belum commit
  per request. Sebelum PR: pisahkan atau koordinasikan.
- `useAbelinkPlan.js` tidak lagi mendestructure 3 prop (`handleYoutubeSearch`,
  `handleSearchCommand`, `handleYoutubeSummary`) — aman karena pemanggil
  (`useAbelinkAgent` via `...tools`) mengoper prop berlebih yang memang
  diabaikan JS; tidak ada crash. Bila jalur media suatu saat butuh kembali,
  kembalikan destructure-nya.
