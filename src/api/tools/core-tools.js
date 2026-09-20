export const core_tools = {
  "read-tools": "WAJIB dipanggil SEBELUM menggunakan tool yang tidak kamu ketahui query-nya! Mendukung nama_grup (misal: \"advanced_browser\", \"pc_automation\", \"git_vcs\", \"task_terminal\"), nama_tool spesifik (misal: \"browser-click\", \"replace-content\"), atau pencarian bebas (misal: \"search: terminal background\" atau \"?snapshot\"). Query: nama_grup ATAU nama_tool ATAU search: kata_kunci.",
  "memory-search": "ALAT PENCARIAN INGATAN (WAJIB DIGUNAKAN). Mencari ingatan masa lalu, preferensi/catatan user, solusi historis, dan riwayat chat percakapan asli (Turn Pairs). ATURAN MUTLAK: Selalu coba cari di tool ini sebelum bertanya balik ke user. ATURAN ANTI-HALUSINASI (GROUNDEDNESS): Jika setelah dicari hasilnya KOSONG atau hanya sedikit, KAMU WAJIB JUJUR dan DILARANG KERAS MENGARANG/MENAMBAH-NAMBAHKAN DAFTAR/FAKTA FIKTIF yang tidak ada di memori! Query: kata_kunci atau kata_kunci||threshold||limit (contoh: 'solusi error CORS' atau 'password wifi||0.6||3' atau 'konfigurasi vite||0.5||10'). Threshold (0.1 - 0.9, default 0.5): atur lebih tinggi untuk pencarian sangat ketat atau lebih rendah untuk pencarian luas. Limit (default 5): jumlah maksimal memori/chat yang ingin diambil.",
  "memory": "Operasi memori profil/preferensi (add, replace, remove, batch). Operasi bersifat atomic. Query berupa JSON string atau format pipa: action||target||new_text (atau old_text||new_text untuk replace). Target yang didukung: 'user' (preferensi pengguna) atau 'memory' (fakta/catatan umum). Contoh: '{\"action\":\"add\",\"target\":\"user\",\"new_text\":\"User suka Tailwind CSS\"}' atau 'add||user||User suka Tailwind CSS' atau 'remove||memory||catatan meeting'.",
  "read-file": "Membaca isi file teks biasa. Query: path_absolut atau path_relatif. Baca spesifik baris: path||startLine||endLine.",
  "write-file": "Menulis/buat file baru dari nol. Query: path||isi_file. (Perlu persetujuan user). Otomatis divalidasi sintaksnya. PENTING: Gunakan 'replace-content' jika file sudah ada!",
  "replace-content": "MENGEDIT SEBAGIAN KODE (UTAMA). Mencocokkan teks target dan menggantinya secara presisi. Query: path||targetContent||replacementContent. Otomatis divalidasi sintaksnya.",
  "replace-lines": "Edit baris tertentu berdasarkan nomor baris. Query: path||startLine||endLine||kode_baru. (Perlu persetujuan user).",
  "delete-file": "Hapus file. Query: path_absolut atau path_relatif. (Perlu persetujuan user).",
  "list-dir": "Lihat daftar isi folder langsung (1 level). Query: path_folder (kosongkan untuk root workspace).",
  "find-files": "Mencari file di seluruh subfolder secara rekursif dengan filter nama/ekstensi glob dan auto-ignore (node_modules, .git, dist, build). Query: pola_glob||subfolder (misal: '*.jsx' atau 'api||src').",
  "grep-search": "Mencari kata kunci/teks kode dalam seluruh file di folder. Query: path_folder||keyword.",
  "file-outline": "Lihat peta/struktur file (fungsi, class, ekspor, heading) beserta nomor baris tanpa membaca seluruh isi. Query: path_absolut.",
  "read-document": "Membaca & mencari isi dokumen teks/PDF/DOCX. Panggil tanpa query untuk Smart Overview, atau gunakan kata kunci (path||keyword) atau baris (path||startLine||endLine).",
  "read-skill": "WAJIB dipanggil jika permintaan user berkaitan dengan salah satu kemampuan di daftar ABELINK SKILLS. Membaca file pedoman skill untuk memuat instruksi dan workflow khusus sebelum mengeksekusi aksi. Query: nama_skill (misal: \"speedrunner\", \"git-commit\").",
  "browser-navigate": "Buka URL di browser companion (Chrome/Chromium). Mengembalikan judul halaman, URL aktif, dan daftar elemen interaktif bernomor ID (ak1, ak2...). Query: URL lengkap (misal: https://www.tradingview.com).",
  "browser-read": "Scan ulang isi DOM & daftar elemen interaktif halaman aktif saat ini. Query: kosongkan atau URL.",
  "browser-ask": "Meminta bantuan pengguna untuk berinteraksi manual langsung di tab browser (misal: login akun Google/TradingView, memecahkan captcha/Cloudflare, verifikasi 2FA). Query: alasan bantuan.",
  "ask-choice": "Meminta user memilih SATU opsi via tombol inline di chat (loop lanjut otomatis setelah klik, tanpa ketik). WAJIB dipakai saat butuh keputusan user di antara opsi konkret yang bisa dienumerasi (maks 4, misal daftar history/debat) — JANGAN mengakhiri giliran dengan pertanyaan teks untuk hal yang bisa jadi tombol. Query: pertanyaan||opsi1;opsi2[;opsi3;opsi4] (contoh: \"Lanjut debat di history mana?||Percakapan A;Percakapan B\").",
  "browser-search": "Mencari informasi di internet secara langsung (web search). Query: kata kunci pencarian.",
  "os-open": "Membuka file lokal atau aplikasi desktop di PC host via xdg-open. Query: nama executable/aplikasi atau path file (misal: nautilus, /path/to/file.pdf). DILARANG KERAS untuk membuka website/URL! Untuk membuka website, WAJIB gunakan browser-navigate.",
  "run-shell": "Menjalankan perintah terminal bash/zsh singkat di PC user (Linux Debian/Ubuntu). Query: perintah_shell. DILARANG mengambil halaman web via curl/wget/python (otomatis ditolak); gunakan browser-navigate/browser-extract.",
  "spawn_subagent": "Mendelegasikan tugas ke agen spesialis baru yang bekerja di lingkungan terisolasi. Query: name||role||goal||initial_message||tools (tools opsional dipisah koma, misal: 'read-file,write-file'). Mengembalikan subagent_id dan balasan awal.",
  "send_message": "Mengirim pesan instruksi, evaluasi, atau feedback dari Abelink ke Sub-Agent aktif. Query: subagent_id||pesan_instruksi. Mengembalikan balasan langsung dari Sub-Agent.",
  "list_subagents": "Melihat daftar seluruh sub-agent yang sedang aktif atau sudah selesai beserta statusnya. Query: kosongkan atau masukkan status (running/idle/completed).",
  "wait_subagents": "Menunggu dan mengumpulkan laporan hasil eksekusi dari sub-agent yang sedang berjalan secara paralel di background. Query: 'all' atau daftar ID dipisah koma (misal: 'sub_1,sub_2') atau beserta batas waktu (misal: 'all||30').",
  "kill_subagent": "Menghentikan paksa eksekusi sub-agent yang sedang berjalan. Query: subagent_id||alasan.",
  "delegate_coding": "Mendelegasikan tugas pemrograman, refactor besar, atau perbaikan mandiri ke CLI coding agent lokal (opencode, hermes) di branch git terisolasi (auto/...). Query: agent_name||instruction||branch_name (contoh: 'opencode||Perbaiki memory leak di vectorMemory.js||auto/fix-memleak' atau 'auto||Implementasi fitur X||auto/feature-x'). Jika agent_name 'auto', agen terbaik yang terpasang akan dipilih otomatis.",
  "web_search": "Alias untuk browser-search. Mencari informasi di internet secara langsung. Query: kata kunci pencarian.",
  "web-search": "Alias untuk browser-search. Mencari informasi di internet secara langsung. Query: kata kunci pencarian.",
  "advanced_search": "Alias untuk browser-search. Mencari informasi di internet secara langsung. Query: kata kunci pencarian."
}

// STREAM D: hanya agen ini yang didukung delegate_coding (cermin di
// codingAgentBridge.js + agentTools.js).
export const PREFERRED_CODING_AGENTS = ['opencode', 'hermes']

export {
  CORE_TOOL_SPECS,
  DEFERRED_GROUP_SPECS,
  UNIFIED_TOOL_CATALOG,
  getToolSpec,
  searchTools,
  formatToolDocumentation,
  formatGroupDocumentation,
  resolveReadToolsQuery
} from './toolCatalog'

