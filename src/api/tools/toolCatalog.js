/**
 * Abelink Tool Catalog & Deferred Search Engine (Adopted from Hermes / Anthropic Tool Search)
 *
 * Menyediakan registrasi metadata kaya per tool:
 * - defer_loading: boolean (false untuk core tools esensial, true untuk deferred groups)
 * - queryFormat: string format query yang diharapkan
 * - examples: array contoh pemakaian nyata ({ query, description })
 * - tags: keywords untuk pencarian lexical
 * - searchTools: pencarian cerdas berbasis token matching & relevansi
 * - resolveReadToolsQuery: resolver pintar untuk read-tools (grup, nama tool, atau search query)
 */

export const CORE_TOOL_SPECS = {
  'read-tools': {
    name: 'read-tools',
    group: 'core',
    defer_loading: false,
    summary: 'Membaca dokumentasi detail atau mencari tool di catalog (grup, tool spesifik, atau keyword search).',
    description: 'WAJIB dipanggil SEBELUM menggunakan tool yang belum kamu ketahui format parameternya. Mendukung nama grup (misal: "advanced_browser"), nama tool spesifik (misal: "browser-click"), atau pencarian (misal: "search: spreadsheet" atau "?terminal").',
    queryFormat: 'nama_grup ATAU nama_tool ATAU search: kata_kunci',
    examples: [
      { query: 'advanced_browser', description: 'Memuat seluruh panduan & tools otomasi browser fisik' },
      { query: 'browser-click', description: 'Melihat detail parameter dan contoh penulisan jangkar klik browser' },
      { query: 'search: git commit', description: 'Mencari tool version control git yang relevan' }
    ],
    tags: ['tools', 'help', 'docs', 'search', 'manual', 'panduan']
  },
  'memory-search': {
    name: 'memory-search',
    group: 'core',
    defer_loading: false,
    summary: 'Mencari memori jangka panjang, preferensi user, catatan profil, dan riwayat turn pairs asli.',
    description: 'ALAT PENCARIAN INGATAN (WAJIB DIGUNAKAN). Mencari ingatan masa lalu, preferensi/catatan user, solusi historis, dan riwayat chat percakapan asli (Turn Pairs). Selalu cari sebelum bertanya balik ke user. Dilarang mengarang fakta fiktif jika hasil kosong.',
    queryFormat: 'kata_kunci atau kata_kunci||threshold||limit',
    examples: [
      { query: 'solusi error CORS', description: 'Mencari ingatan solusi error CORS dengan threshold default' },
      { query: 'password wifi kantor||0.6||3', description: 'Pencarian ketat threshold 0.6 maksimal 3 hasil' },
      { query: 'preferensi warna tema||0.5||5', description: 'Mencari catatan preferensi visual user' }
    ],
    tags: ['memory', 'ingatan', 'profil', 'turn', 'history', 'preferensi', 'search']
  },
  'memory': {
    name: 'memory',
    group: 'core',
    defer_loading: false,
    summary: 'Catat, ganti, atau hapus memori profil/preferensi (add, replace, remove, batch) secara atomic.',
    description: 'Catat, ganti, atau hapus memori profil/preferensi. Batch atomic: semua operasi dalam satu panggilan berhasil atau tidak ada yang diterapkan.',
    queryFormat: 'JSON string { action, target, ... } atau format action||target||...',
    examples: [
      { query: '{"action":"add","target":"user","new_text":"User menyukai gaya bahasa to-the-point"}', description: 'Menambahkan preferensi pengguna baru' },
      { query: '{"action":"replace","target":"user","old_text":"tema terang","new_text":"tema dark mode"}', description: 'Memperbarui preferensi pengguna' },
      { query: '{"action":"remove","target":"memory","old_text":"catatan meeting lama"}', description: 'Menghapus catatan memori' },
      { query: '{"action":"batch","target":"memory","operations":[{"action":"add","target":"user","new_text":"A"},{"action":"remove","target":"memory","old_text":"B"}]}', description: 'Batch atomic beberapa operasi sekaligus' }
    ],
    tags: ['memory', 'profil', 'preferensi', 'ingatan', 'add', 'replace', 'remove', 'batch', 'store']
  },
  'read-file': {
    name: 'read-file',
    group: 'core',
    defer_loading: false,
    summary: 'Membaca isi file teks biasa (seluruh file atau rentang baris tertentu).',
    description: 'Membaca isi file teks biasa dari workspace. Mendukung pembacaan rentang baris spesifik untuk menghemat context budget pada file besar.',
    queryFormat: 'path_file atau path_file||startLine||endLine',
    examples: [
      { query: 'src/App.jsx', description: 'Membaca seluruh isi file App.jsx' },
      { query: 'src/api/db.js||1||120', description: 'Membaca baris 1 sampai 120 dari file db.js' }
    ],
    tags: ['file', 'read', 'cat', 'fs', 'source', 'code']
  },
  'write-file': {
    name: 'write-file',
    group: 'core',
    defer_loading: false,
    summary: 'Menulis file baru dari nol (membutuhkan konfirmasi jika berisiko).',
    description: 'Menulis/buat file baru dari nol di workspace. Otomatis divalidasi sintaksnya. PENTING: Gunakan "replace-content" jika file sudah ada!',
    queryFormat: 'path_file||isi_file',
    examples: [
      { query: 'src/utils/math.js||export const add = (a, b) => a + b;\n', description: 'Membuat file utility baru berisi fungsi add' }
    ],
    tags: ['file', 'write', 'create', 'fs', 'new']
  },
  'replace-content': {
    name: 'replace-content',
    group: 'core',
    defer_loading: false,
    summary: 'Mengedit sebagian kode file secara presisi dengan mencocokkan target content.',
    description: 'MENGEDIT SEBAGIAN KODE (UTAMA). Mencocokkan teks target dan menggantinya secara presisi. Query: path||targetContent||replacementContent. Otomatis divalidasi sintaksnya.',
    queryFormat: 'path_file||targetContent||replacementContent',
    examples: [
      {
        query: 'src/components/Header.jsx||<h1 className="title">Halo</h1>||<h1 className="title font-bold">Halo Abelink</h1>',
        description: 'Mengganti heading judul di file Header.jsx'
      }
    ],
    tags: ['edit', 'replace', 'content', 'code', 'modify', 'patch']
  },
  'replace-lines': {
    name: 'replace-lines',
    group: 'core',
    defer_loading: false,
    summary: 'Mengedit baris tertentu pada file berdasarkan nomor baris (startLine sampai endLine).',
    description: 'Edit baris tertentu berdasarkan nomor baris. Membutuhkan verifikasi nomor baris akurat via read-file atau file-outline terlebih dahulu.',
    queryFormat: 'path_file||startLine||endLine||kode_baru',
    examples: [
      { query: 'src/config.js||15||17||export const PORT = 8080;', description: 'Mengganti baris 15 sampai 17 dengan baris konfigurasi port baru' }
    ],
    tags: ['edit', 'lines', 'line', 'patch', 'code']
  },
  'delete-file': {
    name: 'delete-file',
    group: 'core',
    defer_loading: false,
    summary: 'Menghapus file dari workspace.',
    description: 'Menghapus file di workspace. Membutuhkan persetujuan user.',
    queryFormat: 'path_file',
    examples: [
      { query: 'tmp/scratch.txt', description: 'Menghapus file sementara scratch.txt' }
    ],
    tags: ['delete', 'remove', 'rm', 'unlink']
  },
  'list-dir': {
    name: 'list-dir',
    group: 'core',
    defer_loading: false,
    summary: 'Melihat daftar berkas dan folder langsung (1 level).',
    description: 'Lihat daftar isi folder langsung (1 level). Kosongkan query untuk direktori root workspace.',
    queryFormat: 'path_folder (opsional)',
    examples: [
      { query: '', description: 'Melihat isi direktori root workspace' },
      { query: 'src/components', description: 'Melihat isi folder src/components' }
    ],
    tags: ['dir', 'list', 'ls', 'folder', 'files']
  },
  'find-files': {
    name: 'find-files',
    group: 'core',
    defer_loading: false,
    summary: 'Mencari file secara rekursif dengan filter nama/glob (auto-ignore node_modules, .git, dll).',
    description: 'Mencari file di seluruh subfolder secara rekursif dengan filter nama/ekstensi glob dan auto-ignore (node_modules, .git, dist, build). Query: pola_glob||subfolder.',
    queryFormat: 'pola_glob atau pola_glob||subfolder',
    examples: [
      { query: '*.jsx', description: 'Mencari seluruh file React JSX di root workspace' },
      { query: '*.test.mjs||tests', description: 'Mencari file unit test di dalam folder tests' },
      { query: 'api||src', description: 'Mencari file berawalan/mengandung kata "api" di dalam folder src' }
    ],
    tags: ['find', 'search', 'glob', 'files', 'locate']
  },
  'grep-search': {
    name: 'grep-search',
    group: 'core',
    defer_loading: false,
    summary: 'Mencari kemunculan teks atau kata kunci dalam seluruh file di folder.',
    description: 'Mencari kata kunci/teks kode dalam seluruh file di folder (ripgrep-backed). Query: path_folder||keyword.',
    queryFormat: 'path_folder||keyword',
    examples: [
      { query: 'src||useAbelinkAgent', description: 'Mencari kata kunci useAbelinkAgent di dalam folder src' },
      { query: '.||DATABASE_VERSION', description: 'Mencari referensi konstanta DATABASE_VERSION di seluruh proyek' }
    ],
    tags: ['grep', 'search', 'text', 'regex', 'find']
  },
  'file-outline': {
    name: 'file-outline',
    group: 'core',
    defer_loading: false,
    summary: 'Melihat struktur peta file (fungsi, kelas, ekspor) beserta nomor baris.',
    description: 'Lihat peta/struktur file (fungsi, class, ekspor, heading) beserta nomor baris tanpa membaca seluruh isi. Sangat hemat token untuk file besar.',
    queryFormat: 'path_file',
    examples: [
      { query: 'src/api/ai/planning.js', description: 'Melihat outline struktur fungsi dan ekspor di planning.js' }
    ],
    tags: ['outline', 'ast', 'symbols', 'structure', 'functions']
  },
  'read-document': {
    name: 'read-document',
    group: 'core',
    defer_loading: false,
    summary: 'Membaca dan mencari isi dokumen PDF, DOCX, TXT, atau Markdown via RAG pipeline.',
    description: 'Membaca & mencari isi dokumen teks/PDF/DOCX. Panggil tanpa query untuk Smart Overview, atau gunakan kata kunci (path||keyword) atau baris (path||startLine||endLine).',
    queryFormat: 'path_dokumen ATAU path_dokumen||kata_kunci ATAU path_dokumen||startLine||endLine',
    examples: [
      { query: 'docs/SPEC.pdf', description: 'Membaca overview struktur dan ringkasan dokumen SPEC.pdf' },
      { query: 'docs/kontrak.docx||pembayaran', description: 'Mencari klausa pembayaran di dalam file kontrak.docx' }
    ],
    tags: ['document', 'pdf', 'docx', 'rag', 'read']
  },
  'read-skill': {
    name: 'read-skill',
    group: 'core',
    defer_loading: false,
    summary: 'Membaca pedoman skill terdaftar (SOP resmi atau learned skill) sebelum eksekusi.',
    description: 'WAJIB dipanggil jika permintaan user berkaitan dengan salah satu kemampuan di daftar ABELINK SKILLS. Membaca file pedoman skill untuk memuat instruksi dan workflow khusus sebelum mengeksekusi aksi.',
    queryFormat: 'nama_skill',
    examples: [
      { query: 'speedrunner', description: 'Memuat SOP speedrunner untuk eksekusi batch terencana' },
      { query: 'git-commit', description: 'Memuat SOP konvensi commit pesan git' }
    ],
    tags: ['skill', 'sop', 'playbook', 'instructions', 'learned']
  },
  'browser-navigate': {
    name: 'browser-navigate',
    group: 'core',
    defer_loading: false,
    summary: 'Membuka URL di browser companion fisik dan mengembalikan daftar elemen interaktif bernomor.',
    description: 'Buka URL di browser companion (Chrome/Chromium). Mengembalikan judul halaman, URL aktif, dan daftar elemen interaktif bernomor ID (ak1, ak2...). Query: URL lengkap.',
    queryFormat: 'url_lengkap',
    examples: [
      { query: 'https://news.ycombinator.com', description: 'Membuka situs Hacker News di browser' },
      { query: 'https://github.com/trending', description: 'Membuka halaman trending GitHub' }
    ],
    tags: ['browser', 'web', 'navigate', 'url', 'open', 'dom']
  },
  'browser-read': {
    name: 'browser-read',
    group: 'core',
    defer_loading: false,
    summary: 'Memindai ulang isi DOM & daftar elemen interaktif halaman browser yang sedang aktif.',
    description: 'Scan ulang isi DOM & daftar elemen interaktif halaman aktif saat ini. Query: kosongkan atau URL.',
    queryFormat: 'kosong atau url',
    examples: [
      { query: '', description: 'Membaca ulang state elemen halaman saat ini setelah delay render' }
    ],
    tags: ['browser', 'dom', 'read', 'elements', 'rescan']
  },
  'browser-ask': {
    name: 'browser-ask',
    group: 'core',
    defer_loading: false,
    summary: 'Meminta bantuan user di tab browser (login manual, captcha, 2FA).',
    description: 'Meminta bantuan pengguna untuk berinteraksi manual langsung di tab browser (misal: login akun Google/TradingView, memecahkan captcha/Cloudflare, verifikasi 2FA). Query: alasan bantuan.',
    queryFormat: 'alasan_bantuan_untuk_user',
    examples: [
      { query: 'Silakan login akun Google Anda di jendela browser yang terbuka, lalu saya akan melanjutkan.', description: 'Meminta user login Google' }
    ],
    tags: ['browser', 'ask', 'captcha', 'login', '2fa', 'user']
  },
  'ask-choice': {
    name: 'ask-choice',
    group: 'core',
    defer_loading: false,
    summary: 'Menampilkan tombol pilihan inline (maks 4) agar user memilih dengan satu klik tanpa mengetik.',
    description: 'Meminta user memilih SATU opsi via tombol inline di chat (loop lanjut otomatis setelah klik, tanpa ketik). WAJIB dipakai saat butuh keputusan user di antara opsi konkret yang bisa dienumerasi (maks 4).',
    queryFormat: 'pertanyaan||opsi1;opsi2[;opsi3;opsi4]',
    examples: [
      { query: 'Pilih branch target pengujian||feat/apple-design;feat/memory-router;main', description: 'Menawarkan pilihan branch target pengujian' },
      { query: 'Lanjut eksekusi sekarang?||Ya, lanjutkan;Batal', description: 'Konfirmasi biner cepat dengan tombol pilihan' }
    ],
    tags: ['choice', 'buttons', 'ask', 'options', 'ui', 'user']
  },
  'browser-search': {
    name: 'browser-search',
    group: 'core',
    defer_loading: false,
    summary: 'Mencari informasi di internet secara langsung (multi-provider search engine).',
    description: 'Mencari informasi di internet secara langsung (web search via Searxng/Google/DDG). Mengembalikan tautan dan kutipan hasil pencarian.',
    queryFormat: 'kata_kunci_pencarian',
    examples: [
      { query: 'Tauri v2 release notes migration', description: 'Mencari dokumen rilis migrasi Tauri v2' },
      { query: 'harga bitcoin hari ini usd', description: 'Mencari kurs dan harga pasar kripto terbaru' }
    ],
    tags: ['search', 'google', 'web', 'internet', 'query']
  },
  'web_search': {
    name: 'web_search',
    group: 'core',
    defer_loading: false,
    summary: 'Alias untuk browser-search. Mencari informasi di internet secara langsung.',
    description: 'Alias untuk browser-search. Mencari informasi di internet secara langsung via Searxng/Google/DDG.',
    queryFormat: 'kata_kunci_pencarian',
    examples: [
      { query: 'harga bitcoin hari ini usd', description: 'Mencari kurs dan harga pasar kripto terbaru' }
    ],
    tags: ['search', 'google', 'web', 'internet', 'query']
  },
  'web-search': {
    name: 'web-search',
    group: 'core',
    defer_loading: false,
    summary: 'Alias untuk browser-search. Mencari informasi di internet secara langsung.',
    description: 'Alias untuk browser-search. Mencari informasi di internet secara langsung via Searxng/Google/DDG.',
    queryFormat: 'kata_kunci_pencarian',
    examples: [
      { query: 'harga bitcoin hari ini usd', description: 'Mencari kurs dan harga pasar kripto terbaru' }
    ],
    tags: ['search', 'google', 'web', 'internet', 'query']
  },
  'advanced_search': {
    name: 'advanced_search',
    group: 'core',
    defer_loading: false,
    summary: 'Alias untuk browser-search. Mencari informasi di internet secara langsung.',
    description: 'Alias untuk browser-search. Mencari informasi di internet secara langsung via Searxng/Google/DDG.',
    queryFormat: 'kata_kunci_pencarian',
    examples: [
      { query: 'harga bitcoin hari ini usd', description: 'Mencari kurs dan harga pasar kripto terbaru' }
    ],
    tags: ['search', 'google', 'web', 'internet', 'query']
  },
  'os-open': {
    name: 'os-open',
    group: 'core',
    defer_loading: false,
    summary: 'Membuka file lokal atau aplikasi desktop di PC host via xdg-open.',
    description: 'Membuka file lokal atau aplikasi desktop di PC host via xdg-open. Query: nama executable/aplikasi atau path file. DILARANG KERAS untuk membuka website/URL! Untuk URL wajib gunakan browser-navigate.',
    queryFormat: 'nama_aplikasi atau path_file',
    examples: [
      { query: 'nautilus', description: 'Membuka file manager Nautilus di desktop' },
      { query: 'laporan_keuangan.pdf', description: 'Membuka file PDF laporan di aplikasi viewer default' }
    ],
    tags: ['os', 'open', 'xdg-open', 'app', 'desktop']
  },
  'run-shell': {
    name: 'run-shell',
    group: 'core',
    defer_loading: false,
    summary: 'Menjalankan perintah terminal bash/zsh singkat di PC user (Linux).',
    description: 'Menjalankan perintah terminal bash/zsh singkat di PC user (Linux Debian/Ubuntu). Query: perintah_shell. DILARANG mengambil halaman web via curl/wget/python (otomatis ditolak); gunakan browser-navigate/browser-extract.',
    queryFormat: 'perintah_bash',
    examples: [
      { query: 'bun run test', description: 'Menjalankan test suite menggunakan Bun' },
      { query: 'uname -a', description: 'Memeriksa versi kernel dan arsitektur Linux' }
    ],
    tags: ['bash', 'sh', 'shell', 'terminal', 'cmd', 'exec']
  },
  'spawn_subagent': {
    name: 'spawn_subagent',
    group: 'core',
    defer_loading: false,
    summary: 'Mendelegasikan tugas ke agen spesialis baru di lingkungan terisolasi.',
    description: 'Mendelegasikan tugas ke agen spesialis baru yang bekerja di lingkungan terisolasi. Query: name||role||goal||initial_message||tools (tools opsional dipisah koma). Mengembalikan subagent_id dan balasan awal.',
    queryFormat: 'name||role||goal||initial_message||tools_opsional',
    examples: [
      {
        query: 'TesterAgent||QA Tester||Verifikasi endpoint auth||Tolong periksa respons 401 token expired||run-shell,read-file',
        description: 'Mendelegasikan pengujian token auth ke subagent khusus QA'
      }
    ],
    tags: ['subagent', 'agent', 'spawn', 'delegate', 'multi-agent']
  },
  'send_message': {
    name: 'send_message',
    group: 'core',
    defer_loading: false,
    summary: 'Mengirim pesan instruksi, evaluasi, atau feedback ke Sub-Agent aktif.',
    description: 'Mengirim pesan instruksi, evaluasi, atau feedback dari Abelink ke Sub-Agent aktif. Mengembalikan balasan langsung dari Sub-Agent.',
    queryFormat: 'subagent_id||pesan_instruksi',
    examples: [
      { query: 'sub_tester_1||Lanjutkan ke file authController.js baris 45', description: 'Memberi arahan langkah berikutnya ke subagent aktif' }
    ],
    tags: ['subagent', 'message', 'send', 'intercom']
  },
  'list_subagents': {
    name: 'list_subagents',
    group: 'core',
    defer_loading: false,
    summary: 'Melihat status seluruh sub-agent (running/idle/completed).',
    description: 'Melihat daftar seluruh sub-agent yang sedang aktif atau sudah selesai beserta statusnya.',
    queryFormat: 'kosong atau filter_status (running/idle/completed)',
    examples: [
      { query: '', description: 'Melihat seluruh subagent beserta statusnya' },
      { query: 'running', description: 'Menyaring hanya subagent yang sedang berjalan aktif' }
    ],
    tags: ['subagent', 'list', 'status', 'overview']
  },
  'wait_subagents': {
    name: 'wait_subagents',
    group: 'core',
    defer_loading: false,
    summary: 'Menunggu dan mengumpulkan laporan hasil eksekusi sub-agent di latar belakang.',
    description: 'Menunggu dan mengumpulkan laporan hasil eksekusi dari sub-agent yang sedang berjalan secara paralel di background.',
    queryFormat: "'all' atau subagent_id1,subagent_id2 atau all||timeout_detik",
    examples: [
      { query: 'all', description: 'Menunggu seluruh subagent yang sedang berjalan selesai' },
      { query: 'sub_1,sub_2||30', description: 'Menunggu subagent sub_1 dan sub_2 maksimal 30 detik' }
    ],
    tags: ['subagent', 'wait', 'join', 'sync']
  },
  'kill_subagent': {
    name: 'kill_subagent',
    group: 'core',
    defer_loading: false,
    summary: 'Menghentikan paksa eksekusi sub-agent yang sedang berjalan.',
    description: 'Menghentikan paksa eksekusi sub-agent yang sedang berjalan.',
    queryFormat: 'subagent_id||alasan',
    examples: [
      { query: 'sub_1||Task timeout atau loop berulang', description: 'Menghentikan subagent sub_1 karena loop' }
    ],
    tags: ['subagent', 'kill', 'stop', 'abort']
  },
  'delegate_coding': {
    name: 'delegate_coding',
    group: 'core',
    defer_loading: false,
    summary: 'Mendelegasikan tugas coding/refactor ke CLI coding agent lokal (opencode, hermes) di git branch terisolasi.',
    description: 'Mendelegasikan tugas pemrograman, refactor besar, atau perbaikan mandiri ke CLI coding agent lokal (opencode, hermes) di branch git terisolasi (auto/...). Jika agent_name "auto", agen terbaik yang terpasang akan dipilih otomatis.',
    queryFormat: 'agent_name||instruksi||branch_name',
    examples: [
      { query: 'auto||Implementasikan parser JSON di src/parser.js||auto/json-parser', description: 'Mendelegasikan pembuatan parser ke coding agent lokal' },
      { query: 'opencode||Perbaiki memory leak di vectorMemory.js||auto/fix-memleak', description: 'Mendelegasikan perbaikan bug spesifik ke OpenCode' }
    ],
    tags: ['coding', 'agent', 'opencode', 'hermes', 'git', 'refactor']
  }
}

export const DEFERRED_GROUP_SPECS = {
  advanced_browser: {
    description: 'Navigasi dan kontrol elemen fisik browser web (Chrome/Chromium). Gunakan untuk otomasi web & penelusuran visual interaktif.',
    tools: {
      'browser-navigate': {
        summary: 'Membuka URL di browser fisik dan mengembalikan elemen bernomor (ID).',
        queryFormat: 'url_lengkap',
        examples: [{ query: 'https://example.com', description: 'Buka halaman website' }],
        tags: ['web', 'open', 'url']
      },
      'browser-read': {
        summary: 'Scan ulang elemen halaman saat ini setelah loading/render.',
        queryFormat: 'kosong atau url',
        examples: [{ query: '', description: 'Pindai ulang state elemen' }],
        tags: ['dom', 'rescan']
      },
      'browser-click': {
        summary: 'Klik elemen interaktif berdasar nomor ID atau jangkar ID||teks (mencegah salah klik).',
        queryFormat: 'ID atau ID||teks-yang-diharapkan',
        examples: [
          { query: 'ak5', description: 'Klik tombol/elemen ak5' },
          { query: 'ak5||Login', description: 'Klik aman berjangkar teks (hanya klik bila teks cocok)' }
        ],
        tags: ['click', 'press', 'interact']
      },
      'browser-type': {
        summary: 'Ketik teks ke dalam elemen input di browser.',
        queryFormat: 'ID||teks',
        examples: [{ query: 'ak3||kata kunci pencarian', description: 'Ketik ke input ak3' }],
        tags: ['type', 'input', 'write']
      },
      'browser-scroll': {
        summary: 'Scroll halaman web ke atas atau ke bawah.',
        queryFormat: '"up" atau "down"',
        examples: [{ query: 'down', description: 'Scroll ke bawah' }],
        tags: ['scroll']
      },
      'browser-extract': {
        summary: 'Ekstrak teks data via CSS Selector atau teks utama halaman jika tanpa selector.',
        queryFormat: 'selector_css (opsional)',
        examples: [
          { query: '', description: 'Ekstrak seluruh teks utama artikel/soal' },
          { query: '.product-price', description: 'Ekstrak teks harga produk spesifik' }
        ],
        tags: ['extract', 'scrape', 'text']
      },
      'browser-script': {
        summary: 'Eksekusi custom JavaScript di console browser companion.',
        queryFormat: 'script_javascript',
        examples: [{ query: 'document.title', description: 'Mengambil judul halaman lewat JS' }],
        tags: ['eval', 'javascript', 'script']
      },
      'browser-screenshot': {
        summary: 'Ambil screenshot web utuh dan simpan ke OS.',
        queryFormat: 'nama_file.png',
        examples: [{ query: 'bukti_pembayaran.png', description: 'Simpan snapshot web ke file' }],
        tags: ['screenshot', 'capture', 'image']
      },
      'browser-snapshot': {
        summary: 'Baca SELURUH teks halaman, rumus MathJax TeX, dan daftar gambar soal.',
        queryFormat: 'kosong',
        examples: [{ query: '', description: 'Ambil snapshot konten lengkap saat DOM read kosong' }],
        tags: ['snapshot', 'fulltext', 'mathjax', 'tex']
      },
      'browser-wait-for': {
        summary: 'Tunggu teks tertentu muncul di halaman (konten JS lambat) maks 15 detik.',
        queryFormat: 'teks_yang_ditunggu',
        examples: [{ query: 'Soal No 1', description: 'Tunggu elemen soal muncul sebelum interaksi' }],
        tags: ['wait', 'delay', 'loading']
      },
      'browser-download': {
        summary: 'Download file dari URL langsung ke OS.',
        queryFormat: 'url||namafile.ext',
        examples: [{ query: 'https://example.com/data.csv||data.csv', description: 'Download berkas CSV ke disk' }],
        tags: ['download', 'save']
      },
      'browser-back': {
        summary: 'Navigasi mundur (history back) di tab browser.',
        queryFormat: 'kosong',
        examples: [{ query: '', description: 'Kembali ke halaman sebelumnya' }],
        tags: ['back', 'history']
      },
      'browser-forward': {
        summary: 'Navigasi maju (history forward) di tab browser.',
        queryFormat: 'kosong',
        examples: [{ query: '', description: 'Maju ke halaman selanjutnya' }],
        tags: ['forward', 'history']
      },
      'browser-reload': {
        summary: 'Muat ulang (refresh) tab browser aktif.',
        queryFormat: 'kosong',
        examples: [{ query: '', description: 'Refresh tab browser' }],
        tags: ['reload', 'refresh']
      },
      'browser-ask-user': {
        summary: 'Minta user mengisi CAPTCHA/login manual di popup.',
        queryFormat: 'pesan_instruksi_user',
        examples: [{ query: 'Tolong selesaikan CAPTCHA di layar ya.', description: 'Bantuan user untuk login/captcha' }],
        tags: ['ask', 'captcha', 'login']
      },
      'browser-close': {
        summary: 'Menutup tab atau browser fisik companion.',
        queryFormat: 'kosong',
        examples: [{ query: '', description: 'Tutup sesi browser setelah selesai' }],
        tags: ['close', 'quit']
      }
    }
  },
  pc_automation: {
    description: 'Interaksi fisik dengan desktop OS Linux (X11): kontrol mouse, keyboard, window, dan aplikasi.',
    tools: {
      'os-control-open': {
        summary: 'Mengunci sesi otomatisasi PC dan memunculkan overlay kontrol.',
        queryFormat: 'kosong',
        examples: [{ query: '', description: 'Mulai sesi kontrol desktop' }],
        tags: ['session', 'lock', 'start']
      },
      'os-control-close': {
        summary: 'Menutup sesi dan overlay kontrol otomatisasi PC.',
        queryFormat: 'kosong',
        examples: [{ query: '', description: 'Akhiri sesi kontrol desktop' }],
        tags: ['session', 'close', 'done']
      },
      'os-read': {
        summary: 'Membaca hierarki elemen GUI desktop (kosong = full scan, "focus" = 1 ms instant).',
        queryFormat: 'kosong atau "focus"',
        examples: [
          { query: '', description: 'Scan seluruh GUI desktop' },
          { query: 'focus', description: 'Baca elemen yang sedang fokus/tersorot secara instan' }
        ],
        tags: ['gui', 'read', 'ocr', 'screen']
      },
      'os-click': {
        summary: 'Klik mouse pada koordinat x||y atau nomor ID elemen GUI desktop.',
        queryFormat: 'ID atau x||y atau ID||teks-jangkar atau x||y||teks',
        examples: [
          { query: '12', description: 'Klik elemen GUI ID 12' },
          { query: '500||300', description: 'Klik koordinat x=500, y=300' },
          { query: '12||Buka Berkas', description: 'Klik aman dengan pencocokan teks jangkar' }
        ],
        tags: ['click', 'mouse']
      },
      'os-type': {
        summary: 'Ketik teks ke elemen input di aplikasi desktop.',
        queryFormat: 'ID||teks atau teks_langsung',
        examples: [{ query: '4||document.txt', description: 'Ketik nama file ke kolom dialog input' }],
        tags: ['type', 'keyboard']
      },
      'os-key': {
        summary: 'Tekan kombinasi tombol keyboard (shortcut).',
        queryFormat: 'shortcut (misal: ctrl+c, alt+tab, win+e, enter)',
        examples: [
          { query: 'ctrl+s', description: 'Simpan file dokumen aktif' },
          { query: 'enter', description: 'Tekan tombol enter' }
        ],
        tags: ['key', 'shortcut', 'press']
      },
      'os-scroll': {
        summary: 'Scroll roda mouse di aplikasi aktif.',
        queryFormat: 'direction||amount (misal: down||5 atau up||3)',
        examples: [{ query: 'down||4', description: 'Scroll ke bawah sebanyak 4 tick' }],
        tags: ['scroll', 'mouse']
      },
      'os-search': {
        summary: 'Membuka launcher aplikasi desktop (Super) lalu mengetik kata kunci pencarian.',
        queryFormat: 'kata_kunci_aplikasi',
        examples: [{ query: 'calculator', description: 'Mencari aplikasi kalkulator di launcher desktop' }],
        tags: ['search', 'launcher', 'app']
      },
      'os-open': {
        summary: 'Membuka file atau aplikasi desktop via xdg-open.',
        queryFormat: 'path_file atau nama_aplikasi',
        examples: [{ query: 'gimp', description: 'Membuka editor gambar GIMP' }],
        tags: ['open', 'run']
      },
      'os-double-click': {
        summary: 'Klik ganda mouse pada elemen GUI desktop atau koordinat x||y.',
        queryFormat: 'ID atau x||y',
        examples: [{ query: '15', description: 'Klik ganda pada elemen item 15' }],
        tags: ['double-click', 'mouse']
      },
      'os-list-windows': {
        summary: 'Menampilkan daftar seluruh window aplikasi yang sedang terbuka beserta judulnya.',
        queryFormat: 'kosong',
        examples: [{ query: '', description: 'Melihat seluruh window aktif' }],
        tags: ['windows', 'wm', 'list']
      },
      'os-focus-window': {
        summary: 'Fokus window aplikasi berdasarkan judul persis dari os-list-windows.',
        queryFormat: 'judul_window',
        examples: [{ query: 'Mozilla Firefox', description: 'Fokus ke jendela Firefox' }],
        tags: ['focus', 'window']
      },
      'os-ask': {
        summary: 'Meminta konfirmasi dari user saat sesi otomatisasi PC berlangsung.',
        queryFormat: 'pesan_konfirmasi',
        examples: [{ query: 'Apakah boleh melanjutkan penutupan aplikasi ini?', description: 'Minta izin user' }],
        tags: ['ask', 'confirm']
      }
    }
  },
  git_vcs: {
    description: 'Manajemen version control Git untuk repositori proyek (status, diff, commit, rollback).',
    tools: {
      'git-status': {
        summary: 'Melihat status modifikasi berkas di repositori git (git status --short).',
        queryFormat: 'kosongkan atau path_folder',
        examples: [{ query: '', description: 'Cek file yang berubah di repo saat ini' }],
        tags: ['git', 'status', 'vcs']
      },
      'git-diff': {
        summary: 'Melihat detail baris kode yang berubah sebelum di-commit (git diff).',
        queryFormat: 'kosongkan atau nama_berkas',
        examples: [
          { query: '', description: 'Melihat seluruh diff perubahan repo' },
          { query: 'src/api/tools/toolCatalog.js', description: 'Melihat diff spesifik berkas' }
        ],
        tags: ['git', 'diff', 'patch']
      },
      'git-commit': {
        summary: 'Membuat checkpoint commit git secara otomatis (membutuhkan konfirmasi).',
        queryFormat: 'pesan_commit atau pesan_commit||path_folder',
        examples: [{ query: 'feat(tools): tool search deferred catalog', description: 'Commit perubahan fitur baru' }],
        tags: ['git', 'commit', 'save']
      },
      'git-revert': {
        summary: 'Me-rollback perubahan berkas yang belum di-commit ke HEAD.',
        queryFormat: 'nama_berkas atau kosongkan untuk reset hard',
        examples: [{ query: 'tests/temp.js', description: 'Membatalkan perubahan pada file tests/temp.js' }],
        tags: ['git', 'revert', 'reset', 'rollback']
      }
    }
  },
  task_terminal: {
    description: 'Terminal runner latar belakang (non-blocking) untuk menjalankan server dev, unit test, dan proses jangka panjang.',
    tools: {
      'run-task': {
        summary: 'Menjalankan server atau proses background terminal non-blocking.',
        queryFormat: 'taskId||perintah_shell',
        examples: [
          { query: 'dev-server||bun run dev', description: 'Menjalankan server dev Vite di background' },
          { query: 'vitest-watch||bunx vitest', description: 'Menjalankan test runner di background' }
        ],
        tags: ['task', 'server', 'background', 'daemon', 'run']
      },
      'read-task-output': {
        summary: 'Membaca log output terbaru dari background terminal task.',
        queryFormat: 'taskId atau taskId||jumlah_baris',
        examples: [{ query: 'dev-server||40', description: 'Membaca 40 baris log terakhir dev server' }],
        tags: ['task', 'logs', 'output', 'stdout']
      },
      'kill-task': {
        summary: 'Menghentikan proses background terminal yang sedang berjalan.',
        queryFormat: 'taskId',
        examples: [{ query: 'dev-server', description: 'Menghentikan proses server dev' }],
        tags: ['task', 'kill', 'stop']
      },
      'list-tasks': {
        summary: 'Melihat seluruh background tasks yang sedang berjalan beserta PID dan statusnya.',
        queryFormat: 'kosong',
        examples: [{ query: '', description: 'Melihat daftar tugas latar belakang aktif' }],
        tags: ['task', 'list', 'processes']
      }
    }
  },
  youtube_music: {
    description: 'Integrasi pencarian YouTube dan pemutar musik lokal / YouTube Music.',
    tools: {
      'yt-search': {
        summary: 'Mencari video di YouTube.',
        queryFormat: 'kata_kunci',
        examples: [{ query: 'tutorial react hooks', description: 'Mencari video tutorial' }],
        tags: ['youtube', 'video', 'search']
      },
      'yt-summary': {
        summary: 'Merangkum isi transkrip video YouTube.',
        queryFormat: 'url_video_youtube',
        examples: [{ query: 'https://youtube.com/watch?v=xyz', description: 'Rangkum materi video' }],
        tags: ['youtube', 'transcript', 'summary']
      },
      'music-play': {
        summary: 'Memutar lagu di YouTube Music.',
        queryFormat: 'judul_lagu atau artis',
        examples: [{ query: 'Lofi hip hop beats', description: 'Putar lagu lofi' }],
        tags: ['music', 'play', 'audio']
      },
      'music-toggle': {
        summary: 'Pause atau lanjut memutar lagu yang sedang aktif.',
        queryFormat: 'kosong',
        examples: [{ query: '', description: 'Pause atau resume lagu' }],
        tags: ['music', 'pause', 'resume']
      },
      'music-search': {
        summary: 'Mencari lagu spesifik di YT Music tanpa langsung autoplay.',
        queryFormat: 'kata_kunci_lagu',
        examples: [{ query: 'Clair de Lune', description: 'Cari trek musik' }],
        tags: ['music', 'search']
      },
      'music-next': {
        summary: 'Mengganti ke trek lagu berikutnya.',
        queryFormat: 'kosong',
        examples: [{ query: '', description: 'Skip ke lagu berikutnya' }],
        tags: ['music', 'next', 'skip']
      },
      'music-prev': {
        summary: 'Mengulang atau beralih ke trek lagu sebelumnya.',
        queryFormat: 'kosong',
        examples: [{ query: '', description: 'Kembali ke lagu sebelumnya' }],
        tags: ['music', 'prev']
      }
    }
  },
  google_drive: {
    description: 'Akses layanan Google Drive (manajemen berkas, dokumen, spreadsheet, dan storage).',
    tools: {
      'gdrive-info': {
        summary: 'Memeriksa kuota dan sisa kapasitas Google Drive.',
        queryFormat: '"all"',
        examples: [{ query: 'all', description: 'Cek status kapasitas drive' }],
        tags: ['gdrive', 'storage', 'quota']
      },
      'gdrive-search': {
        summary: 'Mencari berkas di Google Drive.',
        queryFormat: 'kata_kunci atau kata_kunci||start-end',
        examples: [{ query: 'laporan bulanan||0-10', description: 'Cari berkas laporan di Drive' }],
        tags: ['gdrive', 'search', 'files']
      },
      'gdrive-list': {
        summary: 'Daftar berkas di dalam folder Google Drive tertentu.',
        queryFormat: 'folderId||start-end',
        examples: [{ query: 'root||0-20', description: 'Lihat isi folder root Drive' }],
        tags: ['gdrive', 'list', 'folder']
      },
      'gdrive-read': {
        summary: 'Ekstrak isi teks dari Google Docs, Sheets, atau berkas teks TXT.',
        queryFormat: 'fileId',
        examples: [{ query: '1A2b3C...fileId', description: 'Baca teks isi dokumen Google Doc' }],
        tags: ['gdrive', 'read', 'docs', 'sheets']
      },
      'gdrive-upload': {
        summary: 'Upload berkas teks ke Google Drive (butuh persetujuan user).',
        queryFormat: 'nama_file||isi_teks',
        examples: [{ query: 'catatan.txt||Catatan rapat penting', description: 'Upload file teks baru ke Drive' }],
        tags: ['gdrive', 'upload']
      },
      'gdrive-create': {
        summary: 'Membuat dokumen baru atau folder baru di Google Drive.',
        queryFormat: 'nama_file||doc/sheet/folder',
        examples: [{ query: 'Sprint Planning||doc', description: 'Buat Google Doc baru' }],
        tags: ['gdrive', 'create', 'new']
      },
      'gdrive-move': {
        summary: 'Memindahkan berkas antar folder di Google Drive.',
        queryFormat: 'fileId||folderId',
        examples: [{ query: 'file123||folder456', description: 'Pindahkan file ke folder tujuan' }],
        tags: ['gdrive', 'move']
      },
      'gdrive-copy': {
        summary: 'Menduplikasi berkas di Google Drive.',
        queryFormat: 'fileId||nama_baru',
        examples: [{ query: 'file123||Salinan Dokumen', description: 'Duplikasi berkas Drive' }],
        tags: ['gdrive', 'copy']
      }
    }
  },
  google_calendar: {
    description: 'Akses layanan Google Calendar (manajemen jadwal dan event).',
    tools: {
      'gcalendar-list': {
        summary: 'Lihat daftar jadwal/event kalender yang akan datang.',
        queryFormat: 'start-end||YYYY-MM-DDTHH:mm:ssZ',
        examples: [{ query: '0-10||2026-05-01T00:00:00Z', description: 'Lihat 10 event pertama mulai Mei 2026' }],
        tags: ['calendar', 'events', 'schedule']
      },
      'gcalendar-create': {
        summary: 'Membuat jadwal acara kalender baru (memerlukan izin user).',
        queryFormat: 'Judul||Deskripsi||Waktu_Mulai(ISO)||Waktu_Selesai(ISO)',
        examples: [{ query: 'Review Arsitektur||Diskusi perombakan||2026-05-01T10:00:00Z||2026-05-01T11:00:00Z', description: 'Buat jadwal meeting' }],
        tags: ['calendar', 'create', 'event']
      },
      'gcalendar-delete': {
        summary: 'Menghapus event dari kalender.',
        queryFormat: 'eventId',
        examples: [{ query: 'evt_12345', description: 'Hapus jadwal event' }],
        tags: ['calendar', 'delete']
      }
    }
  },
  google_gmail: {
    description: 'Akses layanan Google Gmail (membaca inbox, pencarian email, dan pengiriman pesan).',
    tools: {
      'gmail-search': {
        summary: 'Mencari email di kotak pesan Gmail.',
        queryFormat: 'query_gmail||start-end',
        examples: [{ query: 'is:unread||0-10', description: 'Cari 10 email yang belum dibaca' }],
        tags: ['gmail', 'search', 'inbox']
      },
      'gmail-list': {
        summary: 'Membaca daftar email masuk di inbox.',
        queryFormat: 'start-end',
        examples: [{ query: '0-10', description: 'Daftar 10 email terbaru' }],
        tags: ['gmail', 'list']
      },
      'gmail-read': {
        summary: 'Membaca isi lengkap pesan email tertentu.',
        queryFormat: 'messageId',
        examples: [{ query: 'msg_12345', description: 'Baca isi email berdasarkan ID pesan' }],
        tags: ['gmail', 'read']
      },
      'gmail-send': {
        summary: 'Mengirim email baru (memerlukan izin user).',
        queryFormat: 'email_tujuan||Subjek||Isi_pesan',
        examples: [{ query: 'rekan@example.com||Laporan Hasil Evaluasi||Halo, berikut laporan hasil evaluasi...', description: 'Kirim email baru' }],
        tags: ['gmail', 'send', 'mail']
      },
      'gmail-abelink-read': {
        summary: 'Menandai pesan email sebagai sudah dibaca.',
        queryFormat: 'messageId',
        examples: [{ query: 'msg_12345', description: 'Tandai email telah dibaca' }],
        tags: ['gmail', 'mark-read']
      }
    }
  },
  system_vision_tg: {
    description: 'Fitur visi AI (screenshot layar, kamera webcam), Text-to-Speech audio, dan bot Telegram.',
    tools: {
      'analyze-screen': {
        summary: 'Mengambil screenshot layar monitor aktif dan menganalisisnya via AI Vision.',
        queryFormat: 'prompt_instruksi_visual',
        examples: [{ query: 'Bacakan teks pesan error yang muncul di tengah layar', description: 'Analisis visual layar laptop' }],
        tags: ['screen', 'vision', 'screenshot', 'ocr']
      },
      'camera-look': {
        summary: 'Mengaktifkan kamera webcam untuk mengamati objek fisik di depan pengguna.',
        queryFormat: 'prompt_instruksi_visual',
        examples: [{ query: 'Apa warna buku yang saya pegang?', description: 'Analisis visual via webcam' }],
        tags: ['camera', 'webcam', 'vision']
      },
      'screenshot-to-tg': {
        summary: 'Mengambil screenshot layar komputer dan mengirimkannya langsung ke Telegram.',
        queryFormat: 'kosong',
        examples: [{ query: '', description: 'Kirim gambar desktop ke Telegram' }],
        tags: ['telegram', 'screenshot']
      },
      'tg-send': {
        summary: 'Mengirim pesan teks atau file dokumen ke chat Telegram.',
        queryFormat: 'chatId||text/file||konten',
        examples: [
          { query: '1234567||text||Halo dari Abelink!', description: 'Kirim pesan teks ke Telegram' },
          { query: '1234567||file||/path/to/data.pdf', description: 'Kirim berkas dokumen ke Telegram' }
        ],
        tags: ['telegram', 'send', 'chat']
      },
      speak: {
        summary: 'Bicarakan teks secara lisan (Text-to-Speech) lewat speaker komputer user.',
        queryFormat: 'teks_yang_akan_diucapkan',
        examples: [{ query: 'Tugas kompilasi sudah selesai.', description: 'Ucapkan notifikasi suara' }],
        tags: ['tts', 'voice', 'speak', 'audio']
      }
    }
  },
  connectors: {
    description: 'Pluggable Capability Manager: katalog connector terpasang, schema aksi, policy, dan audit.',
    tools: {
      'connector-list': {
        summary: 'Melihat seluruh connector terpasang beserta izin dan statusnya.',
        queryFormat: 'kosong',
        examples: [{ query: '', description: 'Lihat daftar connector aktif' }],
        tags: ['connectors', 'capabilities', 'list']
      },
      'connector-inspect': {
        summary: 'Melihat detail aksi dan skema input satu connector.',
        queryFormat: 'connectorId',
        examples: [{ query: 'fs', description: 'Periksa kapabilitas connector filesystem' }],
        tags: ['connectors', 'inspect', 'schema']
      },
      'connector-guide': {
        summary: 'Minta panduan input schema & contoh pemakaian aksi connector sebelum eksekusi.',
        queryFormat: 'connectorId||actionId',
        examples: [{ query: 'fs||read', description: 'Lihat panduan aksi read pada connector fs' }],
        tags: ['connectors', 'guide', 'help']
      },
      'connector-run': {
        summary: 'Mengeksekusi aksi connector terpasang dengan payload JSON args.',
        queryFormat: 'connectorId||actionId||args_json',
        examples: [{ query: 'time||diff||{"from":"09:00","to":"17:00"}', description: 'Jalankan kalkulasi waktu' }],
        tags: ['connectors', 'execute', 'run']
      },
      'connector-status': {
        summary: 'Melihat status koneksi, scope izin, dan audit trail connector.',
        queryFormat: 'kosong atau limit_baris_audit',
        examples: [{ query: '10', description: 'Lihat 10 riwayat audit connector terakhir' }],
        tags: ['connectors', 'status', 'audit']
      }
    }
  },
  trading_support: {
    description: 'Buku kas & alokasi budget inference AI lokal (wallet lokal, tanpa order exchange).',
    tools: {
      'trading-status': {
        summary: 'Melihat ringkasan saldo kas, status budget, dan burn rate inference AI.',
        queryFormat: 'kosong',
        examples: [{ query: '', description: 'Cek saldo dan alokasi budget inference' }],
        tags: ['wallet', 'budget', 'balance', 'burn-rate']
      },
      'trading-deposit': {
        summary: 'Mencatat deposit dana ke buku kas wallet lokal (membutuhkan konfirmasi).',
        queryFormat: 'amount||catatan',
        examples: [{ query: '50||Alokasi dana awal bulan', description: 'Deposit saldo ke buku kas' }],
        tags: ['wallet', 'deposit']
      },
      'trading-allocate': {
        summary: 'Mengalokasikan batas pengeluaran dari kas utama ke model AI tertentu.',
        queryFormat: 'modelKey||budget',
        examples: [{ query: 'deepseek-chat||25', description: 'Alokasikan budget inference deepseek' }],
        tags: ['wallet', 'allocate', 'budget']
      },
      'trading-log-spend': {
        summary: 'Mencatat pengeluaran pemakaian token/inference model.',
        queryFormat: 'modelKey||amount||catatan',
        examples: [{ query: 'glm-4.7-air||0.45||Sesi riset komprehensif', description: 'Catat burn rate sesi' }],
        tags: ['wallet', 'spend', 'log']
      },
      'trading-ledger': {
        summary: 'Melihat riwayat pembukuan ledger kas dan alokasi terbaru.',
        queryFormat: 'jumlah_baris (default 20)',
        examples: [{ query: '20', description: 'Lihat 20 entri buku kas terakhir' }],
        tags: ['wallet', 'ledger', 'history']
      }
    }
  }
}

/**
 * Membangun katalog lengkap terpadu (flat map dari semua tool spec).
 */
export function buildUnifiedToolCatalog() {
  const catalog = new Map()

  // 1. Masukkan Core Tools (defer_loading: false)
  for (const [name, spec] of Object.entries(CORE_TOOL_SPECS)) {
    catalog.set(name, { ...spec })
  }

  // 2. Masukkan Deferred Group Tools (defer_loading: true)
  for (const [groupName, groupDef] of Object.entries(DEFERRED_GROUP_SPECS)) {
    for (const [toolName, toolMeta] of Object.entries(groupDef.tools)) {
      if (!catalog.has(toolName)) {
        catalog.set(toolName, {
          name: toolName,
          group: groupName,
          defer_loading: true,
          summary: toolMeta.summary,
          description: toolMeta.summary,
          queryFormat: toolMeta.queryFormat || 'query',
          examples: toolMeta.examples || [],
          tags: toolMeta.tags || []
        })
      }
    }
  }

  return catalog
}

export const UNIFIED_TOOL_CATALOG = buildUnifiedToolCatalog()

/**
 * Mencari tool spesifik berdasarkan nama persis.
 */
export function getToolSpec(toolName) {
  if (!toolName) return null
  return UNIFIED_TOOL_CATALOG.get(toolName.trim()) || null
}

/**
 * Tokenizer sederhana untuk scoring lexical.
 */
function tokenize(text) {
  if (!text) return []
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Mencari tool di seluruh catalog (core maupun deferred) berdasarkan kata kunci query.
 * Menggunakan scoring heuristik multi-faktor:
 * - Exact name match: +100
 * - Partial name match: +40
 * - Tag match: +25
 * - Summary/Description match: +10
 * - Group match: +15
 */
export function searchTools(query, { limit = 8, group = null } = {}) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return []

  const queryTokens = tokenize(q)
  const results = []

  for (const tool of UNIFIED_TOOL_CATALOG.values()) {
    if (group && tool.group !== group) continue

    const name = tool.name.toLowerCase()
    const tags = (tool.tags || []).map((t) => t.toLowerCase())
    const summary = (tool.summary || '').toLowerCase()
    const description = (tool.description || '').toLowerCase()
    const toolGroup = (tool.group || '').toLowerCase()

    let score = 0

    if (name === q) {
      score += 100
    } else if (name.includes(q)) {
      score += 40
    }

    if (toolGroup === q) {
      score += 30
    } else if (toolGroup.includes(q)) {
      score += 15
    }

    for (const token of queryTokens) {
      if (name.includes(token)) score += 20
      if (tags.some((t) => t.includes(token))) score += 15
      if (summary.includes(token)) score += 8
      if (description.includes(token)) score += 5
    }

    if (score > 0) {
      results.push({ tool, score })
    }
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, limit).map((r) => r.tool)
}

/**
 * Format dokumentasi detail untuk 1 tool spesifik lengkap dengan contoh pemakaian.
 */
export function formatToolDocumentation(tool) {
  if (!tool) return ''
  const lines = [
    `[TOOL: ${tool.name}] (Grup: ${tool.group}${tool.defer_loading ? ' - Deferred' : ' - Core'})`,
    `Fungsi: ${tool.summary || tool.description}`,
    `Format Query: ${tool.queryFormat || 'sesuai instruksi'}`
  ]

  if (Array.isArray(tool.examples) && tool.examples.length > 0) {
    lines.push('Contoh Pemakaian Nyata:')
    tool.examples.forEach((ex, idx) => {
      lines.push(`  ${idx + 1}. Query: ${JSON.stringify(ex.query)}`)
      if (ex.description) {
        lines.push(`     Keterangan: ${ex.description}`)
      }
    })
  }

  return lines.join('\n')
}

/**
 * Format dokumentasi seluruh tool dalam suatu grup beserta contoh pemakaiannya.
 */
export function formatGroupDocumentation(groupName, toolsList) {
  const header = `=== DOKUMENTASI GRUP TOOL: ${groupName.toUpperCase()} ===`
  const toolDocs = toolsList.map((t) => formatToolDocumentation(t)).join('\n\n')
  return `${header}\n\n${toolDocs}`
}

/**
 * Resolver cerdas untuk aksi "read-tools".
 * Mendukung:
 * 1. Nama grup (misal: "advanced_browser", "git_vcs") -> mengembalikan semua tool grup + contoh.
 * 2. Nama tool (misal: "browser-click", "replace-content") -> mengembalikan detail tool + contoh.
 * 3. Search query (misal: "search: git commit" atau "?terminal background" atau "screenshot") -> mengembalikan hasil pencarian relevan.
 * 4. Query kosong -> mengembalikan ringkasan grup yang tersedia dan bantuan pencarian.
 */
export async function resolveReadToolsQuery(query, { customGroups = null } = {}) {
  const raw = (query || '').trim()

  // 1. Query kosong: berikan daftar catalog sumber yang tersedia (ala Hermes available_sources)
  if (!raw) {
    const availableGroups = Object.keys(DEFERRED_GROUP_SPECS)
    return {
      success: false,
      isSearch: false,
      available_sources: availableGroups,
      message:
        'Harap sebutkan nama grup (misal: "advanced_browser", "git_vcs"), nama tool (misal: "browser-click"), atau pencarian (misal: "search: terminal").\n' +
        `Grup yang tersedia: ${availableGroups.join(', ')}.`
    }
  }

  // Cek apakah mode eksplisit pencarian ("search: ..." atau "?...")
  let isExplicitSearch = false
  let searchQuery = raw

  if (raw.toLowerCase().startsWith('search:')) {
    isExplicitSearch = true
    searchQuery = raw.slice(7).trim()
  } else if (raw.startsWith('?')) {
    isExplicitSearch = true
    searchQuery = raw.slice(1).trim()
  }

  if (isExplicitSearch) {
    const hits = searchTools(searchQuery, { limit: 6 })
    if (hits.length > 0) {
      const formattedHits = hits.map((t) => formatToolDocumentation(t)).join('\n\n---\n\n')
      return {
        success: true,
        isSearch: true,
        query: searchQuery,
        matches_count: hits.length,
        message: `HASIL PENCARIAN TOOL UNTUK "${searchQuery}" (${hits.length} ditemukan):\n\n${formattedHits}`
      }
    }
    return {
      success: false,
      isSearch: true,
      query: searchQuery,
      available_sources: Object.keys(DEFERRED_GROUP_SPECS),
      message:
        `Tidak ditemukan tool yang cocok untuk pencarian "${searchQuery}".\n` +
        `Grup yang tersedia: ${Object.keys(DEFERRED_GROUP_SPECS).join(', ')}.\n` +
        'Tips: Coba gunakan kata kunci tindakan atau objek yang lebih umum (misal: "browser", "file", "git", "task").'
    }
  }

  // 2. Cek apakah query adalah nama grup terdaftar (case-insensitive)
  const normalizedLower = raw.toLowerCase()
  const matchedGroupName = Object.keys(DEFERRED_GROUP_SPECS).find(
    (g) => g.toLowerCase() === normalizedLower
  )

  if (matchedGroupName) {
    // Kumpulkan tools dalam grup dari katalog
    const toolsInGroup = Array.from(UNIFIED_TOOL_CATALOG.values()).filter(
      (t) => t.group === matchedGroupName
    )
    const formatted = formatGroupDocumentation(matchedGroupName, toolsInGroup)
    return {
      success: true,
      isGroup: true,
      groupName: matchedGroupName,
      message: formatted
    }
  }

  // Cek customGroups jika ada (misal dynamic plugins)
  if (customGroups && customGroups[raw]) {
    const cg = customGroups[raw]
    const formatted = Object.entries(cg.tools || {})
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n')
    return {
      success: true,
      isGroup: true,
      groupName: raw,
      message: `=== DOKUMENTASI GRUP EKSTERNAL: ${raw.toUpperCase()} ===\nDeskripsi: ${cg.description || ''}\n\n${formatted}`
    }
  }

  // 3. Cek apakah query adalah nama tool spesifik (case-insensitive)
  const matchedToolName = Array.from(UNIFIED_TOOL_CATALOG.keys()).find(
    (name) => name.toLowerCase() === normalizedLower
  )

  if (matchedToolName) {
    const tool = UNIFIED_TOOL_CATALOG.get(matchedToolName)
    const formatted = formatToolDocumentation(tool)
    return {
      success: true,
      isTool: true,
      toolName: matchedToolName,
      message: `PANDUAN LENGKAP TOOL ${matchedToolName.toUpperCase()}:\n\n${formatted}`
    }
  }

  // 4. Fallback: coba cari lexical match jika model salah ketik atau menanyakan fitur
  const fallbackHits = searchTools(raw, { limit: 5 })
  if (fallbackHits.length > 0) {
    const formattedHits = fallbackHits.map((t) => formatToolDocumentation(t)).join('\n\n---\n\n')
    return {
      success: true,
      isFallbackSearch: true,
      matches_count: fallbackHits.length,
      message:
        `Grup atau tool "${raw}" tidak ditemukan persis. Berikut rekomendasi tool yang relevan berdasarkan pencarian:\n\n${formattedHits}`
    }
  }

  // 5. Jika sama sekali tidak ada yang cocok
  const availableGroups = Object.keys(DEFERRED_GROUP_SPECS)
  return {
    success: false,
    available_sources: availableGroups,
    message:
      `Grup atau tool "${raw}" tidak ditemukan.\n` +
      `Grup tool yang tersedia: ${availableGroups.join(', ')}.\n` +
      'Gunakan query "search: <kata_kunci>" untuk mencari tool berdasarkan fungsi.'
  }
}
