# Session Log: 2026-09-12 - Lint husus gate + sinkronisasi docs pasca simplifikasi

## Ringkasan

**Keywords:** lint gate, eslint error, stale disable directive, react-hooks preserve-manual-memoization, verify gate, CI lint step, documentation drift, sinkronisasi dokumentasi, avo alias legacy, browser-agent dihapus, arsitektur 4 rung, docs sync, architecture docs.

**Tanggal:** 2026-09-12 | **Branch:** `chore/fix-codebase-and-docs` (base `main`) | **Repo:** abelink

Sesi ini menutup celah yang membuat 2 error ESLint bisa hidup di `main` tanpa
terdeteksi: `bun run lint` memang ada, tetapi tidak dipanggil oleh
`scripts/verify.sh` maupun CI, jadi tidak ada gerbang yang gagal. Setelah lint
hijau (0 error, 972 warning tech-debt), gate lint dimasukkan ke verify.sh dan ke
job `frontend` di `tauri.yml` supaya kelas bug ini tidak bisa lolos lagi.

Sisa sesi menyinkronkan dokumentasi dengan kenyataan kode hasil simplifikasi
besar yang belum ter-commit: `trajLineage.js`/`scoring.js` dihapus (sumbu `avo`
kini alias legacy dari `basic`), `browser-agent.js` dihapus (tagger 80 elemen
pindah ke `extension/background.js`), `rtk`/`driver.js`/`open` dibuang, dan
`registry.mjs` kehilangan helper `unsupported()`.

**Audit Trail (Anti-Duplication Gate):** grep `lint|eslint|verify.sh` di
`docs/PLANNED/` + `docs/` dan `git log -i --grep="lint|eslint"` → hanya
`e717753` (fix config ESLint yang crash karena impor paket tak terpasang, scope
berbeda) dan tidak ada session log soal gerbang lint. Grep
`documentation drift|graph bloat|avo` di history → 0 hits untuk sinkronisasi docs
ini. Patch baru, bukan duplikat.

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
| --- | --- | --- | --- | --- |
| 2 error ESLint di `main` | `src/pages/MarkHome.jsx:302` | Directive `// eslint-disable-next-line react-compiler/react-compiler` menunjuk rule yang TIDAK terdaftar di `eslint.config.mjs`; ESLint melaporkan "Definition for rule ... was not found" sebagai error | Directive usang dihapus | DONE |
| Memoization tidak bisa dipreservasi | `src/pages/MarkHome.jsx:303` | `useCallback(handleStopScreenShare, [screenStream, handleModeChange])` tidak memuat state setter stabil yang dipakai body, sehingga React Compiler melewati komponen dan rule `react-hooks/preserve-manual-memoization` error | Setter stabil (`setScreenStream`, `setLiveScreenFrame`) dimasukkan ke dependency array; 0 error dan tanpa warning `exhaustive-deps` | DONE |
| Gerbang lint tidak ada | `scripts/verify.sh`, `.github/workflows/tauri.yml` | `bun run lint` tidak dipanggil gate mana pun, jadi error lint tidak pernah menggagalkan apa pun | Lint jadi langkah `[2/8]` di verify.sh dan langkah "Lint (eslint)" di job `frontend` sebelum vitest | DONE |
| Kontrak sumbu arch bohong | `src/api/ai/benchArch.js`, `evaluation/matrix.mjs` | Komentar menyatakan `avo` = Fase 2 penuh (lineage + scoring), padahal modulnya sudah dihapus; laporan berlabel `avo` sebenarnya berperilaku `basic` | Komentar kontrak ditulis ulang (avo = alias legacy, jangan diiklankan sebagai arsitektur berbeda) + catatan di 2 entri matriks bench | DONE |
| Docs menunjuk file yang sudah dihapus | `AGENTS.md` | Tabel file masih memuat `main/browser-agent.js`, `BrowserPreviewWidget.jsx`, `systemInfo.js`; stack masih menyebut Driver.js; konstanta `MAX_ELEMENTS` masih dipetakan ke file yang sudah tidak ada | Baris tabel diganti ke lokasi nyata (`sidecar/main/browser/`, `extension/background.js` `taggerFn()` `MAX = 80`), modul baru didokumentasikan, ditambah subbagian "Removed Layers" | DONE |
| Docs arsitektur menyebut helper yang sudah dihapus | `docs/ARCHITECTURE.md` | `unsupported()` masih terdaftar di baris `registry.mjs` dan §3, `music.mjs` masih diklaim memuat stub `os:*`, dan §5 masih bilang `os:*` stub | Baris registry + §3 diperbarui, baris channel `os.mjs` ditambahkan, §5 dikoreksi | DONE |
| Rencana PR2 memuat kriteria yang tak terukur | `docs/PLANNED/pr2-long-horizon.md` | Kriteria terima "Skor `avo` >= `basic` >= `vanilla`" mengasumsikan lapisan Fase 2 masih ada | Ditambahkan bagian `## Update 2026-09-12` (append, bukan rewrite) yang menandai lapisan Fase 2 dibuang dan sumbu yang masih bermakna | DONE |

## Files Modified

| File | Perubahan |
| --- | --- |
| `src/pages/MarkHome.jsx` | Hapus directive disable usang; dependency `useCallback` diselaraskan |
| `scripts/verify.sh` | Lint jadi langkah `[2/8]` (renumber 0..7 dari 8) |
| `.github/workflows/tauri.yml` | Langkah "Lint (eslint)" di job `frontend` |
| `src/api/ai/benchArch.js` | Komentar kontrak sumbu arch ditulis ulang (avo = alias legacy) |
| `evaluation/matrix.mjs` | Catatan `avo` di entri `terminal-bench-4.0` dan `abelink-fase2-corp` |
| `AGENTS.md` | Baris tabel `src/`, `sidecar/`, `src-tauri/`, konstanta DOM, gate build, subbagian "Removed Layers" |
| `docs/ARCHITECTURE.md` | Baris `registry.mjs`, baris channel `music.mjs` + `os.mjs` baru, §3 item 5, §5 |
| `docs/PLANNED/pr2-long-horizon.md` | Bagian `## Update 2026-09-12` |
| `docs/PLANNED/sessions/2026-09-12_lint-gate-doc-sync.md` | File log ini |

## Agent Learnings

- Pipeline hijau bukan bukti lint bersih: `vitest` + `vite build` + `cargo check`
  LOLOS sementara `bun run lint` merah, karena tidak ada gate yang memanggilnya.
  Sebelum menyatakan "tidak ada yang salah", jalankan SEMUA script gate repo,
  bukan hanya yang dirujuk AGENTS.md.
- ESLint melaporkan directive `eslint-disable` untuk rule yang tidak terdaftar
  sebagai **error**, bukan warning, dan tidak bisa di-silence oleh setting
  severity. Directive usang harus dihapus, bukan diturunkan levelnya.
- `react-hooks/preserve-manual-memoization` (eslint-plugin-react-hooks v7)
  menuntut dependency array `useCallback` memuat semua nilai yang di-infer
  compiler, termasuk setter `useState` yang stabil. Memasukkannya aman: tidak
  memicu `exhaustive-deps`, dan tidak mengubah identitas callback.
- React Compiler TIDAK aktif di build (`vite.config.js` hanya `@vitejs/plugin-react`),
  jadi rule compiler-based murni lint-time. Tetap diperlakukan sebagai error
  supaya drift dependency tidak menumpuk.
- Modul yang dihapus hanya terdeteksi lewat grep manual: `no-undef` tidak aktif
  di `eslint.config.mjs`, sehingga `import` yang dibuang tapi masih dipakai akan
  lolos lint dan build (baru meledak saat runtime). Setelah refactor hapus modul,
  grep tiap identifier yang ikut hilang.
- Klaim arsitektur di komentar kode ikut jadi "kontrak": saat `trajLineage.js`
  dibuang, komentar `benchArch.js` yang masih menjanjikan Fase 2 mengubah laporan
  bench menjadi menyesatkan tanpa satu pun tes merah.

## File Invariants

| File | Invariant |
| --- | --- |
| `src/api/ai/benchArch.js` | `ARCH_VALUES` tetap `['vanilla','basic','avo']` (laporan lama harus tetap terbaca). `avo` = alias `basic`; jangan dokumentasikan sebagai arsitektur berbeda tanpa mengembalikan lapisan Fase 2. |
| `src/api/ai/strategyLib.js` | Satu entry point `getNextStrategy()`; jangan tambah taksonomi strategi baru tanpa data bench. |
| `src/api/ai/trajectorySupervisor.js` | Hanya field Fase 1 yang dibaca; caller `score`/`stagnation`/`bestKey` sengaja di-`void`. Jangan pernah throw (fault harus degrade ke CONTINUE). |
| `scripts/verify.sh` | Urutan langkah 8 tahap dan `set -e`; langkah baru harus ditambahkan, bukan menggantikan langkah lama. |
| `extension/background.js` `taggerFn()` | Wajib self-contained (di-serialisasi ke konteks halaman); jangan menutup variabel service worker. Batas 80 elemen / 80 karakter teks. |

## Verification Checklist

- [x] `bunx vitest run` → 54 file, 569 test, semua pass
- [x] `bun run lint` → 0 error, 972 warning (tech-debt terdaftar)
- [x] `bunx vite build` → sukses
- [x] `cargo check` (src-tauri) → bersih
- [x] `bun evaluation/smoke.mjs` dijalankan sebagai bagian gate
- [x] Tidak ada emoji dan tidak ada em dash di output/dokumen baru
- [ ] `bash scripts/verify.sh` penuh (butuh perangkat user: bootstrap dev + perf gate)

## Callback

Apakah `avo` sebaiknya tetap diterima sebagai alias legacy (kompatibilitas laporan
`reports/bench-avo-live.json`), atau dihapus total dari `ARCH_VALUES` sekalian
sehingga `--arch avo` gagal cepat?
