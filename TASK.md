# TASK — Sesi Berikutnya Abelink

> 1 sesi = 1 topik. Di luar topik = catat, jangan kerjakan.

## Status terakhir (2026-09-16)

- Main SUDAH PUSH ke origin (`e6e0077` + log sesi ini): PR #36-#41 MERGED
  (auto-merge oleh push). Branch feat/* lokal+remote dihapus.
- Gate lokal penuh pengganti CI: vitest 864, lint 0, harness 8+25,
  bench 13/13, perf LOLOS-rerun (regresi awal = noise), build OK,
  cargo+clippy bersih, gitleaks no leaks.
  (lihat `2026-09-16_push-merge-cleanup.md`).
- PR open tersisa #33-35 (audit/security/docs sesi lain) — jangan sentuh.

## Topik berikutnya (pilih SATU)

1. Paket 2 scan: identitas subagent + os channels + main_chat hardcode +
   write-file config.
2. Paket 3 scan: logging bypass sisa + bug || 0.5 + satukan konstanta.
3. Skill registry tahap 2 (skor relevansi index, bukan abjad).
4. Lapis 2 memori (groomer berkala) — bila duplikat masih terlihat.
5. Qwen/DeepSeek sebagai custom provider (DITUNDA — bahas dulu).

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
