# Session Log: Audit dan Stabilitas Browser Extension Bridge (Paket 2)

**Tanggal:** 2026-09-19  
**Status:** Selesai (Paket 2 dari 4)  
**Tujuan:** Mengaudit handshake dan stabilitas ekstensi browser MV3, menyelesaikan issue di mana popup ekstensi berwarna hijau namun agen/sub-agent gagal dengan timeout 90 detik.

---

## 1. Analisis Masalah & Root Cause

1. **Session Queue Disconnect (Sub-Agent Routing):**
   - Di `subagentExecutor.js`, perintah native tools browser dipanggil dengan `sessionId = subagentId`.
   - Hal ini membuat sidecar `bridge-core.mjs` mengantrekan perintah ke dalam antrean pending sesi spesifik subagent (`sessions.get(subagentId).pending`).
   - Sementara itu, ekstensi browser Chrome hanya melakukan long-poll ke endpoint `/poll?session=default`.
   - Akibatnya, perintah yang ditujukan untuk subagent menggantung di antrean sesi subagent dan tidak pernah diambil oleh ekstensi browser yang terhubung, hingga akhirnya melempar error timeout 90.000ms: `"Perintah browser '...' kedaluwarsa (90000ms). Kemungkinan ekstensi Abelink tidak terpasang..."` meskipun status popup ekstensi hijau (connected) pada sesi default.

2. **MV3 Service Worker Keep-Alive:**
   - Chrome MV3 background service worker secara agresif mematikan event page setelah idle selama 30 detik.
   - Panggilan `chrome.alarms.onAlarm` diperkuat untuk memastikan siklus `loop()` polling selalu aktif jika token tersedia dan koneksi belum terputus.

---

## 2. Perubahan yang Dilakukan

1. **`sidecar/main/browser/bridge-core.mjs`:**
   - **Unified Queue Draining di `takeNext`:**
     Jika ekstensi melakukan long-poll pada sesi `default`, ketika antrean pending sesi default kosong, server secara cerdas memeriksa antrean pending dari sesi-sesi lain (seperti sesi subagent) dan menyerahkan perintah tersebut ke ekstensi.
   - **Waking Signal Propagation:**
     Ketika `dispatchCommand` dipanggil untuk sesi non-default, sistem juga memicu pemanggilan `wake(def)` pada sesi default agar long-poll yang sedang menunggu langsung terbangun dan mengambil perintah subagent seketika tanpa latency timeout.
   - **Unit Tests:**
     Menambahkan pengujian komprehensif `unified queue draining: polling sesi default dapat menguras perintah dari subagent session` di `tests/browser-bridge.test.mjs`.

2. **`extension/background.js`:**
   - Memperkuat listener `chrome.alarms` (`abelink-bridge-keepalive`): jika status `running` mati, jalankan `tryAutoResume()`. Jika masih berjalan, pastikan loop polling aktif jika belum ada controller aktif.

---

## 3. Verifikasi & Pengujian

- **Unit Tests:**
  `bunx vitest run tests/browser-bridge.test.mjs tests/browser-flavor.test.mjs tests/browser-autoclose.test.mjs tests/browser-snapshot.test.mjs`
  -> **4 file lulus, 47/47 tests passed (100%)**.
