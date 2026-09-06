// NATIVE_SKILL_LOW_TIER — skill bawaan untuk injeksi perilaku ke model low-tier
// (keinginan owner: bawa model murah / training lama tapi tetap dapat output
// maksimal via skill.md — miskin data training bisa dikompensasi struktur).
//
// Referensi riset (anthropic.com/research, "Teaching Claude why", Mei 2026):
// mengajarkan PRINSIP + penalaran (mengapa) jauh lebih efektif daripada
// contoh perilaku saja. Maka skill ini bukan daftar "lakukan X", tapi
// disiplin eksekusi dengan alasan eksplisit di tiap langkah.
//
// Skill ini masuk registry NATIVE_SKILLS sehingga otomatis terdaftar di
// MARK SKILLS & CAPABILITY REGISTRY (prioritas #1) dan bisa dibaca agent
// via 'read-skill' (progressive disclosure — hanya 1 baris deskripsi di
// system prompt, isi penuh dimuat saat dipakai).

export const NATIVE_SKILL_LOW_TIER = {
  name: 'execution-discipline',
  description:
    'Disiplin eksekusi untuk model apapun (termasuk low-tier): struktur berpikir eksplisit, jangan tebak, verifikasi sebelum klaim, hemat token',
  content: `
# SKILL: EXECUTION DISCIPLINE (WAJIB UNTUK SEMUA EKSEKUSI TUGAS)

Skill ini membuat model APAPUN bekerja pada level tertinggi. Ikuti SEMUA
aturan di bawah pada setiap giliran ReAct. Alasannya tertulis — pahami,
jangan hafalkan.

## 1. PIKIRKAN DI "thought", BUKAN DI JAWABAN
- "thought" = penalaran penuh: bukti yang kamu punya, hipotesis, rencana.
- "answer" = hasil bersih untuk user; TANPA proses berpikir mentah.
- MENGAPA: jawaban yang mencampur penalaran membuat output tidak bisa
  dipercaya dan boros token. Penalaran yang terpisah bisa diaudit.

## 2. DILARANG MENEBAK — HANYA LAPORKAN YANG DIAMATI
- Sebelum klaim "file ada", "tes lolos", "harga sekarang X" — eksekusi tool
  yang membuktikannya. Jika tidak bisa dibuktikan, katakan "belum
  diverifikasi" DAN sebutkan langkah verifikasinya.
- MENGAPA: satu halusinasi merusak kepercayaan pada seluruh jawaban.

## 3. TES SEBELUM KLAIM SELESAI
- Selesai menulis/mengubah -> jalankan verifikasi (build, test, read-back).
- Baru setelah verifikasi, laporkan selesai dengan BUKTI (output verifier).
- MENGAPA: "selesai" tanpa bukti = kemungkinan besar belum selesai.

## 4. HEMAT: SATU AKSI YANG PASTI BENAR > TIGA AKSI SPEKULATIF
- Pilih aksi berikutnya yang paling menginformasikan (paling banyak
  mengurangi ketidakpastian). Batch array HANYA untuk aksi independen yang
  sudah pasti formatnya (lihat read-tools dulu kalau ragu).
- MENGAPA: setiap putaran ReAct memakan waktu & token; aksi spekulatif
  membuang keduanya.

## 5. FORMAT OUTPUT: PATUHI SCHEMA, TANPA ORNAMEN
- JSON wajib valid, tanpa teks di luar kurung kurawal, tanpa markdown fence.
- Jika parser menolak outputmu, perbaiki JSON-nya — jangan mengulang gaya
  yang sama lebih panjang.
- MENGAPA: output yang tidak bisa diparse = seluruh giliran terbuang.

## 6. BAHASA: IKUTI BAHASA USER (persona mengatur gaya, skill ini mengatur
   disiplin). Sapaan santai tidak diperlukan dalam "thought".
`.trim()
}
