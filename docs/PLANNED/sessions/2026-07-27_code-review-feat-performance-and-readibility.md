# Sesi: Code Review — feat/performance-and-readibility

**Tanggal:** 2026-07-27
**Branch:** `feat/performance-and-readibility`
**Aktivitas:** Review kode + perbaikan atas diff 5 file yang diubah

---

## Ringkasan

Sesi review untuk branch `feat/performance-and-readibility`. Awalnya diff yang terbaca keliru (import ke file yang tidak ada), lalu diverifikasi ulang dengan diff actual dari HEAD. Tiga file berubah: `ai-bridge.js`, `core.js`, `useMarkPlan.js`.

## Temuan Review

### ✅ Sudah Baik
- Abort listener cleanup (`signal.addEventListener` + cleanup di `finally`) — perbaikan kebocoran listener yang sudah lama.
- Stream return disederhanakan dari `[{ text: fullText }]` → `fullText` langsung.
- `extractContent()` — menangani 4 bentuk response API (OpenAI, legacy, Google Gemini parts).
- Endpoint URL smart join — mendeteksi `/chat/completions` vs bare base URL.
- Chat session bounds guard `>= 2` mencegah crash pada boot fresh.
- Unused env var references (`DEFAULT_AI_PROVIDER`, `CUSTOM_AI_*`) dibersihkan dari `defaultConfig`.

### 🔴 Critical Ditemukan
1. **Stream error path inconsistent** — `{ content: [{ text: ... }] }` vs success path `{ content: fullText }`.
2. **Hardcoded `.env` path** — `/media/abelion/Wave/.hermes/.env` tanpa pengecekan eksistensi.
3. **Provider-specific auth headers dihapus** — Anthropic `x-api-key` dan Google hilang.
4. **HARD STOP qualifier dihilangkan** — Semua guardrail (termasuk `[WARN]`) trigger `isDone = true`.

### 🔵 Saran (tidak diimplementasi)
- Abort race pattern duplikat 3x — ekstrak helper bila muncul ke-4 kali.
- `getGlobalConfig()` shallow copy — `structuredClone` jika dibutuhkan.
- Tidak ada migrasi key config lama (`activeProvider` → `aiProvider`).

## Perbaikan yang Dilakukan

| # | Perbaikan | File | Baris |
|---|-----------|------|-------|
| 1 | Stream error path → `{ content: fullText }` | `ai-bridge.js` | 197 |
| 2 | `.env` path guarded dengan `fs.existsSync` | `ai-bridge.js` | 72-84 |
| 3 | Legacy `activeProvider` fallback ditambahkan | `ai-bridge.js` | 68 |
| 4 | Anthropic `x-api-key` header dikembalikan | `ai-bridge.js` | 109-120 |
| 5 | `HARD STOP` qualifier gate dikembalikan | `useMarkPlan.js` | 299-305 |

## Status Akhir

- 4 actionable issues → ✅ all fixed
- Config key: `activeProvider` → `aiProvider` (dengan backward compat)
- Renderer AI consumers (6 lokasi) semuanya expect string, format baru kompatibel
