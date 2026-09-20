## Ringkasan

**Keywords:** ponytail cleanup, dependency pruning, dead file removal, axios fetch, icon migration, depensi mati, bersih-bersih kode

- Tanggal: 2026-09-20, branch: `chore/ponytail-cleanup-p1p2` (dari `apple-design@325feb7`), 4 commits.
- Apa & kenapa: eksekusi ponytail-audit P1+P2 (scope approved user) — hapus file mati, drop 8 deps (~250MB node_modules), ganti ke native/CSS. Tanpa ubah perilaku.
- Audit Trail: grep `ponytail|cleanup|dead.code|unused.dep` → hits hanya sesi lama tak-terkait (branch-cleanup-doc-rules, boot-overlay, dst); `git log --grep` → tidak ada sesi dep-cleanup sebelumnya. Patch baru, bukan duplikat.
- Status: DONE — lint 0 err, vitest 1159/1159, vite build OK, cargo check + clippy OK.

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
|---|---|---|---|---|
| Audit klaim dexie-export-import mati — SALAH, legacy path live | `Configuration.jsx:258` + `App.jsx:220` first-boot chooser | Audit subagent tidak cek reachability | KEEP dep, catat di commit msg | ✅ |
| Audit klaim debt 19 markers — 5 no-trigger, selebihnya trigger valid | berbagai | — | Ledger di plan, tidak diubah (deferral sadar) | ✅ |
| Stash concurrent basi (stray brace fix sudah di-HEAD `c1d2810`) | `extension/background.js` | Sesi browser lain commit duluan | `git stash drop`, recreate branch dari HEAD | ✅ |
| `cargo check` gagal pasca-hapus `dist-sidecar/` | build script tauri | Artifact ignored dibutuhkan build.rs | `bun run build:sidecar` lalu check OK | ✅ |
| lucide tanpa brand icon | `ThinkingBubble.jsx` FaYoutube | Lucide hapus brand icons | `SquarePlay` generik | ✅ |
| Subagent drop FaGithub/FaExternalLinkAlt/FaRobot di CapabilitiesHub tanpa verifikasi | `CapabilitiesHub.jsx` | — | Diverifikasi: zero JSX usage, aman | ✅ |
| StatusIndicator pakai `TriangleAlert` vs `AlertTriangle` di file lain | `StatusIndicator.jsx` | Dua subagent paralel, alias berbeda | Keduanya file .mjs valid di lucide 1.34.0, OK | ✅ |

## Files Modified

| File | Perubahan |
|---|---|
| 11 tracked files (commit `84dc2e3`) | `git rm`: BUSINESS_VISUALIZATION.md, audit/*.md (3), reports/bench-*-live.json (3), LiveAudio.jsx, FloatingMenu.jsx, electron.svg, wavy-lines.svg |
| `browserTools.mjs`, `useAbelinkYoutube.js`, `Guidebook.jsx`, `package.json` (commit `bc98a99`) | axios→fetch + AbortSignal.timeout; -axios -date-fns |
| 7 files (commit `a82d1cd`) | motion→CSS, force-graph→list, highlighter→pre/code, three→OrbVisualizer wrapper; -639/+85 |
| 23 files + bun.lock (commit `885c49e`) | 21 files icons→lucide, Monaco→textarea; -monaco -motion -force-graph -highlighter -three -react-icons |
| Local only (untracked/ignored) | `rm -rf dist dist-sidecar .eslintcache graphify-out/{cache,graph.html,graph.json,manifest.json,2026-09-*,2026-09-20}` |

Tidak diubah (sengaja): `PROJECT-STATUS.md` (dirujuk docs/README.md), `graphify-out/GRAPH_REPORT.md` (dirujuk .agents/rules/graphify.md), `extension/`, `dexie-export-import`, code-slim list (effortSystem, sessionCompactor, dsb — PR terpisah).

## Agent Learnings

- Verifikasi klaim audit sebelum eksekusi — 2 klaim salah tertangkap (dexie-export-import live, PROJECT-STATUS/GRAPH_REPORT dirujuk). `grep reachability` > percaya ringkasan subagent.
- Satu sesi asing concurrent di worktree yang sama (commit+reset antar-call). Pola selamat: `git stash show -p` → bandingkan HEAD → drop bila obsolete → recreate branch dari HEAD terkini, commit kecil-cepat tiap fase.
- `cargo check` butuh `dist-sidecar/abelink-engine` (build.rs resource) — hapus artifact ignored = rebuild dulu via `bun run build:sidecar`.
- `git add -A` gagal bila argumen campur path ignored; staging tetap jalan parsial — cek `git status` sebelum commit.
- Untracked `docs/RESEARCH/eval-feedback-loop.md` milik sesi lain — exclude eksplisit dari add/commit.

## File Invariants

- `src/components/core/JarvisOrb.jsx` — wrapper API-kompatibel `{status,intensity,size}` ke OrbVisualizer; home tidak diubah. Jangan kembalikan three tanpa ukur.
- `src/components/core/MemoryVisualizer.jsx` — list-only; `handleSelectNode` preserves on-demand `getDocumentChunk`. Jangan tambah graph lib tanpa ukur RAM.
- `CapabilitiesHub.jsx` — textarea + validasi `AsyncFunction` inline (baris ~344). Syntax check tetap jalan tanpa Monaco.
- `useAbelinkYoutube.js` oembed — `fetch` + `res.ok` check; error shape `{judul,author,thumbnail,success}` tidak berubah.
- `browserTools.mjs` — `fetch` + `AbortSignal.timeout`; header response via `.get()` bukan `[]`.

## Verification Checklist

- [x] `bun install` — 8 packages removed
- [x] `bun run lint` — 0 errors, 979 warnings (pre-existing)
- [x] `bunx vitest run` — 114 files, 1159 tests pass
- [x] `bun run build` — 1m31s OK
- [x] `cargo check` + `clippy -D warnings` — Finished OK
- [ ] `bash scripts/verify.sh` penuh (perf/bench gates) — pending pre-push/PR
- [ ] Visual check: boot hello draw, slider knob, memory list, orb toggle, plugin/skill textarea

## Callback

PR ke `main` sekarang, atau tunggu `verify.sh` penuh dulu?
