# MARK Linux — Documentation Index

Peta dokumen untuk agent (dan manusia). Urutan baca yang disarankan saat
mulai bekerja di repo ini:

1. `../AGENTS.md` — kontrak utama: stack, invarian, security gates, aturan
   develop. **Wajib** dibaca sebelum mengubah kode.
2. `ARCHITECTURE.md` — peta runtime tiga dunia (renderer / Rust / sidecar),
   registry channel sidecar, pola arsitektur, alur data kritis.
3. `MIGRATION-GAPS.md` — hasil audit channel Electron→Tauri: yang sudah
   dipulihkan, yang sengaja di-stub, metode audit yang bisa di-reproduce.
4. `SECURITY-TRIAGE.md` — keputusan risiko dependency yang di-accept secara
   eksplisit + override yang dipakai + proses review audit.
5. `RELEASE-AUTOMATION.md` — alur rilis otomatis (prepare/finalize), gate
   verifikasi, catatan toolchain Rust+Bun.
6. `MIGRATION-PLAN.md` — rencana fase migrasi tersisa (B5/B6/C3/C4),
   lengkap dengan titik masuk implementasi + verifikasi per fase.
7. `../evaluation/README.md` — MarkBench: harness evaluasi, verifier
   deterministik, anti-fabrication principles, roadmap.
8. `REFERENCE-LIBRARY.md` — peta referensi eksternal (ATM) dengan prinsip
   load-when-needed: repo mana dibuka saat fase mana, kolom status pemakaian,
   dan filter privacy-first untuk skill/agent referensi.

## Konvensi cepat

- Bahasa dokumen: Indonesia (kode & identifier tetap English).
- Setiap klaim angka/fitur di dokumen HARUS bisa diverifikasi dengan perintah
  yang tercantum di dokumen terkait (prinsip anti-fabrication — lihat
  `../evaluation/README.md`).
- Perubahan arsitektur (channel baru, modul baru, alur data baru) wajib
  memperbarui `ARCHITECTURE.md` di PR yang sama.
