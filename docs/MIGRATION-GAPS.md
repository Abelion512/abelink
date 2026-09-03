# Migration Gaps — Electron → Tauri (fase A/B)

Hasil audit terhadap channel sidecar vs pemanggilan renderer. Pemetaan
dibuat dengan membandingkan setiap `call('<action>')` di
`src/api/tauri-bridge.js` dengan handler `on('<action>')` yang terdaftar di
`sidecar/engine.mjs`.

## Diperbaiki di PR ini (dipulihkan dari modul era Electron)

14 channel renderer sebelumnya mati total karena handler-nya masih
`ipcMain.handle(...)` / `ipcMain.on(...)` yang tidak pernah terpanggil
di bawah Tauri. Kini didaftarkan langsung di `sidecar/engine.mjs`
(atau diekspor dari modul lama tanpa dependensi Electron):

| Channel | Asal implementasi | Catatan |
| --- | --- | --- |
| `plugin:execute` / `plugin:open-folder` / `plugin:open-specific-folder` / `plugin:toggle` / `plugin:reload` / `plugin:create` / `plugin:delete` | `plugin-loader.js` (ipcMain dihapus, jadi export biasa) | Folder plugin pindah ke XDG documents; `shell.openPath` diganti `execFile('xdg-open')` ter-kontinemen; kunci handler tetap `act.name` sesuai manifest |
| `skills:get-tree` / `skills:save-file` / `skills:create-item` / `skills:delete-item` / `skills:rename-item` / `skills:install` | inline di `engine.mjs` (paritas dengan `skill-manager.js` lama) | Semua path relatif disanitasi anti-traversal; install .zip butuh `SKILL.md` di dalam arsip; `skills:install` menggantikan dialog Electron dengan path dari `misc_open_file_dialog` (Rust native) |
| `tg:agent-execution-done` | `telegram-service.js` (handler ipcMain diekstrak jadi export `sendAgentExecutionDone`) | Event ke renderer dikirim via stdout JSON-lines (`tg:reply-sent`); `tg:broadcast-to-admins` sudah terdaftar inline sebelumnya (tidak termasuk hitungan 14) |

Keamanan: karena channel-channel di atas memasukkan kembali operasi destruktif
(`skills:install`, `skills:delete-item`, `skills:save-file`, `skills:create-item`,
`skills:rename-item`, `plugin:create`, `plugin:delete`), semuanya didaftarkan ke
`APPROVAL_ACTIONS` di `src-tauri/src/cmd_node_bridge.rs` — setiap eksekusi
melewati dialog persetujuan NATIVE (rfd) di Rust main thread, konsisten dengan
kebijakan approval-gate (audit upstream 2026-08-26). Hitungan 14 = plugin 7 +
skills 6 + tg 1.

## Sengaja ditunda (stub eksplisit, jangan dianggap bug)

| Channel | Fase | Keterangan |
| --- | --- | --- |
| `browser:navigate` / `browser:read-dom` / `browser:action` / `browser:close` / `browser:show` | Fase C3 | Multi-session browser automation; stub mengembalikan `unsupported` agar gagal cepat, bukan diam |
| `os:read` / `os:click` / `os:type` / `os:key` / `os:scroll` / `os:open` / `os:list-windows` / `os:focus-window` / `os:ask-user` | Fase B6 | Renderer kini memakai Rust native `os_*` commands (`invoke('os_read')`, dst.) — channel sidecar ini hanya fallback lama |

## Dead code era Electron — SUDAH DIBUANG (2026-09-03)

- `telegram-service.js`: 3 handler `ipcMain.on` (`tg:trigger-screenshot`,
  `tg:trigger-music-download`, `tg:trigger-music-ui`) dihapus beserta
  impor `electron`/`desktopCapturer`/`yts`/`ffmpeg`/`execFile` yang hanya
  dipakai blok itu. Path chat/admin ids pindah dari
  `app.getPath('userData')` ke XDG (`~/.local/share/mark/`).
- `skills/skill-manager.js`: dihapus (tidak pernah di-import; paritas
  fitur sudah di `engine/channels/skills.mjs`).
- `window-tracker.js`: impor `powerMonitor` (electron) diganti deteksi
  idle via `xprintidle` (fallback: tidak idle).
- `google-service.js`: impor `app`/`shell` (electron) diganti XDG path +
  `open` (xdg-open) untuk OAuth authorize URL.

Alasan mendesak: `electron` TIDAK ada di bun.lock — ketiga modul live
(telegram/awareness/google) pasti gagal load saat channel-nya dipakai
pertama kali (`ERR_MODULE_NOT_FOUND`), tersembunyi karena lazy import.

## Metode audit (untuk reproduce)

Sejak refactor registry (PR #18), handler tidak lagi didaftarkan di
`sidecar/engine.mjs` — pindah ke `sidecar/engine/channels/*`. Perintah di
bawah sudah disesuaikan dan TERVERIFIKASI pada commit refactor:

```bash
# Normalisasi baris dulu agar registrasi multi-line (on(
#   'workspace:query', ...)) ikut terbaca:
find sidecar/engine -name '*.mjs' -exec cat {} + | tr '\n' ' ' > /tmp/engine-all.mjs
# Channel yang dipanggil renderer tapi tidak punya handler:
comm -23 \
  <(grep -oP "call\('\K[^']+" src/api/tauri-bridge.js | sort -u) \
  <(grep -oP "on\(\s*'\K[^']+" /tmp/engine-all.mjs | sort -u)
# Hasil terverifikasi pada refactor: yang muncul hanya 5 stub browser:*
# (browser:navigate/read-dom/action/close/show) — semuanya terdaftar via
# loop `unsupported()` di engine/channels/music.mjs, jadi BUKAN gap.
# 9 stub os:* tidak muncul karena renderer memakai invoke('os_*') Rust native.
# Hitungan handler total: 55 terdaftar langsung + 14 stub loop = 69.
# Saat audit pertama (pra-registry): 21 baris (2 false positive multi-line,
# 5 browser:* stub, 14 gap nyata + plugin/skills/tg families).
```

## Verdict merge-readiness PR #16

**Layak merge setelah checklist kecil ini, dengan catatan:**

- Blocking — sudah diperbaiki di PR ini: deskripsi/body PR kini sesuai diff,
  `release.yml` guard tidak lagi memanggil script yang dihapus, `evaluation/`
  sudah ESM `.mjs` dengan verifier dieksekusi + smoke test tanpa network,
  Socket Block (protobufjs) sudah hilang dari lockfile, dan 14 channel
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
