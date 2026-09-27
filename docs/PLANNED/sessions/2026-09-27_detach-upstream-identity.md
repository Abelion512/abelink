# Session Log: Detach Upstream & Pembersihan Identitas (2026-09-27)

## Tujuan
"Bersihkan commit dan kepemilikan dari mazees dan mark-agent" — melepas identitas upstream pada level file/infrastruktur, tanpa rewrite history dan tanpa menyentuh LICENSE.

## Keputusan
- **LICENSE TIDAK disentuh.** "MARK Agent Source Available License v1.0" (c) Mada Putra secara eksplisit melarang penghapusan notice lisensi/copyright dan relicensing. Semua pembersihan dibatasi pada infrastruktur upstream + referensi fork.
- **History rewrite ditolak** (git filter-repo dsb.) karena alasan lisensi di atas; dilaporkan ke owner sebagai opsi yang butuh keputusan pemilik hak.
- `scripts/dev.sh` `remove_stale_desktops()` (mark.desktop/mark-agent.desktop) DIPERTAHANKAN — pembersihan fossil era Electron, bukan identitas upstream.
- Jejak atribusi di `tests/auditName.test.mjs` (blok identitas = atribusi sah), komentar port `gemini-web.js`/`sessionCompactor.js`, dan snapshot historis (`CHANGELOG.md`, `src/data/releases.json`, session log lama) DIPERTAHANKAN — atribusi sah/konvensi repo (session log tidak diretro-edit).
- Kandidat lanjutan (butuh keputusan owner, bukan bagian PR ini): atribusi `Mazees` di blok identitas runtime `src/api/appIdentity.js` (masuk prompt persona), regex persona/planning `Mada|Mazees`.

## Perubahan Berkas
- Dihapus: `.github/workflows/upstream-sync.yml`, `.github/workflows/branch-guard.yml`, `scripts/auto-detect-upstream.mjs`, `scripts/abelink-update.mjs` (alat sync upstream; tanpa pemakai di package.json/workflow).
- `AGENTS.md`: branch master/linux dihapus dari strategi branch; Environment bukan lagi "fork of Mazees/mark-agent"; Upstream diganti referensi lisensi; daftar workflow CI disinkronkan (upstream-sync/branch-guard dihapus).
- `README.md`: note fork diganti "dikelola independen, tanpa sinkronisasi upstream sejak 2026-09-27"; bagian Lisensi menyebut MARK Agent Source Available License v1.0 (lihat LICENSE, (c) Mada Putra) — notice dipertahankan sesuai ketentuan.
- `CONTRIBUTING.md`: tabel branch tanpa master/linux + catatan tidak ada upstream tracker.
- `TASK.md`: catatan item lisensi diperbarui (workflow/script upstream sudah dihapus).

## Verifikasi
- `git grep` sisa referensi upstream-sync/branch-guard/auto-detect-upstream/abelink-update: hanya tersisa di snapshot historis (TASK.md kini menjelaskan penghapusan; graphify-out/ adalah artefak build).
- Suite gate: lint + vitest dijalankan setelah rebase ke main (lihat PR).

## Batasan Dikenal
- Commit lama di history masih memuat nama mazees/mark-agent (tidak diubah, alasan lisensi).
- LICENSE tetap "MARK Agent Source Available License v1.0".
