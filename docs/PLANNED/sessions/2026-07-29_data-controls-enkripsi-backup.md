# Session: Integrated Data Controls — Export/Import/Enkripsi Backup ke Configuration

## Ringkasan

**Tanggal:** 2026-07-29  
**Branch:** `feat/performance-and-readibility`  
**Files touched:** `src/renderer/src/api/db.js`, `src/renderer/src/pages/Configuration.jsx`, `src/renderer/src/pages/DataControls.jsx` (dihapus), `src/renderer/src/App.jsx`, `src/renderer/src/components/core/FloatingMenu.jsx`  
**Ringkasan:** Berawal dari laporan dev activity yang menyebut commit `c2c5d70` ("RAG .json support + session knowledge import") — user mengaku tidak merasakan fiturnya. Investigasi menemukan `importSessionKnowledge()` adalah dead code (zero callers). Diskusi melebar ke backup/restore data MARK, enkripsi, PII, dan hirarki UI. Solusi akhir: semua fungsi data controls (export chat, import chat, hapus chat, full backup terenkripsi AES-256-GCM) tetap dalam satu halaman Configuration — tanpa page baru. Halaman DataControls yang sempat dibuat dihapus. Fungsi enkripsi AES-256-GCM + PBKDF2 ditambahkan ke db.js. API key tidak ikut backup.

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
|---------|------|------------|-----|--------|
| `importSessionKnowledge()` dead code | `ragPipeline.js:60` | Fungsi didefinisikan tapi tidak pernah dipanggil dari UI mana pun | Belum — butuh wire-up ke Knowledge.jsx (opsi: auto-detect `$schema` atau tombol terpisah) | ⚠️ Belum commit (ditemukan, belum diperbaiki) |
| Tidak ada fungsi export/import chat di UI | `Configuration.jsx` | Belum pernah diimplementasikan, hanya ada export chat dari sessions.id=1 | Ditambahkan `exportChat()`, `importChat()`, `handleExportChat`, `handleImportChatFile` ke Configuration | ✅ Fixed |
| Tidak ada backup/restore seluruh data | `db.js` | Belum ada | Ditambahkan `exportFullMark(password)`, `importFullMark(json, password)` — backup 10 Dexie store, enkripsi AES-256-GCM + PBKDF2 (600k iterasi) | ✅ Fixed |
| DataControls page tidak diperlukan | `DataControls.jsx` (dihapus) | Halaman baru hanya berisi 3-4 tombol — tidak justify page terpisah | Dihapus. Semua fungsi dikembalikan ke Configuration sebagai section Memory & Data | ✅ Fixed |
| FloatingMenu dan App.jsx punya link ke /data-controls | `FloatingMenu.jsx`, `App.jsx` | Akibat pembuatan page baru | Dikembalikan ke semula | ✅ Fixed |
| API key ikut backup | `db.js` | Awalnya semua config termasuk API key ikut dump | `exportFullMark()` strips `groqApiKey`, `cerebrasApiKey`, `customApiKey` sebelum backup | ✅ Fixed |

## Files Modified

| File | Perubahan |
|------|-----------|
| `src/renderer/src/api/db.js` | **New functions:** `encryptBackup()`, `decryptBackup()` (AES-256-GCM + PBKDF2 600k), `exportChat()`, `importChat()`, `exportFullMark(password)`, `importFullMark(text, password)` — backup/restore 10 store, API key di-strip saat export. Semua Web Crypto API via `crypto.subtle` (zero dependencies) |
| `src/renderer/src/pages/Configuration.jsx` | Section Memory & Data dirombak: tombol Export Chat (plain JSON), Import Chat (upload + validasi + `importChat()`), Hapus Semua Chat, Export & Enkripsi (``exportFullMark(backupPw)``), Restore dari Backup. State `backupBusy`, `backupPw`, `restorePw`. Import `exportChat, importChat, exportFullMark, importFullMark` dari db.js |
| `src/renderer/src/pages/DataControls.jsx` | **New** (dibuat lalu dihapus) |
| `src/renderer/src/App.jsx` | Route `/data-controls` + import `DataControls` dihapus. Kembali ke semula |
| `src/renderer/src/components/core/FloatingMenu.jsx` | Link "Data Controls" + icon `FaSlidersH` dihapus. Kembali ke semula |

## Agent Learnings

### Pattern Konkret

1. **Dead code trap** — `importSessionKnowledge()` didefinisikan sebagai fungsi ekspor dengan rich metadata (confidence, source, agent), tapi tidak pernah dipanggil dari mana pun. User upload `.json` hanya lewat `ingestDocument()` → `extractTextFromJSON()` yang treat JSON sama seperti teks biasa. Cek caller count setiap kali nambah fungsi baru di `api/`.

2. **Page sprawl vs single page** — User nolak page terpisah untuk 3-4 tombol. Argumen: ChatGPT, Claude, DeepSeek semua punya sidebar dengan halaman settings yang fleksibel, bukan banyak page. Kecuali fiturnya kompleks (150+ lines), masukin aja sebagai collapsible section. Kurangi jumlah route.

3. **Enkripsi di Electron tanpa native module** — Web Crypto API (`crypto.subtle`) cukup untuk AES-256-GCM. PBKDF2 dengan 600.000 iterasi standar OWASP. Zero dependency tambahan. Yang penting: salt dan IV di-random, disimpan sebagai base64 di file backup — bukan hardcoded.

### File Invariants

| File | Invariant |
|------|-----------|
| `src/renderer/src/api/db.js` | `exportFullMark()` harus strip `groqApiKey`, `cerebrasApiKey`, `customApiKey` sebelum dump. Jangan pernah backup API key mentah. |
| `src/renderer/src/api/db.js` | Jangan auto-import fungsi backup. Impor oleh page yang butuh, jangan di `App.jsx` startup. |
| `src/renderer/src/pages/Configuration.jsx` | Section Memory & Data jangan dipindah ke page terpisah tanpa validasi ada cukup konten (>100 lines JSX) |

### Verification Checklist

- [ ] Build pass — `npx electron-vite build` tanpa error
- [ ] Export chat plain → file .json → import kembali → data tampil
- [ ] Export full dengan password → file .json terenkripsi → restore dengan password yang sama → data kembali
- [ ] Restore dengan password salah → error graceful, data tidak hilang
- [ ] File backup tidak mengandung groqApiKey/cerebrasApiKey/customApiKey di plaintext
- [ ] Import chat plain (non-encrypted) tetap jalan — backward compatible

## Callback

Session knowledge import (`importSessionKnowledge()`) masih dead code. Mau di-wire up sebagai tombol "Import Session Knowledge" di Knowledge.jsx, atau auto-detect `$schema` di `ingestDocument()`? Yang pertama explicit, yang kedua seamless.
