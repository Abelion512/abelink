# MARK - Memory Adaptive Response Knowledge

> Asisten AI virtual berbasis lokal yang dirancang untuk membantu produktivitas pengguna dengan privasi penuh. Mark bukan sekadar chatbot — ia bisa mengingat, meriset, dan memahami konteks percakapan secara mendalam.

> [!IMPORTANT]
> Proyek ini dioptimalkan khusus untuk **Windows** (Windows 10/11).

## Fitur Utama

### Hybrid AI Engine (Local & Cloud)
Integrasi fleksibel antara **Local LLM** (Gemma 3, Llama, Mistral) melalui **LM Studio** untuk privasi penuh tanpa internet, maupun API cloud super cepat melalui **Groq API** dan **Cerebras API**. Pilihan dapat diubah langsung melalui halaman pengaturan dengan *UI dinamis* yang menyesuaikan form input berdasarkan *provider* yang dipilih. Dilengkapi juga dengan fitur **Secondary Model**, yang secara otomatis mendelegasikan tugas-tugas *background* (seperti *JSON parsing*, *action logic*, dan *summarizing*) ke Groq API untuk mempercepat performa tanpa membebani komputasi Llama lokalmu.

### Agentic Planning & Autonomous Execution
Mark mampu memecah instruksi yang kompleks menjadi langkah-langkah logis (planning) dan mengeksekusinya satu per satu. Ia mengevaluasi hasil dari setiap langkah untuk menentukan aksi secara real-time, seperti mencari di web, memutar lagu, atau sekadar merangkum informasi tanpa intervensi pengguna. Hasil dari riset otomatis (web search) akan dirangkum beserta *source/citation* langsung pada kesimpulan akhir. Dilengkapi mekanisme **Auto-Retry Fallback JSON Schema**, di mana sistem otomatis memulihkan dan memperbaiki format *output* LLM yang rusak (terutama pada model lokal kecil) ke bentuk JSON valid, memastikan alur *agentic* berjalan tanpa henti.

### Multi-Turn Conversation
Riwayat percakapan dikirim sebagai **native multi-turn messages** ke LLM (bukan text dump), menghasilkan pemahaman konteks yang jauh lebih baik — terutama untuk model kecil.

### Transparent Reasoning UI
Mark secara native mendukung model LLM dengan kapabilitas *reasoning* (seperti keluarga model DeepSeek-R1). Proses pemikiran AI (di dalam tag `<think>`) akan diekstrak dan ditampilkan secara elegan dalam bentuk *collapsible dropdown* pada antarmuka *chat*, baik saat menyusun rencana (*planning*) maupun menjawab.

### Vector Memory Management System (MMS)
Memori cerdas yang bekerja layaknya otak manusia. Mark kini mendukung dua provider **Vector Embeddings**:
- **Transformers.js (Fully Local)**: Berjalan 100% di memori aplikasi tanpa perlu server tambahan atau LM Studio. Menggunakan model kecil (~22MB) seperti `all-MiniLM-L6-v2`.
- **LM Studio**: Opsi bagi pengguna yang ingin menggunakan model embeddings kustom via local server.

Mark menyimpan memori dalam kategori:
- `profile`, `preference`, `skill`, `project`, `transaction`, `goal`, `relationship`, `fact`, `other`

Operasi memori lengkap: **insert**, **update**, dan **delete** — semuanya dikelola secara otomatis oleh AI berdasarkan konteks percakapan. Pencarian memori berbasis **cosine similarity** secara dinamis menyesuaikan *threshold* antar-provider.

### Semantic Search & Smart Fallback
Pencarian memori membandingkan pertanyaan pengguna dengan data memori sebelumnya. Jika dimensi vektor berubah (karena pergantian provider embeddings), memori akan di-generate ulang otomatis secara *seamless* di latar belakang.

### Web Search & Deep Research
Mencari data real-time melalui **Google Search** dan melakukan riset mendalam langsung via **Electron Webview** terintegrasi. Termasuk scraping **AI Overview dari Google**. Tanpa Puppeteer, tanpa instalasi Chrome tambahan.

### YouTube Accessible
Mencari video di YouTube dengan `yt search`, dan merangkum isi video YouTube hanya dengan mengirimkan link. Mark mengambil transkrip via `youtube-transcript-plus`, menganalisis, dan memberikan poin-poin penting lengkap dengan *timestamp*.

### YouTube Music Player (AI Curated)
Pemutar musik terintegrasi berbasis **YouTube Music** via Electron Webview. Cukup minta Mark untuk memutar lagu — ia akan mencari via `ytmusic-api`, menganalisis daftar 10 hasil pencarian teratas menggunakan logika AI (memilih antara versi *original*, *live*, atau *cover* secara dinamis menyesuaikan niat/konteks pengguna), lalu otomatis memutarkan lagu yang paling tepat. Dilengkapi dengan **Ad-Blaster** otomatis (auto-mute, 16x speed, auto-skip iklan) dan *floating player* yang bisa di-minimize.

### Voice Interaction (Live Audio Beta)
Interaksi suara real-time menggunakan **Groq API** untuk Speech-to-Text (STT) super cepat dan **Edge-TTS** (Text-to-Speech) lokal. Memungkinkan percakapan dua arah secara natural (Voice-to-Voice) tanpa jeda yang signifikan, lengkap dengan deteksi VAD (Voice Activity Detection) dan Barge-in otomatis.

### Context & Time Awareness
Mark memahami konteks percakapan sebelumnya dan sadar waktu (tanggal & jam saat ini) untuk menentukan relevansi informasi.

### Session Persistence & Robust Error Handling
Menyimpan dan memuat riwayat sesi chat. Mark juga dilengkapi penanganan *Rate Limit* secara manusiawi (misal ketika Token API habis).

### Few-Shot Prompt Engineering
System prompt dilengkapi contoh output (*few-shot examples*) untuk meningkatkan konsistensi respons **JSON** dari model kecil.

### Modern & Premium UI
Desain menggunakan **Tailwind CSS 4** dan **DaisyUI 5** dengan fitur:
- Antarmuka *chat* yang minimalis dan luas berkat desain *Tools Dropdown* yang dinamis.
- Markdown rendering lengkap (React Markdown + Syntax Highlighter)
- GitHub Flavored Markdown support
- Animasi halus dan mode interaksi dinamis

### Global Shortcut & System Tray
Aplikasi berjalan secara tersembunyi di latar belakang (System Tray) dan dapat dipanggil kapan saja menggunakan *Global Shortcut*.
- **`Ctrl + Alt + M`** (atau `Cmd + Alt + M` di Mac): Membuka aplikasi secara instan dan langsung mengaktifkan mode **Live Audio** untuk mulai berbicara dengan Mark.

## Arsitektur Proyek

```text
mark/
├── src/
│   ├── main/              # Electron Main Process (Window management, IPC, TTS, Tray)
│   ├── preload/           # Preload scripts (Electron bridge)
│   └── renderer/          # React Frontend
│       └── src/
│           ├── api/
│           │   ├── ai.js           # LLM integration (LM Studio, Groq & Cerebras + JSON Schema Auto-Retry)
│           │   ├── db.js           # Dexie (IndexedDB) schemas & migrations
│           │   ├── scraping.js     # Google search & deep web scraping
│           │   └── vectorMemory.js # Vector embeddings (Transformers.js / LM Studio)
│           ├── components/         # Reusable UI components
│           ├── contexts/           # Global states (ChatContext, YoutubeMusicContext)
│           └── pages/              # Chat, Configuration UI
```

## Teknologi yang Digunakan

| Kategori         | Teknologi                                                                   |
| ---------------- | --------------------------------------------------------------------------- |
| **Framework**    | Electron 39, React 19, Vite 7                                               |
| **Styling**      | Tailwind CSS 4, DaisyUI 5                                                   |
| **AI Backend**   | LM Studio / Groq API / Cerebras API (Inference)                             |
| **Embeddings**   | Transformers.js (`@huggingface/transformers`), LM Studio                    |
| **Web Scraping** | Electron Webview (Google Search & Deep Research)                            |
| **Audio & Voice**| Groq API (STT), Edge-TTS, Web Audio API (VAD)                               |
| **YouTube**      | `youtube-transcript-plus`, `ytmusic-api`, `yt-search`                       |
| **Database**     | Dexie.js (IndexedDB wrapper)                                                |
| **Markdown**     | React Markdown, React Syntax Highlighter, remark-gfm, rehype-external-links |

## Persiapan & Instalasi

### Prasyarat
- **Operating System**: Windows 10/11
- **Node.js**: v18+
- (Opsional) **LM Studio** jika ingin menjalankan model secara offline.
- (Opsional) **Groq API Key** jika ingin menggunakan model cloud super cepat.

### Langkah Instalasi

1.  **Clone repository ini:**
    ```bash
    git clone https://github.com/username/mark-project.git
    cd mark-project/mark
    ```

2.  **Install dependensi:**
    ```bash
    npm install
    ```

3.  **Jalankan aplikasi:**
    ```bash
    npm run dev
    ```

4.  **Konfigurasi Awal:**
    Buka menu **Pengaturan** di dalam aplikasi, pilih provider AI (LM Studio atau Groq), masukkan API Key (jika memakai Groq), dan atur provider Vector Embeddings (disarankan menggunakan **Transformers.js** agar berjalan 100% lokal tanpa instalasi eksternal).

## Build Aplikasi

Untuk membuat *executable file* (Windows):
```bash
npm run build:win
```
Output installer (`.exe`) akan tersedia di folder `dist/`.

## Roadmap

- [x] Web Search Integration & Deep Research
- [x] Vector MMS (Semantic memory search dengan Transformers.js & LM Studio)
- [x] YouTube Summary (Transkrip & metada video)
- [x] Multi-Turn Conversation & Time Awareness
- [x] Few-Shot Examples untuk konsistensi JSON
- [x] Configuration Page (Halaman pengaturan dinamis untuk AI Engine & Provider)
- [x] YouTube Music Player & Ad-Blaster
- [x] Voice Interaction (Live Audio Beta & STT Groq)
- [x] Agentic Planning dengan sumber/source citations
- [ ] Vision Capability (Analisis gambar secara lokal)
- [ ] Export/Import Memory (Backup & restore memori pengguna)
- [ ] Custom Tools (Code Interpreter): Fitur untuk mengeksekusi *custom script* (JavaScript/Node) secara dinamis oleh AI, memberikan kebebasan kustomisasi *action* tanpa batas.
- [ ] Prompt Templates / Custom Commands: Fitur untuk menyimpan *template prompt* panjang atau persona khusus (misal: spesialis pembuat PRD). Pengguna cukup mengetik `@nama-template` di kolom *chat* untuk memanggil instruksi kompleks tanpa perlu mengetik ulang setiap saat.

## Lisensi

Proyek ini menggunakan lisensi **MIT**, namun dengan ketentuan tambahan: **Dilarang keras memperjualbelikan perangkat lunak ini untuk keuntungan komersial tanpa izin.**

---
> Dibuat untuk masa depan AI yang lebih privat dan cerdas.
