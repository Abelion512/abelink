# Sesi: Bug Hunt + YouTube Music Migration + Model Registry Redesign

**Tanggal:** 2026-07-28
**Branch:** `feat/performance-and-readibility`
**Aktivitas:** Bug hunting, YouTube Music → YouTube biasa, model registry 100% JSON-driven, vision-service wiring

---

## Ringkasan

Sesi panjang multi-tahap: (1) bug hunt menemukan config mismatch `aiProvider` vs `activeProvider`, (2) migrasi YouTube Music webview ke YouTube biasa dengan anti-detection, (3) redesign model registry dari hardcoded ke 100% file-driven, (4) wiring vision-service.js yang sebelumnya orphan.

---

## Temuan & Perbaikan

### 🔴 Critical: Config Key Mismatch

**Masalah:** Renderer kirim `config.aiProvider`, main process baca `conf.activeProvider` — selalu `undefined`, fallback ke `lmstudio`.

**Bukti:**
- `src/renderer/src/api/db.js` — schema Dexie pakai field `aiProvider`
- `src/renderer/src/pages/Configuration.jsx` — UI simpan ke `aiProvider`
- `src/main/ai-bridge.js:68` — baca `conf.activeProvider` (salah)

**Fix:** Ganti `conf.activeProvider` → `conf.aiProvider` di `ai-bridge.js`.

**Impact:** Custom AI provider (9Router, Groq, Cerebras) tidak pernah terpakai sebelumnya. Semua request jatuh ke LM Studio.

---

### 🟡 YouTube Music → YouTube Biasa

**Masalah:** User terbiasa YouTube biasa, bukan YouTube Music. Webview `music.youtube.com` sering ERR_FAILED.

**Perubahan:**
1. `music.youtube.com` → `www.youtube.com` (4 lokasi)
2. Label UI: "YouTube Music" → "YouTube Player"
3. Badge: `ytmusic` → `yt`
4. CSS: hapus 5 selector khusus YT Music
5. Chrome UA spoofing (anti Electron detection)
6. `webSecurity=no` untuk cross-origin
7. Ad-blaster JS diperkuat: MutationObserver + 500ms polling
8. Anti-detection: `navigator.webdriver=false` via main process `did-attach-webview`

**Yang tidak works:**
- Renderer-side `executeJavaScript` untuk anti-detection → `GUEST_VIEW_MANAGER_CALL` error
- `did-start-loading` event → terlalu awal, context belum ready
- Akhirnya pindah ke main process `did-attach-webview` + `dom-ready`

**Catatan:** YouTube black screen di Electron webview masih bisa muncul karena:
- Google consent cookies belum di-accept
- `navigator.webdriver` terdeteksi meski sudah di-override
- User agent spoofing tidak 100% efektif

---

### 🟡 Model Registry Redesign

**Masalah:** Model data hardcoded di `DEFAULT_REGISTRY` + `MODEL_CATALOG` dalam code. Tambah model = edit JS = rebuild.

**Sebelum:**
```js
const MODEL_CATALOG = {
  'opencode/deepseek-v4-flash-free': { type: 'reasoning', tags: [...], ... },
  // ... 6 model hardcoded
}
const DEFAULT_COMBOS = {
  mark: { models: [...], vision: '...', ... },
  // ... 4 combo hardcoded
}
```

**Sesudah:**
- `~/.config/mark-agent/model-registry.json` = SINGLE SOURCE OF TRUTH
- Code hanya `loadRegistry()` → baca JSON → cache 60s
- Zero hardcoded model data di code
- Tambah model = edit JSON, zero code change

**Struktur JSON:**
```json
{
  "models": { "<model-id>": { "type": "...", "tags": [...], "supportsVision": bool, "visionRole": "deep|realtime", ... } },
  "combos": { "<combo-name>": { "models": [...], "vision": "...", "visionRealtime": "..." } },
  "analytics": { "models": {} }
}
```

**Vision routing:**
- `deep` role → Mimo v2.5 (OCR, detail analysis)
- `realtime` role → Gemini Flash Lite (speed, live monitoring)

---

### 🟡 Vision Service Wiring

**Masalah:** `vision-service.js` (123 baris) exist tapi **zero imports** — orphan file. CLAUDE.md: "Jangan buat file baru tanpa wiring ke call path."

**Perubahan:**
1. Import `analyzeScreen` + `analyzeCamera` di `useMarkPlan.js`
2. `analyze-screen` tool → panggil `analyzeScreen()` (deep role)
3. `camera-look` tool → panggil `analyzeCamera()` (realtime role)
4. Tambah IPC handlers di main process: `vision:resolve-model` + `vision:get-endpoint`
5. Tambah preload bridge: `resolveVisionModel()` + `getModelEndpoint()`

---

### 🔵 Build Fixes

1. **Top-level await** di `ai-bridge.js:7` — `await import('jsonrepair')` di module scope → wrap dalam async IIFE
2. **Unused import** `webContents` di `index.js` — dihapus
3. **Registry path** — `join(__dirname, 'model-registry.json')` tidak work di production (file tidak di-copy) → pindah ke `~/.config/mark-agent/`

---

## Lessons Learned untuk AI Agent

### 1. Config Key Mismatch — Pola Umum
Renderer dan main process sering pakai key names berbeda untuk field yang sama. **Selalu cross-check:**
- Dexie schema field names
- `Configuration.jsx` state keys
- `ai-bridge.js` config reading
- IPC payload structure

### 2. Electron Webview — Anti-Detection Tidak Sederhana
- `navigator.webdriver` di-setting oleh Chromium, bukan oleh page scripts
- Renderer-side `executeJavaScript` terlalu lambat — YouTube sudah detect sebelum script jalan
- **Solusi:** Main process `did-attach-webview` + `dom-ready` → `webContents.executeJavaScript()`
- Meski sudah di-override, YouTube masih bisa block karena faktor lain (consent, cookies, TLS fingerprint)

### 3. Orphan Files — Cek Wiring
**Sebelum buat file baru atau modify file yang tidak di-import:**
```bash
grep -rn "filename" src/ --include="*.js" --include="*.jsx" | grep -v "filename.js:"
```
Jika hasil kosong → file orphan, perlu di-wire atau dihapus.

### 4. JSON Registry > Hardcoded
**Prinsip:** Data yang berubah = JSON. Logic yang berubah = code.
- Model metadata = data → JSON
- Combo definitions = data → JSON
- Vision routing logic = code (tapi configurable via JSON)
- Analytics tracking = code (tapi output ke JSON)

### 5. Build Pipeline — Static Files
`electron-vite` tidak copy static JSON ke `out/`. Pilihan:
- Embed di code (OK untuk config kecil)
- Pakai `~/.config/` path (OK untuk user config)
- Tambah copy step di `electron.vite.config.mjs`

### 6. CLAUDE.md Adalah Contract
**Selalu baca CLAUDE.md sebelum mulai coding.** Banned patterns:
- Jangan hapus fallback serializer chain
- Jangan ubah memory thresholds tanpa cross-ref
- Jangan hardcode API keys
- Jangan pindahin AI stack ke main process
- Jangan buat file baru tanpa wiring

---

## File yang Diubah

| File | Change | LOC |
|------|--------|-----|
| `ai-bridge.js` | Registry 100% file-driven, zero hardcode | +109/-50 |
| `index.js` | Vision IPC handlers, anti-detection | +37/-0 |
| `preload/index.js` | Vision bridge methods | +4/-0 |
| `vision-service.js` | Registry-based routing, dual-path | +123/-88 |
| `useMarkPlan.js` | Wired vision-service, simplified tool handlers | +74/-201 |

## Status Akhir

- ✅ Config mismatch fixed (`aiProvider` vs `activeProvider`)
- ✅ YouTube Music → YouTube biasa (dengan anti-detection best-effort)
- ✅ Model registry 100% JSON-driven
- ✅ Vision service wired (deep=Mimo, realtime=Gemini)
- ✅ Build clean
- ⚠️ YouTube black screen — best-effort anti-detection, mungkin perlu Google consent
- ⚠️ Last.fm 403 — API key belum di-set di Settings
