export const core_tools = {
  "read-tools": "WAJIB dipanggil SEBELUM menggunakan tool yang tidak kamu ketahui query-nya! Kamu hanya bisa mengeksekusi tool jika kamu tahu pasti format query-nya. Query: nama_grup (misal: \"advanced_browser\" atau \"pc_automation\").",
  "memory-search": "ALAT PENCARIAN INGATAN (WAJIB DIGUNAKAN). Gunakan tool ini JIKA KAMU TIDAK TAHU atau KEKURANGAN INFORMASI tentang sesuatu! (Contoh: \"siapa nama X\", \"apa password wifi\", \"solusi error Y\", \"nomor kontak\"). ATURAN MUTLAK: DILARANG KERAS BERTANYA BALIK KEPADA USER (misal: \"nomornya mana?\", \"siapa namanya?\") SEBELUM KAMU MENCOBA MENCARI DI TOOL INI. JANGAN PERNAH MENYERAH ATAU MENJAWAB \"SAYA TIDAK TAHU\" SEBELUM MENCARI! Pencarian berbasis SEMANTIK (Vector), BUKAN WAKTU. JANGAN mencari pakai kata \"kemarin\" atau \"tadi\". Query: Gunakan kata kunci inti informasi yang dicari (misal: \"nomor adek\", \"password wifi\", \"solusi error bluetooth\").",
  "read-file": "Membaca isi file teks biasa. Query: path_absolut. Baca spesifik baris: path||startLine||endLine.",
  "write-file": "Menulis/buat file baru. Query: path||isi_file. (Perlu persetujuan user), perintah ini akan otomatis membuat file baru jika file tersebut tidak ada, wajib mengisi isi file.",
  "replace-lines": "Edit baris tertentu. Query: path||startLine||endLine||kode_baru. (Perlu persetujuan user).",
  "delete-file": "Hapus file. Query: path_absolut. (Perlu persetujuan user).",
  "list-dir": "Lihat isi folder. Query: path_folder.",
  "grep-search": "Cari teks dalam folder. Query: path_folder||keyword.",
  "file-outline": "Lihat peta/struktur file (fungsi, class, ekspor, heading) beserta nomor baris tanpa membaca seluruh isi. Query: path_absolut.",
  "read-document": "Membaca & mencari isi dokumen teks/PDF/DOCX. Panggil tanpa query untuk Smart Overview, atau gunakan kata kunci (path||keyword) atau baris (path||startLine||endLine).",
  "run-powershell": "Eksekusi perintah PowerShell. (Perlu persetujuan user untuk command berbahaya).",
  "browser-search": "Mencari informasi di internet.",
  "read-skills": "WAJIB dipanggil jika user meminta kamu menggunakan Skill tertentu (misal: /speedrunner). Membaca file pedoman skill `.md` untuk mengubah perilakumu. Query: nama_skill (tanpa ekstensi .md)."
}
