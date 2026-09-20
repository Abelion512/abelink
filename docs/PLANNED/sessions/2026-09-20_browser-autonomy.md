# Session 2026-09-20 — Browser Autonomy Restoration (P0–P3 + co-pilot HITL)

## Keputusan
- Vonis trajectory `2026-09-20`: sistem picu + model ikut salah (per-insiden, bukan satu pihak).
- Preferensi user: semua P sekaligus; HITL poll+tombol; tab status-quo + anti-duplikat + adopt eksplisit; akurasi > token.
- Eksekusi: 3 worktree/branch paralel off `apple-design` (`feat/browser-ext-autonomy`, `feat/browser-sidecar-autonomy`, `feat/browser-ui-eval-autonomy`), merge `--no-ff` ke `apple-design`. `main`/`origin/main` TIDAK disentuh.
- Plan doc: `docs/superpowers/plans/2026-09-20-browser-autonomy-restoration.md`.

## Berkas berubah (di apple-design)
- `extension/background.js`: tagger main-first 200/120, identitas tab (`_group`+`sessionFocusedUrl`), `awaitingUser` skip-veil + pill pasif, `adoptUserTab` dihormati (+fix typo `excludeIds`, hapus brace nyasar).
- `extension/{tagger-rank,tab-identity,overlay-policy,popup-status}.mjs`: helper murni baru.
- `extension/popup.{js,html}`: status loop-based.
- `sidecar/main/browser/{bridge-core.mjs (focusedTab, no-drain),nav-query.mjs}`.
- `sidecar/main/tools/{browserTools.mjs (navigate/extract/ask pause-state),extract-query.mjs}`.
- `sidecar/main/syntax-validator.js`: bypass prosa `.md/.markdown/.txt/.rst/.log`.
- `src/api/tools/toolCatalog.js`, `src/api/ai/planning.js` (co-pilot + no-surrender), `src/hooks/agent/plan/{toolDispatcher.js,browserResume.js}`, `src/hooks/agent/useAbelinkPlan.js` (pause-state, resume same-tab, batch halt).
- `evaluation/{abelink-eval.mjs,hitl-discipline.mjs}`: dimensi `hitl_discipline`.
- Tests baru: tagger-accuracy, tab-identity (+ext), extract-contract, syntax-prose, copilot-ui (+ext), handshake-honest, hitl-discipline; update: session-tab-isolation, browser-bridge (isolasi), browser-flavor, browser-ask.

## Hasil verifikasi
- `bunx vitest run`: 114 files, 1159 tests PASS.
- `bun run lint`: 0 errors (985 warnings = baseline repo; file baru bersih).
- Scoped eslint file sentuh: 0 errors.

## Batasan dikenal
- HITL poll v1: tanpa deadline + sinyal DOM saja; auto-lanjut penuh belum ada.
- Drain lintas-sesi dihapus: subagent tanpa sesi default butuh sesi sendiri.
- `takeNext` tanpa sesi = null (bukan error) — caller wajib cek.
- Stash `chore/ponytail-cleanup-p1p2` milik sesi lain dititipkan (`stash@{0}`) — JANGAN drop; kembalikan ke pemiliknya.
- Worktree `.wt-browser-*` + branch worker belum dihapus (butuh hapus pasca-stabil).
