# Session: 2026-07-25 — Fix close, YouTube display, adblocker, Node.js 24 migration

## Tasks

### 1. CRITICAL: Proses Electron tidak bisa di-close (X button / Ctrl+C)
**Problem**: Zombie Electron processes tetap hidup setelah close/Ctrl+C.
**Root cause — 3 blockers**:
1. **browser-agent.js** close handler `preventDefault()` memblokir `app.quit()` chain
2. **baileys-service.js** reconnection loop `setTimeout(() => startWhatsappBot(), ...)` menjaga event loop tetap aktif
3. **`will-quit`** tidak memanggil `stopWhatsappBot()`

**Fix**:
- `src/main/index.js`: Signal handlers (`SIGINT`/`SIGTERM`/`SIGHUP`) menggunakan `app.exit(0)` — instant kill, bypass window-close hooks. Tambah handler `SIGHUP` untuk terminal/SSH disconnect.
- `src/main/index.js`: `window-all-closed` panggil `app.quit()` (Linux).
- `src/main/browser-agent.js`: Import `app`, tambah `appIsQuiting` flag via `app.on('before-quit')`. Close handler cek `!isForceClosing && !appIsQuiting`.
- `src/main/whatsapp/baileys-service.js`: Tambah `appIsQuiting` flag. Reconnection cek `!appIsQuiting`.
- `src/main/index.js` `will-quit`: Panggil `stopWhatsappBot()`, `stopMpris()`, `abortAllFetches()`, `closeBrowser()`.

### 2. YouTube Music Player widget display
**Problem**: Widget terpotong (zoom cropping), tidak muat theater mode.
**Fix** (`src/renderer/src/components/YoutubeMusicPlayer.jsx`):
- **Height**: `380px` → `480px`
- **Width**: `max-w-[420px]` → `max-w-[520px]`, wrapper `max-w-[90vw]`
- **Scale**: Hapus `scale-75`/`scale-100` dari panel transition classes
- **Theater mode**: Tambah CSS `#movie_player, .html5-video-player { max-height: 400px !important; }`
- **CSS injection**: Kembali ke versi minimal (scrollbar hidden + adblock containers + theater limit)
- **Duplicated `useEffect`**: Kedua `dom-ready` block diperbarui identik

### 3. Adblocker native (Brave-like) via @cliqz/adblocker-electron
**Implementation** (`src/main/index.js`):
- Import `ElectronBlocker` dari `@cliqz/adblocker-electron`
- Init di `app.whenReady()`: `ElectronBlocker.fromPrebuiltAdsAndTracking(fetch)`
- Enable blocking di kedua session: `persist:youtube` (YouTube webview) dan `defaultSession`
- Fetch native (Node 24) — `node-fetch` dependency dihapus

### 4. Node.js 18 → 24 migration
**Problem**: System Node 18 (v18.19.1) tidak kompatibel dengan banyak dependencies (electron-vite v5.0.0 butuh >=20.19.0, Baileys butuh >=20.0.0, dll — 35+ EBADENGINE warnings).
**Fix**:
- Switch ke NVM Node 24 (`~/.nvm/versions/node/v24.15.0`, lalu `v24.18.0`)
- Symlink Node 24 ke `~/.local/bin/` (PATH priority over `/usr/bin`)
- Tambah NVM init ke `.bashrc`
- `nvm alias default 24`
- `package.json`: hapus `node-fetch` dependency (native fetch di Node 24)
- `src/main/index.js`: hapus `import fetch from 'node-fetch'`

### 5. .gitignore improvement
- Restruktur dengan grouped comments: dependencies, build, IDE/editor, OS, env, logs, cache, runtime, session/plans/docs, temp artifacts
- Tambah: `.superpowers/`, `.zcode/`, `.hermes/`, `docs/sessions/`, `quest.md`, `*.log`, dll
- `git rm --cached` untuk 4 untracked dirs yang terlanjur di-index

### 6. Build
- `npm install` sukses dengan Node 24 (1183 packages, 43 vuln — none blocking)
- `npm run dev` build sukses (2m 14s) via electron-vite v5.0.0

### Pending
- **DO NOT PUSH** tanpa izin eksplisit user
- User perlu testing `npm run dev` → test X button dan Ctrl+C untuk verifikasi fix quit
