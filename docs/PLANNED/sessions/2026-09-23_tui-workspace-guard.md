# Session 2026-09-23 — TUI workspace guard + ponytail debt/gain/audit

Mode: build. Request: "implement task tersisa and use ponytail for debt, gain, dkk".

## Status awal

- Tasks 1-7 (Jarvis slice, `tasks/todo.md`) SUDAH mendarat di tree, belum commit:
  `src/api/ai/archPolicy.js` + truth-table test, migrasi 2 call site renderer,
  adapter bench + supervisor/verify-gate asli, trace GOVERNANCE + metrik,
  `ARCH_AXIS_IN_BENCH_PATH = true`, `PR46_MINIMAL_OFFLINE` 3 fixture OS.
  Bukti: `tests/archPolicy.test.mjs` 5/5, `tests/benchGovernance.test.mjs` 4/4,
  `bun evaluation/smoke.mjs` LOLOS.
- Sisa nyata dari `task.md`: T1 (TUI hang/exit-0) + T2 (E2E fitur TUI).

## T1 — root cause + fix

- Repro deterministik: `--workspace /tmp/x` ke dir HILANG =
  `/init` -> `[ERROR]: ENOENT ... open '/tmp/x/AGENTS.md'`,
  `!echo` -> `[! exited ENOENT]` (shell `cwd` tak ada).
  Dir ada = 5/5 run hijau (`Draf AGENTS` + `SHELL-OK`, exit 0).
  Hang kosong total tak terepro di tree ini (early-collector replay sudah benar);
  laporan "EXIT:0 kosong" = varian dingin dari ENOENT yang sama.
- Fix (2 baris + 2 komentar ponytail):
  `bin/abelink-tui.mjs:403` + `bin/abelink.mjs:318`:
  `try { fs.mkdirSync(cliOptions.workspace, { recursive: true }) } catch {}`.
  Plus `import fs from 'node:fs'` di `bin/abelink.mjs` (TUI sudah punya).
- Verifikasi: missing-workspace 3/3 hijau, ENOENT 0; T2 E2E (`@note.txt`,
  `/details`, `/thinking`, `/models`) jalan; `cli-tui`+`cli`+`cliHeadless`
  102/102; eslint 0 errors file tersentuh.

## ponytail-debt — 25 markers, 8 no-trigger

Ledger (tanpa `.abelink/codebase-index.json` cermin):
`src/api/ragPipeline.js:3`, `src/api/db.js:295`, `src/api/ai/planning.js:837,868`,
`src/api/ai/playbooks.js:7`, `src/api/ai/core.js:182`, `src/api/ai/agentDecision.js:85`,
`src/components/Chat/CodeBlock.jsx:2`, `src/components/core/JarvisOrb.jsx:1`,
`src/components/core/ElasticSlider.jsx:30`, `src/components/core/MemoryVisualizer.jsx:8`,
`src/components/core/AppleHello.jsx:11`, `src/components/WhatNew.jsx:5`,
`src/pages/AbelinkHome.jsx:94`, `scripts/bump-version.mjs:76`,
`scripts/release-version.mjs:32`, `scripts/release-helper.mjs:485`,
`src-tauri/.../window_tracker.rs:61`, `sidecar/main/services/gemini-web.js:39,43`,
`sidecar/main/browser/native-host.mjs:93`, `evaluation/bench/boundary-abelink.mjs:50`,
`evaluation/effort-fixtures.mjs:153`, `.github/workflows/release.yml:133`,
`eslint.config.mjs:46`.
No-trigger (tanpa upgrade path eksplisit): ragPipeline, db, core, CodeBlock,
JarvisOrb, MemoryVisualizer, native-host, eslint — kandidat rot bila dibiarkan.

## ponytail-gain — scoreboard (benchmark median, bukan repo ini)

```
  ponytail gain                     benchmark median · 5 tasks · 3 models

  Lines of code   no-skill  ████████████████████  100%
                  ponytail  ██▌·················    6–20%   ▼ 80–94%
  Cost            no-skill  ████████████████████  100%
                  ponytail  █████▌··············   23–53%  ▼ 47–77%
  Speed           ponytail  ▸ 3–6× faster
```

## ponytail-audit — temuan peringkat

- `shrink bin/abelink.mjs:249 + bin/abelink-tui.mjs:308`: `createSidecarClient`
  ~65 baris identik. Ekstrak `bin/sidecar-client.mjs`, dua file import. [belum dikerjakan — sentuh 2 entry point + test CLI, sesi sendiri]
- `shrink` helper murni TUI (`parseSlashCommand`, `resolveFileRefs`, `buildAgentsMd`):
  single-use di luar test TAPI itu API teruji — bukan bloat, jangan sentuh.
- net: ~-65 lines possible (satu temuan).

## Berkas berubah (sesi ini)

- `bin/abelink-tui.mjs`: auto-mkdir workspace (+1 baris + komentar).
- `bin/abelink.mjs`: import fs + auto-mkdir workspace (+2 baris + komentar).
- `PROJECT-STATUS.md`: langkah-1 stale ("belum tersambung") -> wired selesai-di-tree.
- Log ini (baru).

## Verifikasi akhir

- Full vitest: 1566/1569 (3 gagal flaky timeout, incl. `syntax-prose` gmail;
  lolos saat run solo; diff saya nol sentuh area itu — pre-existing).
- Smoke: LOLOS. ESLint file tersentuh: 0 errors.
- TIDAK commit (aturan repo: branch + PR ke `main`; user belum minta commit).
  `stash@{0}` sesi lain tak tersentuh.
