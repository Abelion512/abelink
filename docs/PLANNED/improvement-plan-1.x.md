# Improvement Plan 1.x — Sidebar Config, Petunjuk Penggunaan, What's New Otomatis

Status: PLANNED (disusun 2026-08-26, pasca-audit besar & stabilisasi Fase 2)
Prasyarat: tag `v1.0.0-alpha.1` pertama sudah terbit lewat `.github/workflows/release.yml`.

Tiga workstream, urutan eksekusi bebas; tiap task satu PR kecil dengan acceptance masing-masing.

---

## A. Sidebar Konfigurasi (src/components/ConfigSidebar.jsx + src/pages/Configuration.jsx)

Kondisi kini: per-section render dengan id `cfg-*`, `activeSection` state, `scroll-mt-4`,
driver.js tour menunjuk `cfg-audio-voice` (warisan fix 2026-08-23).

| # | Task | Ukuran | Catatan |
|---|------|--------|---------|
| A1 | Scroll-spy seragam: satu IntersectionObserver untuk semua section, highlight + auto-scroll daftar sidebar ke item aktif | M | cek implementasi observer lama di Configuration.jsx |
| A2 | Keyboard nav: panah atas/bawah pindah section, Enter fokus elemen pertama; focus ring konsisten | S | a11y |
| A3 | Filter/pencarian setting: input kecil di atas sidebar, match judul + keyword per section, section non-match disembunyikan | M | data keyword = array baru di tiap section config |
| A4 | Collapse mode layar sempit (< lg): sidebar jadi dropdown/select, tanpa duplikasi logika activeSection | M | |
| A5 | Pengelompokan visual: AI / Memori / Suara / Integrasi / Tampilan + badge status (provider tersambung, telegram aktif) | M | badge baca dari config store yang sama |
| A6 | Tour driver.js disesuaikan setelah restrukturasi (selector + urutan step) | S | |

Acceptance keseluruhan: navigasi hidup di 1280px dan 940px (min-width), tour lolos tanpa selector mati,
eslint 0 error baru, vitest tetap hijau.

## B. Pembetulan Petunjuk Penggunaan

| # | Task | Ukuran | Catatan |
|---|------|--------|---------|
| B1 | Audit Guidebook.jsx vs fitur nyata: hapus/jelaskan fitur yang sedang non-fungsional (browser automation & PC os-* menunggu port Fase B/C) | M | jangan janji hal yang belum jalan |
| B2 | First-run tour driver.js: validasi semua selector terhadap UI aktual; tambah langkah Mission Control (Subagents) | S | |
| B3 | Refresh faqData.js: buang Q&A tentang fitur Electron-era (installer NSIS dsb.) | S | |
| B4 | Pesan tool unsupported ramah user: observasi "belum diporting (Fase B/C)" dari sidecar diterjemahkan jadi bahasa manusia di chat panel | S | satu pemetaan string di useMarkPlan/tools layer |
| B5 | Sinkron README quickstart dengan `bash scripts/verify.sh` + alur tag rilis | S | |

Acceptance: zero referensi Electron/Windows di dokumen user-facing; tour selesai sampai akhir tanpa error console.

## C. Changelog In-App "What's New" Otomatis

Kondisi kini: `App.jsx` import `src/data/whats-new.json` (statis, masih versi 5.0.1),
gate `db.config.lastSeenWhatsNewVersion`, modal `src/components/WhatNew.jsx`;
rilis GitHub dibuat `release.yml` dengan `--generate-notes`.

| # | Task | Ukuran | Catatan |
|---|------|--------|---------|
| C1 | `scripts/gen-whats-new.mjs`: baca tag terakhir + `git log <prev>..<head>` ber-conventional-commits, hasilkan `src/data/whats-new.json` (version dari tauri.conf.json via sync-version source, date hari ini, summary auto-ringkas, changes[]) | M | mapping type: feat->FITUR, fix->PERBAIKAN, perf->OPTIMALISASI, refactor->RAPIHKAN; ganti label legacy ATM/AUTO |
| C2 | Wire ke pipeline: release.yml job publish menjalankan generator SEBELUM `bun tauri build` sehingga JSON ter-bundle; plus npm `prebuild` hook agar dev build ikut segar | S | offline-first, tanpa fetch runtime |
| C3 | WhatNew.jsx multi-rilis: render N entri terakhir (json jadi array per rilis), tombol "changelog lengkap" -> `openExternal(url release)` | M | url = https://github.com/Abelion512/mark-agent-linux/releases |
| C4 | Edge cases: version json != app version pada dev build (badge "unreleased"), pertahankan gate lastSeen | S | |

Acceptance: rilis v1.x kedua terbit TANPA edit manual whats-new.json; unit test parser generator;
modal hanya muncul sekali per versi.

---

Urutan yang disarankan: C1+C2 (otomasi, nilai langsung tiap rilis) -> A1-A5 -> B1-B5 -> A6+B2 (tour digabung sekali pass).
