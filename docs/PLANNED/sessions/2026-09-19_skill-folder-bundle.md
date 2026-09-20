# Sesi Kerja: 2026-09-19 — Skill Folder Penuh (#5)

## Konteks & Tujuan
Adopsi Backlog #5 dari `docs/OPERATING-ADOPTION.md`:
Mengadopsi pola Skill Folder penuh ala Hermes Agent Skills:
- Sebelumnya: Skill hanya berupa file `.md` tunggal atau string `content` di Dexie `learnedSkills`. Tidak ada pengorganisasian berkas pendukung (`references/`) atau script eksekusi (`scripts/`), dan agen tidak pernah mengetahui berkas-berkas pendukung tersebut saat membaca skill.
- Sekarang: Skill mendukung struktur folder lengkap:
  ```
  <skill_name>/
  ├── SKILL.md
  ├── references/  # referensi docs, cheatsheet, schema
  └── scripts/     # script otomasi shell/python/node
  ```
- Pembacaan skill via `read-skill` mendukung:
  1. `nama_skill`: memuat konten instruksi utama `SKILL.md` beserta manifes berkas pendukung di `references/` dan `scripts/` (beserta ukuran byte & panduan membaca/eksekusi).
  2. `nama_skill||subpath` atau `nama_skill/references/file.md`: membaca isi spesifik berkas subfolder secara aman anti-path-traversal.
  3. Mendukung penyimpanan di disk, in-memory, Dexie `learnedSkills`, dan `NATIVE_SKILLS`.

## Perubahan Kode
1. **`sidecar/engine/channels/skills.mjs`**:
   - Menambahkan `scanSubfolderFiles` dan `getSkillFolderManifest`.
   - Menambahkan handler `skills:get-manifest`.
   - Memperluas `skills:read(name, relativePath)` agar mengembalikan bundle informatif berkas references dan scripts bila dipanggil tanpa subpath, atau membaca isi subpath jika diberikan.
2. **`src/api/skills/skillFolder.js` (Baru)**:
   - `parseSkillQuery`: mem-parse format query pipe (`||`) maupun slash path (`references/`, `scripts/`).
   - `formatBytes`: format ukuran byte manusiawi.
   - `formatSkillFolderBundle`: merakit observasi bundle instruksi + manifes references/scripts.
   - `extractSkillSubfile`: mengekstrak file dari record Dexie / object references & scripts.
3. **`src/hooks/agent/plan/agentTools.js`**:
   - Memperluas eksekutor `read-skill` untuk mendukung query subpath (`skillName||subpath`) dari Dexie, Native, dan disk via `readSkillFile`.
   - Menampilkan bundle lengkap references/scripts saat skill folder dibaca.
4. **`src/api/tauri-bridge.js`**:
   - Menambahkan `getSkillManifest(name)`.
   - Mengizinkan `readSkill(name, relativePath)` menerima subpath.
5. **`src/api/ai/planning.js`**:
   - Memperbarui panduan prompt planner: menjelaskan struktur skill folder penuh dan cara membaca berkas spesifik di `references/` atau `scripts/`.
6. **`tests/skillFolder.test.mjs` (Baru)**:
   - 11 unit test menguji parsing query, formatting bundle, ekstraksi subfile, sanitasi path traversal, dan manifest folder.

## Verifikasi
- `bunx vitest run tests/skillFolder.test.mjs tests/skill-descriptor.test.mjs`: 14/14 lolos.
- `bunx eslint`: 0 error.
