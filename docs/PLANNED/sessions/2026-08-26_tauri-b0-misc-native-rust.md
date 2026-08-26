# Session Log — Tauri Fase B0: Port Cluster Lite & Misc ke Rust Native

## Ringkasan
**Keywords:** fase b0, lite misc cluster, cmd_misc.rs, port rust native, get-documents-path, get-lite-mode, save-temp-file, open-external, show-notification, node_invoke allowlist cleanup, kikis sidecar, strangler migration, notifikasi body hilang, positional notification args

- **Tanggal:** 2026-08-26 · **Branch:** kerja di atas garis integrasi Tauri (lihat `git status`)
- **Files touched:** `src-tauri/src/cmd_misc.rs` (baru), `src-tauri/src/lib.rs`, `src-tauri/src/cmd_node_bridge.rs`, `sidecar/engine.mjs`, `src/api/tauri-bridge.js`, `docs/PLANNED/migration-tauri-v2.md`
- **Apa & kenapa:** Langkah termurah Fase B ("kikis sidecar, urut murah→berat"): lima aksi trivial tanpa dependensi state sidecar (`save-temp-file`, `app:get-documents-path`, `system:get-lite-mode`, `open-external`, `show-notification`) di-porting menjadi command Rust native `misc_*`, dirouting langsung dari `tauri-bridge.js` tanpa `node_invoke`. Handler JS dan entrinya di allowlist/approval dihapus (deny-by-default menolak pemanggil usang). `ping` sengaja tidak diporting karena semantiknya health-check proses sidecar itu sendiri. `open-external` mempertahankan gate persetujuan NATIVE rfd (reuse `confirm_on_main_thread`) plus hardening skema URL (hanya http/https/mailto).
- **Audit Trail (Anti-Duplication Gate):** grep `get-documents-path|lite-mode|save-temp-file|open-external|show-notification|cmd_misc|fase b5` di docs/ → hanya hit tak relevan (plans-arsip lite-mode Electron, security scan arsip); `git log --all --grep` serupa → hanya commit A3+A4 sidecar dan seri lite-mode renderer lama; semantic check Ringkasan/Keywords 6 session log existing → tidak ada yang mem-porting cluster ini. Patch dinyatakan baru.

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
| --- | --- | --- | --- | --- |
| Body notifikasi hilang: pemanggil renderer memakai `(title, body)` posisional, bridge lama mengirim argumen pertama saja sebagai `{title,body}` ke sidecar | `src/api/tauri-bridge.js`, `useMarkPlan.js:1538`, `useAwareness.js:156`, `api/ai/utils.js:88` | Signature mismatch facade vs pemanggil sejak fase A | Router baru menerima dua gaya: objek `{title,body}` ATAU posisional; command Rust `misc_show_notification(title, body)` terpisah | FIXED |
| `document_dir()` di Tauri v2 versi ini mengembalikan `Result<PathBuf>`, bukan `Option` | `cmd_misc.rs:34` | Asumsi API salah saat penulisan pertama | `if let Ok(dir) = ...` + fallback `$HOME/Documents` | FIXED |
| Nama file temp `"."` / `".."` lolos sanitasi karakter (di JS lama juga) | `cmd_misc.rs` | Filter charset tidak mengecualikan nama path khusus | Nama `""`/`.`/`..` diganti default `attachment_<ts>.png` | FIXED (hardening) |
| `xdg-open` bisa mengeksekusi launcher untuk skema/file arbitrer | `cmd_misc.rs` | Engine lama meneruskan URL mentah | Allowlist skema http/https/mailto sebelum spawn | FIXED (hardening) |

## Files Modified

| File | Perubahan |
| --- | --- |
| `src-tauri/src/cmd_misc.rs` | BARU — 5 command `misc_*` + `spawn_detached` (thread-wait anti-zombie) + deteksi RAM `/proc/meminfo` |
| `src-tauri/src/lib.rs` | `mod cmd_misc;` + registrasi 5 command di `invoke_handler` |
| `src-tauri/src/cmd_node_bridge.rs` | `payload_preview` & `confirm_on_main_thread` jadi `pub(crate)`; hapus 3 entri `ALLOWED_ACTIONS` + `open-external` dari `APPROVAL_ACTIONS`; komentar penanda B0 |
| `sidecar/engine.mjs` | Hapus 5 handler ter-porting + import `spawn` yang menganggur; komentar penunjuk ke `cmd_misc.rs`; `ping` dipertahankan |
| `src/api/tauri-bridge.js` | Routing 5 method ke `invoke('misc_*')` langsung; header comment routing diperbarui |
| `docs/PLANNED/migration-tauri-v2.md` | Checklist `[x] B0` ditambahkan di Fase B |

## Agent Learnings

- `app.path().document_dir()` di Tauri 2 = `Result`, bukan `Option` — cek tanda tangan resolver sebelum `if let Some`.
- Pipeline bash `cargo check | tail` menelan exit code cargo; pakai `set -o pipefail` atau cek `${PIPESTATUS[0]}` agar kegagalan compile tidak terlewat.
- Pola porting sidecar→Rust yang mulus: (1) tulis command `misc_*` paritas perilaku, (2) reuse gate approval lewat helper `pub(crate)`, (3) hapus handler JS + entri allowlist bersamaan, (4) baru routing ulang bridge — deny-by-default membuat sisa pemanggil gagal cepat dengan pesan jelas, bukan hang.
- Child process fire-and-forget di Rust harus di-`wait()` di thread terpisah supaya tidak jadi zombie (padanan `.unref()` Node).
- `os.totalmem() <= 4.5e9` dipetakan ke `/proc/meminfo` MemTotal(kB)x1024; kegagalan deteksi dikembalikan sebagai bukan-lite (fail-open ke fitur penuh).

## File Invariants

| File | Invariant |
| --- | --- |
| `src-tauri/src/cmd_node_bridge.rs` | `ALLOWED_ACTIONS` deny-by-default JANGAN diisi longgar; aksi berbahaya wajib lewat `confirm_on_main_thread` (main thread, di luar renderer) |
| `src/api/tauri-bridge.js` | Renderer tidak boleh memanggil invoke selain lewat facade; channel sidecar hanya via `call()` |
| `sidecar/engine.mjs` | `ping` tetap ada sampai sidecar dibunuh di Fase C5 (dipakai sebagai health-check engine) |

## Verification Checklist

- [x] `cargo check` lulus (setelah fix `document_dir`)
- [x] `node --check sidecar/engine.mjs` OK
- [x] eslint `tauri-bridge.js`: 0 errors, jumlah warning kembali setara HEAD (tidak menambah noise prettier)
- [x] Grep renderer: tidak ada lagi referensi ke 5 aksi lama via `node_invoke`
- [ ] `bash scripts/verify.sh` penuh (vitest + watermark harness + vite build + cargo check) — jalankan SEBELUM push/commit
- [ ] Smoke test runtime `bun tauri dev`: trigger notifikasi (awareness), buka link eksternal (harus muncul dialog rfd), simpan lampiran chat

## Callback
Fase B berikutnya menurut urutan dokumen adalah port `run-shell`/task-daemon ke `tokio::process` — mau lanjut ke sana, atau lebih dulu smoke test runtime B0 ini di `bun tauri dev`?
