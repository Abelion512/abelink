# Session 2026-09-26 — Penegakan invariant model + kebersihan repo (branch feat/tui-opentui)

Mode: build. Permintaan: "fix anything wrong in this codebase by the chat and your suggest".
Tidak commit/push (gate manusia). Tree membawa perubahan dari sesi lain — hanya file di
bawah yang disentuh sesi ini.

## Temuan (semua diverifikasi, bukan dugaan)

| # | Temuan | Bukti | Root cause | Fix |
|---|---|---|---|---|
| F1 | `FORBIDDEN_MODELS` dideklarasikan tapi **tidak pernah ditegakkan** | `grep -rn FORBIDDEN_MODELS` hanya menemukan definisi + komentar; `resolveCliAuth` meloloskan `claude-work`; `tests/cliHeadless.test.mjs` justru mengunci passthrough | Keputusan owner (larangan `claude-work`) mendarat sebagai konstanta mati + daftar hardcode lokal di `modelCatalog.mjs` | `isForbiddenModel()` + `forbiddenModelError()` di `headlessCli.js`; `resolveCliAuth` mengembalikan `forbidden`; guard di 4 entry |
| F2 | Daftar terlarang terduplikasi | `modelCatalog.mjs:129` default `['claude-work']` terpisah dari `FORBIDDEN_MODELS` | Dua sumber kebenaran | `engine.mjs` mengoper `FORBIDDEN_MODELS` eksplisit ke `resolveCatalogModel` |
| F3 | Respons provider kosong lolos sebagai "sukses" | Probe 2026-09-26: `oc/muse-spark-...` → `200` + `content: ""` + `finish_reason: "in_progress"`; `{}` → `data.choices[0]` = TypeError mentah | `ai-bridge.js:857` mengakses `data.choices[0].message` tanpa guard bentuk/isi | Guard: tanpa `choices` → pesan jujur; `finish_reason` non-`stop` + teks kosong → pesan jujur (bukan turn kosong) |
| F4 | `opencode/` (clone pihak ketiga) untracked **dan tidak** di-gitignore | `git check-ignore opencode/` → tidak cocok; `git status` → `?? opencode/` | Clone riset ditaruh di root tanpa entry ignore | `/opencode/` di `.gitignore` |
| F5 | Isolasi test tidak hermetik untuk kredensial | `loadNineRouterKey` selalu `~/.9router/db/data.sqlite`; tidak ada override | Path di-hardcode ke HOME | Override `ABELINK_9ROUTER_DB` (ABELINK_HOME tetap **tidak** menggeser — itu data 9Router, bukan app) |

## Yang dibangun

- `src/api/ai/headlessCli.js`: `isForbiddenModel()` (case-insensitive) + `forbiddenModelError()`;
  `resolveCliAuth` mengembalikan `forbidden` (tetap never-throws, **tidak** menukar model —
  tanpa fallback sesuai keputusan owner); `loadNineRouterKey` hormati `ABELINK_9ROUTER_DB`.
- `cli/tui/engine.mjs`: `assertModelAllowed()` di choke point `runPrompt` (model bisa datang
  dari `cli.json`/env lama, bukan cuma `/model`); `/model` mengoper `forbidden` dari
  `FORBIDDEN_MODELS`.
- `bin/abelink.mjs` + `bin/abelink-tui.mjs`: tolak di entry (`process.exit(2)` + pesan jujur).
- `bin/abelink-tui-v2.tsx`: tolak sebelum `render()` (pesan awal, nol request terkirim).
- `sidecar/main/ai-bridge.js`: guard bentuk + isi respons chat/completions.
- Tests: `cli-tui-v2` +2 (`/model claude-work`, prompt dengan model terlarang → error tanpa
  `runTurn`), `cliHeadless` +1 (`isForbiddenModel` + flag `forbidden`).

## Verifikasi

- `bunx vitest run` **147 file / 1675 test hijau** (termasuk `tests/syntax-prose.test.mjs`
  yang sebelumnya order-dependent; lihat Batasan).
- `bunx eslint --no-cache` file tersentuh → 0 errors.
- E2E nyata (pipe, `ABELINK_HOME` tmp):
  - `-m claude-work` → exit **2** + `[TUI] Model "claude-work" dilarang (training-data)...`
  - `/model claude-work` → `[ERROR]: "claude-work" dilarang...`, model tidak berubah.
- `git check-ignore -v opencode/` → cocok `.gitignore:15`.

## Batasan dikenal

- **`.tsx` masih nol lint/typecheck** (temuan lama, belum ditutup). ESLint hanya `**/*.{js,jsx}`;
  tidak ada `@typescript-eslint/parser`/`typescript-eslint` terpasang, dan `typescript` hanya
  transitif di `node_modules` (5.9.3, tidak dideklarasikan). Menutupnya = menambah devDependency
  + lock + CI step → butuh keputusan pemilik (menyentuh dependensi & frozen lockfile).
- **Flaky `tests/syntax-prose.test.mjs > gmail-list … parsePagination`** tidak tereproduksi
  (hijau di run penuh sesi ini, hijau 3/3 isolasi). Tetap dicatat sebagai risiko order/state;
  jangan dianggap selesai sampai ada run merah yang bisa direproduksi.
- Perubahan sesi lain (±40 file) masih menumpang di branch ini; pisahkan sebelum PR.
- TUI v1 (`bin/abelink-tui.mjs`) masih jalur fallback; guard ditambah, tapi migrasi ke engine
  bersama belum dilakukan.

## Callback

1. Putuskan toolchain TS (parser lint + `tsc --noEmit`) — satu PR kecil menutup `.tsx` dari
   blind spot sebelum refactor JS→TS.
2. Pisahkan commit per slice & buka PR dari branch ini.
