# Session Log — PR1: Trajectory Supervisor + CI Hijau + UX/Telegram Fixes

## Ringkasan

**Keywords:** trajectory supervisor, supervisor lintasan, PR merge, pull request, CI fix, gitleaks permission, sidecar resource, bridge-core import, codeql hapus, GHAS, error provider, AI fetch gagal, 9Router mati, Gemini sorry page, rate limit, anti-hammer, browser auto-launch, xdg-open, telegram double respon, polling race, approval tg-control, log spam, console noise.

Tanggal: 2026-09-11. Branch: `feat/trajectory-supervisor` → merge commit `a472781` ke `main` (PR #1, CI hijau penuh incl. Bundle AppImage/deb).

Sesi raksasa multi-agen: (a) Trajectory Supervisor Fase 1 deterministik (penulis log ini); (b) Fase 2 sesi agent lain (lineage/scoring/strategy-lib/bench-axis, sudah di branch saat tiba); (c) perbaikan CI merah kronis (sidecar resource, import path, gitleaks, CodeQL); (d) error AI ramah (Rust menelan pesan + atribusi provider salah); (e) browser auto-launch OS; (f) Telegram connect-putus/double-respon/approval; (g) Gemini sorry-circuit + log-spam cleanup; (h) UX kecil (ikon window-2, menu Trajectory, single-user, hamburger dot).

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
|---|---|---|---|---|
| CI Rust exit 101 tiap push | `.github/workflows/tauri.yml` | Tauri build script embed `../dist-sidecar/abelink-engine`, tidak ada di runner fresh; deadlock (job bundle yang membuatnya butuh Rust hijau) | Step `bun run build:sidecar` sebelum `cargo check` | ✅ CI hijau |
| `bun run build:sidecar` rusak | `sidecar/main/tools/{browserTools,fsTools,shellTools}.mjs` | 8 dynamic import `./browser/bridge-core.mjs` (tidak ada; yang benar `../browser/`) | Betulkan path (1x replaceAll kebablasan line 2, diperbaiki) | ✅ build OK |
| CodeQL merah semua job | `.github/workflows/codeql.yml` | Repo private tanpa GHAS → upload SARIF 403 selamanya | Hapus file (owner setuju); catat restore saat GHAS ada | ✅ |
| Gitleaks merah di PR (bukan bocor) | `tauri.yml` secrets job | `contents:read` saja → `GET /pulls/{n}/commits` 403 | Tambah `pull-requests:read` | ✅ |
| "AI fetch gagal" buta | `src-tauri/src/cmd_node_bridge.rs:410` | Ekstraksi error hanya `as_str()` → error objek `{message,code}` jadi `None` | Helper `error_message()` + 4 unit test | ✅ 18/18 Rust |
| Provider salah tuduh | `sidecar/main/ai-bridge.js` | Endpoint apapun mati → "LM Studio mati port 1234" | `providerOfflineMessage()` per provider + test | ✅ |
| Renderer fallback buta | `src/api/ai/fetchError.js` (baru) | Fallback string generik | Mapping ramah + test | ✅ |
| Test mission_scope flake acak | `src-tauri/src/mission_scope.rs` | Static global + test paralel tanpa kunci | Mutex serial di test-only | ✅ 3x stabil |
| Telegram connect-lalu-putus | `telegram-service.js` | `updateStatus('connected')` sinkron + catch→stop permanen | Retry 5x backoff; 401/404 saja fatal; generasi anti start-ganda | ✅ |
| Telegram stuck connecting | `telegram-service.js` | `await bot.launch()` tak pernah kembali saat sehat (polling pending selamanya) | Race 25s: timeout = connected; late-death → getMe → putus jujur | ✅ |
| Telegram double-respon | `telegram-service.js` | Dua start bersamaan → dua poller satu token | Stop unconditional + alive() per await + idempotensi msgId | ✅ |
| Izin tg:start tiap klik | `approval_policy.rs` | Family tg-control default ask | Default session (sunyi/runtime; user bisa set ask di UI) + test | ✅ |
| Typing + LOADING dobel | `telegram-service.js` | Bubble LOADING + typing bersamaan | Hapus bubble LOADING; typing saja | ✅ |
| Gemini sorry → dump HTML + hammer | `services/gemini-web.js` | 302 google.com/sorry; retry tiap giliran perpanjang blokir | Deteksi sorry → error ramah berkode + sirkuit 3x→cooldown 5 mnt | ✅ |
| Span/p di answer (AI slop) | `builtinPlugins.js` + `planning.js` | Aturan MODE OBROLAN memerintah "cerewet" menindih caveman | Caveman: anti-HTML + ~3 kalimat; lunakkan aturan chat | ✅ |
| Console spam | `oramaStore.js`, `planning.js`, `core.js`, `useAwareness.js` | Debug per-turn/query; DEV-gate sia-sia (owner jalan dev) | Hapus (estimasi token dipertahankan) | ✅ |
| Ikon hilang window-2 | `cmd_music.rs` | music_player tanpa set_icon | set default_window_icon (clone, bukan move) | ✅ cargo |
| Trajectory yatim | `FloatingMenu.jsx`, `DeveloperSection.jsx` | Route ada, link tidak ada | Sempat hamburger → pindah Developer saja (non-IT) | ✅ |
| Hamburger dot merah abadi | `FloatingMenu.jsx` | AbelinkHome tak oper tgStatus → default disconnected | Berlangganan sendiri (initial + event) + state connecting | ✅ |
| Multi-sender mati | `planning.js`, `useAbelinkAgent.js` | `options.waContext` tak pernah diisi | userId selalu 'owner' (single-user eksplisit) | ✅ |
| Browser tutup = tool mati | `browser/launcher.mjs` (baru) | Tak ada yang membukakan browser | xdg-open + tunggu handshake 20s, default AKTIF (owner mau otomatis) | ✅ 9 test |
| Musik 1 LLM call sia-sia | `ai/tools.js`, `useAbelinkMusic.js` | Rank LLM selalu jalan walau top-1 jelas | `trustworthyTopHit()` deterministik konservatif | ✅ 5 test |
| bench-gate flake | `evaluation/bench-gate.mjs` | Single-sample 5-12ms di mesin beban (terbukti di main murni) | Median 3 run, threshold utuh | ✅ stabil 0.9ms |

## Files Modified

PR #1 penuh: 25+ commit (supervisor F1, Fase 2 sesi lain, eval axis, semua fix di atas). Lihat `git log main --oneline` pasca `a472781`. Untracked milik sesi lain (jangan sentuh): capabilities audit + `docs/PLANNED/sessions/2026-09-11_fix-capabilities-audit.md`.

## Agent Learnings

1. **Asumsi terbalik Telegraf**: `await bot.launch()` sehat = pending selamanya. Verifikasi ke source sebelum meng-await (efek: stuck connecting).
2. **`replaceAll` edit makan tetangga**: selalu grep ulang path yang sudah benar di file yang sama.
3. **Rantai error 3 lapis**: pesan hilang di BATAS (Rust as_str), bukan di sumber — trace bentuk data antar-lapis dulu.
4. **CI merah ≠ kode salah**: baca log via API (`/actions/runs/{id}/logs` zip) — 3 akar kali ini semuanya lingkungan/protokol.
5. **Flake gate butuh kontrol main murni** (worktree) sebelum menuduh diff.
6. **Perf/bench gate load-sensitive**: median + noise floor; jangan `perf:save` saat mesin sibuk.
7. **DEV-gate log sia-sia bila owner jalan dev** — hapus, bukan gate.
8. **Tanya gejala dulu** untuk "fix X" tanpa spesifikasi (Telegram: 1 pertanyaan menghemat 1 jam tebak-tebakan).
9. **Commit message typo → amend + force-with-lease** di branch PR sendiri, bukan commit fix baru.

## File Invariants

- `src-tauri/src/cmd_node_bridge.rs`: `NodeResponse.error` tetap `Option<String>` — objek error HARUS lewat `error_message()`.
- `sidecar/main/browser/bridge-core.mjs`: path impor dari `tools/` = `../browser/`, dari `main/` root = `./browser/`.
- `evaluation/bench-baseline.json` + `perf-baseline.json`: jangan save saat mesin berbeban.
- `docs/PLANNED/sessions/*.md`: append, jangan overwrite (aturan skill ini).

## Verification Checklist

- [x] `bunx vitest run` 571 passed (akhir sesi)
- [x] `bash scripts/verify.sh` LOLOS
- [x] `cargo test` 18-19/19 stabil berulang
- [x] CI PR hijau semua job; CI main pasca-merge hijau incl. Bundle
- [x] Sidecar `build:sidecar` + ping smoke OK
- [ ] E2E manual user (bot connect, 1 pesan = 1 balasan, ikon window-2) — butuh restart `tauri dev`

## Callback

PR2 long-horizon direncanakan di `docs/PLANNED/pr2-long-horizon.md` — setujukah eksekusi Fase A (budget skala-effort + resume durable + trace injeksi, semua offline) di branch baru sekarang?
