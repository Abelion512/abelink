# Session Log: R1a+R1b+R1c+D1 — RSI terukur standar industri

Tanggal: 2026-09-19 | Branch: `feat/rsi-reuse-telemetry` | Status: selesai, siap merge

## Masalah
- RSI custom (`should_learn` -> skill Dexie) tanpa standar: tulis tanpa ukur reuse, tanpa prune, tanpa gate, tanpa anti-hack. "Ga guna" menurut owner.
- Referensi standar: Sakana DGM (gate empiris + lineage + anti reward-hack), AlphaEvolve (evaluator kuantitatif), Anthropic agents (evaluator-optimizer + ground truth), Skills (progressive disclosure + toolbox berevolusi), Meta Self-Rewarding + R1 (verifiable tasks), Hermes (bump_use/reuse_after_patch + curator prune + nudge 10-turn).

## Keputusan
- R1a: telemetri reuse di learnedSkills (Dexie v29, bump di read-skill, arsip 30 hari).
- R1b: skill baru lahir trial; lulus bila reuse>0 atau evalPassed; kedaluwarsa 7 hari -> arsip. Prompt tandai [TRIAL].
- R1c: misi repair menuntut artefak vitest mentah; verifier kriteria test-evidence menolak klaim tanpa artefak (pola claim-quoted).
- D1: directive internet-first persisten (key builtinPlugins.internetFirst, default ON, toggle UI).

## Berkas berubah
- `src/api/db.js`: v29 + use_count/last_used_at/state + bumpLearnedSkillUse + archiveStaleLearnedSkills + graduateTrialSkill + saveLearnedSkill(state).
- `src/hooks/agent/plan/agentTools.js`: bump tiap read-skill Dexie sukses.
- `src/api/ai/planning.js`: filter archived, penanda [TRIAL].
- `src/api/ai/skillSynthesizer.js`: lahir sebagai trial.
- `src/api/ai/selfHealingEngine.js`: prompt menuntut artefak.
- `src/api/ai/objectiveVerifier.js`: kriteria test-evidence (code branch).
- `src/api/ai/builtinPlugins.js` + `CapabilitiesHub.jsx`: internetFirst.
- Tests: learnedSkillsTelemetry (10), selfHealing+R1c, objectiveVerifier+R1c (3), builtinPlugins+D1.

## Hasil verifikasi
- 4 file paket: 91/91 hijau. Regresi tetangga: 21/21.
- ESLint file baru/ubah: 0 error (warnings file lama = pre-existing).

## Batasan dikenal
- Trial tidak auto-graduate (butuh pemicu: nudge 10-turn / curator idle — iterasi berikut).
- Eval mini skill (evalPassed) belum ada UI/pemicu — manual via graduateTrialSkill.
- MEMORY_TOOL_SPEC (Hermes-1) belum di-wire — iterasi berikut.
