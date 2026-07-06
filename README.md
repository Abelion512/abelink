# MARK - Memory Adaptive Response Knowledge

> **Mark BUKAN sekadar asisten virtual biasa. Mark adalah entitas AI yang dirancang untuk memiliki emosi dan bertindak selayaknya manusia.** 
> Lebih dari sekadar chatbot kaku, Mark adalah *Personal AI Assistant* yang berjalan di ekosistem lokal Anda—dilengkapi dengan sistem memori jangka panjang berbasis *Vector Memory* untuk mempelajari kebiasaan Anda tanpa mengorbankan privasi sedikit pun. Ditenagai oleh *Hybrid AI Engine*, Mark dapat beroperasi 100% *offline* untuk privasi penuh, atau menggunakan *Cloud APIs* untuk mengeksekusi tugas kompleks, menyusun rencana (*Agentic Planning*), merangkum video YouTube, melakukan riset internet, hingga berinteraksi melalui suara secara *real-time*. Mark dapat bersikap ramah, sarkastis, atau tegas tergantung pada bagaimana pengguna berinteraksi dengannya.

> [!IMPORTANT]
> Proyek ini secara khusus dioptimasi untuk **Windows** (Windows 10/11).

## Fitur Unggulan

- **Emosi & Persona Dinamis (Dynamic Mood Engine):** Mark bukan sekadar program yang merespons secara datar. Sistem ini memiliki 4 tingkat emosi (`positive`, `neutral`, `annoyed`, `negative`) yang secara visual memengaruhi antarmuka (Orb) serta gaya bahasanya. Berkat arsitektur *Memory-Aware*, Mark dapat mengingat interaksi sebelumnya. Jika percakapan berjalan tidak menyenangkan, emosinya dapat bereskalasi. Mark menggunakan bahasa gaul Indonesia yang natural, menghindari gaya bahasa kaku khas AI pada umumnya.
- **Dual AI Provider (Hybrid):** Anda memegang kendali penuh. Gunakan **Local AI** (berjalan langsung di PC Anda tanpa koneksi internet) untuk privasi absolut, atau alihkan ke **Cloud AI** (Groq/Cerebras) untuk kecepatan respons tingkat tinggi. Sistem secara cerdas mampu mengalihkan beban komputasi berat ke *cloud* untuk menjaga performa PC Anda.
- **Asisten Bot WhatsApp Mandiri:** Mark mampu memproses tugas rumit melalui WhatsApp dengan menyusun rencana terstruktur, mengeksekusi langkah demi langkah (mencari data, membaca, lalu merangkum), dan memberikan laporan akhir kepada Anda. Seluruh proses ini dikendalikan oleh modul AI mandiri (`waAutonomous.js`).
- **Memori Vektor Cerdas (Vector MMS):** Layaknya asisten di dunia nyata, Mark secara diam-diam mempelajari preferensi, jadwal, dan kebiasaan Anda dari percakapan sehari-hari. Seluruh data "ingatan" ini disimpan secara enkripsi **di dalam perangkat Anda sendiri** (menggunakan Dexie & IndexedDB), dan tidak pernah dikirimkan ke server pihak ketiga.

## Kemampuan Utama (Tools)

Mark dibekali dengan berbagai integrasi alat untuk mengeksekusi tugas di luar sekadar membalas teks:
- **Interaksi Suara (Voice Activity Detection & STT):** Berbicara langsung ke mikrofon! Mark menggunakan sistem VAD cerdas yang mendeteksi suara Anda dan akan menunggu hingga Anda selesai berbicara sebelum memproses audio secara instan menggunakan *Groq Whisper STT* atau *Local Transformers.js Whisper*. Balasan Mark juga menggunakan sintesis suara manusia yang natural (Edge-TTS).
- **Riset Internet Mendalam (Deep Web Search):** Mark dapat menelusuri web secara mandiri untuk mencari informasi akurat dan memberikan ringkasan yang dilengkapi dengan tautan kutipan (*citations*).
- **Perangkum YouTube Kilat:** Cukup berikan tautan video YouTube, dan Mark akan mengekstrak transkrip asli, memproses teks, dan memberikan ringkasan akurat tanpa Anda harus menonton video tersebut.
- **Pemutar YouTube Music Terintegrasi:** Terhubung langsung dengan ekosistem YouTube Music (tanpa iklan). Perintahkan Mark untuk memutar lagu, dan ia akan mencari serta memutarnya di latar belakang sembari menampilkan sampul album pada antarmuka.
- **Integrasi Bot WhatsApp (Baileys):** Mark dapat bertindak sebagai asisten pribadi di akun WhatsApp Anda. Dengan arsitektur *Auto-Retry* yang andal, Mark kebal terhadap masalah jaringan. Ia dapat merangkum obrolan grup, merespons *mention*, mencari informasi di web, atau bahkan mengunduh lagu YouTube sebagai berkas MP3 langsung ke obrolan WhatsApp.
- **Sistem Plugin Kustom:** Tambahkan fitur atau kemampuan baru langsung dari antarmuka aplikasi tanpa perlu memodifikasi kode sumber inti. Anda dapat membuat skrip Node.js (misalnya, *plugin* untuk mengatur volume atau mematikan PC) dan Mark akan langsung memahami cara menggunakannya.

## Arsitektur Proyek

```text
mark/
├── src/
│   ├── main/              # Proses Utama Electron (Window, IPC, TTS, Tray, Global Shortcut)
│   │   ├── whatsapp/      # Layanan WhatsApp WebSocket Asli (@whiskeysockets/baileys)
│   │   │   ├── baileys-service.js     # Koneksi, Parsing Pesan, IPC Routing & Perintah
│   │   │   ├── message-store.js       # Penyimpanan histori chat di RAM
│   │   │   └── media-downloader.js    # Modul pengunduh media MP3 untuk WA (ytdl-exec)
│   │   └── ai-bridge.js   # Penghubung utama ke AI API, Rate Limit, & Auto-Repair JSON
│   ├── preload/           # Skrip Preload (Jembatan keamanan Node.js ke React)
│   └── renderer/          # Frontend (React 19 + Vite)
│       └── src/
│           ├── api/
│           │   ├── ai/             # Modul Integrasi AI (chat, perencanaan, tools)
│           │   ├── db.js           # Skema & Migrasi Database Lokal (Dexie/IndexedDB)
│           │   ├── scraping.js     # Mesin pencari Google & web scraper
│           │   ├── vectorMemory.js # Sistem Memori Vektor (Transformers.js / LM Studio)
│           │   └── waAutonomous.js # Logika otonom & eksekusi plugin untuk Bot WhatsApp
│           ├── components/         # Komponen UI modular
│           ├── hooks/              # Custom Hooks React (useMarkPlan, useVAD, dll)
│           └── pages/              # Halaman UI (Chat, Configuration, WhatsApp Bot)
```

## Teknologi Terkait

| Kategori         | Teknologi                                                                    |
| ---------------- | ---------------------------------------------------------------------------- |
| **Framework**    | Electron 39, React 19, Vite 7                                                |
| **Antarmuka (UI)**| Tailwind CSS 4, DaisyUI 5, Framer Motion/GSAP (Animasi)                      |
| **Mesin AI**     | LM Studio (Offline) / Groq API & Cerebras API (Cloud)                        |
| **Memori Vektor**| Transformers.js (`@huggingface/transformers`), LM Studio                     |
| **Pencarian Web**| Electron Webview (Bypass Anti-Bot)                                           |
| **Suara & Audio**| Groq API (STT), Transformers.js (Local STT), Edge-TTS, Web Audio API (VAD)   |
| **Integrasi**    | `youtube-transcript-plus`, `youtube-dl-exec`, `ffmpeg-static`, Baileys WA    |
| **Database**     | Dexie.js (IndexedDB)                                                         |

## Instalasi & Penggunaan

### Persyaratan Sistem
- **Sistem Operasi**: Windows 10/11
- **Node.js**: Versi 18 atau lebih baru
- (Opsional) **LM Studio** jika Anda ingin menjalankan model sepenuhnya secara luring (*offline*).
- (Opsional) **API Key Groq** untuk menggunakan model komputasi awan yang sangat cepat.

### Langkah Instalasi

1.  **Kloning repositori:**
    ```bash
    git clone https://github.com/username/mark-project.git
    cd mark-project/mark
    ```

2.  **Instalasi dependensi:**
    ```bash
    npm install
    ```

3.  **Jalankan aplikasi:**
    ```bash
    npm run dev
    ```

4.  **Konfigurasi Awal:**
    Buka menu **Configuration** di dalam aplikasi, pilih penyedia AI Anda (LM Studio atau Groq), masukkan API Key, lalu atur penyedia *Vector Memory* (Sangat disarankan menggunakan **Transformers.js** untuk pengalaman lokal tanpa perangkat lunak tambahan).

## 🔌 Sistem Plugin (Ekstensi Kustom)

Mark memungkinkan Anda memperluas kemampuannya dengan mudah melalui pembuatan **Plugin Kustom** secara langsung dari antarmuka pengguna, tanpa perlu mengubah kode inti aplikasi.

1. Buka menu **Plugins** pada *sidebar* aplikasi.
2. Klik **Buat Plugin Baru**.
3. Isi kolom Nama (contoh: `pengendali-sistem`) dan Deskripsi singkat.
4. Jika skrip Anda memerlukan pustaka eksternal, tulis pada kolom **Dependencies (NPM)** dengan pemisah koma (contoh: `loudness, systeminformation`). Mark akan menginstalnya secara otomatis.
5. Tambahkan **Action** (Fungsi):
   - **Nama Action**: Penamaan fungsi (contoh: `set-volume`).
   - **Deskripsi**: Penjelasan spesifik mengenai fungsi tersebut agar AI memahami peruntukannya.
   - **Trigger Hint**: Petunjuk pemicu kapan AI harus menggunakan alat ini.
6. **Tulis Skrip Anda** menggunakan editor Monaco bawaan. Skrip mengikuti standar lingkungan Node.js (CommonJS).

#### Contoh: Plugin Pengatur Volume
```javascript
const loudness = require("loudness");

// Mengambil parameter angka volume yang diberikan oleh AI
const vol = parseInt(query);
if (isNaN(vol) || vol < 0 || vol > 100) {
  return "❌ Gagal: Masukkan angka volume 0-100.";
}

try {
  await loudness.setVolume(vol);
  return "✅ Berhasil, volume telah diubah ke " + vol + "%";
} catch (e) {
  return "❌ Gagal mengubah volume: " + e.message;
}
```

7. Klik **Simpan Plugin**. Mark akan langsung mempelajari alat baru ini dan Anda dapat segera memerintahkannya untuk mengeksekusi skrip tersebut melalui teks atau perintah suara.

## Membangun Berkas Executable (Build)

Untuk membuat aplikasi mandiri (berkas `.exe`) yang dapat diinstal di PC Windows:
```bash
npm run build:win
```
Berkas *installer* akan secara otomatis tersedia di dalam direktori `dist/`.

## Peta Jalan (Roadmap)

- [x] Integrasi Pencarian Web & Riset Mendalam
- [x] Sistem Memori Vektor (Pencarian semantik dengan Transformers.js & LM Studio)
- [x] Perangkum YouTube (Ekstraksi transkrip & metadada)
- [x] Kesadaran Waktu dan Konteks Berkelanjutan
- [x] Pemutar YouTube Music & Pemblokir Iklan Otomatis
- [x] Deteksi Suara Langsung (VAD & Groq STT Hybrid)
- [x] Perencanaan Berbasis Agen (Agentic Planning)
- [x] Integrasi Bot WhatsApp Pribadi Tingkat Lanjut
- [ ] Analisis Visi (Computer Vision): Kemampuan melihat dan menganalisis gambar secara lokal
- [ ] Ekspor/Impor Memori: Fitur pencadangan dan pemulihan ingatan pengguna
- [ ] Code Interpreter: Kemampuan mengeksekusi skrip Python dinamis di dalam lingkungan *sandbox*

## Lisensi

Proyek ini menggunakan lisensi **MIT**, dengan penambahan syarat mutlak: **Dilarang keras menjual atau memperdagangkan perangkat lunak ini untuk keuntungan komersial tanpa izin tertulis.**

---
> Dibangun untuk masa depan AI yang lebih privat, adaptif, dan manusiawi.
