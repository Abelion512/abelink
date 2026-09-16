# TASK — Sesi Berikutnya Abelink

> 1 sesi = 1 topik. Di luar topik = catat, jangan kerjakan.

## Status terakhir (2026-09-16)

- Branch kerja: `feat/memory-write-dedup` (PR #41 open, tanpa merge;
  stacked #37-#40 — merge berurutan, rebase tiap lapis).
- Isi: write-gate dedup di insertMemory (Lapis 1 duplikat memori).
- Verifikasi: vitest 864 passed (860+4), lint 0 errors (927 = baseline).
  Observe: fix trajectory Paket 1 bekerja (tool-calls gabung grup benar).
  (lihat `2026-09-16_memory-write-dedup.md`).

## Topik berikutnya (pilih SATU)

1. Review + merge PR berurutan #37->#41 (butuh billing CI pulih).
2. Paket 2 scan: identitas subagent + os channels + main_chat hardcode +
   write-file config.
3. Paket 3 scan: logging bypass sisa + bug || 0.5 + satukan konstanta.
4. Skill registry tahap 2 (skor relevansi index, bukan abjad).
5. Lapis 2 memori (groomer berkala) — bila duplikat masih terlihat.
6. Qwen/DeepSeek sebagai custom provider (DITUNDA — bahas dulu).

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
