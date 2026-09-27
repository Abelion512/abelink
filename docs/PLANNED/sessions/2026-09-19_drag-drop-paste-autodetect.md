# Session Log: 2026-09-19 - Auto-Detect Drag & Drop dan Paste

**Branch:** `feat/drag-drop-paste-autodetect` -> merge ke `feat/apple-design`  
**Area:** Attachment Ingestion (Drag-and-Drop, Screenshot Paste, Linux File Manager URI, Web HTML `<img>`)  
**Status:** Complete (Tests 12/12 passed, 0 eslint errors)

## 1. Konteks Masalah
Pada Linux WebKitGTK dan desktop Linux (Nautilus/Dolphin):
1. Menyeret file dari desktop/file manager melayang di atas jendela aplikasi sering kali tidak memicu HTML5 `dragenter` standar secara konsisten. Tauri v2 menyediakan event bawaan `tauri://drag-enter`, `tauri://drag-over`, dan `tauri://drag-leave`, namun sebelumnya `DropAnywhere` hanya mendengarkan `tauri://drag-drop`.
2. Menyalin file dari file manager Linux mengisi clipboard dengan `text/uri-list` (`file:///path/to/file`), bukan blob `item.kind === 'file'`. Pengecekan lama di `InputBar.jsx` dan `DropAnywhere.jsx` menolak data tersebut.
3. Menyeret atau menyalin elemen gambar dari peramban web mengirimkan tag HTML `text/html` dengan atribut `<img src="...">`, bukan raw bytes file.

## 2. Perubahan Teknis
1. **`src/utils/attachments.js`:**
   - Menambahkan penanganan `file://` URI pada `extractDroppedItems` dan `extractClipboardFiles`.
   - Mengurai path lokal, mendekode URI, dan mengisi metadata stat path via `window.api.statPath`.
   - Menambahkan ekstraksi regex `<img[^>]+src=["']([^"']+)["']/gi` dari payload `text/html` untuk drop maupun paste dari web.
2. **`src/components/core/DropAnywhere.jsx`:**
   - Memasang listener native Tauri v2: `tauri://drag-enter`, `tauri://drag-over`, dan `tauri://drag-leave` untuk memunculkan dan menyembunyikan overlay visual saat file OS melayang.
   - Memperluas filter `hasDropData` agar mencakup `text/html` dan MIME `image/*`.
   - Memperbaiki `onPaste` agar mengecek `text/uri-list`, `file://`, dan `text/html`.
3. **`src/components/core/InputBar.jsx`:**
   - Memperbaiki `handlePaste` agar tidak memblokir event jika clipboard berisi `text/uri-list`, `file://`, atau `text/html` dengan tag image.
4. **`tests/attachments.extract.test.mjs`:**
   - Suite pengujian unit baru mencakup ekstraksi file:// URI lokal, parsing HTML `<img>`, URL web standar, dan fallback clipboard.

## 3. Verifikasi
- `bunx vitest run tests/attachments.extract.test.mjs tests/attachments.url.test.js`: 12/12 passed.
- `bunx eslint src/utils/attachments.js src/components/core/DropAnywhere.jsx src/components/core/InputBar.jsx tests/attachments.extract.test.mjs`: 0 errors.
