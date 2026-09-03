# Reference Library — ATM (Amati, Tiru, Modifikasi)

Daftar repositori referensi yang di-curasi untuk pengembangan MARK Linux.
Prinsip pemakaian: **load when needed** — dokumen ini hanyalah peta; buka repo
referensi SAAT fase terkait dikerjakan, jangan menyalin massal. Semua referensi
wajib lolos filter privacy-first: tidak ada dependency wajib cloud, tidak ada
telemetry, dan pola yang diambil harus bisa jalan 100% offline.

Status kolom "Dipakai": `unused` (belum ada titik masuk di repo), `indexed`
(sudah diindeks oleh workspace RAG `workspace:index`), `applied` (pola sudah
diambil dan terdokumentasi di PR terkait). Perbarui kolom ini di PR yang sama
saat sebuah referensi mulai dipakai.

## Peta referensi

| # | Referensi | Domain | Ambil apa untuk MARK (dan dari mana) | Kapan dimuat (fase) | Dipakai |
|---|-----------|--------|--------------------------------------|---------------------|---------|
| 1 | [anthropics/skills](https://github.com/anthropics/skills) | Skill format | Konvensi `SKILL.md` (frontmatter `name`/`description`, body instruksi, folder per skill). MARK sudah memakai layout `<name>/SKILL.md` di XDG skills dir; verifikasi paritas frontmatter + progresi skill (foundation → advanced). | Fase skills: `skills:get-tree`, auto-scan, skill synthesizer | unused |
| 2 | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | Skill format / engineering practice | Kurasi skill engineering siap pakai (debugging, testing, refactoring) — kandidat bahan `skills:install` dari folder. Jangan vendor seluruh repo; pilih per-skill lewat auto-scan. | Fase skills modular + auto-scan | unused |
| 3 | [TheAlgorithms/Rust](https://github.com/TheAlgorithms/Rust) | Algoritma Rust | Implementasi algoritma idiomatis saat `src-tauri/` butuh logika berat (search, sorting, encoding). Contoh, bukan dependency. | Fase Rust shell lanjutan (B6+) | unused |
| 4 | [rust-lang/rustlings](https://github.com/rust-lang/rustlings) | Latihan Rust | Latihan kecil untuk memverifikasi idiom sebelum menulis command Rust baru; berguna juga sebagai bahan test-first untuk `cmd_*.rs`. | Fase Rust shell lanjutan (B6+) | unused |
| 5 | [rust-unofficial/awesome-rust](https://github.com/rust-unofficial/awesome-rust) | Ekosistem Rust | Direktori crate terkurasi (parsers, fs, process). Konsultasikan SEBELUM menambah crate baru ke `src-tauri/Cargo.toml`; prioritaskan crate tanpa dependency cloud. | Setiap kali crate baru dipertimbangkan | unused |
| 6 | [sunface/rust-course](https://github.com/sunface/rust-course) | Latihan Rust | Referensi idiom (lifetime, async) saat refactor `cmd_node_bridge.rs`/`cmd_fs.rs`. | Fase Rust shell lanjutan (B6+) | unused |
| 7 | [google/comprehensive-rust](https://github.com/google/comprehensive-rust) | Latihan Rust | Material concurrency/FFI — relevan untuk sidecar stdio bridge yang multi-thread. | Fase Rust shell lanjutan (B6+) | unused |
| 8 | [rust-lang/rust-analyzer](https://github.com/rust-lang/rust-analyzer) | Tooling Rust | Pemahaman kompilasi inkremental + cara menulis lint; konteks untuk menaikkan kualitas kode Rust shell. | Fase Rust shell lanjutan (B6+) | unused |
| 9 | [rust-lang/rust-clippy](https://github.com/rust-lang/rust-clippy) | Lint Rust | Sumber pattern anti-lint. MARK sudah punya `cargo clippy` di CI (lihat `.github/workflows/`); gunakan repo ini saat warning baru muncul dan perlu justifikasi/pembenahan. | CI fix / fase Rust apa pun | unused |
| 10 | [rust-lang/rustfmt](https://github.com/rust-lang/rustfmt) | Format Rust | Standar format `src-tauri/`. Tambahkan `cargo fmt --check` ke verify gate saat toolchain Rust tersedia di sandbox. | Fase CI/toolchain | unused |
| 11 | [anthropics/claude-cookbooks](https://github.com/anthropics/claude-cookbooks) | Pola agent | Pola tool-use, structured output, dan prompt chaining — pembanding untuk `ai-bridge.js` (3-tier JSON fallback) dan planner ReAct. Ambil POLA, bukan dependensi API. | Fase planner/capabilities | unused |

## Aturan pakai (load when needed)

1. **Satu fase = satu-dua referensi.** Jangan membuka seluruh daftar sekaligus;
   pilih baris dengan fase yang sedang dikerjakan.
2. **ATM, bukan vendor.** Amati struktur, tiru pola yang lolos filter
   privacy-first, modifikasi ke konteks Tauri + Bun sidecar. Tidak ada subtree
   vendor langsung ke repo tanpa justifikasi di deskripsi PR.
3. **Catat di kolom "Dipakai".** Setiap kali sebuah referensi mulai memengaruhi
   kode, ubah statusnya dan tautkan PR.
4. **Filter privacy-first tetap berlaku** untuk konten skill/agent: tidak ada
   skill referensi yang boleh memaksa panggilan cloud saat dijalankan.

## Kaitan

- Status migrasi per fase: `docs/MIGRATION-PLAN.md`
- Gap & stub eksplisit: `docs/MIGRATION-GAPS.md`
- Peta arsitektur: `docs/ARCHITECTURE.md`
