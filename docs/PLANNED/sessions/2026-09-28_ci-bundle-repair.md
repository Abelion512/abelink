# Session Log: Perbaikan CI Bundle main (2026-09-28)

## Tujuan
Menindaklanjuti status "continue": dua run Tauri CI terakhir di main berstatus failure pada job Bundle AppImage/deb — job yang hanya jalan di push main/tags sehingga selama ini blind spot PR.

## Akar Masalah (tiga lapis)
1. **Smoke sidecar dari cwd root (PR #81):** binary hasil `bun build --compile` masih membaca `bunfig.toml` dari cwd. Dari root, preload TUI `@opentui/solid/preload` dicari dan gagal (`error: preload not found`), padahal binary sehat. Repro lokal A/B: dari root gagal, dari `dist-sidecar/` `engine:ready`. Semua push main merah sejak snapshot TUI v2 (`de09d7a`, 26-09) karena job Bundle selalu berhenti di sini.
2. **Noise EPIPE (PR #83):** `grep -q` menutup pipe setelah match pertama sehingga binary mengembalikan EPIPE (tidak menggagalkan step karena pipeline tanpa pipefail, tapi kotor dan rapuh). Diganti `grep engine:ready > /dev/null` (baca sampai EOF).
3. **Version mismatch tauri (PR #83):** setelah smoke lolos, step berikutnya (`bun tauri build`) baru tercapai dan gagal: `tauri v2.11.5` (Cargo.lock) vs `@tauri-apps/api v2.12.0` (bun.lock, constraint `^2` mengapung). Fix: `cargo update -p tauri --precise 2.12.0` (ikut wry 0.57, windows 0.62).

## Berkas Berubah
- `.github/workflows/tauri.yml` + `.github/workflows/release.yml`: smoke dijalankan dari `dist-sidecar` (cwd netral, setia layout produksi), tanpa `-q`.
- `scripts/verify.sh`: step baru `[6b/9]` build sidecar + smoke stdio ping — regresi kelas ini kini tertangkap lokal (sebelumnya verify.sh tidak menyentuh smoke sama sekali).
- `src-tauri/Cargo.lock`: tauri 2.11.5 -> 2.12.0.

## Verifikasi
- Repro A/B smoke netral lokal (exit 0, tanpa EPIPE).
- `cargo check` + `cargo clippy --all-targets -- -D warnings` bersih di tauri 2.12.0.
- vitest penuh 1788/1804 hijau (2x), lint 0 error/44 warnings.
- CI PR #81 dan #83 hijau; run push-main `36356838840`: **seluruh 5 job success, termasuk Bundle AppImage/deb — pertama kali sejak 26-09**.

## Batasan Dikenal
- Job Bundle hanya jalan di push main/tags: PR tidak pernah menjalankan smoke+build ini (by design, hemat runner). verify.sh 6b/9 mengurangi blind spot di sisi lokal.
- verify.sh kini lebih lama ~2-3 detik (build sidecar compile) — dapat diterima untuk jaminan paritas CI.
