# Session Log: YouTube Music Ad-Free Player Optimization

**Tanggal:** 2026-09-19
**Branch:** feat/yt-music-adfree-stream
**Fokus:** Optimasi playback YouTube Music bebas dari injeksi iklan video dan overlay sponsor.

## 1. Analisis Masalah
- Pemutaran musik via embedded YouTube IFrame API sebelumnya berpotensi memuat iklan komersial, video annotations, kartu overlay sponsor, serta branding YouTube yang mengganggu UX pemutaran audio di latar belakang.
- Investigasi `yt-dlp` di host menunjukkan risiko cipher block HTTP 400 dari Google/YouTube saat token cipher diperbarui, sehingga mengandalkan binary external scraper langsung pada client berisiko tinggi rapuh (fragile).
- Pendekatan embedded IFrame aman via `host: 'https://www.youtube-nocookie.com'` memerlukan `playerVars` presisi untuk mematikan seluruh komponen overlay/anotasi dan meminimalkan banner.

## 2. Solusi Teknis
- **Host Privasi:** Mengunci pemutaran pada domain `https://www.youtube-nocookie.com` untuk memutus tracking iklan bertarget dan mencegah injeksi iklan berbasis profil Google.
- **Konfigurasi Anti-Iklan & Overlay:**
  - `iv_load_policy: 3`: Menonaktifkan seluruh video annotations, kartu sponsor, dan overlay banner interaktif.
  - `modestbranding: 1`: Menghilangkan watermark logo YouTube besar.
  - `rel: 0`: Mencegah rekomendasi video acak pihak ketiga di akhir pemutaran.
  - `playsinline: 1`, `controls: 0`, `disablekb: 1`, `fs: 0`: Memastikan player beroperasi murni sebagai audio stream engine tanpa interupsi keyboard/fullscreen eksternal.
- **Audio Guarding:** Menambahkan penanganan `unMute()` otomatis pada transisi status pemutaran agar stream audio tidak dibungkam diam-diam oleh browser engine WebKitGTK.

## 3. Verifikasi
- Unit test: `tests/musicPlayerAdfree.test.mjs` (3/3 pass).
- Unit test terkait: `tests/musicAmbiguity.test.mjs` (2/2 pass), `tests/choiceBus.test.mjs` (6/6 pass).
