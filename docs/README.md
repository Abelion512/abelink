# Abelink — Documentation Index

Peta dokumen untuk agent (dan manusia). Urutan baca yang disarankan saat
mulai bekerja di repo ini:

0. `abelink-5w1h.html` — **DATA UTAMA + FROZEN** (ubah butuh owner): 5W1H,
   diagnosis over-engineering, masalah yang harus di-solve (P0/P1/P2),
   prinsip anti over-engineering. Buka langsung di browser (visual HTML).
1. `../REFERENCES.md` — **wajib baca sebelum edit** (DO NOT DELETE): peta
   sinkron ATM multi-sumber + aturan sitasi anti-halusinasi.
2. `../AGENTS.md` — kontrak utama: stack, invarian, security gates, aturan
   develop. **Wajib** dibaca sebelum mengubah kode.
3. `ARCHITECTURE.md` — peta runtime (engine `cli/` + client GUI/extension/
   TUI/gateway), registry channel sidecar, pola arsitektur, alur data kritis.
4. `../extension/README.md` — wajah browser (Fase C3 Jalur A): popup,
   pairing prod/dev, bridge lokal. Prominen karena visi proaktif
   bertumpu pada extension.
5. `../bin/README.md` — CLI engine (`bin/` + `agentRunner.js`): loop,
   headless helpers, gateway Telegram, perintah run. Satu engine,
   banyak client (GUI/extension/TUI/gateway).
6. `MIGRATION-GAPS.md` — hasil audit channel Electron→Tauri: yang sudah
   dipulihkan, yang sengaja di-stub, metode audit yang bisa di-reproduce.
7. `SECURITY-TRIAGE.md` — keputusan risiko dependency yang di-accept secara
   eksplisit + override yang dipakai + proses review audit.
8. `RELEASE-AUTOMATION.md` — alur rilis otomatis (prepare/finalize), gate
   verifikasi, catatan toolchain Rust+Bun.
9. `MIGRATION-PLAN.md` — rencana fase migrasi tersisa (B6/C3/C4),
   lengkap dengan titik masuk implementasi + verifikasi per fase.
10. `../evaluation/README.md` — AbelinkBench: harness evaluasi, verifier
    deterministik, anti-fabrication principles, roadmap.
11. `../PROJECT-STATUS.md` — ringkasan status sanitized untuk dibaca manager
    AI via GitHub (tanpa detail internal): milestone, kesehatan CI, keputusan
    terakhir, langkah berikut.
12. `effort-system-spec.md` — spesifikasi beku sistem effort/budget (§1-§72).
13. `PLANNED/README.md` — indeks dokumen rencana + status hidup/arsip,
    termasuk kontrak benchmark PR45→PR46
    (`PLANNED/2026-09-21_agent-benchmark-matrix.md` +
    `PLANNED/2026-09-21_runtime-standards-adaptation.md`).
14. `../evaluation/bench/README.md` — benchmark arsitektur: kontrak trajectory,
    katalog probe, boundary execution, cara run.
15. `REFERENCE-LIBRARY.md` — peta referensi eksternal (ATM) dengan prinsip
    load-when-needed: repo mana dibuka saat fase mana, kolom status pemakaian,
    dan filter privacy-first untuk skill/agent referensi.
16. `HARNESS-LOG-SCHEMA.md` — skema envelope log harness (reader = writer).
17. `MODEL-MATRIX.md` — matriks model/provider yang didukung.
18. `EXTENSION-PUBLISH-CHECKLIST.md` — checklist publikasi extension.
19. `ABELINK_CLI_DIRECTION.md` — arah CLI (status: proposed; implementasi
    mengacu ke `../cli/README.md`).
20. ADR-001 loop-divergence — keputusan divergensi loop GUI vs headless
    (file ADR belum ter-commit; ringkasan R1–R4 ada di `abelink-5w1h.html`
    §arsitektur + `TASK.md` status M3).

## Arsip (tak relevan dengan arah saat ini, jangan jadi bacaan wajib)

- `archive/OPERATING-MODEL.md`, `archive/OPERATING-DECISIONS.md`,
  `archive/OPERATING-ADOPTION.md`, `archive/OPERATING-SECURITY.md`,
  `archive/ARCHITECTURE-LEARNINGS.md`,
  `archive/ARCHITECTURAL_DIRECTION.md`, `archive/smart-orchestrator.md`

## Konvensi cepat

- Nama produk: **Abelink** (tanpa embel-embel Linux di dokumen).
- Bahasa dokumen: Indonesia (kode & identifier tetap English).
- Setiap klaim angka/fitur di dokumen HARUS bisa diverifikasi dengan perintah
  yang tercantum di dokumen terkait (prinsip anti-fabrication — lihat
  `../evaluation/README.md`).
- Sitasi riset WAJIB: URL visitable manusia + verbatim quote + `[P-X]`
  (lihat `../REFERENCES.md` §2). URL karangan = halusinasi.
- Perubahan arsitektur (channel baru, modul baru, alur data baru) wajib
  memperbarui `ARCHITECTURE.md` di PR yang sama.
