# Catatan Keamanan (Vulnerability Triage)

Dokumen ini merekam keputusan triage atas temuan `bun audit` agar keputusan
"terima risiko" bersifat eksplisit dan ter-review — bukan diabaikan diam-diam.

## Diterima (risk-accepted) — `minimatch@3.0.8` via `yt-search`

- **Advisory:** GHSA-3ppc-4f35-3m26, GHSA-7r86-cg39-jmmj, GHSA-23c5-xmqv-rm74
  (kelas ReDoS; patched di >= 3.1.3).
- **Rantai:** `yt-search@2.13.1` -> `node-fzf@0.14.0` -> `redstar@0.0.2`
  (pin `minimatch@~3.0.4` yang ketat) -> `minimatch@3.0.8`.
- **Status:** 21 -> 4 temuan setelah override `dompurify`, `tar`, dan
  `adm-zip`. Override `overrides["redstar"]` TIDAK ditembuskan Bun karena pin
  `~3.0.4` di manifest redstar lebih ketat dari override; `resolutions`
  path-key (`redstar/minimatch`) juga diabaikan `bun install`. Override
  nested-object (`@eslint/eslintrc`/`glob`/`eslint-plugin-react`) juga diabaikan
  — `minimatch@3.1.5` yang terpasang di jalur itu berasal dari requirement
  `^3.1.5` paketnya sendiri, bukan efek override.
- **Justifikasi risiko:** ReDoS di sini butuh *pattern* glob jahat; redstar
  hanya memakai minimatch untuk fuzzy-match query pencarian YouTube yang
  dibentuk aplikasi sendiri (bukan input penyerang). Tidak ada jalur data
  eksternal -> pattern glob. Dampak realistis: rendah.
- **Upgrade path:** hapus/ganti `node-fzf` dari `yt-search` di upstream, atau
  migrasi pencarian YouTube ke `youtube-transcript-plus`/API lain. Re-evaluasi
  tiap kali `bun audit` menandai advisory ReDoS baru untuk minimatch < 3.1.3.
- **Terakhir dicek:** 2026-09-20. Versi npm `yt-search` terbaru masih tetap
  `2.13.1` (belum ada rilis upstream yang menghapus dependensi `node-fzf`/`redstar`).

## Diperbaiki

| Paket       | Dari        | Ke         | Kelas                          |
| ----------- | ----------- | ---------- | ------------------------------ |
| dompurify   | <= 3.4.11   | ^3.4.12    | XSS (hook pollution, dst.)     |
| tar         | < 7.5.7     | ^7.5.7     | path traversal, DoS (critical) |
| adm-zip     | < 0.6.0     | ^0.6.0     | 4GB alloc DoS                  |
| sharp       | 0.34.5      | ^0.35.4    | libvips CVEs (via `@huggingface/transformers@^4.3.0`) |

Catatan: `tar` di-override flat dan tetap kompatibel karena hanya dipakai
build-time oleh node-pre-gyp (6 -> 7), bukan runtime aplikasi. `sharp`
telah teratasi bersih via rilis resmi `@huggingface/transformers@4.3.0`
yang mem-pin `sharp@^0.35.4` secara natif tanpa perlu override.

## Proses

1. `bun audit` sebelum push; wajib hijau (0 critical) untuk rilis.
2. Temuan yang tidak bisa diperbaiki via override -> catat di sini dengan
   justifikasi + upgrade path, jangan di-silence tanpa jejak.
3. Dependabot mingguan (`.github/dependabot.yml`) memantau cargo/npm/actions.
