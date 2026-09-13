# Abelink: Autonomous AI OS Companion (Linux Edition)

![Abelink Banner](./assets/banner-repo.png)
[![Download Terbaru](https://img.shields.io/badge/Download-Linux-blue?style=for-the-badge&logo=linux)](https://github.com/Abelion512/abelink/releases/)

> **Abelink** (berbasis arsitektur **ABELINK: Metacognitive Artificial Relational Knowledge**) adalah asisten otonom berbasis Linux dengan fokus pada privasi, otomatisasi sistem operasi, dan eksekusi tugas multi-langkah. Berjalan langsung di workstation lokal menggunakan arsitektur hybrid Tauri v2 (Rust) dan Bun runtime sidecar.

> [!NOTE]
> Proyek ini merupakan Linux-only fork independen dari basis fondasi [Mazees/mark-agent](https://github.com/Mazees/mark-agent).

---

## Arsitektur Sistem

Abelink dibangun dengan pemisahan tanggung jawab yang ketat:

```text
abelink/
├── index.html            # Entry Vite (standard Tauri layout)
├── src/                  # React 19 frontend (UI, visualizer, local DB, Web Workers)
│   ├── api/              # AI routing, planning, Dexie DB, vectorMemory worker
│   ├── components/       # Komponen antarmuka (HUD, Jarvis Orb, Mission Control)
│   ├── hooks/            # Lifecycle orchestrators (useAbelinkAgent, useVAD, useAwareness)
│   └── pages/            # View routing (AbelinkHome, Configuration, Subagents, Studio)
├── src-tauri/            # Shell native Rust: windowing, tray, secure sandboxing, rfd modals
├── sidecar/              # Bun sidecar daemon: JSON-lines RPC stdio, tool handlers, MCP
├── resources/            # Binary helper pendukung (ffmpeg, yt-dlp)
└── scripts/              # Verifikasi, benchmark, dan release helper
```

| Lapisan | Teknologi | Peran |
| --- | --- | --- |
| **Desktop Shell** | Tauri v2 (Rust) | Pengelolaan window transparan, global shortcut, tray Linux, dialog konfirmasi native (`rfd`), dan sandboxing path (`resolve_contained`). |
| **Frontend UI** | React 19, Vite 7, Tailwind 4 | Antarmuka interaktif, Floating HUD, Visualisasi status, dan interaksi suara real-time. |
| **Background Sidecar** | Bun (JSON-RPC stdio) | Runtime eksekusi tool, integrasi Telegram bot, MCP client, web scraping, dan desktop automation daemon. |
| **Vector Engine** | Transformers.js (Web Worker) | Ekstraksi embeddings 384-dimensi lokal (MiniLM-L12-v2) tanpa membebani UI thread. |
| **Database & Index** | Dexie (IndexedDB) + Orama | Penyimpanan terstruktur 12 tables dengan hybrid vector dan full-text search offline. |

---

## Fitur Inti

### 1. Multi-Provider Hybrid AI Routing
- Mendukung koneksi lokal (LM Studio, Ollama di `localhost:1234`) dan cloud provider (Groq, Cerebras, custom OpenAI-compatible endpoints).
- Integrasi native Gemini Web RPC bridge tanpa biaya API token eksternal.
- Mekanisme fallback otomatis jika model cloud terkena rate limit.

### 2. Autonomous Multi-Agent (Mission Control)
- Lead agent mendelegasikan tugas khusus ke sub-agents yang berjalan secara paralel dan terisolasi.
- Sub-agents memiliki ReAct loop mandiri dengan dynamic tool-group scoping (`read-tools`).
- Intercom dan Visual Topology Map menampilkan thought hierarchy, observasi tool, dan deliverable akhir.

### 3. Durable Agent Tasks
- Eksekusi alur kerja berulang dengan checkpoint state machine yang persisten di IndexedDB.
- Step deduplication berbasis hash konten untuk mencegah komputasi ulang yang tidak perlu.

### 4. Epistemic Grounding & Hybrid Memory System
- Setiap turn obrolan diindeks secara otomatis ke dalam IndexedDB dan Orama vector store.
- Strict groundedness policy: model diinstruksikan menolak menjawab jika data riwayat atau file dokumen tidak terbukti ada di repositori lokal.

### 5. Desktop Awareness & OS Automation
- Pelacakan jendela aktif via `xdotool` dan filter idle.
- Otomatisasi desktop Linux native dengan boundary pengaman: setiap aksi sistem berisiko wajib dikonfirmasi melalui native Rust modal dialog.
- Emergency stop global via shortcut `Ctrl+Shift+S`.

### 6. Voice & Audio Pipeline
- Voice Activity Detection (VAD) via Web Audio API.
- Transkripsi suara real-time via Groq Whisper API atau Transformers.js Whisper lokal.
- Speech synthesis menggunakan Edge-TTS (`id-ID-ArdiNeural`).

---

## Prasyarat & Instalasi

### Kebutuhan Sistem (Linux Mint / Ubuntu / Debian / Arch)
- **Rust Toolchain**: `rustup` stable.
- **Sistem Libs**:
  ```bash
  sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev xdotool
  ```
- **Bun Runtime**: v1.3+ (`curl -fsSL https://bun.sh/install | bash`).
- **Python 3**: untuk desktop automation scripts.

### Setup Cepat

1. **Clone repository:**
   ```bash
   git clone https://github.com/Abelion512/abelink.git
   cd abelink
   ```

2. **Jalankan aplikasinya:**
   ```bash
   bun run app
   ```
   Satu perintah ini mengurus semuanya: cek environment, pasang dependensi,
   rapikan port yang nyangkut, lalu nyalakan Abelink dalam mode dev yang
   terisolasi (aman jalan bareng versi install-an). Butuh `tauri dev`
   polos tanpa isolasi? `bun run app:raw` — tapi jangan bareng versi prod.

---

## Perintah Pengembangan

| Perintah | Buat apa |
| --- | --- |
| `bun run app` | Nyalakan Abelink mode dev (pintu utama, sudah terisolasi). |
| `bun run app:raw` | `tauri dev` polos tanpa isolasi — jangan dipakai bareng versi prod. |
| `bun test` | Jalankan seluruh unit test. |
| `bun evaluation/smoke.mjs` | Smoke test AbelinkBench (gerbang cepat). |
| `bun run sync-version` | Samakan versi dari `tauri.conf.json` ke semua manifest. |
| `bun run build:sidecar` | Kompilasi sidecar jadi binary mandiri. |
| `bun run build:deb` | Bungkus rilis `.deb` (Debian/Ubuntu/Mint). |
| `bun run build:dist` | Bungkus rilis lengkap (`.deb` + `.AppImage`). |

---

## Standar Kontribusi & Kebijakan Repositori

Untuk pedoman kontribusi agen dan pengembang, baca dokumen referensi berikut:
- [Agent Contribution Guidelines](docs/AGENT_CONTRIBUTION_GUIDELINES.md): Protokol kerja agen, arsitektur boundary, dan aturan anti-regresi.
- [Architectural Direction RFC](docs/ARCHITECTURAL_DIRECTION.md): Analisis teknis jangka panjang antara Rust rewrite, Pure Web, dan Hybrid runtime.
- [Contributing](CONTRIBUTING.md): Alur branching dan commit conventions.

---

## Lisensi & Atribusi
Lisensi mengacu pada lisensi proyek upstream [Mazees/mark-agent](https://github.com/Mazees/mark-agent). Port Linux dan pemeliharaan arsitektur Abelink dikelola oleh Abelion512.
