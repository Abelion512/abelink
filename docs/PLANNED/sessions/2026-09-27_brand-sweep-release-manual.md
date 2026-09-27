# Session Log: Sweep Istilah Era Warisan + Manual Release Prepare (2026-09-27)

## Tujuan
Aturan owner: istilah produk/brand era warisan tidak boleh disebut sama sekali di seluruh pohon repo. Sekalian: perbaikan sistem rilis yang membuat PR alpha baru pada setiap push ke main (rilis yang merilis rilis).

## Diagnosis Sistem Rilis (pertanyaan owner)
- `release-prepare.yml` sebelumnya `on: push (main, linux)` TANPA filter -> setiap merge (docs pun) memicu `release-helper prepare` -> bump versi + PR alpha baru (kasus nyata: #44 -> #67 -> #69 -> #71 beruntun dalam satu hari).
- `bumpRank` memperlakukan commit non-konvensional sebagai patch dan `feat` sebagai minor; PR release hasil bot ("chore(release)") sendiri memicu siklus berikutnya.
- Fix: trigger prepare menjadi `workflow_dispatch` saja (manual oleh owner). `release-finalize.yml` sudah ter-gate ke Release PR (aman, tidak diubah). Alur baru: owner jalankan prepare saat mau rilis -> PR release -> merge -> finalize otomatis.

## Kebijakan Sweep
- DIHAPUS dinetralkan: docs (README, AGENTS, REFERENCES, 5w1h, CHANGELOG, data rilis historis `releases.json`), session log hari ini, artefak `graphify-out/` (stale, berisi nama lama) dihapus utuh.
- KODE: `scripts/dev.sh` glob fosil desktop digeneralisasi (`*mark*.desktop` — entri resmi `abelink*.desktop` tidak kena); `src-tauri/cmd_fs.rs` fungsi deteksi profil era Electron dihapus + registrasi di `lib.rs` dan facade bridge dicabut (tanpa pemakai UI).
- Stub `sidecar/node_modules/electron/index.js` (sengaja ter-commit, dikeluarkan dari gitignore): `getName` -> 'Abelink'.
- DIPERTAHANKAN (guard, bukan penyebut): `findSuspiciousName` (planning.js) + placeholder persona + tests/auditName — detektor runtime yang mencegah nama era lama bocor ke konteks AI dari data memori tua; tidak pernah menghasilkan nama.
- DIPERTAHANKAN sementara: 2 PNG (`assets/banner-repo.png`, `src/assets/music-cover.png`) — istilah tertanam di piksel raster, tidak bisa diedit teks; perlu regenerasi owner via `bun run brand:icons` dengan aset sumber bersih.

## Verifikasi
- `git grep -ilE '<pola era warisan>'` tersisa: hanya 2 guard runtime + 2 PNG (dikecualikan sengaja).
- Gate: lint 0 error/43 warnings; `cargo check` + `clippy -D warnings` bersih; vitest penuh 1772/1788 (159+2 skip; satu flake beban di run pertama, run ulang hijau penuh).

## Batasan Dikenal
- Commit messages historis di remote sudah bersih (FASE 2), tapi `refs/pull/*` arsip GitHub tetap menyimpan teks lama (keterbatasan platform).
- PNG banner/cover menunggu regenerasi aset dari owner.
