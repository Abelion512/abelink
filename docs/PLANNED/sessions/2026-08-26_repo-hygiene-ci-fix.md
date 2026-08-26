# Session Log — 2026-08-26: Repo Hygiene, CI Workflow Fix, Branch Tracking

## Ringkasan

**Keywords:** repo hygiene, branch tracking gone, mark-linux remote, prune stale refs, upstream-sync linear fail, codeql rust matrix, vitest include mjs, orphaned test deletion, archive security scan, pytest cache, upstream-diff-report untracked, electron deps leftover

- **Tanggal:** 2026-08-26 | **Branch:** 5.5.0 | **Pemicu:** audit infra (P1 CI tak menjalankan test; P2 aneka hygiene).
- Temuan kunci: branch kerja `5.5.0` menunjuk `origin/5.5.0: gone` (repo origin sudah tidak ada); remote hidup = `mark-linux`. Ref `pr-1..pr-9` hanya sisa tracking lokal.

**Audit Trail:** topik hygiene umum tumpang-tindih dengan banyak log lama secara parsial, tapi kombinasi scope ini baru; verifikasi per-item di tabel. Scope BARU untuk item yang dicantumkan.

## Temuan dan Fix

| Finding | Area | Root Cause | Fix | Status |
|---|---|---|---|---|
| P2 tracking remote mati (`git push` gagal) | git config branch 5.5.0 | origin/5.5.0 dihapus di GitHub | `git branch -u mark-linux/5.5.0` | DONE |
| P3 ref pr-1..9 usang | remote-tracking refs | PR lama terhapus di remote | `git fetch --prune mark-linux` -> 0 sisa | DONE |
| P1 workflow upstream-sync selalu gagal | .github/workflows/upstream-sync.yml | step Linear memanggil CLI `linear` yang tidak ada + secret tidak di-inject | step dihapus, deteksi dipertahankan, report jadi artifact; catatan alasan di header workflow | DONE |
| P2 CodeQL tidak memindai Rust | codeql.yml | matrix tanpa rust | + `- language: rust / build-mode: none` | DONE |
| P2 test orphan mengimpor modul yang sudah tidak ada | tests/skill-sanitizer.test.mjs | module skill-sanitizer.js hilang saat migrasi | file test dihapus (modulnya memang sudah tiada) | DONE |
| P2 stress-watermark*.test.mjs bukan suite vitest | tests/ | script mandiri ber-ekstensi .test.mjs, diam-diam dieksklusi include lama | rename -> `.harness.mjs`, self-reference path dibetulkan, `bun run test:harness` + masuk verify.sh | DONE |
| P3 artefak generator di-commit lalu busuk | upstream-diff-report.json | output script di-track | git rm --cached + gitignore | DONE |
| P3 folder scan security v4.0 usang di root | CLAUDE-SECURITY-20260729-010711/ | sisa audit era Electron | diarsipkan ke docs/archive/2026-07-29-claude-security-scan-v4/ | DONE |
| P3 .pytest_cache basi | root | sisa eksperimen python | dihapus | DONE |

## Files Modified

.gitignore, .github/workflows/{upstream-sync,codeql,tauri}.yml, tests/{skill-sanitizer.test.mjs hapus; stress-watermark* rename}, scripts/verify.sh, package.json, docs/archive/** (pindahan), git config (tracking).

## Agent Learnings

- `git branch -vv` rutin dicek saat pindah remote; `[origin/x: gone]` adalah bom waktu untuk push -u ke remote salah.
- Workflow cron yang satu langkahnya pasti gagal lebih buruk dari tanpa workflow: merah setiap hari melatih mata abai alarm.
- File `.test.mjs` yang bukan suite (self-running harness) harus dibedakan ekstensi agar gate `vitest run` bermakna.

## File Invariants

| File | Invariant |
|---|---|
| scripts/verify.sh | Urutan gate: vitest -> harness -> vite build -> cargo check; semua WAJIB hijau sebelum tag rilis. |
| docs/archive/** | Arsip read-only historis; jangan diupdate, buat file baru bila perlu. |

## Verification Checklist

- [x] git branch -vv menunjukkan [mark-linux/5.5.0] tanpa gone
- [x] git branch -a tanpa ref pr-*
- [x] vitest hijau dengan include baru; harness pass standalone
- [x] upstream-sync.yml valid YAML tanpa step mati
- [ ] Push commit ke mark-linux dan pastikan CI tauri.yml jalan di push branch 5.5.0

## Callback

Remote `origin` (Abelion512/mark-agent) ternyata sudah tidak ada — mau dihapus saja dari konfigurasi lokal biar tidak membingungkan, atau ada rencana repo itu dihidupkan lagi?
