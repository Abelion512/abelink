# Session Log: Detach Upstream & Pembersihan Identitas (2026-09-27)

## Tujuan
"Bersihkan kepemilikan era warisan" — melepas identitas upstream lama pada level file/infrastruktur, tanpa rewrite history dan tanpa menyentuh LICENSE.

## Keputusan
- **LICENSE TIDAK disentuh pada tahap ini.** Lisensi source-available warisan melarang penghapusan notice/copyright; (kemudian diganti via keputusan owner di PR docs-completion). Pembersihan dibatasi pada infrastruktur upstream + referensi fork.
- **History rewrite ditolak** (git filter-repo dsb.) karena alasan lisensi di atas; dilaporkan ke owner sebagai opsi yang butuh keputusan pemilik hak.
- `scripts/dev.sh` `remove_stale_desktops()` (entri desktop fosil era lama) DIPERTAHANKAN — pembersihan fossil era Electron, bukan identitas upstream.
- Jejak atribusi di `tests/auditName.test.mjs` (blok identitas = atribusi sah), komentar port `gemini-web.js`/`sessionCompactor.js`, dan snapshot historis (`CHANGELOG.md`, `src/data/releases.json`, session log lama) DIPERTAHANKAN — atribusi sah/konvensi repo (session log tidak diretro-edit).
- Kandidat lanjutan (butuh keputusan owner, bukan bagian PR ini): atribusi nama era warisan di blok identitas runtime `src/api/appIdentity.js` (masuk prompt persona) serta pola nama era warisan di guard persona/planning.

## Perubahan Berkas
- Dihapus: `.github/workflows/upstream-sync.yml`, `.github/workflows/branch-guard.yml`, `scripts/auto-detect-upstream.mjs`, `scripts/abelink-update.mjs` (alat sync upstream; tanpa pemakai di package.json/workflow).
- `AGENTS.md`: branch master/linux dihapus dari strategi branch; Environment bukan lagi "fork dari basis warisan"; Upstream diganti referensi lisensi; daftar workflow CI disinkronkan (upstream-sync/branch-guard dihapus).
- `README.md`: note fork diganti "dikelola independen, tanpa sinkronisasi upstream sejak 2026-09-27"; bagian Lisensi merujuk lisensi source-available warisan — notice dipertahankan sesuai ketentuan (saat itu).
- `CONTRIBUTING.md`: tabel branch tanpa master/linux + catatan tidak ada upstream tracker.
- `TASK.md`: catatan item lisensi diperbarui (workflow/script upstream sudah dihapus).

## Verifikasi
- `git grep` sisa referensi upstream-sync/branch-guard/auto-detect-upstream/abelink-update: hanya tersisa di snapshot historis (TASK.md kini menjelaskan penghapusan; graphify-out/ adalah artefak build).
- Suite gate: lint + vitest dijalankan setelah rebase ke main (lihat PR).

## Batasan Dikenal
- Commit lama di history masih memuat nama era warisan (kini sudah dibersihkan lewat FASE 2).
- LICENSE saat itu tetap lisensi warisan (diganti Abelink Proprietary di PR docs-completion).
