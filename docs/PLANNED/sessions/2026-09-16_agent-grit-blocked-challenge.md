# Session 2026-09-16 — Agent grit: blocked-challenge 1x

## Keputusan

- Topik: daya juang agent rendah (gampang menyerah) + tryability lokal.
  Systematic-debugging Phase 1-3, ponytail full (reuse pola verify-gate,
  tanpa abstraksi baru; arsitektur AGI-ready bertahap, fix saat nemu).
- Root cause BUKAN prompt lemah (planning.js:158,161,180 sudah keras) dan
  BUKAN budget (MAX_PLAN_STEPS=25, spiral stop 8, STOP repeat>=5 — tak pernah
  tercapai karena blocked memotong turn 1-2). Asimetri harness: klaim `done`
  diuji verify-gate bounded replan, klaim `blocked` diterima mentah.
- Fix: `shouldChallengeBlocked` — blocked 0-tool ditantang 1x, ulangan
  diterima. Main loop reuse slot `pendingVerifyObservation`; subagent
  observasi korektif + continue. Conversational dikecualikan.
- PR #39 ke main, TANPA merge (stacked #37 + #38).

## Berkas berubah (PR #39, +99/-8)

- `src/api/ai/agentDecision.js`: `shouldChallengeBlocked`,
  `BLOCKED_CHALLENGE_TEXT`, `MAX_BLOCKED_CHALLENGES=1` (+ komentar ponytail).
- `src/hooks/agent/useAbelinkPlan.js`: counter + branch BLOCKED challenge.
- `src/api/subagent/subagentExecutor.js`: counter + challenge continue.
- `tests/agentDecision.test.mjs`: 5 kasus shouldChallengeBlocked.

## Hasil verifikasi

- `bunx vitest run` full: 76 files, 860 tests passed (855+5).
- `bun run lint`: 0 errors (927 warnings pre-existing).
- Bukti trajectory: harness dev 2026-09-16 sid 10 — run-shell gagal 1x ->
  blocked T2; screenshot request -> blocked T1 0 tool; music-play verifier
  tolak -> langsung blocked (file langsung, bukan copas).
- Dev direstart fresh (proses lama 17:15 pegang lock, dev.sh gagal start
  baru; kill manual + launch ulang): vite :1420 = 200, bridge :49713 = 401,
  PID app+sidecar baru, jendela visible + difokuskan. Kode baru kepakai.

## Batasan dikenal

- Merge berurutan #37 -> #38 -> #39 + rebase tiap lapis (overlap
  useAbelinkPlan/subagentExecutor).
- Challenge 1x sengaja minimal; naikkan hanya dengan bukti trajectory
  repeat give-up (lihat komentar ponytail di agentDecision.js).
- CI cloud merah = billing; verifikasi lokal penuh.

## Ponytail debt ledger (sesi ini)

- `MAX_BLOCKED_CHALLENGES=1`: ceiling 1 challenge per run. Naikkan bila
  trajectory tunjukkan model butuh 2x dorongan (bukti dulu, bukan firasat).
- Reuse slot `pendingVerifyObservation` untuk challenge: teks [LANJUTKAN]
  generik ("aksi verifikasi"), bukan khusus-blocked. Pisah slot bila
  membingungkan model (bukti trajectory).
- Deteksi "0 tool" = `executedToolsList.length` / `toolsExecutedThisRun`
  boolean (kasar: gagal-1x dihitung sudah-berusaha). Bedakan gagal-vs-nol
  bila kasus "gagal 1x lalu menyerah" muncul lagi.
