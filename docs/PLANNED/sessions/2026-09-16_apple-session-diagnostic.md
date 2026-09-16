# Diagnostic: Apple sessions sid 6-9 stuck (2026-09-16)

## Fakta (harness dev 2026-09-16, file langsung)

- sid 6 (18 turn, failed/verify-partial): durable task Apple di worktree
  `../abelink-apple`. Agent `read-file SKILL.md` -> ERROR path tak ditemukan;
  `find-files SKILL.md/*HIG*` -> 0 hasil; lalu menulis `hig_reading_log`
  ke `/home/abelion/Documents/Abelink Tasks/...` (sid system) dan akhirnya
  menyerah setelah ~10 turn.
- sid 7-9 (blocked/state-blocked): prompt W2/W3 orb+JarvisOrb. Workspace hanya
  berisi 4 file riset (`ai-agent-research*.md`, `computer-use-verification.md`);
  `find-files *JarvisOrb*` -> 0; agent tutup jujur (anti-halusinasi benar).

## Root cause

1. Skill files ADA di `~/.agents/skills/abelion/abelion-ui-ux/` (SKILL.md +
   references/), TAPI agent tidak pernah diberi path absolutnya. Prompt
   durable task menyebut "baca SKILL.md" relatif terhadap workspace aktif.
2. Workspace aktif = dev workspace (`~/.local/share/abelink-dev/abelink/workspace`)
   yang isinya file riset sesi lain — bukan repo, bukan worktree apple,
   bukan direktori skill. Tidak ada mekanisme resolve "skill X -> path Y".
3. Hasil: agent jujur (tidak halusinasi) tapi stuck 10+ turn sebelum blocked.
   Perilaku jujur benar; routing sumber salah.

## Rekomendasi (belum dieksekusi)

1. Skill registry: pemetaan nama skill -> path absolut (`~/.agents/skills/...`),
   disuntik ke system prompt saat skill diminta (pola load-when-needed yang
   sudah ada di docs/REFERENCE-LIBRARY.md — tinggal jadikan data, bukan docs).
2. Durable task: Gaia `workspaceRoot` eksplisit saat task dibuat (default =
   workspace aktif; Apple task -> path worktree). Terkait WS-1 plumbing yang
   sudah mendarat di branch ini.
3. Worktree apple sehat: `feat/apple-design`, W1 `9d85dba` present, tidak
   tersentuh sesi gagal ini.

## Verifikasi

- `ls ~/.agents/skills/abelion/abelion-ui-ux/` = SKILL.md + agents/ + references/
- `git -C ../abelink-apple log --oneline -2` = 9d85dba + 1596e6f
- Harness sid 6: 21 events; sid 7-9: 7-8 events tiap sesi.
