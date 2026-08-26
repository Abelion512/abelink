# Session Log — 2026-08-26: Rust Shell Hardening + Release/Test Gate

## Ringkasan

**Keywords:** rust hardening, cmd_fs containment, canonicalize path traversal, workspace root, node_invoke allowlist, deny-by-default, rfd approval dialog, main thread consent, sidecar drain pending, kill child exit, CSP wasm-unsafe-eval, opener capability removal, harness kind validation, spawn_blocking grep cap, codeql rust, vitest include mjs

- **Tanggal:** 2026-08-26 | **Branch:** 5.5.0 | **Pemicu:** audit 4-area pasca-migrasi Tauri (2 P0 Rust).
- `cmd_fs.rs` dulu menerima path absolut/`..` verbatim (`fs_delete_file` bisa `remove_dir_all` seluruh disk); `node_invoke` meneruskan SEMUA aksi ke sidecar tanpa filter — approval hanya data advisory dari renderer.
- Pola fix: containment di lapisan Rust (bukan kepercayaan ke JS), otorisasi deny-by-default, persetujuan native DI LUAR renderer (dialog rfd di main thread via run_on_main_thread + mpsc), lifecycle sidecar dikelola.

**Audit Trail:** grep `cmd_fs|node_invoke|canonicalize|containment` di docs/PLANNED -> hanya migration-tauri-v2.md (rencana, bukan patch); git log cmd_fs.rs -> hanya commit pembuat (5dd99f4/891e1b5). Scope BARU.

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
|---|---|---|---|---|
| P0 fs tanpa containment: absolute & `..` lolos, remove_dir_all bebas | cmd_fs.rs resolve() | base tidak pernah di-enforce | resolve_contained(): tolak `~`/absolut/komponen ParentDir; canonicalize + starts_with(cbase); larang hapus root workspace; cap baca 10MB/tulis 20MB/grep skip >1MB; async+spawn_blocking | DONE |
| P0 node_invoke proxy tak terbatas | cmd_node_bridge.rs | forward semua aksi; approval advisory | ALLOWED_ACTIONS deny-by-default; APPROVAL_ACTIONS + DANGEROUS_TOOLS(run-powershell/git-commit/git-revert) wajib dialog native rfd (OkCancel, hasil via mpsc recv_timeout 180s, default TOLAK) | DONE |
| P1 engine mati = caller menggantung 300s; bun jadi orphan | cmd_node_bridge.rs | pending didrain tidak; child tidak disimpan | reader-exit drain semua request dg error frame; state.child disimpan; kill_engine() di RunEvent::Exit | DONE |
| P2 harness_append kind escape + baris mentah | cmd_harness.rs | join `{kind}.jsonl` tanpa validasi | kind regex [A-Za-z0-9_-] max64; entri serde_json {ts,kind,line}; cap 256k chars | DONE |
| P1 CSP lemah: unsafe-eval + connect-src * + csp null | index.html + tauri.conf.json | warisan template dev | CSP ketat identik di keduanya: script-src self+wasm-unsafe-eval+blob:, connect-src localhost/ws-local + https (custom API tetap hidup), img tanpa http wildcard, object-src none, base-uri self | DONE |
| P2 opener capability unscooped (write-then-execute chain) | capabilities/default.json, lib.rs, Cargo.toml | opener:default = open_url tanpa scope; renderer malah pakai jalur open-external sidecar | capability + plugin init + dep dilepas total | DONE |
| P3 duplikat tauri_plugin_log; icon unwrap panic | lib.rs | copy-paste setup | registrasi tunggal; tray icon fallback aman | DONE |
| P2 UI freeze grep/delete sinkron di main thread | cmd_fs.rs | command non-async | semua fs berat async + spawn_blocking | DONE |
| Ctrl+Shift+S emergency stop mati di Tauri | lib.rs | shortcut terdaftar di electron stub | global-shortcut Rust broadcast event `pc-emergency-stop`; channel sidecar menyusul Fase B | DONE (hook) |

Bonus gate: vitest include `.mjs` + alias @renderer->./src; harness watermark direname `.harness.mjs` (script mandiri, bukan suite vitest; 8/8+25/25 pass) + `test:harness` masuk verify.sh; CodeQL +rust matrix; CI tauri.yml jalankan vitest & trigger push 5.5.0/master.

## Files Modified

src-tauri/src/{cmd_fs,cmd_node_bridge,cmd_harness,lib}.rs, src-tauri/{Cargo.toml,tauri.conf.json,capabilities/default.json}, index.html, vite/vitest.config.mjs, scripts/verify.sh, package.json (script), .github/workflows/{codeql,tauri}.yml, tests/stress-watermark*.harness.mjs (rename).

## Agent Learnings

- rfd 0.15 API: `MessageButtons::OkCancel` (bukan MessageDialogButtons), hasil enum `MessageDialogResult::Yes`. Dialog GTK wajib main thread -> pola `app.run_on_main_thread(closure yang blocking show() + tx.send)` + `rx.recv_timeout` dari async context.
- Sync #[tauri::command] jalan di main thread (makanya rfd pick_file lama aman); async jalan di worker -> JANGAN panggil GTK langsung dari async fn.
- Closure spawn_blocking yang memindah PathBuf: siapkan clone display string SEBELUM move untuk dipakai setelah await.
- `.map(|(_, l)| *l)` pada iter `(usize,&str)` = deref ke unsized str; cukup `l`.
- Filter keamanan harus di layer yang tidak bisa dibypass renderer; data advisory dari JS bukan boundary.

## File Invariants

| File | Invariant |
|---|---|
| src-tauri/src/cmd_fs.rs | Semua command WAJIB lewat resolve_contained(); jangan tambah parameter path baru tanpa guard; root workspace tak boleh dihapus. |
| src-tauri/src/cmd_node_bridge.rs | Aksi baru = tambah ke ALLOWED_ACTIONS secara sadar; aksi/tool destruktif masuk APPROVAL_ACTIONS/DANGEROUS_TOOLS. confirm_on_main_thread default-DENY bila dispatch gagal. |
| tauri.conf.json + index.html | Dua-duanya memuat CSP sama; ubah berdua sekaligus. connect-src * dilarang kembali. |
| capabilities/default.json | Tanpa opener/shell/fs plugin permission; tambahan permission baru butuh justifikasi eksplisit di review. |

## Verification Checklist

- [x] cargo check 0 error 0 warning
- [x] bunx vitest run 10/10 (2 file)
- [x] bun run test:harness 8/8 + 25/25
- [x] grep rejectUnauthorized / JSON.stringify(currentBody = nol di modul terkait
- [ ] E2E GUI: modal approval muncul saat run-powershell; tolak -> error di chat (butuh app hidup)
- [ ] E2E: Transformers.js embedding masih jalan di bawah CSP wasm-unsafe-eval (Lite fallback ada bila gagal)

## Callback

Approval dialog saat ini menampilkan payload preview 200 char. Mau ditambah opsi "Izinkan selalu untuk tool ini sesi ini" (in-memory allowlist ber-TTL di Rust) biar alur agentic panjang tidak dialog terus?
