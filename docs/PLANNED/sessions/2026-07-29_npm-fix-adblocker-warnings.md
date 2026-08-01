# Session: NPM Recovery + Adblocker Migration + Zero Warnings Cleanup

## Ringkasan

**Tanggal:** 2026-07-29  
**Branch:** `feat/performance-and-readibility`  
**Files touched:** `package.json`, `src/main/index.js`, `src/main/native-tools.js`, `src/main/tool-registry.js`, `src/renderer/src/App.jsx`, `src/renderer/src/api/oramaStore.js`, `src/renderer/src/hooks/agent/useMarkPlan.js`, `src/renderer/src/pages/Configuration.jsx`, `.nvmrc`, `.env`  
**Ringkasan:** `npm audit fix --force` sebelumnya telah merusak dependency tree — Electron hilang, yt-search downgrade ke 0.0.2 (API break), mpris-service turun major. Sesi ini memulihkan package.json ke original via `git checkout`, melakukan fresh install dengan Node 22 (dipaksa via `.nvmrc`), memigrasi `@cliqz/adblocker-*` yang deprecated ke `@ghostery/adblocker-*`, dan membersihkan semua Vite chunk warnings dari dynamic+static import conflict. Status akhir: **zero warnings, zero deprecations, zero errors** pada build maupun dev.

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
|---------|------|------------|-----|--------|
| `npm audit fix --force` merusak deps | `package.json` | `--force` override peer deps, downgrade react-router, transformers, mpris-service, yt-search, eslint-plugin-react, dan menghapus Electron | `git checkout HEAD -- package.json package-lock.json` + fresh install | ✅ Fixed |
| Baileys engine-requirements gagal | `node_modules/@whiskeysockets/baileys` | Node 18.19.1 tidak memenuhi `engine-strict` (butuh >=20) | Bikin `.nvmrc` dengan `22`, install via nvm | ✅ Fixed |
| `@cliqz/adblocker-*` deprecation warning | `package.json`, `index.js` | Package renamed to `@ghostery/adblocker-*` | Ganti import + install ulang | ✅ Fixed |
| `basename` unused import | `tool-registry.js` | Leftover dari refactor | Hapus dari destructure | ✅ Fixed |
| Vite chunk warnings (3x) | `native-tools.js`, `App.jsx`, `oramaStore.js`, `useMarkPlan.js`, `Configuration.jsx` | File di `import()` dynamic tapi juga `import` static di file lain → Vite cannot split | Ubah ke static import konsisten | ✅ Fixed |
| `yt-dlp` postinstall GitHub rate limit | `node_modules/youtube-dl-exec` | Anonymous API call kena rate limit | `YTDLP_SKIP_DOWNLOAD=1` di `.env` | ✅ Fixed |

## Files Modified

| File | Perubahan |
|------|-----------|
| `.nvmrc` | **New** — pin Node 22 |
| `.env` | Ditambah `YTDLP_SKIP_DOWNLOAD=1` |
| `package.json` | `@cliqz/adblocker-electron` → `@ghostery/adblocker-electron` |
| `src/main/index.js` | Import path: cliqz → ghostery |
| `src/main/native-tools.js` | Static import `closeBrowser`, hapus dynamic import |
| `src/main/tool-registry.js` | Hapus `basename` dari import |
| `src/renderer/src/App.jsx` | Static import `saveConfiguration` + `getExtractor`, hapus 2 dynamic imports |
| `src/renderer/src/api/oramaStore.js` | Static import `db`, hapus `await import('./db')` |
| `src/renderer/src/hooks/agent/useMarkPlan.js` | Static import `insertAuditLog`, hapus `.then()` dynamic import |
| `src/renderer/src/pages/Configuration.jsx` | Hapus 4 redundant `await import('../api/db')` yang duplikat static import |

## Agent Learnings

### Pattern Konkret

1. **`npm audit fix --force` is never safe** — Itu flag override peer dep constraints dan bisa nge-drop package entirely (Electron). Selalu audit dulu, `npm audit fix` (tanpa --force) untuk patch in-range aja. Untuk major vuln, upgrade manual dengan uji.

2. **Vite chunk warnings bukan error, tapi signal** — `(!) X is dynamically imported by Y but also statically imported by Z` berarti Vite gak bisa code-split. Fix: pilih satu arah (static atau dynamic) per file, jangan campur. Untuk file kecil/core (<10KB), static import aja.

3. **Postinstall scripts rentan pada environment mismatch** — `youtube-dl-exec` (yt-dlp binary download) gagal kena GitHub API rate limit; `@whiskeysockets/baileys` ngecek Node version via `engine-requirements.js`. Fix: `--ignore-scripts` + manual `electron-builder install-app-deps`, atau env var `YTDLP_SKIP_DOWNLOAD=1`.

4. **nvm shell function tidak inherit ke child process** — `source ~/.nvm/nvm.sh && nvm use 22` harus di-`source` di setiap shell yang mau pake Node 22. `.nvmrc` bantu developer lain, tapi `npm install` tetap perlu source explicit.

### File Invariants

| File | Invariant |
|------|-----------|
| `package-lock.json` | Jangan `--force` audit. Kalau terlanjur rusak: `git checkout HEAD -- package.json package-lock.json` + `rm -rf node_modules` + `npm install`. Jangan partial `npm audit fix --force` |
| `src/renderer/src/pages/Configuration.jsx` | `saveConfiguration` DAN `getAllConfig` SUDAH static import di line 21. Jangan `await import('../api/db')` lagi untuk fungsi itu. |
| `src/renderer/src/api/oramaStore.js` | `db` harus static import karena dipakai di seluruh fungsi hydrate; dynamic import cuma nambah 1 Vite warning tanpa benefit. |
| `.env` | `YTDLP_SKIP_DOWNLOAD=1` harus ada untuk menghindari GitHub rate limit pada `npm install` pertama. |

### Verification Checklist

- [ ] `npm run build` — zero `(!)` warnings, zero errors
- [ ] `npx electron-vite dev` — dev server starts, no deprecation spam
- [ ] `grep -r 'cliqz/adblocker' src/ package.json` — zero matches
- [ ] `node --version` >=20 (ideally 22)
- [ ] `npm install --ignore-scripts` selesai tanpa peer dep conflict

## Callback

Sesi ini fokus ke **zero warnings**. Ada request lain untuk kode atau feature? Atau lanjut ke improvement lain?
