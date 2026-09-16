# TASK — Sesi Berikutnya Abelink

> 1 sesi = 1 topik. Di luar topik = catat, jangan kerjakan.

## Status terakhir (2026-09-16)

- Branch kerja: `feat/browser-watchdog-reconnect` (PR #38 open, tanpa merge;
  stacked di atas PR #37 yang belum merge — merge #37 dulu, lalu rebase).
- Isi: watchdog sweep 60s + fail-fast dispatch sesi basi + channel
  browser:reconnect + pill/tombol Hubungkan Ulang di CapabilitiesHub.
- Verifikasi: vitest 855 passed (851+4), lint 0 errors (lihat session log
  `2026-09-16_browser-watchdog-reconnect.md`).

## Topik berikutnya (pilih SATU)

1. Review + merge PR sesi ini (butuh billing CI pulih untuk gate cloud).
2. Skill registry tahap 2 (skor relevansi index, bukan abjad — gap sudah
   dipetakan: tanpa fungsi skor, scan 1 level, basePath putus).
3. ~~Extension watchdog + tombol reconnect UI~~ SELESAI (PR #38).
4. Qwen/DeepSeek sebagai custom provider (DITUNDA — bahas dulu).

## Prompt sesi baru (copy-paste)

```
Lanjut kerja Abelink, repo /media/abelion/Isaf/ican/project/abelink.
Baca DULU: TASK.md ini, docs/PLANNED/sessions/ (2 file terbaru),
git log --oneline -5, git status.
Topik sesi ini: [ISI SATU TOPIK DI ATAS].
Aturan: 1 sesi 1 topik. Di luar topik = catat di session log, JANGAN kerjakan.
Setiap klaim wajib bukti: vitest + lint + file:line, bukan copas.
Kode selain patch kecil: branch + PR ke main, TANPA merge.
Tutup sesi dengan session log (keputusan/berkas/verifikasi/batasan).
```

## Batasan dikenal

- CI cloud merah = billing akun (bukan kode). Verifikasi lokal penuh.
- Repo private — jangan public sebelum rotasi GROQ + Last.fm key.
- Jangan tambah collaborator untuk hemat menit (kuota milik owner).
