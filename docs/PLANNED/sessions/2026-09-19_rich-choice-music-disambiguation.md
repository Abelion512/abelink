# Session Log: Rich Choice Bus Multimodal & Disambiguasi Musik/OST (Paket 3)

**Tanggal:** 2026-09-19  
**Status:** Selesai (Paket 3 dari 4)  
**Tujuan:** Mengatasi kelemahan di mana permintaan ambigu (misal "setel OST solo leveling") langsung memutar track sembarangan tanpa bertanya, dan mengintegrasikan Rich Choice Bus dengan preview/cuplikan audio kartu musik interaktif.

---

## 1. Analisis Masalah

1. **Autoplay Buta pada Query Kompilasi/OST:**
   - Ketika user meminta "setel ost ...", sistem YouTube Music mengembalikan puluhan track (opening, ending, insert song, score BGM).
   - Di `useAbelinkMusic.js`, jalur lama berusaha memilih satu lagu terbaik via deterministik atau LLM ranking, yang kerap kali memaksakan lagu pertama alih-alih mengonfirmasi ke user.
2. **Keterbatasan Format Flat `ask-choice`:**
   - Format konvensional `pertanyaan||opsi1;opsi2` hanya mampu mengirimkan teks tombol sederhana tanpa gambar thumbnail, nama artis terpisah, durasi, maupun cuplikan preview audio.

---

## 2. Perubahan yang Dilakukan

1. **`src/api/choiceBus.js`:**
   - Perluas `parseChoiceQuery`: kini mendukung string flat konvensional maupun payload JSON terstruktur `{ question, type: 'music_preview' | 'general', options: [...] }`.
   - Mengembalikan `rawOptions` dan `type` sehingga metadata kaya (judul, artis, durasi, thumbnail, previewUrl) tersimpan utuh di state choice.

2. **`src/hooks/agent/useAbelinkMusic.js`:**
   - Menambahkan deteksi kompilasi / tema musik multi-track: `/\b(ost|soundtrack|album|theme song|lagu tema|bgm)\b/i`.
   - Jika query mengandung kata kunci OST/soundtrack/album dan hasil pencarian mengembalikan > 1 entitas, sistem dilarang melakukan autoplay buta dan langsung mengembalikan kandidat 4 track teratas untuk disajikan via pilihan bus interaktif.

3. **`src/hooks/agent/plan/mediaTools.js` & `toolDispatcher.js`:**
   - `offerMusicChoice`: mengemas 4 kandidat lagu ke dalam format rich multimodal choice dengan tipe `music_preview` dan menyertakan metadata lengkap (judul, artis, durasi, thumbnail, videoId).
   - `toolDispatcher`: meneruskan `rawOptions` dan `type` ke `targetSetChatData`.

4. **`src/components/Chat/ChoiceButtons.jsx`:**
   - Menghadirkan rendering kartu musik interaktif (grid kartu cover art, judul tebal, artis, durasi, tombol play/pause cuplikan audio lokal, dan border seleksi bercahaya bergaya Apple).
   - Mempertahankan kompatibilitas penuh untuk tombol chip teks konvensional.

5. **`src/api/ai/planning.js`:**
   - Mempertegas aturan system prompt AI: jika mendapati permintaan majemuk/ambigu dengan opsi konkret yang bisa dienumerasi (seperti OST film/anime atau kompilasi), model WAJIB memanggil `ask-choice` dan DILARANG mengakhiri giliran dengan pertanyaan teks polos atau memilih lagu secara sepihak.

6. **Unit Tests:**
   - `tests/choiceBus.test.mjs`: pengujian parsing JSON payload & rawOptions.
   - `tests/musicAmbiguity.test.mjs`: pengujian regex deteksi kompilasi OST dan validitas metadata multimodal choice.

---

## 3. Verifikasi & Pengujian

- `bunx vitest run tests/choiceBus.test.mjs tests/musicAmbiguity.test.mjs`
  -> **2 file lulus, 8/8 tests passed (100%)**.
