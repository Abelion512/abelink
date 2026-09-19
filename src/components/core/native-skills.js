// Native skills — di-registry di sini agar masuk ABELINK SKILLS & CAPABILITY
// REGISTRY (prioritas #1) dan dibaca agent via 'read-skill'.
// NATIVE_SKILL_LOW_TIER: disiplin eksekusi untuk model apapun (injeksi
// perilaku via skill.md — kompensasi model low-tier, lihat native-skill-lowtier.js).
import { NATIVE_SKILL_LOW_TIER } from './native-skill-lowtier'

export const NATIVE_SKILLS = [
  NATIVE_SKILL_LOW_TIER,
  {
    name: 'goal',
    description:
      'Kontrak misi long-horizon (/goal): kriteria DONE + bukti per langkah, snapshot dulu, stop-loop konten kosong, konvergen saat budget menipis',
    content: `
# SISTEM INSTRUKSI SKILL "/goal" (KONTRAK MISI LONG-HORIZON)
Kamu menjalankan misi dengan kriteria selesai eksplisit. Ikuti kontrak ini sampai DONE — JANGAN berhenti prematur.

## 1. KRITERIA DONE EKSPLISIT
- Di "thought" giliran pertama, tulis: TUJUAN + KRITERIA SELESAI (apa yang dihitung selesai) + BUKTI per kriteria.
- Setiap giliran: laporkan progres per kriteria (criterianya, bukan narasi bebas).
- "is_done": true HANYA bila SEMUA kriteria terbukti via observasi tool. Klaim tanpa bukti = kegagalan.

## 2. SNAPSHOT DULU, JANGAN ULANG BACA BUTA
- Butuh isi halaman? 'browser-snapshot' DULU (teks utama + TeX + gambar), baru 'browser-read' untuk elemen.
- Konten JS lambat? 'browser-wait-for' (teks yang ditunggu), bukan read berulang.

## 3. STOP-LOOP KONTEN KOSONG (ANTI BURN TOKEN)
- 3x baca/extract beruntun KOSONG untuk konten yang sama = BERHENTI. Tangga: (1) 'browser-snapshot' sekali, (2) bila tetap kosong dan ada gambar → 'analyze-screen' ATAU laporkan blocked spesifik, (3) JANGAN read/click/extract lagi untuk konten itu.
- MENGAPA: 35 read + 16 click untuk 1 soal yang gagal T24 (trajectory 2026-09-19) — semuanya mengulang baca kosong.

## 4. KONVERGEN SAAT BUDGET MENIPIS
- Sisa <=7 langkah: JANGAN eksplorasi baru. Selesaikan jawaban final atau aksi penutup.
- MENGAPA: stop di batas dengan tangan kosong = seluruh misi sia-sia; jawaban parsial jujur > gagal total.`
  },
  {
    name: 'plan',
    description:
      'Membuat rencana sebelum mengeksekusi tugas untuk mendapatkan jawaban yang lebih berkualitas',
    content: `
# SISTEM INSTRUKSI SKILL "/plan" (DURABLE TASK PLANNER)
Kamu telah diinstruksikan oleh user untuk menggunakan fitur **/plan** atau **Durable Task Planner**!

## PERATURAN MUTLAK KETIKA SKILL INI DIAKTIFKAN:
1. **DILARANG KERAS** mengeksekusi tool apapun di dalam response saat ini.
2. Kamu **WAJIB** mengatur nilai properti "suggested_mode" di dalam JSON respons-mu menjadi "durable". Ini sangat penting karena sistem interceptor hanya akan memicu taskPlanner.js jika mode ini diset ke "durable".
3. Kamu **WAJIB** mengatur nilai properti "task_status" menjadi "in_progress".
4. Berikan pesan answer ke user, memberi tahu bahwa kamu sedang menyalakan sistem "Mission Control" dan membuat perencanaan multi-langkah.
5. Pikirkan sejenak tentang tugas yang diminta user di dalam properti "thought" agar taskPlanner bisa mengambil logikamu.

JANGAN MEMULAI PENGERJAAN TUGAS SEKARANG. Sistem akan memecahnya setelah kamu mengembalikan "suggested_mode": "durable".`
  }
]
