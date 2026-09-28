# Session 2026-09-28 — W0 Governance Migrasi TS (js-to-ts-spec.md)

Mode: build otonom (owner: "execute aja semua, lapor hasil kerja").
Branch: `refactor/ts-w0-governance` dari `main` @ `1fb086c`.

## Apa & kenapa

Wave pembuka spec `js-to-ts-spec.md` (goal 100% TS tanpa sisa, keputusan
interview owner K1..K14): governance + gates TANPA rename apa pun. Hasil
eng review (`/plan-eng-review`) D2/D3 dimasukkan di sini (extension CI
ditunda ke W8 sesuai rencana; smoke dual-path langsung dieksekusi).

## Perubahan

1. `scripts/ci/no-new-js.sh` (BARU): ratchet CI — file .js/.jsx/.mjs BARU di
   zona migrasi (src/sidecar/cli/bin/scripts/evaluation/tests) ditolak pada
   event pull_request; hanya jalan di CI (GITHUB_EVENT_NAME), exit 0 lokal.
2. `.github/workflows/tauri.yml`: step `No-new-JS ratchet` setelah typecheck
   di job frontend.
3. `scripts/verify.sh`: + step `[2b/9]` typecheck (gate payung + node) dan
   + `[6c/9]` smoke jalur HOT `bun sidecar/engine.mjs` (temuan D3: sebelumnya
   hanya binary compile yang di-smoke).
4. `docs/PLANNED/2026-09-26_js-to-ts-migration.md`: header SUPERSEDED ->
   `js-to-ts-spec.md`; marker handoff OPENCODE dibungkus komentar SUPERSEDED
   (teks dipertahankan sebagai sejarah; sinyal aktif dicabut).
5. `docs/PLANNED/2026-09-26_master-migration-program.md`: indeks P1 menunjuk
   `js-to-ts-spec.md`.
6. `js-to-ts-spec.md`: + §15 keputusan eng review (D1 lanjut as-is, D2
   extension CI di W8, D3 dual smoke, koreksi: `cli/core/protocol.ts` bukan
   duplikat kontrak frame; horizon pasca-P1: Agents -> Loops -> Graphs ->
   Self Improving Systems).
7. `docs/AGENT_CONTRIBUTION_GUIDELINES.md`: + §1b Siklus Kerja Otonom
   (Audit -> Fix -> Test -> [fail? auto-fix | pass? ponytail pass] -> Verify
   -> Loop), implikasi rename (ledger PONYTAIL + spec aktif wajib ikut), dan
   ringkasan sistem ponytail penuh (marker/DEBT/GAIN/AUDIT + sinkronisasi
   ledger via test).

## Keputusan

- Marker handoff TIDAK dihapus fisik: dibungkus komentar "[SUPERSEDED
  2026-09-28]" — sejarah tersimpan, watcher cron tidak lagi punya sinyal
  aktif. (Alternatif di spec K10 bilang "hapus"; owner juga minta dokumentasi
  workflow, jadi penyimpanan sejarah dipilih dan dicatat di sini.)
- Ratchet jalan hanya di CI (pull_request): push lokal/branch lain lolos,
  PR-lah yang dijaga — sesuai aturan kerja repo (semua lewat PR).
- verify.sh step 6c smoke jalur hot memakai `bun sidecar/engine.mjs` (path
  lama); PR W1-1 wajib update ke `engine.ts` di PR yang sama.

## Verifikasi (semua dieksekusi nyata)

- `bash -n scripts/verify.sh` OK; `bash scripts/ci/no-new-js.sh` exit 0
  (dilewati di luar CI, sesuai desain).
- `bun run typecheck` + `typecheck:node` exit 0.
- `bun run lint` exit 0 — 0 error, 0 warning.
- `bunx vitest run`: **1810 pass / 16 skip** (baseline 1788 naik karena
  sesi paralel; tidak ada regresi).
- Belum dijalankan: cargo check/clippy (tidak tersentuh kode Rust), vite
  build (tidak tersentuh renderer), smoke engine (tidak tersentuh engine).

## Batasan

- W0 tidak menyentuh file produktif — nol rename (sesuai DoD W0).
- Step typecheck baru di verify.sh menambah ~10-20s ke release gate lokal.
- Ratchet membandingkan `origin/<base>...HEAD`; PR draft tetap dijaga.
