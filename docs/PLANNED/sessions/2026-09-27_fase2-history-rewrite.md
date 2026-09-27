# Session Log: FASE 2 History Rewrite (2026-09-27)

## Tujuan
Bersihkan kepemilikan identitas era warisan dari commit history (keputusan owner: "license-nya memang harusnya milik saya; kalau bisa dibersihkan commit era warisan, ga masalah"), metode dipilih owner: **rewrite in-place + force-push**.

## Prasyarat & Keamanan
- Backup ganda terverifikasi: `/tmp/abelink-backup-prerewrite.bundle` dan `/tmp/abelink-backup-final.bundle` (keduanya `git bundle verify` OK, complete history, 46MB).
- Rewrite dijalankan di **clone terpisah** `/tmp/abelink-rewrite` (bukan working repo) — melindungi stash sesi lain (`stash@{0}` ponytail-cleanup) dan worktree `Abelion512/barreleye`.

## Eksekusi (git-filter-repo, 2 pass)
- Pass 1: `--mailmap` (identitas author era warisan + email lama + akun test -> Abelion512; bot rilis era warisan -> Abelink Release Bot) + `--replace-message` (seluruh pola nama/email era warisan -> Abelion512; pola nama produk era warisan -> Abelink). 1150 commit, 5.8s.
- Pass 2 (case-insensitive): 8 sisa nama era warisan huruf kecil di commit detach-upstream #66 (artefak pass 1 sendiri: pola nama produk era warisan sudah menjadi "abelink" sehingga pola gabungan dengan nama lama lolos regex case-sensitive). `( ?i)` pass 1.04s.
- `git filter-repo` melepas remote origin (perilaku bawaan); ditambahkan ulang sebelum push.

## Verifikasi
- Author/committer era warisan = **0**; pesan commit berisi pola nama/email era warisan (case-insensitive) = **0**.
- **Tree-hash main lama vs baru identik** (`adafc580…`) — isi file final 100% sama, hanya metadata history berubah.
- 1150 commit utuh; 4 tag di-force-push ulang (v1.0.0-alpha.1/2/3, v1.1.0-alpha.5).
- Remote: main = `114cd4a`, hanya `refs/heads/main` + tags + `refs/pull/*` milik GitHub.

## Batasan Dikenal
- **`refs/pull/*` lama masih menyimpan commit bersejarah di sisi GitHub** — tidak bisa dihapus via git push; hanya menghilang bila repo dihapus/ulang atau GitHub memutuskan. PR archives tetap menampilkan author lama di UI.
- Lokal masih menjangkau history lama via **branch worktree `Abelion512/barreleye`** dan **stash sesi lain** — sengaja dipertahankan (bukan milik sesi ini). Setelah keduanya tidak lagi dibutuhkan, purge penuh lokal: `git worktree remove <barreleye>`, `git branch -D Abelion512/barreleye`, `git stash drop`, lalu `git reflog expire --expire=now --all && git gc --prune=now --aggressive`.
- Reflog lokal juga masih menunjuk commit lama (dibiarkan untuk keamanan sesi lain).
- Pesan commit pembersihan identitas kini tanpa nama era warisan — konteks historisnya berubah; diterima sebagai konsekuensi keputusan rewrite owner.

## Keadaan Akhir
- Remote & local main = `114cd4a` (v1.3.0-alpha.7), history bersih identitas, pohon identik dengan pra-rewrite.
- Gate saat pra-rewrite: e2e 1772/1788 + 16 skip, lint 0 error/43 warnings (pohon tidak berubah, tidak ada rerun penuh post-rewrite; perubahan hanya metadata commit).
