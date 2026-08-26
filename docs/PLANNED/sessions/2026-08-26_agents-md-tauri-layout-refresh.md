# Session Log — 2026-08-26: AGENTS.md Refresh Layout Tauri + Banner Arsip

## Ringkasan

**Keywords:** AGENTS.md rewrite, dokumen agent context usang, tauri layout docs, ARCHITECTURE-INTERNALS banner status, constants re-verified, MAX_DRIFT 0.05, VAD RMS 0.01, electron path phantom, renderer isolation rule

- **Tanggal:** 2026-08-26 | **Branch:** 5.5.0 | **Pemicu:** audit infra P2 - AGENTS.md mendeskripsikan tree Electron (`src/main/**`, `src/preload`, `src/renderer`) yang sudah tidak ada; agent AI yang mengikuti dokumen ini mengedit path hantu.
- Rewrite penuh section 1-5 AGENTS.md untuk layout kini: `src/` renderer React 19, `src-tauri/` Rust shell, `sidecar/` engine fase A/B; ditambah gerbang keamanan non-negotiable (containment, allowlist deny-by-default, approval rfd native, CSP ganda) dan gate versi (sync-version dari tauri.conf.json).
- ARCHITECTURE-INTERNALS.md diberi banner status di bawah H1; isi historis tidak dirombak (nilai referensi perilaku modul yang kini hidup di sidecar/main dan src/api).

**Audit Trail:** git log --grep "AGENTS" + grep docs/PLANNED untuk "agents-md|layout tauri docs" -> tidak ada patch serupa sebelumnya (log terdekat: rust-hardening/version-reset 2026-08-26, scope beda). Scope BARU.

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
|---|---|---|---|---|
| Section 3 menyebut direktori hantu | AGENTS.md | belum diupdate saat migrasi | tabel dibangun ulang; setiap path diverifikasi ada dengan listing dir | DONE |
| Konstanta usang/salah | AGENTS.md sec 4 | nilai warisan tidak pernah dicek ulang | diverifikasi per-nama via grep: MAX_DRIFT 0.05 (bukan 0.01), VAD RMS 0.01 + cut 8 frame, threshold memori extended default 0.5 / turn-pair 0.3; baris CATEGORY_TEXTS 0.35 dihapus (sudah tiada); tambah baris baru (fs read cap 10MB, clamp bridge ~20k char, rotasi harness 50MB, poll 60s/idle 180s) | DONE |
| Rule proses boundary era Electron | AGENTS.md sec 5 | preload->IPC->main sudah tak relevan | diganti Renderer Isolation + Security Gates + Adding Sidecar Tools + Build & Version Gate | DONE |
| Referensi repo/owner lama | AGENTS.md sec 1 | masih Mazees/Windows | Maintainer Abelion512, homepage mark-agent-linux, upstream dicantumkan eksplisit | DONE |

## Files Modified

| File | Perubahan |
|---|---|
| AGENTS.md | rewrite section 1/2/3/4/5 (+138/-90); satu-satunya sebutan "Electron" tersisa adalah frasa sejarah migrasi di sec 1 |
| docs/ARCHITECTURE-INTERNALS.md | banner status 4 baris di bawah judul; body utuh |
| AGENTS.md (tambahan parent) | baris `src/cmd_misc.rs` pada tabel src-tauri (modul lahir bersamaan dengan penulisan dokumen) |

## Agent Learnings

- Dokumen context agent adalah KODE: salah path = kerja merusak. Setiap path dalam tabel harus lolos listing dir, setiap konstanta harus lolos grep nama sebelum ditulis.
- Nilai default yang berubah diam-diam antar refactor (drift 0.01->0.05, RMS 0.015->0.01) hanya ketemu kalau tabel konstanta diverifikasi ulang, bukan disalin.

## File Invariants

| File | Invariant |
|---|---|
| AGENTS.md | Dilarang menyebut path yang tidak ada; setiap edit berikutnya wajib verifikasi listing/grep. Gerbang keamanan sec 5 adalah kontrak non-negotiable. |
| docs/ARCHITECTURE-INTERNALS.md | Banner status jangan dihapus; body bersifat historis-referensial. |

## Verification Checklist

- [x] grep 'src/main/', 'src/preload', 'src/renderer' di AGENTS.md -> 0 hit
- [x] Emoji scan bersih (panah tipografis U+2192 di tabel legacy bukan emoji)
- [x] Semua row konstanta baru hasil grep nyata

## Callback

Section 2 menyebut Dexie schema v22 (12 stores) hasil verifikasi agen — mau ditambahkan sketsa skema store baru (agentTasks/agentTaskSteps/chatTurns/learnedSkills) sebagai lampiran docs terpisah biar migrasi schema berikutnya punya baseline tertulis?
