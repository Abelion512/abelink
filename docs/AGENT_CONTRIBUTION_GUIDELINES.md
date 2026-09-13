# Agent Contribution Guidelines (Abelink OS)

Dokumen ini adalah pedoman operasional wajib bagi AI coding agent (Antigravity, Claude, Copilot, Cursor, atau agent otonom lainnya) saat membaca, memodifikasi, atau menambahkan kode pada repositori Abelink.

Tujuan utama panduan ini adalah menjaga kedaulatan arsitektur, konsistensi keamanan native, dan mencegah regresi pada pipeline pengujian.

---

## 1. Prinsip Fundamental (Epistemic Grounding)

1. **Tool-First Policy**: Jangan mengandalkan asumsi memori internal LLM. Selalu baca berkas, periksa skema, atau jalankan perintah diagnostik sebelum merancang solusi.
2. **Anti-Hallucination & Anti-Slop**:
   - Dilarang menambahkan dependensi npm atau cargo tanpa memverifikasi ketersediaannya terlebih dahulu.
   - Dilarang menulis teks dokumentasi atau pesan antarmuka dengan gaya hiperbolis atau jargon AI kosong. Tulis dokumentasi secara tajam, ringkas, dan teknis.
   - Dilarang keras menggunakan em dash (simbol tanda pisah panjang). Gunakan tanda titik dua, kurung, atau tanda hubung standar.
3. **Siklus Kerja Baku (Spec -> Plan -> TDD)**:
   - Telaah scope tugas secara menyeluruh.
   - Susun file rencana implementasi jika perubahan melibatkan lebih dari satu modul arsitektur.
   - Buat atau perbarui unit test sebelum atau bersamaan dengan perubahan kode.

---

## 2. Batas Arsitektur (Architectural Boundaries)

Abelink membagi beban kerja ke dalam tiga lapisan terisolasi:

```
[ Frontend: src/ (React 19) ]
         │
         ▼  (Tauri IPC invoke)
[ Shell: src-tauri/ (Rust Shell) ]
         │
         ▼  (stdio JSON-lines RPC)
[ Sidecar: sidecar/ (Bun Engine Daemon) ]
```

### A. Frontend Layer (`src/`)
- Berjalan di dalam WebKitGTK webview (Linux native).
- **LARANGAN KERAS**: Tidak boleh mengimpor modul Node.js (`fs`, `path`, `child_process`) atau sisa dependensi Electron.
- Seluruh komunikasi sistemik WAJIB melalui facade `window.api` di `src/api/tauri-bridge.js`.
- Semua data state berat dan Turn Pairs obrolan disimpan di IndexedDB via `src/api/db.js` (Dexie) dan Web Worker (`embedding.worker.js`). UI thread tidak boleh dibebani komputasi embedding atau transformasi data besar.
- **Anti-Slop Markup (aturan agen)**: Dilarang membungkus teks dengan elemen yang tidak dibutuhkan (`<span>`, `<p>`, `<div>` sekadar pembungkus). Teks polos = teks polos; satu elemen per peran visual. Styling lewat utility Tailwind/DaisyUI langsung di elemen yang sudah ada (tidak ada `<div>` tambahan hanya demi satu class). Tidak ada inline `style={{...}}` kecuali nilainya dinamis dari runtime. Komponen berulang (kartu, badge, tombol) wajib memakai ulang pola yang sudah ada (`HoloCard`, token di `src/assets/main.css`), bukan merakit ulang dari nol.
- **Flat DOM, Teks Pendek (aturan agen)**: Dilarang `div` bersarang lebih dari 3 level untuk satu blok visual — ratakan dengan flex/grid di satu parent, atau pecah jadi komponen kecil. Fragment (`<>`) untuk grup tanpa peran visual. Teks UI (label, deskripsi, empty-state, tooltip) maksimal 1-2 kalimat pendek; potong basa-basi ("Selamat datang di...", "Fitur ini memungkinkan Anda untuk..."). Placeholder/komentar kode juga singkat: satu baris jelas > tiga baris bertele-tele.

### B. Shell Layer (`src-tauri/`)
- Mengontrol lifecycle jendela desktop, tray indicator, dan sistem keamanan sandboxing.
- **Path Containment**: Setiap operasi filesystem di `src-tauri/src/cmd_fs.rs` wajib melalui helper `resolve_contained()`. Akses path yang mengandung `..`, `~`, atau path absolut di luar workspace kerja harus ditolak secara deterministik.
- **Approval Actions**: Setiap tindakan berkategori kritis (penulisan skill baru, pembuatan/penghapusan plugin, registrasi bot Telegram, dan koneksi Google Workspace) wajib meminta konfirmasi pengguna melalui native dialog `rfd` di Rust main thread (`src-tauri/src/cmd_node_bridge.rs`).

### C. Sidecar Engine Layer (`sidecar/`)
- Berjalan sebagai proses terpisah di latar belakang menggunakan Bun (`sidecar/engine.mjs`).
- Menangani eksekusi tools (desktop automation via xdotool, web scraping, MCP connectors, Telegram service).
- Menggunakan protokol JSON-lines melalui `stdin`/`stdout`. Setiap response wajib menyertakan id korelasi yang sama dengan request.

---

## 3. Aturan Manifest & Single Source of Truth

- Versi aplikasi HANYA dideklarasikan pada:
  ```
  src-tauri/tauri.conf.json -> "version"
  ```
- Dilarang mengubah versi secara manual di `package.json` atau `src-tauri/Cargo.toml`.
- Setelah memperbarui versi di `tauri.conf.json`, jalankan perintah sinkronisasi otomatis:
  ```bash
  bun run sync-version
  ```

---

## 4. Kebijakan Repositori Privat & Aset

1. **Apa yang Boleh Di-commit**:
   - Source code, unit tests, scripts, dokumentasi teknis, internal RFC, dan arsitektur audit.
2. **Apa yang DILARANG KERAS Di-commit**:
   - Direktori dependensi (`node_modules/`, `src-tauri/target/`).
   - File media berat berukuran megabyte (video format `.mp4`, `.mov`, `.mkv`, `.avi`, rekaman layar raw).
   - Bobot model biner lokal (`.safetensors`, `.gguf`, `.bin`, `.onnx` di luar resource resmi).
   - Secret keys, `.env`, token API pengguna, atau IndexedDB dump lokal yang berisi data pribadi.
   - Aturan ini dikunci di `.gitignore`.

---

## 5. Gerbang Verifikasi (Verification Gates)

Setiap agent yang menyelesaikan tugas wajib menjalankan rangkaian gerbang pengujian berikut sebelum menyatakan pekerjaan selesai:

1. **Unit Testing Frontend & Utilities**:
   ```bash
   bunx vitest run
   ```
   Seluruh test file wajib berstatus pass tanpa regresi.

2. **AbelinkBench Determinism Smoke Gate**:
   ```bash
   bun evaluation/smoke.mjs
   ```
   Memverifikasi registry task, verifier anti-cheat, evaluasi metriks, dan penanganan effort tanpa network.

3. **Integritas Manifest**:
   ```bash
   bun run sync-version --check
   ```
   Memastikan tidak ada ketidakcocokan versi antara Tauri, Cargo, dan Node manifest.

4. **Kompilasi Rust Shell**:
   ```bash
   cargo check --manifest-path src-tauri/Cargo.toml
   ```
   Memastikan type checking dan bridge Rust tidak rusak oleh perubahan konfigurasi.

---

## 6. Standar Pesan Commit (Conventional Commits)

Format commit pesan:
```
<type>(<scope>): <deskripsi ringkas dalam kalimat aktif>
```
- Contoh valid:
  - `feat(subagent): add concurrent memory indexing support`
  - `fix(eval): ensure regression comparison is synchronous`
  - `refactor(ui): streamline floating HUD layout and remove slop`
- Hindari pesan commit generik seperti "update code", "fix bugs", atau pesan yang dihasilkan otomatis oleh template tanpa konteks teknis spesifik.
