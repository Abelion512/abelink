# Sesi: Code Review + Critical Fix — feat/model-fallback-abelink

**Tanggal:** 2026-07-28
**Branch:** `feat/model-fallback-abelink`
**Aktivitas:** Code review 40 files (+6.5K/-6.8K), fix hardcoded API key, debug turn timeout spiral

---

## Ringkasan

Sesi review branch `feat/model-fallback-abelink` yang berisi model registry dinamis, tool registry v2, guard gate, output sanitizer, prompt compressor, vision service, fallback serializer, MPRIS/yt-dlp/Last.fm service baru, dan refactor planning loop.

## Temuan Review (5 Axis)

### ✅ Correctness & Architecture Baik
- **fallback-serializer.js** — 3-tier format fallback (JSON → XML → key-value) cegah retry death spiral ✅
- **prompt-compressor.js** — hermetic, token estimation, protect-first/last-N configurable ✅
- **guard-gate.js** — circuit breaker pattern untuk tool failures ✅
- **Model registry** — pluggable combo system, analytics tracking per model ✅
- **ytdl-service/mpris-service** — clean abstractions, cache dengan TTL ✅

### 🔴 Critical Ditemukan
1. **Hardcoded Last.fm API key** — `'0b1c0c1e3b7f4b3e8e5b6f7c8d9e0f1a'` di committed file → **FIXED**
2. **Turn Governor timeout 30s** — model reasoning ambil >30s, truncate JSON → parse gagal → retry spiral
3. **`cleanAndParse` terima Array** — `JSON.parse` return `Array(4)` yang lolos → parser lanjutan gagal → null → retry

### 🔵 High Severity (Catatan)
- **tool-registry.js** (343 baris) — **zero imports**, tidak terpakai di mana pun (YAGNI — delete atau wire)
- **vision-service.js** (88 baris) — **zero imports**, `analyzeScreen`/`analyzeCamera` tidak dipanggil
- **`jsonrepair` silent failure** — import diganti lazy require dengan try-catch, tapi gagal tidak ada warning

### 🟡 Medium
- **output-sanitizer.js** — `BROWSER_TOOLS` missing `browser-ask-user`
- **mpris-service.js** — static ESM import bisa gagal di non-DBus platform (pakai dynamic import lebih aman)

## Perbaikan Dilakukan

| # | Perbaikan | File | Detail |
|---|-----------|------|--------|
| 1 | Hardcoded API key → config/env | `lastfm-service.js` | Ganti `const API_KEY=...` dengan `process.env.LASTFM_API_KEY` + `setApiKey()` |
| 2 | Flat cache → Map multi-user | `lastfm-service.js` | Cache keyed by user name, bukan single flat object |
| 3 | Config schema v15 + `lastfmApiKey` | `db.js` | Dexie schema tambah field `lastfmApiKey` |
| 4 | UI Config field | `Configuration.jsx` | Input Last.fm API Key dengan show/hide toggle |
| 5 | Config sync ke main | `index.js` | Panggil `setLastfmKey()` di handler `sync-config` |
| 6 | Turn timeout 30s → 90s | `useMarkPlan.js` | `PER_TURN_TIMEOUT_MS` dari 30000 → 90000 |
| 7 | `cleanAndParse` reject array | `core.js` | Tambah `!Array.isArray()` guard di fast path + repaired path |

## Status Akhir

- Critical #1 (API key) → ✅ fixed + config chain lengkap
- Critical #2 (timeout) → ✅ timeout dinaikkan
- Critical #3 (array parse) → ✅ guard ditambahkan
- High (tool-registry, vision-service) → **tidak dihapus**, diarahkan ke PR berikut
- Last.fm → user setuju untuk **diganti dengan log lokal** dari YT Music history (PR terpisah)
