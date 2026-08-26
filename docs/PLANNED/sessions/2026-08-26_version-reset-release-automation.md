# Session Log — 2026-08-26: Version Reset Fork + Release Automation

## Ringkasan

**Keywords:** reset versi fork, version reset, skema versi linux, release otomatis, auto release, tag-triggered release, sync-version single source of truth, tauri.conf version, CI guard tag mismatch, gitleaks verify gate, garis versi 1.x, upstream version decoupling

- **Tanggal:** 2026-08-26 | **Branch:** 5.5.0 (basis integrasi fork Linux)
- Owner memutuskan versi fork harus lepas dari penomoran official (Mazees/mark-agent 5.x/6.x) karena ini edisi Linux independen. Dipilih garis versi baru mulai **`1.0.0-alpha.1`**, sumber kebenaran tunggal di `src-tauri/tauri.conf.json`.
- Release otomatis dibangun ketat: tag `v*` → guard kecocokan tag↔versi → gitleaks + vitest + vite build + cargo check → bundle AppImage/deb → GitHub Release dengan changelog otomatis (`--generate-notes`), versi `-alpha` terdeteksi sebagai prerelease.
- Skrip `scripts/sync-version.mjs` (+ `bun run sync-version`, mode `--check` untuk CI) menyinkronkan package.json + Cargo.toml dari tauri.conf.json.

**Audit Trail:** `grep -rliE "versi|version.?reset|release.?automation|auto.?release|changelog" docs/PLANNED/sessions/` → 3 hit tidak relevan (linear-integrasi, tiktok-stealth, config-sidebar — makna beda); `git log -i --grep="release|version"` → hanya retire workflow electron lama (`3aee1c4`) dan whats-new boot trigger. Tidak ada patch serupa. Scope BARU.

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
|---|---|---|---|---|
| Versi acak-acakan: package.json `5.0.0`, tauri.conf `6.0.0-alpha.1`, Cargo.toml `0.1.0` | package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml | Warisan migrasi + scaffold template belum disentuh | Semua → `1.0.0-alpha.1`; Cargo metadata diisi sungguhan; sync-version.mjs sebagai penjaga | DONE |
| CI tidak jalan untuk push langsung ke `5.5.0` (hanya PR), pola branch `6.*` usang | .github/workflows/tauri.yml | Trigger lama era migrasi | push: tauri-migration, 5.5.0, master; PR idem | DONE |
| Tidak ada pipeline rilis (bundle job lama tidak membuat GitHub Release) | .github/workflows/release.yml | Workflow rilis electron sudah diretired, penggantinya belum ada | release.yml baru: guard → verify → publish | DONE |

## Files Modified

| File | Perubahan |
|---|---|
| src-tauri/tauri.conf.json | version 6.0.0-alpha.1 → 1.0.0-alpha.1 (single source of truth) |
| package.json | version → 1.0.0-alpha.1; +script `sync-version` |
| src-tauri/Cargo.toml | version/metadata real (description, authors Abelion512) |
| scripts/sync-version.mjs | BARU — sinkron + `--check` mode exit-1 untuk CI |
| .github/workflows/release.yml | BARU — tag v* → guard/verify/publish, AppImage+deb+auto-notes |
| .github/workflows/tauri.yml | trigger push ditambah 5.5.0 & master |
| README.md | blok "Mark Light 6.x" → identitas fork + garis versi 1.x + cara rilis |

## Agent Learnings

- Single source of truth versi HARUS satu file (tauri.conf.json) karena Tauri bundler membaca situ; package.json/Cargo.lock hanya turunan.
- `gh release create --generate-notes --verify-tag` + flag `--prerelease` kondisional (versi mengandung `-`) cukup untuk changelog otomatis tanpa tool pihak ketiga.
- Guard tag↔versi di job pertama mencegah build mahal jalan untuk tag salah.

## File Invariants

| File | Invariant |
|---|---|
| src-tauri/tauri.conf.json | `version` = SATU-SATUNYA tempat mengubah versi; jangan edit versi di package.json/Cargo.toml manual — jalankan `bun run sync-version`. |
| scripts/sync-version.mjs | Mode `--check` wajib exit non-zero saat drift — dipakai gerbang release.yml. |
| .github/workflows/release.yml | Job `guard` harus tetap menjadi `needs` pertama semua job berikutnya. |

## Verification Checklist

- [x] `bun run sync-version --check` hijau (semua manifest 1.0.0-alpha.1)
- [ ] `cargo check` hijau dengan manifest baru (berjalan background)
- [ ] Push tag uji `v0.0.0-test` ke repo nyata → release.yml full pass (perlu akses push; owner)
- [ ] Hapus tag uji setelah verifikasi

## Callback

Tag pertama rilis nyata (`v1.0.0-alpha.1`) baru saya buat setelah Fase 2 (fix keamanan) lolos verify lokal — setuju kalau tag dipaku di akhir Fase 2 alih-alih sekarang?
