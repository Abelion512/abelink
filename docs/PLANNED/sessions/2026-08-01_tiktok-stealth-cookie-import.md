# Session: TikTok Stealth — Cookie Import Fix + Verification

## Ringkasan

**Tanggal:** 2026-08-01
**Branch:** `worktree-tiktok-stealth`
**Files touched:** `scripts/import-tiktok-cookies.mjs`, `src/main/index.js`, `src/main/browser-agent.js`, `docs/PLANNED/sessions/2026-08-01_tiktok-stealth-cookie-import.md`
**Ringkasan:** Lanjutan PR #19 (TikTok stealth) yang sudah di-merge. Sesinya kali ini fokus eksekusi manual: WARP exclude domain TikTok diverifikasi (IP asli keluar, bukan Cloudflare), cookie session TikTok dari Brave di-import ke partition `persist:mark-browser` dengan 3 cookie berhasil (`sessionid`, `sessionid_ss`, `tt_session_tlb_tag`), UA Chrome patch sudah di-commit. Fix besar: script import awalnya `Imported 0` — root cause `process.argv[2]` di Electron menunjuk path script, bukan argumen cookie.

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
|---------|------|------------|-----|--------|
| Script import `Imported 0 cookies` | `scripts/import-tiktok-cookies.mjs` | Di Electron, `process.argv[2]` = path script (bukan argumen cookie) karena `--no-sandbox` ada di argv[1]. Script baca dirinya sendiri, parse gagal → 0 cookie | Cari argumen `.txt` via `process.argv.find()` | ✅ Fixed (commit `d5523bc`) |
| Cookie file domain leading dot | `/tmp/tiktok_cookies.txt` | Format Netscape `domain` dengan leading dot (`.tiktok.com`) → Electron reject `invalid Domain attribute` | Tulis domain tanpa dot (`tiktok.com`) | ✅ Fixed |
| Script hang (tidak exit) | `scripts/import-tiktok-cookies.mjs` | Unhandled promise rejection + `app.exit()` tidak dipanggil | Tambah `app.disableHardwareAcceleration()` + try/catch per cookie | ✅ Fixed |
| Login TikTok di Mark gagal ("max attempts") | `src/main/browser-agent.js` | IP Cloudflare WARP (datacenter, flagged) + UA Electron bocor | WARP exclude domain TikTok + UA Chrome patch | ✅ Fixed (PR #19) |

## Files Modified

| File | Perubahan |
|------|-----------|
| `scripts/import-tiktok-cookies.mjs` | **New** — import cookie Netscape ke partition, fix argv index |
| `src/main/index.js` | UA Chrome real (major version sinkron dari Chromium embedded) |
| `src/main/browser-agent.js` | Handler `Sec-CH-UA` claim Chrome, scope partition mark-browser saja |
| `docs/PLANNED/sessions/2026-08-01_tiktok-stealth-cookie-import.md` | **New** — session log ini |

## Agent Learnings

### Pattern Konkret

1. **Electron `process.argv` — index script berbeda** — Saat jalankan `electron --no-sandbox script.mjs file.txt`, `process.argv[2]` = path script, `file.txt` di index 3+. Jangan hardcode index; cari pola argumen (`.txt`). Silent failure: script jalan tapi baca file sendiri → 0 hasil, tidak ada error.
2. **Cookie domain leading dot di Electron** — `cookies.set({domain: '.tiktok.com'})` → `invalid Domain attribute`. Domain tanpa dot (`tiktok.com`) → tersimpan sebagai `.tiktok.com` di cookie store. Jangan copy domain Netscape mentah-mentah.
3. **`app.exit(0)` wajib di script CLI Electron** — tanpa itu, process hang (tidak ada window). Tambah di akhir `whenReady().then()`.
4. **`cookies.set()` resolve undefined** — bukan error; verifikasi via `cookies.get()` setelah set.

### File Invariants

| File | Invariant |
|------|-----------|
| `src/main/index.js` | Jangan hapus switch UA — TikTok & YouTube bergantung pada identity browser |
| `src/main/browser-agent.js` | Handler `Sec-CH-UA` scope partition `persist:mark-browser` SAJA — jangan `defaultSession` (main window + API traffic tak tersentuh) |

### Verification Checklist

- [x] WARP exclude: `warp-cli tunnel host list` → 3 domain TikTok
- [x] IP asli: `curl --resolve www.tiktok.com` → HTTP 200 via Akamai (bukan Cloudflare)
- [x] Cookie tersimpan: `cookies.get()` → sessionid, sessionid_ss, tt_session_tlb_tag
- [x] Syntax: `node --check` → index.js + browser-agent.js OK
- [x] Build: `npm run build` → exit 0, `✓ built in 1m 6s`
- [ ] **E2E (belum diverifikasi):** `npm run dev` → `browser-navigate https://www.tiktok.com` → cek login tampil

## Callback

Apakah perlu lanjut tes E2E (jalankan `npm run dev` + `browser-navigate` ke TikTok) untuk konfirmasi login tampil, atau cukup sampai verifikasi build?
