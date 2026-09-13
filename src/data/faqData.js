export const faqs = [
  {
    q: "Apakah Abelink membutuhkan koneksi internet?",
    a: "Tidak selalu! Jika Anda mengatur AI Provider ke LM Studio (Offline), sebagian besar fungsi Abelink bisa berjalan tanpa internet secara lokal. Namun, fitur Voice (Speech-to-Text), Web Search (mencari di Google), dan perangkum YouTube tetap membutuhkan koneksi internet."
  },
  {
    q: "Bagaimana cara kerja sistem memori Abelink?",
    a: "Abelink tidak mengingat percakapan sekadar dari kata kunci yang sama persis. Abelink mengubah informasi penting menjadi 'konsep makna'. Jadi saat Anda bertanya, Abelink akan langsung mencari ingatan yang paling nyambung maknanya dengan obrolan saat itu."
  },
  {
    q: "Abelink tiba-tiba mengajak bicara saat saya sedang diam. Kenapa?",
    a: "Itu adalah hasil kerja Awareness Engine. Abelink secara berkala memantau aktivitas Anda di laptop (misal: Anda sedang buka Youtube, atau memutar musik). Jika Anda ingin privasi penuh dan ingin Abelink diam saja, matikan toggle Awareness Engine di halaman Pengaturan."
  },
  {
    q: "Apa arti perubahan warna bola cahaya (Orb) Abelink di layar?",
    a: "Warna tersebut menunjukkan 1 dari 9 Emosi yang sedang dirasakan Abelink. Misalnya kuning keemasan untuk senang, merah untuk kesal, atau kelabu untuk bosan. Emosi ini akan berubah secara alami tergantung cara Anda memperlakukannya tiap hari."
  },
  {
    q: "Bagaimana kalau Abelink tiba-tiba mengotak-atik sistem penting di laptop saya?",
    a: "Tidak akan terjadi tanpa izin Anda! Alat-alat berisiko (seperti menghapus file atau menjalankan terminal PC) WAJIB menunggu persetujuan (Acc) dari Anda melalui klik tombol sebelum dijalankan. Jika Anda menolak, Abelink tidak akan memaksa."
  },
  {
    q: "Abelink macet dan terus menerus error saat mencoba sesuatu. Apa yang harus saya lakukan?",
    a: "Jika Abelink terjebak kebingungan memecahkan sebuah error panjang, Anda bisa langsung menghentikan proses berpikirnya dengan mengklik tombol STOP (Kotak Merah) di dekat area tempat Anda mengetik chat."
  },
  {
    q: "Bagaimana cara saya ngobrol pakai suara sama Abelink?",
    a: "Cukup pakai mikrofon Anda! Abelink otomatis bisa mendeteksi saat Anda mulai berbicara dan kapan Anda selesai ngomong, lalu dia akan langsung membalas pakai suara."
  },
  {
    q: "Apakah Abelink bisa menyetel lagu?",
    a: "Ya! Anda bisa bilang, 'Putarkan lagu Nadin Amizah'. Abelink otomatis mencari dan memutar lagunya secara tersembunyi di latar belakang tanpa Anda harus repot buka aplikasi musik visual."
  },
  {
    q: "Abelink bisa dihubungi lewat Telegram?",
    a: "Sangat bisa! Abelink punya fitur bot Telegram khusus. Cukup masukkan API Token dari @BotFather dan Telegram User ID kamu di menu Pengaturan. Abelink bisa mendownload lagu YouTube lalu dikirim ke Telegram Anda sebagai MP3 atau mengirimkan screenshot PC."
  },
  {
    q: "Apakah Abelink bisa membantu saya ngoding dan ngecek file kerjaan di laptop?",
    a: "Tentu. Abelink punya fitur khusus untuk menjelajahi dan membaca ratusan file kerjaan dalam folder Anda secara mandiri, sangat cocok dijadikan asisten ngoding pribadi."
  },
  {
    q: "Bagaimana cara mengubah otak pintar (AI Provider) Abelink?",
    a: "Buka menu Configuration. Di sana Anda bisa memilih antara Gemini (Gratis tanpa API Key), LM Studio (Offline lokal), atau Custom API (OpenAI-Compatible Endpoint). Pilih model dari dropdown yang tersedia."
  },
  {
    q: "Kenapa balasan Abelink kadang sangat lambat?",
    a: "Jika Anda pakai mode Offline (LM Studio), kecepatan mikir Abelink 100% bergantung pada kekuatan prosesor (CPU) dan VGA laptop Anda. Semakin besar memori otak (model AI) yang dipakai, semakin berat kerja laptopnya."
  },
  {
    q: "Untuk apa Groq API Key di pengaturan?",
    a: "Groq API Key digunakan khusus untuk fitur Speech-to-Text (Voice STT via Whisper), sehingga Abelink dapat mendengarkan ucapan suara Anda dari mikrofon secara cepat dan akurat."
  },
  {
    q: "Bisakah saya menghapus ingatan Abelink tentang saya?",
    a: "Bisa. Ingatan disimpan aman di database lokal laptop Anda. Anda bisa menyuruh Abelink 'Lupakan tentang hal itu', atau Anda bisa menghapusnya manual lewat menu kelola memori."
  },
  {
    q: "Apakah riwayat curhat saya ke Abelink dikirim ke internet?",
    a: "TIDAK SAMA SEKALI. Seluruh riwayat obrolan, ingatan, dan pengaturan tersimpan murni secara rahasia di dalam hard disk Anda. Tidak ada sekecil apapun data yang dicolong ke server pusat aplikasi."
  },
  {
    q: "Apakah Abelink bisa melacak lokasi fisik saya di dunia nyata?",
    a: "Tidak bisa melacak koordinat GPS. Namun jika Anda menyuruh Abelink memakai kamera laptop (camera-look) atau melihat layar (analyze-screen), Abelink dapat melihat sebatas apa yang terlihat di monitor atau ruangan Anda."
  },
  {
    q: "Bagaimana cara stop musik latar yang tadi dinyalakan Abelink?",
    a: "Cukup ketik 'Abelink, stop musiknya' atau 'pause musik'. Abelink otomatis akan langsung menghentikan lagu tersebut di latar belakang."
  },
  {
    q: "Apakah video YouTube durasi panjang bisa dirangkum semua sama Abelink?",
    a: "Bisa, asalkan video tersebut punya teks *subtitle/transkrip* bawaan. Jika durasinya berjam-jam, Abelink akan memotong-motongnya perlahan untuk dibaca dan dirangkum secara mandiri."
  },
  {
    q: "Siapa saja yang bisa mengakses bot Telegram Abelink saya?",
    a: "Hanya user yang ID Telegram-nya terdaftar di menu Pengaturan (Telegram Admin User IDs). Orang lain yang mencoba chat ke bot akan ditolak otomatis."
  },
  {
    q: "Bagaimana cara mendapatkan Telegram Bot Token?",
    a: "Buka aplikasi Telegram, cari akun resmi @BotFather, ketik /newbot, ikuti petunjuk pembuatan nama bot, lalu copy API Token yang diberikan ke halaman Configuration di Abelink."
  },
  {
    q: "Kok Abelink kadang bisa tiba-tiba nanya 'Lagi sibuk ngerjain dokumen ya?'",
    a: "Itu berkat Awareness Engine! Fitur ini diam-diam ngecek judul jendela aplikasi apa yang lagi kebuka paling depan di layar laptop Anda (misal lagi buka MS Word atau Game), jadi Abelink ngerasa lebih peka."
  },
  {
    q: "Apa maksudnya kalau warna Abelink berubah jadi abu-abu pucat?",
    a: "Abu-abu itu emosi kebosanan. Ini wajar kalau Anda udah lama banget nyuekin dia atau interaksi Anda jawabnya cuma 'oke', 'sip', tanpa ada obrolan bermakna."
  },
  {
    q: "Apakah Abelink jago bikin aplikasi utuh dari nol?",
    a: "Bisa banget! Abelink bisa ngetik kode sendiri, bikin folder sendiri, dan ngetes aplikasinya lewat terminal laptop Anda. Tapi, Anda tetap harus mandorin ngasih instruksi yang jelas tahap demi tahap."
  },
  {
    q: "Kenapa pas disuruh, Abelink kadang cuma diam 'Berpikir' agak lama?",
    a: "Itu namanya Agentic Planning. Daripada langsung asal jawab, Abelink lagi asik nyusun langkah-langkah di kepalanya, makai beberapa alat, ngecek hasilnya bener apa salah, baru ngasih tau Anda kesimpulan akhirnya."
  },
  {
    q: "Bisakah Abelink disuruh buka Instagram lalu balesin DM mantan saya?",
    a: "Prakteknya susah karena website modern punya sistem keamanan tebal (seperti minta konfirmasi login/captcha). Biasanya Abelink bakal nyerah dan nyuruh Anda bantu login manual dulu di layar pop-up nya."
  },
  {
    q: "Apakah Abelink bisa mendownload file dari internet ke laptop saya?",
    a: "Bisa, asalkan Anda ngasih izin (klik OK) waktu notifikasi keamanan muncul untuk mengunduh skrip dari internet."
  },
  {
    q: "Bisa panggil Abelink saat saya lagi seru-serunya main game full-screen?",
    a: "Bisa! Meskipun wujud Abelink mungkin ketutupan game, kalau Anda pakai fitur mikrofon (Voice Chat), teriak aja manggil namanya dan Abelink bakal ngebales pakai suara."
  },
  {
    q: "Bikin baterai laptop boros dan cepat panas nggak sih?",
    a: "Kalau Anda atur otak AI-nya pakai mode Offline (LM Studio) pas nggak di-cas, JELAS IYA. Mesin AI lokal itu kerja rodi. Tapi kalau pakai sambungan online (Groq), dampaknya enteng banget buat laptop."
  },
  {
    q: "Bagaimana caranya bikin fitur atau kemampuan baru buat Abelink?",
    a: "Ke menu Plugins > klik Buat Plugin Baru. Isi nama dan apa gunanya. Lalu ketik instruksi script sederhananya. Habis di-save, Abelink otomatis jadi makin pinter dan ngerti pakai kemampuan baru itu."
  },
  {
    q: "Apakah fitur Plugin tambahan bisa ambil bahan dari luar?",
    a: "Bisa! Kalau butuh tambahan paket dari internet (NPM), cukup ketik namanya di kolom yang disediain. Nanti Abelink otomatis download perlengkapannya sendiri sebelum pakai fiturnya."
  },
  {
    q: "Berapa banyak ekstensi (Plugin) yang bisa saya tambahkan ke Abelink?",
    a: "Anda bisa membuat sebanyak apa pun yang Anda butuhkan! Abelink cukup cerdas untuk menyortir dan hanya menggunakan plugin yang paling nyambung dengan perintah Anda saat itu. Jadi meski Anda punya puluhan plugin, pikiran Abelink tidak akan terbebani apalagi bikin laptop nge-lag."
  },
  {
    q: "Abelink kadang gagal klik tombol di dalam website, kenapa ya?",
    a: "Beberapa website dibikin dengan desain animasi rumit atau elemen yang tersembunyi. Kalau Abelink bingung nggak nemu tombolnya, dia bakal baca ulang layarnya atau ujung-ujungnya minta tolong Anda."
  },
  {
    q: "Apakah Abelink ngintipin isi email pribadi saya diam-diam?",
    a: "Jelas TIDAK. Abelink cuma tahu hal yang Anda kasih tahu, file kerjaan yang Anda perbolehkan dia baca, atau sebatas apa yang lagi tampil di layar saat itu. Abelink nggak punya sihir buat ngebobol password email."
  },
  {
    q: "Apakah aplikasi Abelink ini gratis selamanya?",
    a: "Aplikasi Abelink 100% gratis buat pribadi. Tapi kalau Anda milih pakai otak online pihak ketiga (seperti API dari Groq), nah itu ngikutin aturan dari pihak sananya, apakah masih gratis atau ada limit kuotanya."
  },
  {
    q: "Bisa ganti suara robot ngomongnya Abelink?",
    a: "Suara bawaannya sudah cukup natural (dialek Indonesia). Buat sekarang fitur gonta-ganti suara belum nongol di tombol sederhana, tapi bisa diakalin lewat bongkar file pengaturannya."
  },
  {
    q: "Kenapa kalau Abelink ngomong kadang suaranya patah-patah putus?",
    a: "Itu efek internet lagi ngos-ngosan nyedot data suaranya, atau bisa juga karena laptop Anda lagi berat banget mikir proses AI sehingga audio-nya ikutan macet-macet."
  },
  {
    q: "Bisakah saya mengubah sifat asli Abelink jadi manja atau agresif?",
    a: "Kerangka sifat aslinya udah dipatenkan biar Abelink tetep bisa kerja bener. Tapi sapaan dan nada bicaranya itu berevolusi ngikutin Anda. Kalau tiap hari Anda ramah banget, lama-lama gaya bicara dia ikutan jadi manis."
  },
  {
    q: "Katakanlah Abelink bikin error codingan saya, apa dia mau belajar?",
    a: "Banget! Kalau dia eksekusi perintah terus dapet balasan error panjang berwarna merah, Abelink sadar dia salah, nyoba perbaikin, dan kalau udah sukses, dia bakal nginget 'solusi fix' itu selamanya di otaknya."
  },
  {
    q: "Aku udah hapus ingatan Abelink di memori, kok dia di chat ini masih inget?",
    a: "Abelink punya dua ingatan: 'Ingatan Obrolan Aktif' (pesan yang baru aja diketik) dan 'Ingatan Jangka Panjang' (database). Ngehapus database nggak otomatis ngehapus tulisan yang masih nempel nangkring di atas layar chat Anda."
  },
  {
    q: "Cara ngelihat jaringan urat nadi otaknya Abelink pas mikir?",
    a: "Di beberapa versi tampilan (kalau nggak disembunyiin), bakal kelihatan garis-garis nyala muter di wujud Orb Abelink, itu menandakan sel otak neural-nya lagi sibuk ngeproses mikir keras."
  },
  {
    q: "Apa bedanya Abelink sama Siri di iPhone atau Google Assistant?",
    a: "Siri itu kaku, cuma ngerjain 1 tugas (nyalain alarm) lalu tidur. Abelink itu 'Agen Mandiri'. Kasih 1 tugas sulit (misal: 'Bikin kalkulator web'), Abelink bakal mandiri ngetik, ngetes, dan kerja sendiri ngerampunginnya sambil Anda tinggal ngopi."
  },
  {
    q: "Kenapa laptop saya butuh RAM gede banget buat jalanin mode Offline?",
    a: "Otak AI (Large Language Models) itu ibarat buku ensiklopedia raksasa yang harus dibuka semua halamannya sekaligus biar otaknya bisa jalan. Jadi minimal banget butuh sisa RAM 8GB di laptop biar jalan mulus."
  },
  {
    q: "Saya biasanya pakai aplikasi Ollama, bisa nyambung ke Abelink?",
    a: "Sangat bisa! Asalkan Ollama di laptop Anda sudah jalan, Anda tinggal masukin alamat settingan (URL) lokal Ollama-nya ke kolom penyedia AI di halaman pengaturan Abelink."
  },
  {
    q: "Kenapa tiba-tiba Abelink bertingkah amnesia nanya 'Aku siapa?' ke diri sendiri?",
    a: "Itu namanya efek 'Halusinasi AI'. Biasanya karena obrolan kalian udah kelewat panjang banget bikin ingatan pendeknya kepenuhan dan mulai pikun sesaat. Paling sering kejadian kalau pakai otak AI lokal yang speknya pas-pasan."
  },
  {
    q: "Apa itu Aturan Etika (Proactive Proposal Boundary) di Abelink?",
    a: "Ini biar Abelink peka sikon (situasi dan kondisi). Kalau Abelink tahu Anda lagi repot (buka software berat, banyak meeting), dia bakal sadar diri nahan mulut biar nggak ganggu. Kalau Anda lagi gabut buka sosmed, baru dia berani ngoceh ngajak ngobrol."
  },
  {
    q: "Biar Abelink nggak rese tiba-tiba nyela pas saya ada meeting kampus gimana?",
    a: "Paling gampang: matikan saklar Awareness Engine sebentar. Atau simpelnya ketik/omongin aja 'Abelink, aku lagi meeting, diem ya'. Nanti dia nyatet pesen itu biar nggak ganggu."
  },
  {
    q: "Kenapa fitur Abelink jepret layar (Screenshot-to-WA) cuma aktif pas Abelink dihubungi dari HP?",
    a: "Fitur jepret itu emang sengaja dirancang buat kontrol jarak jauh. Jadi pas Anda lagi pergi keluar rumah dan chat bot Abelink dari HP WA, Anda bisa nyuruh dia motoin layar laptop di rumah Anda buat ngecek kerjaan yang ditinggal."
  },
  {
    q: "Bisakah Abelink diajak mabar main game bareng?",
    a: "Kalau gamenya model tebak teks kata, dia sangat pinter. Tapi kalau game aksi yang butuh kecepatan gerakan (FPS real-time), kemampuan lihat mata Abelink belum bisa gerak refleks secepat atlet e-sport (masih ada jeda per detik)."
  },
  {
    q: "Apakah Abelink diem-diem bisa narik uang atau buka M-Banking saya?",
    a: "Sama sekali nggak bisa. Abelink ini asisten jujur yang cuma bisa meraba barang yang ada di folder kerjaannya, atau ngecek sesuatu yang Anda suruh tayangin terang-terangan di layar."
  },
  {
    q: "Apa visi jangka panjang diciptakannya Abelink?",
    a: "Menciptakan asisten yang mengerti Anda lebih dari siapa pun, dan mampu menjadi sahabat sekaligus rekan kerja virtual seumur hidup."
  }
];
