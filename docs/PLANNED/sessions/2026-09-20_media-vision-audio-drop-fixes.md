# Session Log: 2026-09-20 - Media, Vision, Audio Drop & Auto-Compact Improvements

## 1. Ringkasan Pekerjaan
Penyelesaian tuntas seluruh 7 poin feedback evaluasi dan keputusan sesi grill-me:
1. **Auto-Compact Hybrid (Hermes + Anthropic Pattern):**
   - Menurunkan ambang batas karakter `MAX_SESSION_CHARS` dari 525.000 menjadi 45.000 karakter (~11k token).
   - Menambahkan pemicu giliran aktif `MAX_UNCOMPACTED_TURNS = 20` pada `src/api/ai/sessionCompactor.js`.
   - Menjaga kompresi tool in-memory tetap berjalan proaktif sebelum masuk ke summarizer AI.
2. **YoutubeMusicContext & YoutubeMusicPlayer Queue Reordering:**
   - Menghapus teks lama *"Pemutar Musik Internal Embedded API"* dan menggantinya dengan kontrol antrean interaktif.
   - Menambahkan state dan helper `reorderQueue`, `removeFromQueue`, `enqueuePlaylist`, dan `previewSnippet` di `src/contexts/YoutubeMusicContext.jsx`.
   - Mengimplementasikan panel *Antrean Lagu (Queued Tracks)* pada `src/components/YoutubeMusicPlayer.jsx` dengan dukungan HTML5 drag-and-drop reordering, grab handle (`GripVertical`), badge status `PLAYING`, dan tombol hapus track (`Trash2`).
3. **ChoiceButtons Apple Glass Pill & Audio Preview:**
   - Memperbarui styling tombol pilihan teks di `src/components/Chat/ChoiceButtons.jsx` menjadi Apple glass pill (`px-3.5 py-1.5 rounded-full text-xs font-medium backdrop-blur-md`).
   - Menyediakan tombol preview snippet audio 15 detik di setiap kartu lagu kandidat yang terhubung langsung ke player context.
4. **Disambiguasi Playlist & OST:**
   - Di `src/hooks/agent/plan/mediaTools.js`, jika query berupa OST, soundtrack, atau album dengan banyak track, opsi pilihan diperluas dengan opsi *"Putar Seluruh Playlist ke Antrean"*.
   - Memasukkan seluruh track kandidat ke dalam antrean YouTube Music via `enqueuePlaylist` dan memutar track pertama secara mulus.
5. **Vision Model Chain & STT Guard Sensitivity:**
   - Memperbarui `VISION_MODEL_CHAIN` di `src/hooks/agent/plan/visionTools.js` menggunakan model aktif 9Router terverifikasi: `gemini/gemini-3.8-flash`, `bor/mimo-v2.5:free`, dan `bor/deepseek-v4.1-flash:free`.
   - Mengoptimalkan sensitivitas VAD/STT di `src/api/sttGuard.js`: `PEAK_RMS_MIN = 0.008` dan `VOCAL_SEC_MIN = 0.35s` agar mampu menangkap bisikan lembut dan komando suara singkat tanpa terpotong.
6. **Attachment Sanitization & Global Paste Drop:**
   - Memastikan sanitasi URL Google Images (`/imgres`) dan penolakan payload `text/html` yang menyamar sebagai gambar di `src/utils/attachments.js`.

---

## 2. Hasil Verifikasi
- **Vitest Suite:** 104 berkas tes, 1094 tes dijalankan.
- **Status:** 100% Passed (0 failed).
- Seluruh tes unit untuk `compact-gap.test.mjs`, `sessionCompactor.test.mjs`, `sttGuard.test.mjs`, dan `telegramStart.test.mjs` lulus dengan predikat bersih.
