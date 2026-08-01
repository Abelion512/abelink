# Session: Security Scan — Merged Changes (24h)

## Ringkasan

**Tanggal:** 2026-07-29  
**Branch:** `feat/performance-and-readibility`  
**Files touched:** `src/main/youtube-player.js`, `src/renderer/src/contexts/YoutubeMusicContext.jsx`, `src/renderer/src/components/YoutubeMusicPlayer.jsx`, `src/renderer/src/api/ai/vision-service.js`, `src/main/index.js`, `src/preload/index.js`, `src/main/ai-bridge.js`  
**Ringkasan:** Security scan terhadap ~40 commit yang dimerge dalam 24 jam terakhir. **3 high-confidence regressions ditemukan** — semuanya dari migrasi `<webview>` ke `BrowserWindow` untuk YouTube player. Semua fix sudah di-commit di `f9f871d` + `a8fa3ec`. Plus latihan pakai research skills (`context7-mcp`) untuk validasi approach. Cek upstream vs fork diff — 30+ file baru/modifikasi di upstream, beberapa worth ATM (prompt-compressor, fallback-serializer, tool-registry).

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
|---------|------|------------|-----|--------|
| Track metadata update dead | `src/main/youtube-player.js:11-12` | `setOnTrackCallback()` tidak pernah dipanggil. Old webview polling di-cabut tanpa wiring baru | `index.js` wiring ke `mainWindow.webContents.send('yt:track-updated')` → `onYtTrackUpdated` listener di context | ✅ Fixed (`f9f871d`) |
| Next/Prev no-op | `src/renderer/src/contexts/YoutubeMusicContext.jsx:52-58` | `document.dispatchEvent` dihapus, diganti `ytShow()` — cuma show window | `ytCommand('next'/'prev')` → IPC `yt:command` → `sendKeyboardCommand()` → `executeJavaScript` keyboard event | ✅ Fixed (`f9f871d`) |
| Play/Pause hanya toggle state | `src/renderer/src/contexts/YoutubeMusicContext.jsx:60-62` | `setIsPlaying(p => !p)` gak sentuh YouTube | `ytCommand('playPause')` → keyboard event `key 'k'` | ✅ Fixed (`f9f871d`) |
| Ad-blocker mismatch yt player | `src/main/index.js:269-277` | Blocker target `persist:youtube`, BrowserWindow pakai `persist:mark-browser` | Tambah `markBrowserSession` ke blocker | ✅ Fixed (`f9f871d`) |
| `backgroundThrottling` default true | `src/main/youtube-player.js` | Hidden renderer di-throttle oleh Chromium → input events & page-title-updated bisa stall | `backgroundThrottling: false` di webPreferences | ✅ Fixed (`f9f871d`) |

## Files Modified

| File | Perubahan |
|------|-----------|
| `src/main/youtube-player.js` | **New** + `sendKeyboardCommand()`, `showAndNavigate()`, `backgroundThrottling: false`, title parsing |
| `src/main/index.js` | Import tambahan, `setOnTrackCallback` wiring, `yt:command` IPC handler, ad-blocker session fix |
| `src/preload/index.js` | +`ytCommand()`, +`onYtTrackUpdated()` listener bridges |
| `src/renderer/src/contexts/YoutubeMusicContext.jsx` | `nextTrack`/`prevTrack`/`playPause` now call `ytCommand()`, +`onYtTrackUpdated` listener, playUrl langsung `ytLoad` (skip browser-agent) |

## Agent Learnings

### Pattern Konkret

1. **Dead callback di migration** — Export function TIDAK CUKUP. Harus ada wiring di entry point (`index.js`) linking main process → renderer via `webContents.send`. `setOnTrackCallback` silent failure — function exists, null handler, no error in console.
2. **`backgroundThrottling` adalah silent killer hidden window** — Chromium throttle renderer kronis saat window hidden. `page-title-updated` events bisa delay menit. `executeJavaScript` juga stall. Fix: `backgroundThrottling: false` di webPreferences.
3. **Keyboard control via IPC chain** — Renderer → IPC invoke → main `sendKeyboardCommand()` → `ytWindow.webContents.executeJavaScript()` → `document.dispatchEvent(new KeyboardEvent(...))`. `sendInputEvent()` lebih native tapi **requires window focus** — gak cocok buat hidden window.
4. **Cek upstream sebelum ATM, bukan sesudah** — Kita udah commit fix, baru ngecek upstream. Harusnya: lihat dulu apakah upstream punya masalah sama atau solusi beda.

### File Invariants

| File | Invariant |
|------|-----------|
| `src/main/youtube-player.js` | `backgroundThrottling: false` WAJIB — tanpanya, hidden window tidak bisa diandalkan |
| `src/main/ai-bridge.js` | `resolveVisionModel(input)` accept 1 arg. Caller di `index.js:509` kirim `(comboName, role)` — `role` diabaikan. Intentional atau bug? |
| `src/main/index.js` | `yt:*` IPC handler harus idempotent. `getOrCreateWindow()` sudah handle null/closed window |
| `package.json` | `playwright` unused dep — hapus atau tunggu implementasi |

### Verification Checklist

- [ ] Cek `setOnTrackCallback` dipanggil di `app.whenReady()` → wiring ke `mainWindow.webContents.send`
- [ ] Cek `preload/index.js` punya listener `yt:track-updated` → forward ke `YoutubeMusicContext`
- [ ] Cek next/prev/playPause kirim keyboard event via `ytWindow.webContents.executeJavaScript`
- [ ] Cek `persist:mark-browser` ditambah ke ad-blocker session list
- [ ] Cek `backgroundThrottling: false` ada di youtube-player.js

## Update 2026-07-29 — Fix Implementation + Research

### Ringkasan

Semua 3 regressions dari security scan udah di-fix dan di-commit. Ditambah: latihan research pakai `context7-mcp` skill — berhasil validasi `backgroundThrottling` issue dan nemuin alternatif `sendInputEvent()`.

### Key Learnings

1. **Research skill pattern** — waktu nemu problem yang butuh referensi API / best practice, jangan nebak dari training data. Invoke skill: `context7-mcp` → `resolve-library-id` → `query-docs`. Source aktual dari Electron docs.
2. **`backgroundThrottling` ditemukan via research** — tanpa context7, kita gak akan tahu hidden renderer di-throttle di level C++ (`electron_api_web_contents.cc`).
3. **Upstream comparison timing** — jangan fix dulu baru cek upstream. Cek dulu: apakah upstream punya problem sama? Solusi mereka gimana?

### Files Modified in this Update

Sama seperti sesi utama — fix sudah di-commit ke `f9f871d`.

## Callback

Research skill udah terbukti berguna (context7-mcp). Mau coba `tavily-research` atau `you-research` untuk ATM upstream files yang worth? Atau langsung ATM `fallback-serializer.js` + `prompt-compressor.js` dari upstream?
