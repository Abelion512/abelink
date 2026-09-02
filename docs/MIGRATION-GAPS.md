# Migration Gaps — Electron → Tauri (fase A/B)

Hasil audit terhadap channel sidecar vs pemanggilan renderer. Pemetaan
dibuat dengan membandingkan setiap `call('<action>')` di
`src/api/tauri-bridge.js` dengan handler `on('<action>')` yang terdaftar di
`sidecar/engine.mjs`.

## Diperbaiki di PR ini (dipulihkan dari modul era Electron)

19 channel renderer sebelumnya mati total karena handler-nya masih
`ipcMain.handle(...)` / `ipcMain.on(...)` yang tidak pernah terpanggil
di bawah Tauri. Kini didaftarkan langsung di `sidecar/engine.mjs`
(atau diekspor dari modul lama tanpa dependensi Electron):

| Channel | Asal implementasi | Catatan |
| --- | --- | --- |
| `plugin:execute` / `plugin:open-folder` / `plugin:open-specific-folder` / `plugin:toggle` / `plugin:reload` / `plugin:create` / `plugin:delete` | `plugin-loader.js` (ipcMain dihapus, jadi export biasa) | Folder plugin pindah ke XDG documents; `shell.openPath` diganti `execFile('xdg-open')` ter-kontinemen; kunci handler tetap `act.name` sesuai manifest |
| `skills:get-tree` / `skills:save-file` / `skills:create-item` / `skills:delete-item` / `skills:rename-item` / `skills:install` | inline di `engine.mjs` (paritas dengan `skill-manager.js` lama) | Semua path relatif disanitasi anti-traversal; install .zip butuh `SKILL.md` di dalam arsip; `skills:install` menggantikan dialog Electron dengan path dari `misc_open_file_dialog` (Rust native) |
| `tg:agent-execution-done` / `tg:broadcast-to-admins` | `telegram-service.js` (blok ipcMain diekstrak jadi export) | Event ke renderer dikirim via stdout JSON-lines (`tg:reply-sent`) |

Keamanan: karena channel-channel di atas memasukkan kembali operasi destruktif
(`skills:install`, `skills:delete-item`, `skills:save-file`, `skills:create-item`,
`skills:rename-item`, `plugin:create`, `plugin:delete`), semuanya didaftarkan ke
`APPROVAL_ACTIONS` di `src-tauri/src/cmd_node_bridge.rs` — setiap eksekusi
melewati dialog persetujuan NATIVE (rfd) di Rust main thread, konsisten dengan
kebijakan approval-gate (audit upstream 2026-08-26).

## Sengaja ditunda (stub eksplisit, jangan dianggap bug)

| Channel | Fase | Keterangan |
| --- | --- | --- |
| `browser:navigate` / `browser:read-dom` / `browser:action` / `browser:close` / `browser:show` | Fase C3 | Multi-session browser automation; stub mengembalikan `unsupported` agar gagal cepat, bukan diam |
| `os:read` / `os:click` / `os:type` / `os:key` / `os:scroll` / `os:open` / `os:list-windows` / `os:focus-window` / `os:ask-user` | Fase B6 | Renderer kini memakai Rust native `os_*` commands (`invoke('os_read')`, dst.) — channel sidecar ini hanya fallback lama |

## Dead code era Electron (tercatat, belum dibuang)

- `telegram-service.js`: 3 handler `ipcMain.on` (`tg:trigger-screenshot`,
  `tg:trigger-music-download`, `tg:trigger-music-ui`) — tidak pernah
  terpanggil; logika trigger-nya sudah diambil alih Rust commands.
- `skill-manager.js`: modul penuh masih mengimpor `electron` (`app`,
  `ipcMain`, `dialog`) — tidak boleh di-import engine apa pun sekarang;
  paritas fiturnya sudah dipindah ke `engine.mjs`. Kandidat penghapusan
  berikutnya setelah diverifikasi tidak ada pemakai lain.

## Metode audit (untuk reproduce)

```bash
# Channel yang dipanggil renderer tapi tidak punya handler:
comm -23 \
  <(grep -oP "call\('\K[^']+" src/api/tauri-bridge.js | sort -u) \
  <(grep -oP "^on\('\K[^']+" sidecar/engine.mjs | sort -u)
# Saat audit pertama: 21 baris (2 false positive multi-line, 5 browser:* stub,
# 14 gap nyata + plugin/skills/tg families).
```

## Verdict merge-readiness PR #16

**Layak merge setelah checklist kecil ini, dengan catatan:**

- Blocking — sudah diperbaiki di PR ini: deskripsi/body PR kini sesuai diff,
  `release.yml` guard tidak lagi memanggil script yang dihapus, `evaluation/`
  sudah ESM `.mjs` dengan verifier dieksekusi + smoke test tanpa network,
  Socket Block (protobufjs) sudah hilang dari lockfile, dan 19 channel
  renderer yang mati sudah dipulihkan + approval-gated.
- Tersisa (non-blocking, punya jalur tindak lanjut):
  1. CI `cargo check` wajib hijau sebelum merge (sandbox lokal tidak punya
     toolchain Rust untuk memverifikasi perubahan `cmd_node_bridge.rs`).
  2. `sharp@0.34.5` dan `minimatch@3.0.8` di-accept dengan justifikasi —
     lihat `docs/SECURITY-TRIAGE.md`; Dependabot akan memantau upgrade-nya.
  3. `browser:*` (Fase C3) dan `os:*` (Fase B6) tetap stub eksplisit — jangan
     merge dengan asumsi fitur automation sudah jalan.
  4. Dead code era Electron di `skill-manager.js` + 3 handler `ipcMain.on`
     telegram: kandidat pembersihan menyusul, tidak memblokir merge.
  5. Urutan merge: #17 dulu, lalu #16 (AGENTS.md sudah diselaraskan agar
     tidak konflik).
