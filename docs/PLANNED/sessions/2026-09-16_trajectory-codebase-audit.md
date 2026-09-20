# Session: Trajectory + Codebase Audit (2026-09-16)

## Trajectory (harness dev 2026-09-16)

- Sesi musik Mandarin (sid 1, turn 2-4): read-tools -> music-play
  `離開我的依賴` (王艷薇) -> music-play `wo zou hou` (小咪). Semua ok:true.
  Jawaban user sebelumnya ("agent lucu, tools ga nyentuh") SUDAH basi —
  sesi ini agent BEKERJA BENAR.
- Sesi Apple (sid 6-9): sub-agent stuck cari SKILL.md di worktree yang salah
  (workspace dev, bukan repo skill). blocked/failed beruntun, state-blocked.
  Akar: working-directory salah, bukan skill hilang. W1 Apple tetap jalan
  manual di worktree (commit 9d85dba).
- Turn-end.jsonl kini ada (hasil fix PR #30): sid 6 failed/verify-partial,
  sid 7-9 blocked/state-blocked. Observabilitas membaik.

## Codebase audit (10 temuan -> PR #34)

1. Telegram download tanpa timeout -> AbortController 60s.
2. oEmbed axios tanpa timeout -> 15s + signal.
3. MCP notify tanpa timeout -> ikut RPC_TIMEOUT_MS.
4. Broadcast queue uncapped -> cap 100 + drop jujur.
5. cleanAndParse duplikat drift (test parity MERAH -> samakan sidecar,
   hijau 13/13).
6-7. getErrorLog/redactHeaders DIBIARKAN (API berguna, bukan dead).
8-9. VAD/vision log gate DEV-only.
10. Awareness clear await+catch.

Verifikasi: vitest 847, lint 0 errors, node check OK.
PR: #34 open tanpa merge. CI cloud merah billing.
