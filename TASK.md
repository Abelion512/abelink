# TASK — Sesi Berikutnya Abelink

> 1 sesi = 1 topik. Di luar topik = catat, jangan kerjakan.

## Status terakhir (2026-09-16)

- Branch kerja: `feat/extension-keepalive-trajectory` (PR #40 open, tanpa
  merge; stacked #37+#38+#39 — merge berurutan, rebase tiap lapis).
- Isi: extension alarms-resume + trajectory sessionId/turn + overlay tebal.
- Verifikasi: vitest 860 passed, lint 0 errors (927 = baseline). Dev fresh
  (vite 200, bridge 401). Sisa verifikasi user: reload extension di Chrome,
  tutup popup 6+ mnt, cek browser:status tetap connected.
  (lihat `2026-09-16_keepalive-trajectory.md`).

## Topik berikutnya (pilih SATU)

1. Review + merge PR berurutan #37->#38->#39->#40 (butuh billing CI pulih).
2. Paket 2 scan: identitas subagent + os channels + main_chat hardcode +
   write-file config.
3. Paket 3 scan: logging bypass sisa + bug || 0.5 + satukan konstanta.
4. Skill registry tahap 2 (skor relevansi index, bukan abjad).
5. Qwen/DeepSeek sebagai custom provider (DITUNDA — bahas dulu).

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
