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
| 2 error ESLint di `main` | `src/pages/AbelinkHome.jsx:302` | Directive `// eslint-disable-next-line react-compiler/react-compiler` menunjuk rule yang TIDAK terdaftar di `eslint.config.mjs`; ESLint melaporkan "Definition for rule ... was not found" sebagai error | Directive usang dihapus | DONE |
| Memoization tidak bisa dipreservasi | `src/pages/AbelinkHome.jsx:303` | `useCallback(handleStopScreenShare, [screenStream, handleModeChange])` tidak memuat state setter stabil yang dipakai body, sehingga React Compiler melewati komponen dan rule `react-hooks/preserve-manual-memoization` error | Setter stabil (`setScreenStream`, `setLiveScreenFrame`) dimasukkan ke dependency array; 0 error dan tanpa warning `exhaustive-deps` | DONE |
| Gerbang lint tidak ada | `scripts/verify.sh`, `.github/workflows/tauri.yml` | `bun run lint` tidak dipanggil gate mana pun, jadi error lint tidak pernah menggagalkan apa pun | Lint jadi langkah `[2/8]` di verify.sh dan langkah "Lint (eslint)" di job `frontend` sebelum vitest | DONE |
| Kontrak sumbu arch bohong | `src/api/ai/benchArch.js`, `evaluation/matrix.mjs` | Komentar menyatakan `avo` = Fase 2 penuh (lineage + scoring), padahal modulnya sudah dihapus; laporan berlabel `avo` sebenarnya berperilaku `basic` | Komentar kontrak ditulis ulang (avo = alias legacy, jangan diiklankan sebagai arsitektur berbeda) + catatan di 2 entri matriks bench | DONE |
| Docs menunjuk file yang sudah dihapus | `AGENTS.md` | Tabel file masih memuat `main/browser-agent.js`, `BrowserPreviewWidget.jsx`, `systemInfo.js`; stack masih menyebut Driver.js; konstanta `MAX_ELEMENTS` masih dipetakan ke file yang sudah tidak ada | Baris tabel diganti ke lokasi nyata (`sidecar/main/browser/`, `extension/background.js` `taggerFn()` `MAX = 80`), modul baru didokumentasikan, ditambah subbagian "Removed Layers" | DONE |
| Docs arsitektur menyebut helper yang sudah dihapus | `docs/ARCHITECTURE.md` | `unsupported()` masih terdaftar di baris `registry.mjs` dan §3, `music.mjs` masih diklaim memuat stub `os:*`, dan §5 masih bilang `os:*` stub | Baris registry + §3 diperbarui, baris channel `os.mjs` ditambahkan, §5 dikoreksi | DONE |
| Rencana PR2 memuat kriteria yang tak terukur | `docs/PLANNED/pr2-long-horizon.md` | Kriteria terima "Skor `avo` >= `basic` >= `vanilla`" mengasumsikan lapisan Fase 2 masih ada | Ditambahkan bagian `## Update 2026-09-12` (append, bukan rewrite) yang menandai lapisan Fase 2 dibuang dan sumbu yang masih bermakna | DONE |

## Files Modified

| File | Perubahan |
| --- | --- |
| `src/pages/AbelinkHome.jsx` | Hapus directive disable usang; dependency `useCallback` diselaraskan |
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
| `src/api/ai/benchArch.js` | `ARCH_VALUES` adalah `['vanilla','basic']`; `avo` dihapus dari sumbu aktif (`--arch avo` exit 2). Laporan lama berisi `avo` tetap terbaca sebagai history. Jangan dokumentasikan `avo` sebagai arsitektur berbeda tanpa mengembalikan lapisan Fase 2. |
| `src/api/ai/strategyLib.js` | Satu entry point `getNextStrategy()`; jangan tambah taksonomi strategi baru tanpa data bench. |
| `src/api/ai/trajectorySupervisor.js` | Hanya field Fase 1 yang dibaca; caller `score`/`stagnation`/`bestKey` sengaja di-`void`. Jangan pernah throw (fault harus degrade ke CONTINUE). |
| `scripts/verify.sh` | Urutan langkah 8 tahap dan `set -e`; langkah baru harus ditambahkan, bukan menggantikan langkah lama. |
| `extension/background.js` `taggerFn()` | Wajib self-contained (di-serialisasi ke konteks halaman); jangan menutup variabel service worker. Batas 80 elemen / 80 karakter teks. |

## Verification Checklist

- [x] `bunx vitest run` → 54 file, 569 test, semua pass
- [x] `bun run lint` → 0 error, 850 warning (setelah artefak build di-ignore; sebelumnya 972)
- [x] `bunx vite build` → sukses
- [x] `cargo check` (src-tauri) → bersih
- [x] `cargo clippy --all-targets -- -D warnings` → bersih
- [x] `cargo test` (src-tauri) → 21 tes pass
- [x] `bun evaluation/smoke.mjs` → LOLOS (termasuk assert baru: `avo` fallback ke `basic`)
- [x] `--arch avo` ditolak exit 2 dengan daftar nilai valid
- [x] Tidak ada emoji dan tidak ada em dash di output/dokumen baru
- [ ] `bash scripts/verify.sh` penuh (butuh perangkat user: bootstrap dev + perf gate)

## Update 2026-09-12 (lanjutan: clippy gate, artefak build, hapus avo)

Tiga tindak lanjut dikerjakan di sesi yang sama setelah review PR.

| Finding | File | Root Cause | Fix | Status |
| --- | --- | --- | --- | --- |
| ESLint melintasi artefak build | `eslint.config.mjs` | ESLint tidak membaca `.gitignore`; `src-tauri/target/` (salinan sidecar + extension hasil `tauri build`) ikut ter-lint dan menyumbang 121 dari 972 warning, jadi baseline tech-debt bias dan lint lambat | `ignores` ditambah `**/target`, `**/dist-sidecar`, `**/coverage`, `**/graphify-out`; 972 -> 850 warning | DONE |
| Directive disable tanpa efek | `src/api/ai/core.js:221` | Escape sequence `\u0000-\u001F` tidak memicu `no-control-regex`, jadi directive-nya dilaporkan sebagai "Unused eslint-disable directive" | Directive dihapus + komentar penjelas | DONE |
| 9 warning clippy | `cmd_fs.rs`, `cmd_node_bridge.rs`, `commands/tools/{shell,git,tasks}.rs`, `commands/telegram/bot.rs` | Utang lama: `and_then(\|x\| Some(y))`, `int_plus_one`, `if let Err(e) = ... return Err(e)` alih-alih `?`, `splitn().nth(1)`, doc comment dipisah baris kosong, dan 2 `spawn()` tanpa `wait()` (zombie) | Semua diperbaiki; `cargo clippy --all-targets -- -D warnings` bersih | DONE |
| Nilai arch `avo` menyesatkan | `src/api/ai/benchArch.js`, `evaluation/{smoke,run,matrix,abelink-adapter}.mjs`, `src/hooks/agent/useAbelinkPlan.js` | `avo` diterima sebagai pengali legacy, tetapi `--arch avo` lalu berjalan sebagai `basic` tanpa peringatan: laporan bisa salah label | `ARCH_VALUES` jadi `['vanilla','basic']`; `--arch avo` gagal-cepat exit 2 (validasi sudah ada di `run.mjs`), resolver tetap jatuh ke `basic` agar laporan lama terbaca | DONE |
| Gate clippy tidak ada | `scripts/verify.sh`, `.github/workflows/tauri.yml` | Sama seperti lint: tidak ada gerbang yang memanggil clippy, jadi 9 warning menumpuk | Langkah `[8/9]` di verify.sh + langkah clippy di job `rust` CI | DONE |

Catatan urutan tes: `let _ = child.wait()` di `commands/tools/tasks.rs` ditempatkan
**setelah** assert `wait_gone()`. Kalau `wait()` ditaruh di depan, zombie langsung
di-reap oleh test sendiri dan assertnya lolos tanpa membuktikan apa pun.

Perubahan `cmd_fs.rs` (range baris) memakai `skip(start - 1)` + `take(...)`,
ekuivalen dengan filter index lama tetapi bebas `clippy::int_plus_one`. Ini area
terkontrak, jadi `cargo test` (21 tes) dijalankan ulang dan hijau.

## Callback

Apakah `cmd_fs.rs` perlu tes unit khusus untuk kombinasi `start_line`/`end_line`
(termasuk `start > end` dan `start` melewati akhir file), mengingat logikanya baru
saja ditulis ulang dari filter index ke `skip`/`take`?
