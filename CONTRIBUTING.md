# Contributing to Mark Agent (Linux Fork)

Terima kasih sudah mau berkontribusi! Repo ini adalah **Linux-only fork** dari
Mark Agent, dioptimalkan untuk end-user. Panduan ini untuk kontributor manusia —
semua aturan singkat dan praktis.

## Quick Start

```bash
git clone https://github.com/Abelion512/mark-agent.git
cd mark-agent
bun install
bun tauri dev        # dev server (Vite HMR + Tauri shell)
bun tauri build      # production build -> src-tauri/target/release/bundle/
```

Catatan: project pakai **bun** — lockfile resmi `bun.lock`.
`node_modules/` tidak pernah di-commit (sudah di `.gitignore`).

## Branch Convention

Pola rilis versi — branch utama adalah nomor versi rilis berikutnya, bukan `main`:

| Branch     | Kegunaan                                   |
|------------|--------------------------------------------|
| `5.5.0`    | Rilis berikutnya — semua fitur yang lolos testing di-merge ke sini |
| `master`   | Stabil — hanya berisi versi rilis final     |
| `feat/*`   | Fitur baru (dibuat dari branch rilis)       |
| `fix/*`    | Bug fix                                    |
| `chore/*`  | Tooling, deps, CI, refactoring             |

Alur:

1. Buat branch fitur dari branch rilis: `git checkout -b feat/xyz 5.5.0`
2. Kerjakan, commit, push
3. Testing di branch fitur (lint + build + run app)
4. Jika lolos → merge ke branch rilis (`5.5.0`)
5. Jika semua beres → merge rilis ke `master`

Jangan pernah push langsung ke `master`.

## PR Workflow

1. Open PR dengan title deskriptif
2. CI otomatis menjalankan: gitleaks → vite build → cargo check (lihat `.github/workflows/tauri.yml`)
3. Minimal 1 review approval
4. Merge dengan pesan commit yang jelas

## Code Style

- **Linter:** ESLint — `bun run lint`
- **Formatter:** Prettier — `bun run format`
  - singleQuote, noSemi, printWidth 100, trailingComma none
- **Electron boundary:** Jangan pakai `fs`/`path` di `renderer/` — komunikasi OS lewat `preload/index.js` (IPC) saja
- **CSS:** Tailwind 4 + DaisyUI 5 (`forest` theme). Jangan bikin file CSS ad-hoc
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/)
  `type(scope): description` — contoh: `feat(ai-bridge): add 9Router provider`

## Architecture Rules

- Main ↔ Renderer communication **wajib** lewat `preload/index.js` IPC
- Semua operasi OS berbahaya **wajib** memicu dialog approval
- Tanpa third-party analytics/tracking — aplikasi privacy-first
- File konfigurasi lokal (`model-registry.json`, dll) jangan di-commit — sudah di `.gitignore`

## Linux-Specific Notes

- **Linux-only fork.** Jangan tambah patch kompatibilitas Windows/macOS
- System deps: `libgtk-3-dev`, `libnotify-dev`, `libnss3`, `xdotool`, `tesseract-ocr`
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
