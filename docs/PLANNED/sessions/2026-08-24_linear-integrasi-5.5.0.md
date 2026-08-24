# Linear Tracking — Integrasi 5.5.0 (mark-agent-linux)

Base kanonik: `5.5.0` @ `2957e50` (pushed) — official upstream 0281791 + layer Linux + merge fitur.
Branch kerja lokal: `merge/all-to-5.5.0` (sama dengan remote 5.5.0).

## ✅ SELESAI (merged ke 5.5.0)

| # | Task | Source | Commit | Status |
|---|------|--------|--------|--------|
| 1 | Sync official b8b0d6f..0281791 (approval always-allowed-paths, tg /accept /always /reject, ConfirmModal, dsb.) | sync-upstream-0281791 | 3696921..26f90d6 | DONE — jadi base |
| 2 | Orb easter eggs (4-egg pool date/quote/mood/matrix; jam eksklusif fullscreen; auto-hide 15s; window-state IPC) | pr-orb-fix (port file-level, WA-bridge diabaikan) | dc29a14 | DONE |
| 3 | Lite Mode (RAM detect IPC, LiteBadge dismissible, hash embedding fallback, skip boot model load, MemoryVisualizer fallback) | lite-mode-rebase | 985c3b2..2ba1806 | DONE |
| 4 | Fullscreen window control button + IPC window-fullscreen | worktree-fullscreen | 8500781 | DONE |
| 5 | CSP unsafe-eval + blob untuk Transformers.js WASM | cd/loving-solomon-613d68 | 213b2b3 | DONE |
| 6 | perf lazy-load transformers wasm (-49% entry bundle) + vectorLoader/vectorCore arsitektur | feat-perf-rebased | 2957e50 | DONE |
| 7 | refactor ProcessPanel (drop dropdown Proses Pemikiran) + main.css | worktree-compact-ai-layout | 6f05d84 | DONE |

## ⏳ BACKLOG (butuh port menyeluruh — jangan merge buta)

| # | Task | Source | Catatan |
|---|------|--------|---------|
| B1 | Two-column home layout (orb+answer kiri, Detail Informasi kanan saat jawaban panjang; TLDR under orb) | worktree-compact-ai-layout e21e349+b56bc00 | Ditulis di atas tree lama; MarkHome sekarang punya egg+panel baru → port layout manual per-hunk |
| B2 | music-recent tool + local playback history fase 1 | feat/voice-live-panel 8918052,70d30f7 | 8 file di atas arsitektur musik lama; planning/useMarkMusic/YT context sudah evolve |
| B3 | YT Music playback via music.youtube.com + track-event fallback judul | feat/voice-live-panel 0794bd7 | Eval dulu apakah masih relevan dgn player sekarang |
| B4 | Security hardening (webSecurity:true, sandbox note, WA bot opt-in) | cd/friendly-visvesvaraya-3a533a 2d484fb | Dibuat di tree lama berisi WA bridge yang sudah tidak ada; pilah hunk security saja |
| B5 | PR CI workflow trigger untuk base 5.5.0 | 2a2865c | Sudah masuk; verifikasi workflow Build jalan di GitHub |

## 🗑️ TIDAK DI-MERGE (stale/superseded)

- pr-fix (5009fd3) — superseded oleh pr-orb-fix
- pr-base, pr-orb-fix-base, perf-backup-master-base, merge-*-backup/backup-pre-filter, merge-tmp, merge-upstream-abandoned, pr/merge-5.5.0-resolved — backup/snapshot
- fullscreen-btn (=597c17d tanpa unique), perf/lazy-whisper-boot*, compact-ai-layout-rebase, feat/performance-and-readibility, master lama — lineage tua, konten sudah terwakili

## Catatan teknis

- `vectorMemory.js` = facade: generateVector lazy via vectorLoader + cabang isLiteMode→hashEmbedding(384d FNV)
- `oramaStore.js`/`ragPipeline.js` versi BASE dipertahankan (theirs kehilangan findSimilarMemoryClusters dll.), hanya import diganti ke vectorLoader
- Window-state IPC (main broadcast + preload onWindowState/getWindowState) dipakai orb egg
- Sesi agent lain pernah aktif di repo ini (worktree-fix-orb-click dsb.) — koordinasi sebelum rewrite file yang sama
