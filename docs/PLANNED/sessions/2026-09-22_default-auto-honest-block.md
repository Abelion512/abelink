# Session 2026-09-22 — Default auto + pesan jujur + NEEDS_USER headless

Mode: build. Branch: feat/headless-agent-cli.

## Keputusan owner (locked)

Default = auto, bukan manual. Long-horizon tidak boleh mati nunggu Enter.
Profil agentic multi-agent: kasih goal, agent selesaikan, user ditinggal.

## Temuan verifikasi (bukti, bukan klaim)

- Rust `default_policy` SUDAH ALWAYS untuk mutasi non-kritis sejak f86b17b;
  test `dangerous_defaults_to_ask` basi (assert ASK vs source ALWAYS).
  Cargo run pertama gagal justru membuktikan inkonsistensi ini.
- Blokir `index.html` user: reproduksi `validateHeadlessPath` tunjukkan
  `index.html` + `/tmp/ujicli` = ALLOW. Blokir aktual = SELF_DIR marker
  `/abelink` substring-match SEMBARANG path berisi "abelink"
  (termasuk `/tmp/abelink-test-workspace` dan repo sendiri).
- NEEDS_USER di CLI one-shot = dead-end (`ketik 'lanjutkan'` tak terbaca).

## Perubahan

- `headlessCli.js`: `resolveApprovalDecision` default auto + param `mode`
  (auto/manual/dont-ask); hardline tak pernah relay.
- `bin/abelink.mjs`: `--permission-mode auto|manual|dont-ask` (default auto),
  relay sederhanakan ke satu sumber kebenaran, NEEDS_USER = terminal jujur
  + exit 1 + saran (tanpa suruhan mengetik).
- `headlessSecurity.js`: kategori `self-target` + pesan jujur + saran
  `--workspace`; matcher segment-based (perbaiki substring `/abelink`,
  `/workspace` yang makan `/tmp/abelink-test-workspace`).
- `approval_policy.rs`: komentar + test sinkron ALWAYS (Auto Mode f86b17b).
- Docs: permission-modes, engine-roadmap, model-variants (sesi ini).

## Verifikasi

- JS target: 76 passed. Full: 1456 passed (rerun; 1 flaky transien di run
  pertama, hijau di rerun). Lint: 0 errors. Smoke: LOLOS.
- Cargo lib: 32 passed (termasuk `dangerous_defaults_to_always_auto_mode`).
- E2E auto tanpa flag: COMPLETED, tanpa `[HEADLESS APPROVAL]` prompt.

## Batasan

- `auto` Abelink = trust + audit (supervisor/verifier/harness), BUKAN
  classifier model kedua ala Claude Code — dinyatakan di doc, bukan klaim.
- Tanpa sandbox/container, auto = trust penuh dalam workspace.
