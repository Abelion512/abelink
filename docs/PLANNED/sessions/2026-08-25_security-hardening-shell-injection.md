# Session Log — 2026-08-25: Security Hardening Shell Injection & Path Traversal

## Ringkasan

**Keywords:** security hardening, keamanan, command injection, shell injection, CWE-78, path traversal, CWE-22, execFile argv array, run-powershell, git-service, syntax-validator, plugin-loader, npm install injection, spawn tanpa shell, approval gate, LLM tool safety

- **Tanggal:** 2026-08-25 | **Branch:** merge/all-to-5.5.0
- **Files touched:** `src/main/node-tools.js`, `src/main/git-service.js`, `src/main/syntax-validator.js`, `src/main/plugins/plugin-loader.js`
- Full audit pass diminta owner ("make this project more secure"). Ditemukan 5 vuln baru di luar scope patch security lama (`cc9fc54` yang hanya cover webSecurity/WA-optin/CSP): command injection via interpolasi string shell di run-powershell, git-service (commit msg/diff/revert path), syntax-validator (node/python/php/ruby/gofmt filePath), plugin-loader npm install; plus path traversal di IPC plugin toggle/delete/open-specific-folder.
- Pola fix seragam: eksekusi proses via argv array (execFile/spawn tanpa shell) sehingga input LLM tidak pernah melewati lapisan parser shell kedua; dependency npm divalidasi regex ketat tanpa metachar; path plugin wajib ter-contain dalam plugins dir.

**Audit Trail:** `grep -rliE "security|keamanan|hardening|injection|sanitiz|allowlist|blacklist|whitelist|ssrf|xss|secret" docs/` → hit hanya `DRIFT_MANIFEST.md` B4 (webSecurity/WA opt-in, scope beda) + log sesi tak-relevan; `git log --grep` → `cc9fc54`/`5046564` (P0: CSP+WA), `005fab6` (pc-agent spawn), `3477732` (skill-sanitizer). Semantic check Ringkasan semua session log → tidak ada patch shell-injection/path-traversal sebelumnya. Scope ini BARU.

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
|---|---|---|---|---|
| V1 Command injection (CWE-78): query LLM diinterpolasi ke `bash -c "${query}"` / `powershell.exe -Command "${query}"` — escape `"` saja tidak blok backtick/`$()` | node-tools.js:967-995 | String concat ke shell ganda-lapis | `spawn(bin, ['-c', query] / ['-NoProfile','-NonInteractive','-Command', query])` argv array + timeout 120s + windowsHide | DONE |
| V2 Command injection: pesan commit hanya escape `"`, backtick/`$()` dieksekusi; diff/revert path sama | git-service.js:27,44,57 | Interpolasi template literal ke execPromise | Semua fungsi → helper `runGit(args)` via `execFile('git', [...])` maxBuffer 10MB | DONE |
| V3 Command injection: filePath LLM diinterpolasi ke `node -c "${filePath}"`, py/php/ruby/gofmt | syntax-validator.js:322+ | Sama | Helper `runCheck(bin, args)` via execFile + timeout 30s; ENOENT ditangkap sebagai "interpreter tidak ada", bukan syntax error | DONE |
| V4 Command injection: `npm install ${deps.join(' ')}` dari manifest plugin (renderer-controlled) | plugin-loader.js:185 | deps digabung mentah ke shell | Validasi regex ketat per-dep `/^(@scope/)?name(@range)?$/` (tanpa metachar shell); dep invalid → reject dengan pesan jelas | DONE |
| V5 Path traversal (CWE-22): `plugin:toggle/delete` join nama mentah → `../..` bisa rmSync recursive force di luar plugins dir; `open-specific-folder` buka path sembarangan | plugin-loader.js:116+,199+ | Tidak ada containment check | `resolveContainedPluginPath()`: resolve + path.relative prefix check; null → reject | DONE |

Tidak diubah (by design / sudah aman): `task-daemon.js` (spawn argv array), `telegram-service.js` yt-dlp (execFile argv), `browser-agent.js executeScript` (fitur intensional `browser-script`, ada approval gate), blacklist `isDangerousCommand` (heuristic approval layer, tetap dipertahankan).

## Files Modified

| File | Perubahan |
|---|---|
| src/main/node-tools.js | import exec/util → spawn; handler run-powershell → spawn argv array |
| src/main/git-service.js | rewrite penuh: execFile arg arrays untuk status/diff/commit/revert |
| src/main/syntax-validator.js | runCheck() execFile helper; 6 titik interpolasi diganti |
| src/main/plugins/plugin-loader.js | isValidNpmDependency(), resolveContainedPluginPath(), containment di toggle/delete/open-folder |

## Agent Learnings

- Escape kutip tunggal (`replace(/"/g,'\\"')`) BUKAN mitigasi injection di POSIX sh — backtick dan `$()` tetap hidup dalam double quotes. Satu-satunya fix benar: argv array tanpa shell.
- `execFile` di Windows gagal utk `.cmd` shim (npm) → utk kasus itu: validasi charset ketat dulu, baru boleh lewat shell.
- `process.execPath` di Electron main = binary Electron, BUKAN node — jangan dipakai untuk `node -c`; pakai literal `'node'`.
- Smoke test injection: buat canary file via payload `` `touch x` ``/`$(touch y)` lalu assert file TIDAK tercipta + pesan tersimpan literal di COMMIT_EDITMSG.
- vitest di branch ini orphaned (modul approval-modes/cleanAndParse/modelDiscovery/output-sanitizer dihapus, test tinggal) — failure pre-existing, JANGAN disalahkan pada patch baru.

## File Invariants

| File | Invariant |
|---|---|
| src/main/node-tools.js | `run-powershell` WAJIB spawn argv array; jangan kembalikan pola template-string `-Command "${...}"`. Blacklist `isDangerousCommand` tetap dipakai sebagai approval heuristic (bukan boundary). |
| src/main/git-service.js | Semua git call lewat `runGit()` (execFile). Jangan tambah interpolasi string baru. |
| src/main/syntax-validator.js | Urutan validasi: bracket-balance statis dulu, subprocess check belakangan. `runCheck` resolve Error object (bukan throw). |
| src/main/plugins/plugin-loader.js | Setiap path dari renderer harus lewat `resolveContainedPluginPath`; setiap dep npm harus lolos `isValidNpmDependency`. |

## Verification Checklist

- [x] eslint 0 error pada 4 file (warning prettier/no-unused-vars pre-existing)
- [x] `node -c` syntax clean semua file
- [x] Smoke test: hostile commit message/diff path/filename → payload tidak dieksekusi, perilaku normal preserved
- [x] node -c error path masih mendeteksi JS SyntaxError asli
- [x] Dep validator: 10 sampel hostile semuanya rejected, format sah (axios, @scope/pkg@1.2.3, lodash@^4.17.0) accepted
- [x] vitest failures diverifikasi pre-existing (orphaned tests), bukan regresi
- [ ] E2E manual di app (write-file .js dgn syntax error → warning self-healing muncul)
- [ ] Test di Windows build (powershell.exe -NoProfile -NonInteractive path)

## Update 2026-08-26 — Hardening Ternyata HILANG saat migrasi; direstorasi ke sidecar

**Keywords tambahan:** restorasi hardening, stale patch, sidecar git-service runGit, syntax-validator runCheck, plugin-loader validator, engine.mjs skills traversal, workspace containment guard, fsGuard

Temuan audit 2026-08-26 (subagent + verifikasi `git log --all -S`): **keempat fix V1-V5 di atas TIDAK PERNAH ter-commit** — simbol `runGit`/`runCheck`/`isValidNpmDependency`/`resolveContainedPluginPath` tidak ada di commit/branch manapun; log sesi ini ditulis untuk branch `merge/all-to-5.5.0` yang tidak eksis, dan patch diterapkan ke path `src/main/**` yang sudah dipindah/dihapus oleh migrasi Tauri (4a11f29). Kode di `sidecar/main/*` adalah versi PRA-hardening utuh.

| Item lama | Status di sidecar sebelum update | Fix 2026-08-26 |
|---|---|---|
| V1 run-shell argv array | STALE (`exec(query,{shell:'/bin/bash'})`, tanpa timeout) | timeout 120s + maxBuffer; gate blacklist tetap (upgrade allowlist = backlog) |
| V2 git-service | STALE penuh (interpolasi + needsApproval:false di git-diff!) | rewrite `runGit()` execFile argv, path sebagai elemen argv |
| V3 syntax-validator | STALE (6 titik interpolasi `${filePath}`) | helper `runCheck()` execFile + timeout 30s; ENOENT = interpreter tidak ada |
| V4/V5 plugin-loader | STALE (`npm install ${deps}`, rmSync tanpa containment) | `isValidNpmDependency()` regex + `resolveContainedPluginPath()` |
| BARU: file tools tanpa containment | read/write/delete/list/grep menerima path absolut & `..` | guard `resolveContained(root,p)` di semua file tool -> "Akses ditolak: path di luar workspace." |
| BARU: skills:* traversal di engine.mjs | save/delete/read join `name` mentah | validasi nama [A-Za-z0-9._-] + strip '..' pada read-file |
| BARU: browser-*/os-* fake success | stub electron BrowserWindow loadURL no-op -> AI berhalusinasi hasil riset | handler mengembalikan `{success:false, unsupported:true}` eksplisit |

Verifikasi: `node --check` semua file OK; smoke test engine (`bun sidecar/engine.mjs`): frame rusak dijawab error frame, `skills:delete "../../../evil"` ditolak "Nama skill tidak valid", `read-file "../../etc/passwd"` ditolak "Akses ditolak: path di luar workspace."

Pelajaran besar: **patch yang tidak di-commit = patch yang tidak ada.** Session log DONE bukan bukti kode hidup; selalu grep simbol di tree aktif sebelum menandai selesai. Detail lanjutan lapisan Rust: `docs/PLANNED/sessions/2026-08-26_rust-shell-hardening-ci-gate.md`.

## Callback

Approval gate `isDangerousCommand` masih blacklist-based dan bisa bypass dengan encoding (mis. `Get-ChildItem | Remove-Item` via alias `ls | ri`, atau base64 `-EncodedCommand`). Mau kita upgrade ke allowlist-based policy (default-deny, whitelist perintah aman) + blokir `-EncodedCommand`, sebagai hardening tahap berikutnya?
