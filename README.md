# MARK - Metacognitive Artificial Relational Knowledge

![MARK AI Banner](./assets/banner-repo.png)
[![Download Terbaru](https://img.shields.io/badge/Download-Versi_Terbaru-blue?style=for-the-badge&logo=windows)](https://github.com/Mazees/mark-agent/releases/)

> **Mark BUKAN sekadar asisten virtual biasa. Mark adalah entitas AI yang dirancang untuk memiliki emosi, bertindak selayaknya manusia, dan memimpin tim agen cerdas.**
> Lebih dari sekadar chatbot kaku, Mark adalah *Personal AI OS Companion* yang berjalan di ekosistem lokal Anda—dilengkapi dengan sistem memori jangka panjang berbasis *Vector Memory*, **Relational Growth System**, **Autonomous Multi-Agent Sub-Agent Engine**, serta **Multi-Session Browser Automation**. Ditenagai oleh *Hybrid AI Engine*, Mark dapat beroperasi secara lokal untuk privasi maksimal, atau menggunakan *Cloud APIs* untuk mengeksekusi tugas kompleks, menyusun rencana (*Agentic Planning*), mengotomatisasi desktop PC, merangkum video YouTube, mengobservasi layar atau dunia nyata (*Vision*), hingga kendali jarak jauh via **Telegram Bot**.

> [!IMPORTANT]
> Proyek ini secara khusus dioptimasi untuk **Windows** (Windows 10/11).

## Fitur Unggulan

- **Autonomous Multi-Agent Sub-Agent Engine (Mission Control):** Mark bertindak sebagai *Lead Agent* yang mampu memecah tugas kompleks dan mendelegasikannya ke banyak **Sub-Agent spesialis** yang bekerja secara paralel di latar belakang. Dilengkapi dengan antarmuka **Mission Control** dan **Live Sub-Agent Intercom HUD** yang menampilkan pemikiran mendalam (*Reasoning Analisis*), langkah eksekusi berkala (*Execution Steps*), dan laporan hasil akhir dengan dukungan penuh Markdown & Syntax Highlighting.
- **Multi-Session Isolated Browser Automation:** Sistem browser Chromium fisik Mark kini mendukung sesi independen tanpa batas. Beberapa Sub-Agent dapat melakukan riset web, menavigasi Google, mengekstrak data, dan mengisi form secara bersamaan tanpa saling mengganggu, didukung oleh **Multi-Card Holo Preview** yang menampilkan status visual tiap sesi di layar desktop.
- **Dynamic Agentic Planning (ReAct Loop):** Mengganti sistem penjawab statis dengan arsitektur penalaran cerdas. Mark mampu memecah masalah, memikirkan strategi, menggunakan *tools* secara otonom berulang kali, dan mengevaluasi hasilnya sebelum memberikan jawaban akhir yang komprehensif.
- **Agent Task Workflows (Durable Tasks):** Untuk pekerjaan multi-langkah yang panjang, router AI memilih mode `durable`, memecah pekerjaan ke dalam *milestone*, lalu mengeksekusinya bertahap. Setiap langkah divalidasi, di-checkpoint, dapat di-retry, dan menghasilkan artifact resmi di `Documents/Mark Tasks/<task-id>/`.
- **Zero-Vision Physical PC & Desktop Automation (Windows UIAutomation + C# Daemon):** Menggunakan daemon PowerShell C# persisten (`pc-daemon.ps1`), Mark dapat membaca elemen GUI desktop secara struktural, mengklik koordinat, mengetik teks Unicode, menekan kombinasi *shortcut*, hingga mengelola jendela aplikasi di Windows secara fisik dengan kecepatan tinggi tanpa biaya vision API. Dilengkapi *Floating Security Banner* dan tombol darurat **Emergency Stop (`Ctrl+Shift+S`)**.
- **Infinite Memory & Injection Knowledge RAG:** Sistem Vector Retrieval-Augmented Generation (RAG) berjalan secara *offline*. Mark menyimpan riwayat memori obrolan masif tanpa batas dan pengguna dapat menambahkan dokumen (.pdf, .docx, .txt, .md) ke dalam *knowledge base* tanpa membebani *context window* LLM.
- **Automatic Memory Groomer (Hippocampus Engine):** Sistem pembersihan dan konsolidasi memori mandiri berbasis *Orama Clustering* dan *LLM Batch Processing*. Hippocampus Engine mendeteksi klaster memori serupa (`profile` & `preference`) lalu menggabungkannya secara kronologis tanpa kehilangan riwayat penting.
- **Visualisasi Jaringan Otak (Memory Visualizer):** Antarmuka *Live Feed* "Mark Neural Core" berbasis grafis Neural Network interaktif untuk menjelajahi jaringan *Chat History*, *Knowledge Base*, hingga *Document Vault*.
- **Relational Growth System & Dynamic Persona:** Hubungan Anda dengan Mark dievaluasi layaknya manusia sungguhan melalui 4 parameter krusial (*Warmth, Sarcasm, Trust, Energy*). Tingkat kesopanan, kelancangan (*roasting*), dan kepribadian Mark akan berevolusi organik sesuai gaya komunikasi Anda.
- **Multi AI Provider (Built-in Gemini / Local / Cloud):** Mark hadir dengan **Google Gemini Engine (Gratis)** sebagai *provider* bawaan yang siap pakai tanpa API Key. Anda juga memiliki fleksibilitas penuh untuk menggunakan **Local AI** (LM Studio), **Cloud AI** (Groq / Cerebras), maupun *Custom OpenAI-Compatible API*.
- **Asisten Bot Telegram Mandiri (Telegraf Engine):** Terhubung langsung dengan Telegram Bot API. Mark dapat dikontrol jarak jauh via Telegram, merangkum obrolan, mengunduh MP3 YouTube, mengambil tangkapan layar PC, dan secara otomatis menyinkronkan seluruh balasan & *Awareness Engine* ke Telegram Admin secara *real-time*.
- **Proaktif dengan Awareness Engine:** Mark tidak hanya pasif merespons. Mark dapat proaktif menyapa, mengingatkan tugas, atau memutarkan musik di latar belakang saat Anda sedang bersantai atau bekerja fokus.

## Kemampuan Utama (Tools)

- **Autonomous Multi-Agent Tools:** `spawn_subagent`, `wait_subagents`, `send_message`, `list_subagents`, `kill_subagent`.
- **Multi-Session Web Browsing (`browser-*`):** `browser-navigate`, `browser-read`, `browser-click`, `browser-type`, `browser-scroll`, `browser-extract`, `browser-ask-user`, `browser-close`.
- **Desktop Automation (`os-*`):** `os-read`, `os-click`, `os-type`, `os-key`, `os-scroll`, `os-open`, `os-list-windows`, `os-focus-window`, `os-ask`.
- **Native File Handling & PowerShell:** `read-file`, `write-file`, `replace-lines`, `delete-file`, `list-dir`, `grep-search`, `run-powershell`.
- **Vision Awareness:** `analyze-screen` (analisis layar multi-monitor) dan `camera-look` (observasi visual webcam).
- **Interaksi Suara Natural:** Voice Activity Detection (VAD) dengan Groq Whisper STT / Local Whisper dan Edge-TTS.
- **Perangkum YouTube & YouTube Music:** Transkripsi kilat video YouTube dan pemutar YouTube Music tanpa iklan dengan *ad-blaster*.
- **Mark Skills System:** Kustomisasi kepribadian dan kapabilitas menggunakan instruksi Markdown (`.md`) dengan pemanggilan slash command (`/nama-skill`).
- **Sistem Plugin Kustom:** Penambahan modul fungsi Node.js baru langsung dari antarmuka pengguna dengan Monaco Editor.

## Arsitektur Proyek

```text
mark/
├── src/
│   ├── main/              # Proses Utama Electron (Window, IPC, Multi-Session Browser, PC Daemon)
│   │   ├── browser-agent.js       # Multi-Session Chromium Browser Manager
│   │   ├── pc-agent.js            # Desktop Automation Engine via C# Daemon
│   │   ├── pc-agent-scripts/      # Persistent PowerShell & Win32 C# scripts
│   │   ├── node-tools.js          # Registry Tool Native OS & Browser
│   │   ├── telegram/              # Layanan Bot Telegram (Telegraf Engine)
│   │   └── ai-bridge.js           # Penghubung AI API, Rate Limiting, & Auto-Repair JSON
│   ├── preload/           # Skrip Preload (Jembatan keamanan IPC Node.js ke React)
│   └── renderer/          # Frontend (React 19 + Vite 7 + Tailwind CSS 4)
│       └── src/
│           ├── api/
│           │   ├── ai/            # Planning, Persona, Awareness, Relationship, Memory Groomer
│           │   ├── subagent/      # Sub-Agent Store, Autonomous ReAct Executor, Prompt Engine
│           │   ├── db.js          # Skema Dexie Database (IndexedDB v14)
│           │   └── oramaStore.js  # Hybrid Full-Text & Vector Search
│           ├── components/
│           │   ├── subagent/      # SubagentIntercom (HUD Double Dropdown & Markdown Stream)
│           │   └── core/          # ResponseArea, HoloCard, BrowserPreviewWidget (Multi-Card)
│           ├── hooks/             # Custom Hooks (useMarkPlan, useAwareness, useVAD, dll)
│           └── pages/             # Subagents (Mission Control), MarkHome, Configuration, Plugins, dll
```

## Teknologi Terkait

| Kategori           | Teknologi                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Framework**      | Electron 39, React 19, Vite 7                                                                      |
| **Antarmuka (UI)** | Tailwind CSS 4, DaisyUI 5, Framer Motion/GSAP, Prism Syntax Highlighter, Monaco Editor            |
| **Mesin AI**       | Google Gemini (Bawaan Gratis) / LM Studio (Offline) / Groq, Cerebras, Custom OpenAI-Compatible API |
| **Multi-Agent**    | Dexie Multi-Stream Store, Autonomous ReAct Loop, Multi-Session Browser Isolation                   |
| **Memori Vektor**  | `@orama/orama` (Hybrid Search), Transformers.js (`@huggingface/transformers`, 384d)                |
| **Suara & Audio**  | Groq Whisper-Large-v3, Local Transformers.js STT, Edge-TTS (`id-ID-ArdiNeural`), Web Audio API VAD |
| **Desktop & OS**   | Win32 UIAutomation, Windows PowerShell C# Daemon, WinRT OCR                                        |

## Instalasi & Penggunaan

### Persyaratan Sistem

- **Sistem Operasi**: Windows 10/11
- **Node.js**: Versi 18 atau lebih baru
- (Opsional) **LM Studio** untuk menjalankan model lokal secara luring (*offline*).
- (Opsional) **API Key Groq** untuk inferensi awan berkecepatan tinggi.

### Langkah Instalasi

1. **Kloning repositori:**
   ```bash
   git clone https://github.com/Mazees/mark-agent.git
   cd mark-agent/mark
   ```

2. **Instalasi dependensi:**
   ```bash
   npm install
   ```

3. **Jalankan aplikasi dalam mode pengembangan:**
   ```bash
   npm run dev
   ```

4. **Kompilasi Installer Executable (.exe):**
   ```bash
   npm run build:win
   ```
   Berkas *installer* NSIS akan otomatis tersedia di direktori `dist/`.

---

**Dilarang keras menjual atau memperdagangkan perangkat lunak ini untuk keuntungan komersial tanpa izin tertulis.**
