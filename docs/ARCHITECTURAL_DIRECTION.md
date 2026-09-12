# Evaluasi Arah Arsitektur Masa Depan (RFC)

Dokumen ini menganalisis tiga opsi arsitektur teknis untuk arah masa depan **Abelink** (Linux Autonomous AI OS Companion):
1. **Opsi A**: Tetap Arsitektur Hybrid Saat Ini (Tauri v2 Shell + React 19 Frontend + Bun Sidecar Daemon).
2. **Opsi B**: Rewrite Penuh ke Native Rust (Single-binary Rust Backend + Native/WebView UI).
3. **Opsi C**: Migrasi Menjadi Web Murni (Browser App / PWA).

---

## 1. Opsi A: Tetap Arsitektur Hybrid (Status Quo Dioptimalkan)

### Deskripsi Teknis
- **Desktop Shell**: Tauri v2 (Rust) menangani windowing native, system tray, single-instance, global shortcuts, dialog persetujuan native (`rfd`), dan sandboxing path (`resolve_contained`).
- **Antarmuka (Frontend)**: React 19 + Vite 7 + Tailwind CSS 4 berjalan di dalam WebKitGTK webview dengan Web Worker untuk memproses model embedding WASM (Transformers.js) dan IndexedDB (Dexie + Orama).
- **Background Engine**: Bun runtime daemon (`sidecar/engine.mjs`) berkomunikasi via JSON-lines RPC stdio dua arah, menjalankan Telegram bot, web scraper, MCP connector, dynamic plugin loader, dan skrip otomatisasi desktop (`xdotool`).

### Kelebihan (Pros)
1. **Kecepatan Iterasi Sangat Tinggi**: Ekosistem AI bergerak mingguan. Integrasi protokol baru (Model Context Protocol / MCP, SDK provider baru, tool parsing) di TypeScript/Node jauh lebih cepat diimplementasikan dibanding Rust.
2. **Kaya Ekosistem Tooling**: Pustaka seperti `telegraf`, `@orama/orama`, Monaco Editor, dan scraper berbasis cheerio/playwright sudah matang dan siap pakai tanpa perlu menulis ulang dari nol.
3. **Efisiensi Memori Memadai**: Dibandingkan era Electron (600MB sampai 1.2GB RAM), arsitektur Tauri + Bun saat ini hanya mengonsumsi sekitar 100MB hingga 180MB RAM pada kondisi normal.
4. **Isolasi Keamanan Alami**: Jika script sidecar crash atau gagal mengeksekusi bash script, shell Rust dan antarmuka desktop tetap hidup (resilient terhadap unhandled exceptions).

### Kekurangan (Cons)
1. **Multi-Runtime Overhead**: Membutuhkan toolchain Rust dan Bun sekaligus saat proses build dan development.
2. **Overhead IPC Stdio**: Data berukuran sangat besar (misalnya transfer gambar screenshot resolusi 4K atau riwayat obrolan puluhan megabyte) harus diserialisasi menjadi JSON string melalui pipe stdio, menimbulkan latensi mikro.
3. **Distribusi Biner Multi-Lapisan**: Paket rilis harus menyertakan binary executable sidecar (`abelink-engine` / `abelink-engine`) di dalam bundle resource aplikasi.

### Analisis Jangka Panjang (Long-Term ROI)
- **Benefit**: Kemampuan beradaptasi dengan tren AI (sub-agents, durable workflows, MCP) tanpa friksi ekosistem.
- **Risiko**: Kompleksitas maintenance dua bahasa (Rust dan JavaScript/TypeScript).

---

## 2. Opsi B: Rewrite Penuh ke Rust (Full Rust Native)

### Deskripsi Teknis
- Mengeliminasi Bun sidecar dan Node.js runtime secara total.
- Seluruh logika bot Telegram (via crate `teloxide`), HTTP routing (via `reqwest`), database lokal (via `rusqlite` atau `sled`), vector search (via `hnsw_rs`), dan otomasi OS ditulis murni dalam Rust.
- Antarmuka bisa tetap menggunakan Webview via Tauri v2, atau beralih ke native Rust GUI (Slint, Iced, Egui).

### Kelebihan (Pros)
1. **Single Binary Tanpa Dependensi Runtime**: Distribusi hanya berupa satu file binary ELF mandiri. Tidak memerlukan Bun, Node, atau resource bundle terpisah.
2. **Efisiensi Ekstrem**: Konsumsi RAM dapat ditekan hingga di bawah 40MB dengan waktu startup kurang dari 0.2 detik.
3. **Zero-Cost IPC**: Tidak ada serialisasi JSON stdio antara engine dan shell karena semua logika berjalan di proses yang sama dengan memory safety tokio tasks.
4. **Stabilitas Tipe Menyeluruh**: Kesalahan data atau race conditions tertangkap 100% pada saat waktu kompilasi.

### Kekurangan (Cons)
1. **Dev Velocity Merosot Drastis**: Siklus riset dan eksperimen AI melambat secara signifikan. Implementasi ekosistem dinamis (MCP client, Monaco editor, Google APIs, Dynamic ESM Plugins) di Rust membutuhkan usaha 5 hingga 10 kali lebih besar.
2. **Ekosistem AI Native Rust Masih Terbatas**: Sebagian besar spesifikasi protokol AI modern (MCP, tool calling schemas, parser markdown dinamis) dipelihara pertama kali untuk TypeScript dan Python. Porting Rust sering kali tertinggal atau berstatus eksperimental.
3. **Dynamic Plugin Menjadi Sangat Rumit**: Untuk mendukung plugin skrip yang dibuat pengguna tanpa mengompilasi ulang aplikasi, pengembang harus menyematkan runtime JS engine seperti `rquickjs` atau `deno_core` ke dalam biner Rust, yang justru mengembalikan kompleksitas runtime.

### Analisis Jangka Panjang (Long-Term ROI)
- **Benefit**: Aplikasi desktop paling ramping dan paling stabil di kelas Linux OS companion.
- **Biaya**: Biaya refactor sangat masif (estimasi 2 hingga 4 bulan penghentian fitur baru) dan risiko kehilangan relevansi fitur karena lambat mengadopsi protokol AI baru.

---

## 3. Opsi C: Migrasi Menjadi Web Murni (Pure Web / PWA)

### Deskripsi Teknis
- Mengubah Abelink menjadi web app standar yang di-host di server publik atau diakses via browser (Chrome/Firefox/Brave).

### Kelebihan (Pros)
1. **Universal Cross-Platform**: Dapat dibuka dari browser apa pun di Linux, Windows, macOS, Android, maupun iOS tanpa instalasi biner lokal.
2. **Deployment Sepele**: Update kode cukup di-deploy ke server web atau CDN (Vercel, Cloudflare, VPS) tanpa perlu merilis paket `.deb` atau `.AppImage`.

### Kekurangan & Fatal Flaws (Mengapa Opsi Ini Merusak Esensi Produk)
1. **Sandbox Browser Memblokir Akses OS**: Web app dalam browser TIDAK DAPAT mengeksekusi shell command lokal (`run-bash`), membaca window title aktif (`xdotool`), memonitor idle time sistem (`xprintidle`), atau mengendalikan kursor mouse/keyboard.
2. **Kehilangan Kedaulatan Privasi Lokal**: Tanpa shell lokal, seluruh pemrosesan dokumen, indexing file lokal, dan credentials API harus dikirim ke cloud server, meniadakan proposisi nilai utama "Privacy-first local companion".
3. **Ketiadaan Fitur Desktop Native**: Tidak ada global keyboard shortcuts (`Ctrl+Alt+M`, `Ctrl+Shift+S`) saat browser sedang tidak fokus. Jendela transparan melayang di atas desktop Linux tidak mungkin diwujudkan dalam tab browser biasa.
4. **Kesimpulan Opsi C**: Mengubah Abelink menjadi Web Murni adalah langkah regresif yang mengubah sistem dari "Autonomous OS Companion" menjadi sekadar chatbot antarmuka web biasa (seperti ChatGPT web wrapper generik).

---

## 4. Matriks Perbandingan

| Dimensi Evaluasi | Opsi A: Hybrid (Tauri + Bun) | Opsi B: Full Rust | Opsi C: Pure Web |
| --- | --- | --- | --- |
| **Kedaulatan Kontrol OS** | Sangat Tinggi (Native + Daemon) | Sangat Tinggi (Native Murni) | Nol (Terjebak Sandbox Web) |
| **Kecepatan Adopsi AI (Velocity)** | Sangat Cepat (Ekosistem JS/TS) | Lambat (Porting Manual) | Cepat (Backend Server) |
| **Konsumsi RAM Workstation** | Sedang (100MB - 180MB) | Sangat Rendah (<40MB) | Rendah (Beban di Browser Tab) |
| **Keamanan & Sandboxing** | Tinggi (rfd + resolve_contained) | Maksimal (Type & Memory Safe) | Tergantung Server Backend |
| **Dukungan Dynamic Plugins** | Alami (ESM + Bun Loader) | Rumit (Butuh Embedded Engine) | Sulit untuk Skrip Lokal |
| **Waktu & Biaya Transisi** | Nol (Sudah Berjalan & Teruji) | Sangat Tinggi (Rewrite 100%) | Tinggi (Rombak Arsitektur) |

---

## 5. Rekomendasi Strategis (The Pragmatic Hybrid Evolution)

### Keputusan: Pertahankan Opsi A dengan "Pragmatic Rust Migration"

Berdasarkan analisis trade-off teknis, arsitektur terbaik untuk Abelink saat ini dan 2-3 tahun ke depan adalah **Opsi A (Hybrid: Tauri v2 + React 19 + Bun Sidecar)** dengan pendekatan evolusi terarah:

1. **Jaga UI dan AI Connectors di Ranah JavaScript/TypeScript**:
   - Biarkan antarmuka, visualisasi Floating HUD, ReAct loops, sub-agent coordination, dan integrasi MCP tetap berada di React dan Bun. Ini menjamin kecepatan pengembangan tetap maksimal.
2. **Migrasikan Fitur Sensitif & Berat ke Rust Per-Modul**:
   - Bagian yang membutuhkan performa tinggi atau keamanan mutlak dipindahkan secara bertahap ke native Rust command (sebagaimana yang sudah berhasil dilakukan pada `cmd_fs.rs` untuk filesystem sandbox dan `cmd_misc.rs` untuk screenshot capture).
   - Jalur desktop automation berat (misalnya screen capture stream atau OCR parsing) dapat dipindahkan ke Rust crate di masa mendatang tanpa perlu merombak seluruh codebase.
3. **Tolak Opsi Web Murni**:
   - Jangan pernah mengorbankan akses sistem level OS demi kemudahan deployment web. Nilai pembeda Abelink adalah integrasi mendalamnya dengan desktop Linux.
