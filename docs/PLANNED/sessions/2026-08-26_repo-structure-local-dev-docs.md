# Session Log — 2026-08-26: Struktur Repo Root + README Lokal & SemVer

## Ringkasan

**Keywords:** struktur folder root, repo structure cleanup, backlink path docs, artefak electron sisa, electron.vite.config hapus, dev-app-update.yml, tool-local dir gitignore, readme cara menjalankan lokal, local dev run guide, semantic versioning prerelease, badge repo salah

- **Tanggal:** 2026-08-26 | **Branch:** 5.5.0 | **Pemicu:** permintaan owner pasca-rilis alpha: (1) konfirmasi skema versi, (2) rapikan struktur folder/file termasuk backlink & path, (3) cara jalan lokal + update .gitignore & README.
- Audit trail: grep "struktur|backlink|readme|gitignore|local dev" di docs/PLANNED + git log -> log terdekat `2026-08-26_repo-hygiene-ci-fix.md` mencakup branch/workflow/CI, BUKAN pembersihan file root ter-track maupun dokumen README; makna inti beda -> file baru sah.

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
|---|---|---|---|---|
| Config build Electron masih ter-commit padahal build kini Vite standar | electron.vite.config.mjs | sisa migrasi belum dibersihkan | git rm; grep referensi silang = 0 pemakaian | DONE |
| Konfigurasi updater electron-updater tak relevan | dev-app-update.yml | idem | git rm | DONE |
| Script npm usang menyesatkan kontributor | package.json scripts | electron:dev/electron:build memanggil paket yang tak lagi jalan | dua script dihapus; `bun run app` = tauri dev tetap | DONE |
| Gitlink embedded repo dari eksperimen worktree lama ter-commit | .claude/worktrees/ui-overhaul-glass-blues (mode 160000) | worktree tidak dibersihkan saat eksperimen selesai | untrack; /.claude/ di-ignore penuh | DONE |
| File plan/state tool AI ikut ter-track | .hermes/plans/*, .zcode/plans/*, .impeccable/config.json, plans/context-engineering-fix.md, .claude/launch.json | tidak ada pola ignore untuk direktori tool | untrack semua + blok ignore "/.claude/, /.hermes/, /.zcode/, /.impeccable/, /.remember/, /.superpowers/, /plans/" | DONE |
| Badge Download menunjuk repo lama yang mati | README.md | copy-paste era sebelum rename fork | URL badge -> Abelion512/mark-agent-linux/releases | DONE |
| Instruksi clone placeholder | README.md | template upstream tidak pernah disesuaikan | clone URL + cd mark-agent-linux | DONE |
| Perintah jalan lokal tidak merujuk alias resmi & gate wajib | README.md | ditulis sebelum script `app`/`verify` ada | tabel Perintah Pengembangan Lainnya (verify/test/lint/format/sync-version/harness) + shortcut Ctrl+Alt+M / Ctrl+Shift+S | DONE |
| Header tabel Teknologi dobel + emoji di judul section & contoh plugin | README.md | salin-tempel bertumpuk; aturan tanpa-emoji belum diterapkan ke README | header dibuang, judul polos, string contoh plugin [SUKSES]/[GAGAL] | DONE |
| Pertanyaan owner: apakah versi ini semver | - | - | ya, SemVer 2.0.0; paragraf kebijakan versi (prerelease ordering) ditambahkan di blok fork README | DONE |

Hasil audit yang TIDAK bermasalah: seluruh tautan relatif markdown (README/CONTRIBUTING/AGENTS/docs) lolos cek resolusi file = 0 rusak; `.githooks/` sengaja dipertahankan (pre-commit/pre-push aktif lewat core.hooksPath); `assets/banner-repo.png` dipakai README.

## Files Modified

| File | Perubahan |
|---|---|
| electron.vite.config.mjs, dev-app-update.yml | DIHAPUS |
| .gitignore | /.claude/ penuh + blok direktori tool AI baru |
| package.json | script electron:dev/electron:build dihapus |
| README.md | badge+clone URL benar, tabel perintah dev, shortcut, header dobel, emoji bersih, kebijakan SemVer |
| .claude/*, .hermes/*, .zcode/*, .impeccable/*, plans/* | untrack dari index |

## Agent Learnings

- Mode 160000 (gitlink) di `git ls-files -s` adalah tanda repo ter-embed; `git rm --cached` path-nya, bukan rm biasa.
- `bunx <pkg>` menyembunyikan dependensi tak-deklarasi (kasus vitest kemarin); dokumentasi run lokal harus selalu menunjuk script package.json, bukan bunx langsung.
- Cek tautan markdown bisa satu-loop bash: ekstrak `\]\(([^)#]+)` lalu test -e relatif dirname — cukup untuk repo kecil tanpa tool tambahan.

## File Invariants

| File | Invariant |
|---|---|
| README.md | Tanpa emoji; URL repo selalu mark-agent-linux; perintah contoh hanya yang ada di package.json scripts. |
| .gitignore | Direktori tool AI (.claude/.hermes/.zcode/.impeccable/.remember/.superpowers/plans) tidak boleh ter-track lagi. |
| src-tauri/tauri.conf.json | Satu-satunya tempat ubah versi; ikuti SemVer 2.0.0 dgn sufiks prerelease. |

## Verification Checklist

- [x] grep emoji README/AGENTS/CONTRIBUTING = 0
- [x] Semua tautan relatif markdown resolve ke file nyata
- [x] bash scripts/verify.sh exit 0
- [x] git status bersih dari file tool AI

## Callback

Direktori `social-data-engine/` dan `workflow` ada di disk tapi sudah lama di-gitignore — masih berfungsi sebagai bagian proyek, atau boleh saya arsipkan keluar dari root biar root makin ramping?
