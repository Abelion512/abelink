# PANDUAN STANDAR AGEN OTONOM & AUDIT GAP ARSITEKTUR ABELINK

**Status:** Technical Research Paper & Strategic Architecture Specification  
**Tanggal:** 20 September 2026  
**Penulis:** Antigravity (Senior AI Systems Engineer)  
**Target Repositori:**
1. Upstream & Remote: `https://github.com/Abelion512/abelink`
2. Workspace Utama: `/media/abelion/Isaf/ican/project/abelink`
3. Workspace Apple Design: `/media/abelion/Isaf/ican/project/abelink-apple`

---

## 1. Executive Summary & Problem Statement

Abelink dibangun sebagai pendamping AI otonom lokal berbasis Linux (Tauri v2 + React 19 + Node/Bun Sidecar). Namun, dalam pengujian praktis dan trajectory operasional, sistem masih menunjukkan kelemahan mendasar:
1. **Kegagalan Eksekusi Tugas Majemuk:** Agen terjebak dalam loop lokal, salah memilih tool, atau berhenti prematur sebelum deliverable terverifikasi di lingkungan nyata.
2. **Kerapuhan Koneksi & Keterbatasan Model:** Ketergantungan pada model komposit (`claude-work`) tanpa failover adaptif menyebabkan abort saat terkena kuota TPM/RPM sementara.
3. **Pemuatan Skill yang Tidak Efisien:** Ekosistem laptop memiliki lebih dari 100 folder skill di `~/.agents/skills`, `~/.claude/skills`, dan `~/.local/share/abelink/skills`, tetapi arsitektur belum menerapkan pemuatan *load when needed* (progressive disclosure) yang menghemat jendela konteks.
4. **Ketiadaan Grounding Fakta Berbasis Kutipan:** Informasi dari web dan dokumen rentan mengalami halusinasi karena belum ada validasi kutipan langsung (*verbatim offset grounding*).

Dokumen ini menyajikan kajian komprehensif literatur standar industri terkini (CoALA, Hermes-Agent, SWE-bench Verified, Anthropic Citations, OpenAI Harness), membedah secara jujur kesenjangan teknis (*gap analysis*) pada codebase Abelink, serta menyusun cetak biru transformasi yang siap dieksekusi.

---

## 2. Riset Arsitektur Standar Industri: Bagaimana Seharusnya Agen Otonom Bekerja

Berdasarkan konsensus riset sistem kecerdasan buatan 2025–2026, agen otonom bukan sekadar "prompt yang dibungkus loop `while(true)`". Agen otonom adalah **sistem komputasi kognitif (Cognitive System)** yang mengelola memori, ruang aksi, eksekusi terisolasi, dan evaluasi deterministik.

### A. Kerangka Kerja Kognitif CoALA (Sumers et al., Princeton / Berkeley)
Arsitektur agen modern memisahkan memori dan penalaran menjadi 4 kuadran tegas:
1. **Working Memory (RAM Kognitif):** Menampung tujuan aktif (*objective*), draf status saat ini (*Chain of Draft*), dan observasi langsung dari giliran aktif. Jendela ini harus dirawat agar tidak mengalami token bloat.
2. **Episodic Memory (Jejak Pengalaman):** Catatan trajectory masa lalu (riwayat percakapan, turn pairs, riwayat keberhasilan/kegagalan eksekusi).
3. **Semantic Memory (Pengetahuan Faktual):** Fakta profil pengguna, dokumen lokal terindeks (RAG), dan basis pengetahuan statis.
4. **Procedural Memory (Keahlian & SOP):** Prosedur pelaksanaan tugas (*skills*) yang menjelaskan langkah kerja sistematis untuk memecahkan domain masalah tertentu.

### B. Pola Progressive Disclosure Skill (Standar Hermes-Agent & agentskills.io)
Ketika sebuah laptop atau sistem kerja memiliki ratusan skill (seperti yang terdeteksi di laptop user: 140+ skill di `~/.agents/skills` dan puluhan di `.claude/skills`), menyuntikkan seluruh instruksi ke dalam system prompt adalah kesalahan fatal yang memboroskan token dan mengacaukan perhatian (*attention dispersion*) model LLM.

Standar Hermes-Agent membagi pemuatan skill menjadi **3 Lapisan Bertahap (Progressive Disclosure)**:
1. **Discovery (Startup Prompt):** Hanya memuat metadata ringan: `name`, `description` (1–2 kalimat), dan `tags`. Beban token < 3.000 token untuk ratusan skill.
2. **Activation (Triggered on Demand):** Saat instruksi tugas memerlukan prosedur tertentu, sistem mengeksekusi `read-skill <name>` untuk membaca file `SKILL.md` ke dalam working memory giliran aktif.
3. **Deep Reference (Resource Execution):** Berkas pembantu seperti `scripts/` atau `references/*.md` hanya dibaca jika langkah kerja di dalam `SKILL.md` secara eksplisit memerlukannya.

### C. Triad Evaluasi & Eksekusi Otonom (Standar SWE-bench & SWE-EVO)
Penelitian pada SWE-bench Verified membuktikan bahwa model canggih tanpa scaffolding yang solid hanya menghasilkan akurasi rendah. Tiga pilar penentu keberhasilan adalah:
1. **Workspace Isolation (Auto-Worktree):** Agen tidak boleh mengedit file kerja utama secara langsung saat melakukan eksplorasi. Setiap tugas dijalankan di isolated git worktree (`.abelink/worktrees/<task_id>`).
2. **Two-Tier State Machine (Model Claim vs. Environment Verification):** Model yang menyatakan `{"is_done": true}` baru mengajukan klaim. Sistem verifikasi deterministik (*Objective Verifier*) wajib memeriksa bukti fisik di lingkungan (exit code 0, file disk berubah, test suite lulus, screenshot valid) sebelum sesi dinyatakan tuntas.
3. **Self-Healing & Bounded Replan:** Kegagalan tool bukan alasan berhenti. Agen harus mengisolasi pesan error, menyusun hipotesis baru, dan melakukan maksimal 2–3 putaran perbaikan terarah.

### D. Evidence Grounding & Citations (Standar Anthropic API)
Pada tugas riset dan tanya-jawab faktual:
1. Dokumen dan hasil web dipecah ke dalam chunk ber-ID (*Ephemeral Passage Store*).
2. Jawaban akhir wajib menautkan klaim ke kutipan teks asli (*verbatim passage*).
3. Jika kutipan tidak cocok secara karakter demi karakter (*exact offset*), sistem memicu 1x replan atau memberikan pernyataan ketidakpastian secara jujur, mencegah halusinasi data palsu.

---

## 3. Peta Komparasi & Audit Gap Abelink

Berikut adalah evaluasi kritis dan objektif terhadap repositori:
- **Upstream / Remote:** `https://github.com/Abelion512/abelink`
- **Workspace A:** `/media/abelion/Isaf/ican/project/abelink` (Branch `main`)
- **Workspace B:** `/media/abelion/Isaf/ican/project/abelink-apple` (Branch `feat/apple-design` & `apple-design`)

| Dimensi Arsitektur | Standar Industri Otonom (State-of-the-Art) | Repositori `abelink` (main) | Repositori `abelink-apple` (apple-design) | Evaluasi Kesenjangan (Gap Analysis) & Dampak |
| :--- | :--- | :--- | :--- | :--- |
| **1. Manajemen Skill Laptop (Progressive Disclosure)** | Mendeteksi semua repositori skill di host (`~/.agents/skills`, `~/.claude/skills`, dll.). Startup hanya memuat manifest ringkas; instruksi penuh dimuat on-demand via resolver pintar. | Hanya memindai `~/.local/share/abelink/skills` dan NATIVE_SKILLS bawaan. Skill lain di laptop terabaikan. | Memiliki `skillsCache.js` (TTL 5m), tetapi sumber data tetap terbatas pada direktori tunggal XDG. | **GAP TINGGI.** Pengguna memiliki 140+ skill di `~/.agents/skills` dan repositori lain yang tidak dapat diakses Abelink. Tanpa discovery multi-direktori, kapabilitas laptop terpasang tidak termanfaatkan. |
| **2. Determinisme Verifikasi Selesai (Grounding vs Claim)** | Pemisahan tegas: Klaim model diverifikasi oleh harness fisik independen sebelum dinyatakan selesai. | Belum memiliki `objectiveVerifier.js`. Jawaban teks tanpa action dianggap selesai secara prematur. | Memiliki `objectiveVerifier.js` dan `agentDecision.js` dengan matriks evidence fisik (file, code, browser, os). | **GAP SEDANG-RENDAH.** `abelink-apple` sudah berada pada jalur yang benar, namun `abelink` (main) masih tertinggal jauh. Perlu penyelarasan ke `main`. |
| **3. Ketahanan Model & Pool Gateway** | Gateway agregator dengan failover otomatis, exponential backoff cerdas saat rate limit / TPM, dan fallback multi-model. | ai-bridge langsung melempar exception saat 429 atau kuota habis, mematikan sesi tugas panjang. | Ditambahkan penanganan kuota/TPM dan backoff hingga 10 percobaan (Commit `c91e6bb`), namun belum ada rotasi model otomatis ke model sekunder. | **GAP SEDANG.** Jika `claude-work` kelelahan kuota permanen, agen menunggu hingga 10x lalu gagal total tanpa mengalihkan beban ke model alternatif di 9Router. |
| **4. Isolasi Eksekusi (Git Auto-Worktree)** | Eksekusi koding dan refactor otomatis dibuatkan git worktree terisolasi agar branch utama tetap bersih. | Memiliki dokumen blueprint `2026-09-17_autonomous-worktree-peer-gateway-blueprint.md`, tetapi implementasi engine belum aktif di runtime. | Runtime masih melakukan edit in-place via `replace-content` langsung ke file workspace aktif. | **GAP TINGGI.** Agen berisiko merusak file kerja aktif pengguna jika terjadi halusinasi sintaks atau loop edit yang salah. |
| **5. Evidence Retrieval & Verbatim Citations** | In-memory Ephemeral Passage Store (BM25 + Vector). Klaim terikat pada substring kutipan nyata. | Hanya RAG dokumen statis 500 karakter via Orama & Dexie. Hasil web search langsung digabung ke teks observasi mentah. | Masih menggunakan format teks observasi web mentah tanpa penandaan passage atau verifikasi kutipan otomatis. | **GAP TINGGI.** Masih terbuka peluang agen mengutip informasi yang salah atau mengarang angka di luar snippet observasi. |
| **6. Efisiensi Penalaran (Reasoning Bloat)** | Chain of Draft (CoD) ringkas: Status state, hipotesis singkat, tindakan. Menghemat 75% token context window. | Prompt meminta penjelasan detail di field `thought` dan `intermediate_answer`, membebani ReAct loop. | Terdapat ringkasan pemotongan observasi lama, namun struktur CoD formal belum diterapkan di system prompt. | **GAP SEDANG.** Konteks cepat penuh pada tugas di atas 15 turn, memicu penurunan kecerdasan model. |
| **7. Siklus Belajar Otonom (Meta-Learning)** | Refleksi mandiri berkala: Tugas kompleks sukses dianalisis, disintesis jadi SOP, diuji kelayakannya, lalu disimpan ke disk. | Memiliki `should_learn` boolean di output prompt, tetapi modul synthesizer belum terhubung secara penuh. | Memiliki `skillSynthesizer.js` dan `skillMiniEval.js` (evaluasi deterministik struktur dan keamanan skill sebelum kelulusan). | **GAP RENDAH-SEDANG.** Mekanisme evaluasi sudah sangat matang di `abelink-apple`, tinggal diaktifkan untuk menulis berkas `.md` ke folder skill yang dapat dibaca kembali. |
| **8. Tool Dispatcher & Search Aliasing** | Robust tool router: Menerima sinonim natural (`web_search`, `advanced_search`, `google`) dan memetakan ke handler kanonik. | Hanya mendukung `browser-search`. Pemanggilan `web_search` oleh LLM gagal total. | Telah diperbaiki di `core-tools.js`, `toolCatalog.js`, `browserTools.mjs` (Commit `c91e6bb`). | **GAP TUNTAS di apple-design**, belum dimerge ke `main`. |

---

## 4. Rencana Solusi Komprehensif: Cetak Biru Transformasi Abelink

Untuk mentransformasikan Abelink menjadi agen otonom sejati yang setara dengan standar Hermes dan Anthropic, berikut adalah empat langkah rekayasa sistem yang wajib diterapkan:

### Arsitektur 1: Progressive Multi-Source Skill Discovery System ("Load When Needed")
Sistem akan memindai seluruh direktori skill di laptop tanpa membebani context window:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Host Skill Directories Detector                    │
│  - ~/.agents/skills (140+ skills)     - ~/.claude/skills                │
│  - ~/.local/share/abelink/skills      - Custom workspace .abelink/skills│
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                        Index Manifest (Name + Description)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        In-Memory Skill Registry                         │
│  Cache ringan (~2KB) berisi metadata ringkas per skill:                 │
│  { id: "hig-foundations", desc: "Apple HIG design principles", path }   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
           Prompt Startup: Hanya cantumkan 1-baris nama & fungsi
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         On-Demand Lazy Loader                           │
│  Model memanggil: `read-skill hig-foundations`                          │
│  -> Membaca SKILL.md dari path asli di laptop                           │
│  -> Menyuntikkan instruksi lengkap ke Observasi giliran ini             │
└─────────────────────────────────────────────────────────────────────────┘
```

**Spesifikasi Teknis:**
- Ubah `sidecar/engine/channels/skills.mjs` agar mendukung multi-root discovery:
  1. `$XDG_DATA_HOME/abelink/skills`
  2. `~/.agents/skills`
  3. `~/.claude/skills`
  4. Project `.abelink/skills`
- Setiap skill diindeks hanya nama dan deskripsinya.
- Saat dipanggil via `read-skill <nama>`, resolver mencari file target di hierarki folder yang sesuai secara aman (bebas path-traversal).

### Arsitektur 2: Model Pool Resilience & 9Router Auto-Rotator
Mengamankan eksekusi tugas panjang terhadap limit kuota:
1. Saat mendeteksi 429 / TPM limit / Quota Exceeded pada endpoint utama `claude-work`:
   - Lakukan jeda eksponensial (2s, 4s, 8s...).
   - Jika setelah 3 kali percobaan model masih menolak, alihkan panggilan ke model cadangan dalam pool yang terdaftar di konfigurasi (misal: `gemini-3.0-flash` atau model open-source lokal via 9Router).
2. Status peralihan model dicatat pada log trajectory dan diinfokan secara elegan di HUD tanpa memutus alur ReAct.

### Arsitektur 3: Ephemeral Passage Store & Citation Verifier
1. Hasil `browser-search`, `browser-extract`, dan `read-document` otomatis dipecah menjadi passage 300 karakter dengan tanda ID unik `[P-1]`, `[P-2]`, dst.
2. Respons model diwajibkan menyertakan ID passage yang dirujuk.
3. `objectiveVerifier.js` memvalidasi keberadaan cuplikan teks yang dikutip dalam passage terkait. Jika fakta tidak ditemukan dalam passage, verifier menolak kelulusan tugas dan memerintahkan pencarian ulang (*Two-Strike Verification*).

### Arsitektur 4: Auto-Worktree Execution Engine
1. Saat tugas melibatkan manipulasi banyak file atau delegasi coding, agen secara otomatis memicu pembuatan git worktree di `.abelink/worktrees/<task-id>`.
2. Semua operasi file dialihkan ke path worktree tersebut.
3. Sebelum penggabungan (*merge*), rangkaian tes otomatis dijalankan. Jika tes gagal, sistem memicu siklus pemulihan mandiri (*self-healing*) di dalam worktree tanpa mengotori cabang utama.

---

## 5. Kesimpulan & Rekomendasi Eksekusi

Kelemahan Abelink saat ini bukan pada antarmuka visualnya, melainkan pada **disiplin scaffolding sistem kognitifnya**. 
Dengan mengadopsi:
1. **Multi-Source Progressive Disclosure** untuk seluruh pustaka skill di laptop.
2. **Model Pool Resilience** anti-abort kuota.
3. **Objective Verification & Citation Grounding** anti-halusinasi.
4. **Git Auto-Worktree** untuk keselamatan kode.

Abelink akan berevolusi dari sekadar bot asisten menjadi platform sistem operasi agen otonom tingkat industri.

---
*Dokumen ini diterbitkan sebagai referensi otoritatif perbaikan sistem otonom Abelink.*
