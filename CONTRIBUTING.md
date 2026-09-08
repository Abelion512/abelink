# Contributing to Mark Agent (Linux Fork)

Terima kasih sudah mau berkontribusi! Repo ini adalah **Linux-only fork** dari
Mark Agent, dioptimalkan untuk end-user. Panduan ini untuk kontributor manusia —
semua aturan singkat dan praktis.

## Quick Start

```bash
git clone https://github.com/Abelion512/abelink.git
cd abelink
bun install
bun tauri dev        # dev server (Vite HMR + Tauri shell)
bun tauri build      # production build -> src-tauri/target/release/bundle/
```

Catatan: project pakai **bun** — lockfile resmi `bun.lock`.
`node_modules/` tidak pernah di-commit (sudah di `.gitignore`).

### Alternatif: `bun run dev:smart` (bootstrap otomatis)

Untuk workstation Linux yang baru pertama kali clone (belum ada `bun`, atau
port 1420 masih di-hold sesi sebelumnya), pakai:

```bash
bun run dev:smart        # atau: bash scripts/dev.sh
```

`scripts/dev.sh` akan, secara berurutan:

1. Auto-install `bun` ke `~/.bun` (atau `BUN_INSTALL`) tanpa `sudo` kalau belum ada.
2. Jalankan `bun install` kalau `node_modules` belum ada / lockfile lebih baru.
3. Bersihkan holder port 1420 dan `cargo` build-lock yang tertinggal dari sesi
   sebelumnya (hanya target proses yang jelas milik repo ini — kalau holder
   bukan milik kita, wrapper akan **abort** agar tidak membunuh proses lain).
4. Lanjut ke `bun run app` (= `tauri dev`).

CI tidak berubah: `.github/workflows/tauri.yml` tetap pakai `oven-sh/setup-bun@v2`
dengan `bun-version: 1.3.14`. Versi itu adalah satu-satunya versi yang
`scripts/dev.sh` anggap "exact match" — versi major yang lebih baru di
workstation lokal tetap diterima dengan log `[dev.sh] ... major >=, OK`.

## Branch Convention

`linux` adalah mainline — semua fitur dan fix masuk ke sini. `master` hanya
mirror upstream (sync-only, dijaga `branch-guard.yml`): jangan pernah targetkan
PR ke `master` dan jangan merge `linux` ke `master`.

| Branch     | Kegunaan                                              |
|------------|-------------------------------------------------------|
| `linux`    | Mainline — semua fitur yang lolos testing di-merge ke sini |
| `master`   | Mirror upstream, sync-only — jangan sentuh manual     |
| `feat/*`   | Fitur baru (dibuat dari `linux`)                      |
| `fix/*`    | Bug fix                                               |
| `chore/*`  | Tooling, deps, CI, refactoring                        |

Alur:

1. Buat branch fitur dari mainline: `git checkout -b feat/xyz linux`
2. Kerjakan, commit, push
3. Testing di branch fitur (lint + build + run app)
4. Jika lolos → open PR ke `linux`
5. Jika semua beres → merge ke `linux`

Jangan pernah push langsung ke `linux` atau `master`.

## PR Workflow

1. Open PR dengan title deskriptif
2. CI otomatis menjalankan: gitleaks → vite build → cargo check (lihat `.github/workflows/tauri.yml`)
3. Minimal 1 review approval
4. Merge dengan pesan commit yang jelas

## Code Style

- **Linter:** ESLint — `bun run lint`
- **Formatter:** Prettier — `bun run format`
  - singleQuote, noSemi, printWidth 100, trailingComma none
- **Tauri boundary:** Jangan pakai Node API langsung di `src/` — semua akses OS lewat facade `src/api/tauri-bridge.js` (Tauri `invoke()` / channel `node_invoke` sidecar) saja
- **CSS:** Tailwind 4 + DaisyUI 5 (`forest` theme). Jangan bikin file CSS ad-hoc
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/)
  `type(scope): description` — contoh: `feat(ai-bridge): add 9Router provider`

## Architecture Rules

- Main ↔ Renderer communication **wajib** lewat `src/api/tauri-bridge.js` (Tauri `invoke()` / channel `node_invoke` sidecar)
- Semua operasi OS berbahaya **wajib** memicu dialog approval
- Tanpa third-party analytics/tracking — aplikasi privacy-first
- File konfigurasi lokal (`model-registry.json`, dll) jangan di-commit — sudah di `.gitignore`

## Linux-Specific Notes

- **Linux-only fork.** Jangan tambah patch kompatibilitas Windows/macOS
- System deps (sama seperti CI `tauri.yml`): `libwebkit2gtk-4.1-dev`, `build-essential`, `libxdo-dev`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, plus `xdotool`, `tesseract-ocr` untuk desktop automation
- `pc-agent.js` pakai AT-SPI D-Bus + xdotool. Wayland support via ydotool
- Lihat `scripts/setup-linux-pc-agent.sh` untuk instalasi dep otomatis

## End-User Focus

Repo ini untuk end-user: yang ter-commit hanya yang dibutuhkan untuk build dan
pakai aplikasi. Jangan commit:

- Dokumentasi AI/dev (`AGENTS.md`, `CLAUDE.md`, `docs/`, `.agents/`)
- File eksperimen, screenshot, test artifact besar
- Script dev personal (`scripts/ask-ais.mjs`)

Semua itu di-ignore via `.gitignore` — file tetap ada di disk kamu, hanya tidak
ikut repo.
