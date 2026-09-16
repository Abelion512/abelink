# Contributing to Abelink (Linux Edition)

Repo ini adalah **Linux-only fork** dari Abelink Agent, dioptimalkan untuk
performa desktop Linux.

## Siapa yang mengerjakan apa

Project ini dibangun **dari agent, oleh agent, untuk agent**. Satu-satunya
human dalam loop:

- **Founder (human):** Abelion512, pemilik Abelion of Group. Abelink adalah AI
  buatannya. Keputusan arsitektur final dan approval merge ada di founder.
- **Agen AI:** seluruh kontributor kerja (OpenCode, Claude Code, Codex,
  Hermes, dan agen kompatibel lain). Agen membaca `AGENTS.md` dan
  `docs/AGENT_CONTRIBUTION_GUIDELINES.md` sebagai sumber kebenaran operasional,
  bukan dokumen ini. Dokumen ini hanya ringkasan pintu masuk.

Aturan untuk agen: baca [docs/AGENT_CONTRIBUTION_GUIDELINES.md](docs/AGENT_CONTRIBUTION_GUIDELINES.md)
sebelum menyentuh kode apapun.

## Quick Start

```bash
git clone https://github.com/Abelion512/abelink.git
cd abelink
bun install
bun run app         # nyalakan dev (Vite HMR + Tauri shell, terisolasi)
bun tauri build      # production build -> src-tauri/target/release/bundle/
```

Catatan: project pakai **bun**: lockfile resmi `bun.lock`.
`node_modules/` tidak pernah di-commit (sudah di `.gitignore`).

### Baru pertama kali clone? Satu perintah cukup

```bash
bun run app              # atau: bash scripts/dev.sh
```

`scripts/dev.sh` akan, secara berurutan:

1. Auto-install `bun` ke `~/.bun` (atau `BUN_INSTALL`) tanpa `sudo` kalau belum ada.
2. Jalankan `bun install` kalau `node_modules` belum ada / lockfile lebih baru.
3. Bersihkan holder port 1420 dan `cargo` build-lock yang tertinggal dari sesi
   sebelumnya (hanya target proses yang jelas milik repo ini: kalau holder
   bukan milik kita, wrapper akan **abort** agar tidak membunuh proses lain).
4. Lanjut ke `bun run app` (= `bash scripts/dev.sh`, dev terisolasi; mentah: `bun run app:raw`).

CI tidak berubah: `.github/workflows/tauri.yml` tetap pakai `oven-sh/setup-bun@v2`
dengan `bun-version: 1.3.14`. Versi itu adalah satu-satunya versi yang
`scripts/dev.sh` anggap "exact match": versi major yang lebih baru di
workstation lokal tetap diterima dengan log `[dev.sh] ... major >=, OK`.

## Branch Convention

`main` adalah mainline: semua fitur dan fix masuk ke sini via PR. Jangan
commit langsung ke `main` kecuali patch kecil (typo/komentar/format satu-dua
baris tanpa ubah perilaku).

| Branch     | Kegunaan                                              |
|------------|-------------------------------------------------------|
| `main`     | Mainline: semua fitur yang lolos testing di-merge ke sini |
| `linux`    | Cabang pelacak remote publik `public-upstream`: jangan pakai untuk kerja fitur |
| `master`   | Mirror upstream Mazees/mark-agent, sync-only: jangan sentuh manual |
| `feat/*`   | Fitur baru (dibuat dari `main`)                      |
| `fix/*`    | Bug fix                                               |
| `chore/*`  | Tooling, deps, CI, refactoring                        |

Alur:

1. Buat branch fitur dari mainline: `git checkout -b feat/xyz main`
2. Kerjakan, commit, push
3. Testing di branch fitur (lint + build + run app)
4. Jika lolos → open PR ke `main`
5. Jika semua beres → merge ke `main`
6. Hapus branch lokal setelah merge: jangan biarkan branch merged menumpuk

Jangan pernah push langsung ke `main`, `linux`, atau `master`.

## PR Workflow

1. Open PR dengan title deskriptif
2. CI otomatis menjalankan: gitleaks → vite build → cargo check (lihat `.github/workflows/tauri.yml`)
3. Minimal 1 review approval (founder untuk perubahan arsitektur)
4. Merge dengan pesan commit yang jelas
5. Perubahan arsitektur wajib memperbarui `docs/ARCHITECTURE.md` di PR yang sama

## Session Log (wajib untuk setiap perubahan kode)

Setiap sesi kerja yang mengubah kode WAJIB ditutup dengan session log di
`docs/PLANNED/sessions/YYYY-MM-DD_<topik>.md`: keputusan, berkas berubah,
hasil verifikasi, batasan dikenal. Tanpa session log, pekerjaan dianggap
belum selesai.

## Code Style

- **Linter:** ESLint: `bun run lint`
- **Formatter:** Prettier: `bun run format`
  - singleQuote, noSemi, printWidth 100, trailingComma none
- **Tauri boundary:** Jangan pakai Node API langsung di `src/`: semua akses OS lewat facade `src/api/tauri-bridge.js` (Tauri `invoke()` / channel `node_invoke` sidecar) saja
- **CSS:** Tailwind 4 + DaisyUI 5 (`forest` theme). Jangan bikin file CSS ad-hoc
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/)
  `type(scope): description`: contoh: `feat(ai-bridge): add 9Router provider`

## Architecture Rules

- Main ↔ Renderer communication **wajib** lewat `src/api/tauri-bridge.js` (Tauri `invoke()` / channel `node_invoke` sidecar)
- Semua operasi OS berbahaya **wajib** memicu dialog approval
- Tanpa third-party analytics/tracking: aplikasi privacy-first
- File konfigurasi lokal (`model-registry.json`, dll) jangan di-commit: sudah di `.gitignore`

## Linux-Specific Notes

- **Linux-only fork.** Jangan tambah patch kompatibilitas Windows/macOS
- System deps (sama seperti CI `tauri.yml`): `libwebkit2gtk-4.1-dev`, `build-essential`, `libxdo-dev`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, plus `xdotool`, `tesseract-ocr` untuk desktop automation
- `pc-agent.js` pakai AT-SPI D-Bus + xdotool. Wayland support via ydotool
- Lihat `scripts/setup-linux-pc-agent.sh` untuk instalasi dep otomatis

## Kebijakan Repositori Privat

Karena repositori ini berstatus privat, seluruh kode sumber, dokumentasi arsitektur (`docs/`), rencana kerja, dan pengujian internal boleh di-commit dan di-push untuk menjaga kelengkapan proyek.

Aturan pengecualian yang DILARANG di-commit:
- File dependensi dan build (`node_modules/`, `src-tauri/target/`, `dist/`).
- File media/video berukuran megabyte (`.mp4`, `.mov`, `.mkv`, rekaman layar raw).
- Binary model lokal (`.safetensors`, `.bin`, `.onnx` di luar resource resmi).
- Kredensial, secret token, atau dump database lokal.

Semua pengecualian tersebut telah diatur di `.gitignore`.
