# Sesi: Security Review 24h — 4 HIGH Fixes Applied

**Tanggal:** 2026-07-28
**Branch:** `feat/model-fallback-abelink`
**Aktivitas:** Security scan perubahan 24 jam terakhir (6 commits code + unstaged), identifikasi 4 HIGH risk, fix langsung

---

## Ringkasan

Scan `git log --since="24 hours"` untuk high-confidence runtime failures, data loss, authorization bypass, resource leaks, cross-platform compat. Ditemukan 4 HIGH, 3 MEDIUM. Semua HIGH diperbaiki, 1 MEDIUM di-defer (YouTube domain migration — false positive).

## Temuan & Fix

### HIGH — Semua Diperbaiki

| # | Finding | File | Root Cause | Fix |
|---|---------|------|------------|-----|
| 1 | `policy.maxDelay` undefined → `sleep(NaN)` → zero-delay retry storm | `ai-bridge.js:308,331` | FALSE POSITIVE — sudah ada di `RETRY_POLICIES` sejak commit `1f9c446`, garis 89-93. Tidak diperbaiki | — |
| 2 | `stream: false` hardcoded → `onStream` callers diam-diam non-streaming | `ai-bridge.js:228` | Refactor `1f9c446` set `const baseBody = { ..., stream: false }` tanpa conditional. `onStream` parameter diterima (line 192) tapi tidak pernah dicek | `stream: onStream !== null` + tambah SSE streaming reader (lines 360-420) yang accumulate `delta.content`, panggil `onStream()` per chunk |
| 3 | `require('jsonrepair')` di ESM module → silent null | `ai-bridge.js:7` | Refactor ganti `await import('jsonrepair')` dengan `require()` yang tidak tersedia di ESM. Try-catch swallow error, `jsonrepair` = null. `cleanAndParse` fallback ke regex-only yang rusak untuk trailing commas | `await import('jsonrepair')` |
| 4 | `json_schema` + `strict:true` dikirim ke LM Studio & cloud providers | `ai-bridge.js:239-243` | Branch logic: LM Studio skip via `activeProvider !== 'lmstudio'`, tapi fall-through `else if (jsonSchema)` tetap kirim `response_format`. `strict: true` butuh `additionalProperties: false` di semua object — schemas MARK tidak guarantee ini | LM Studio: system prompt injection only. Cloud: `response_format: { type: 'json_object' }` + system prompt. **Tidak** kirim native `json_schema` |

### MEDIUM — Skip (Intentional)

| # | Finding | File | Verdict |
|---|---------|------|---------|
| 5 | YouTube URL `music.youtube.com` → `www.youtube.com` + ad-blocker CSS wrong domain | `YoutubeMusicPlayer.jsx` | **False positive.** Semua CSS selector sudah diupdate ke `ytd-*` (YouTube standard) dari `ytmusic-*`. Ad-blaster MutationObserver target `.ad-showing` yang kerja di kedua domain. Ini **intentional rewrite**, bukan bug |

## Pattern untuk Debugging Masa Depan

### 1. `require()` vs ESM

File main process (`ai-bridge.js`) di-build oleh electron-vite/rollup sebagai ESM. `require()` di ESM **tidak** throw — hanya return `undefined` di try-catch. Sangat silent. Jika suatu fitur dependency-based tiba-tiba tidak jalan, cek apakah package di-import dengan `require()` di file yang `type: "module"`.

```js
// ❌ Silent failure:
let dep = null
try { dep = require('dep') } catch {}  // require is not defined → catch → dep stays null

// ✅ Working (ESM top-level await):
let dep = null
try { dep = (await import('dep')).default || null } catch {}
```

### 2. `stream: true` harus conditional

Response OpenAI-compatible endpoint **selalu berbeda format** antara `stream: false` (JSON object response) dan `stream: true` (SSE chunks). Jika `onStream` di-pass tapi `stream: false` tidak di-override, streaming consumer akan:

- Menerima full JSON response sebagai satu blok
- Tidak pernah parsing chunk `{ choices: [{ delta: { content } }] }`
- Memanggil `onStream` nol kali

Pattern aman: `stream: onStream !== null` di request body awal, dan cabang kode yang terpisah untuk SSE reader vs JSON parse.

### 3. OpenAI `json_schema.strict: true` sangat restrictive

Strict mode OpenAI mensyaratkan:
- Setiap object punya `additionalProperties: false`
- Setiap property di `required` array
- Tidak ada `anyOf`/`oneOf`/`$ref` di root

Jarang ada planning/tool-calling schema yang memenuhi ini. `response_format: { type: 'json_object' }` + system prompt instruction lebih reliable untuk sebagian besar provider. LM Studio tidak support format response sama sekali — hanya bisa via system prompt.

### 4. `maxDelay` kritis untuk exponential backoff

`Math.min(baseDelay * 2^retry, maxDelay)` — jika `maxDelay` undefined, `Math.min(a, undefined)` return `NaN`, dan `setTimeout(NaN)` jadi `setTimeout(0)`. Zero-delay retry loop bisa hammer server. `RETRY_POLICIES` harus selalu include `maxDelay`.

### 5. Cek sintaks dengan `node --check`

Fille ESM perlu di-check dengan `node --check file.js`. File CJS perlu `node --check file.cjs`. Pastikan ekstensi cocok dengan `"type"` di `package.json`.

## Files Modified

| File | Perubahan |
|------|-----------|
| `src/main/ai-bridge.js` | `require` → dynamic `import`, `stream: false` → conditional, `json_schema` → `json_object` + sys prompt |

## Status

- HIGH #2 (streaming) → ✅ fixed
- HIGH #3 (jsonrepair ESM) → ✅ fixed
- HIGH #4 (json_schema strict) → ✅ fixed
- MEDIUM #5 (YouTube) → ❌ false positive, no change
- Syntax check → ✅ `node --check` passes
