# Session Log: Sensitive-write umum ala Hermes (backlog #2)

Tanggal: 2026-09-19 | Branch: `feat/sensitive-write-guardian` | Status: selesai, siap merge

## Masalah
- Guardian sebelumnya hanya melindungi direktori Abelink sendiri (`SELF_DIR_MARKERS`).
- Akses mutasi/penulisan file sensitif umum seperti `~/.ssh/authorized_keys`, `.env`, shell rc (`.bashrc`, `.zshrc`), credential stores (`.netrc`, `.npmrc`), dan file sistem (`/etc/sudoers`, `/etc/passwd`) belum dicegat secara eksplisit sebagai aksi berbahaya yang butuh persetujuan.

## Referensi (diverifikasi dari file)
- Hermes `tools/approval_detection.py:17-42`: `_SSH_SENSITIVE_PATH`, `_PROJECT_ENV_PATH`, `_SHELL_RC_FILES`, `_CREDENTIAL_FILES`, `_SYSTEM_CONFIG_PATH`.
- Hermes `agent/file_safety.py:151-193`: `build_write_denied_paths` & `build_write_denied_prefixes`.

## Keputusan
- `sidecar/main/tools/_shared.mjs`:
  - Mendefinisikan `SENSITIVE_TARGET_MARKERS` mencakup `SELF_DIR_MARKERS`, `~/.ssh`, `$HOME/.ssh`, `.env*`, shell rc (`.bashrc`, `.zshrc`, `.profile`, dll.), credential stores (`.netrc`, `.npmrc`, dll.), dan sistem (`/etc/sudoers`, `/etc/shadow`, `/etc/passwd`).
  - `hasSensitiveWriteTarget`: memindai operasi mutasi (`rm`, `mv`, `cp`, `install`, `>`, `>>`, `tee`, `chmod`, `chown`, `sed -i`, `dd of=`) terhadap target sensitif.
  - Perintah baca murni (`cat .env`, `ls ~/.ssh`, `grep`) tetap `safe`.
- `src-tauri/src/hardline.rs` + `src-tauri/src/cmd_node_bridge.rs`:
  - Menambahkan cermin Rust: `has_sensitive_write_target`, `is_dangerous_shell`, dan `shell_approval_reason`.
  - Pada `cmd_node_bridge.rs::approval_reason`, payload `native-tool:execute` memicu dialog persetujuan native (rfd) bila memuat perintah shell berbahaya atau penulisan target sensitif, tunduk pada kebijakan `shell-exec`.

## Berkas Berubah
- `sidecar/main/tools/_shared.mjs`
- `sidecar/main/node-tools.js`
- `src-tauri/src/hardline.rs`
- `src-tauri/src/cmd_node_bridge.rs`
- `tests/hermes-guardian.test.mjs`
- `docs/OPERATING-ADOPTION.md`

## Hasil Verifikasi
- Vitest: `tests/hermes-guardian.test.mjs` 16/16 lolos.
- Rust: `cargo test` 28/28 lolos (2 test baru di `hardline.rs`).
- Clippy: `cargo clippy -- -D warnings` bersih (0 warning).
- ESLint: 0 error, 0 warning.
