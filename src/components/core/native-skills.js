// Native skills — di-registry di sini agar masuk MARK SKILLS & CAPABILITY
// REGISTRY (prioritas #1) dan dibaca agent via 'read-skill'.
// NATIVE_SKILL_LOW_TIER: disiplin eksekusi untuk model apapun (injeksi
// perilaku via skill.md — kompensasi model low-tier, lihat native-skill-lowtier.js).
import { NATIVE_SKILL_LOW_TIER } from './native-skill-lowtier'

export const NATIVE_SKILLS = [
  NATIVE_SKILL_LOW_TIER,
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
