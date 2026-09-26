# ADR-001 — GUI mempertahankan loop sendiri; paritas dikunci lewat kontrak bersama

Tanggal: 2026-09-26 · Status: **DITERIMA** (menjawab keputusan terbuka D1, wave M3)
Konteks induk: `docs/PLANNED/2026-09-26_master-migration-program.md` §8 D1,
`docs/PLANNED/2026-09-26_hermes-cli-engine-adoption.md` H1.

## Konteks

Ada dua loop agent di repo:

| | GUI | Headless (CLI/TUI/bench) |
|---|---|---|
| Loop | `src/hooks/agent/useAbelinkPlan.js` (~2591 baris) | `src/api/ai/agentRunner.js` (`runAgentLoop`) |
| Verifier | `evaluateEvidence` + `gateCompletion` + `buildReplanObservation` | sama |
| Supervisor | `createTrajectorySupervisor` | sama |
| Budget | `resolvePlanStepBudget` (+ GOAL_MODE_FLOOR + renew) | `resolvePlanStepBudget` (+ ekstensi +16) |
| Observability | harness Rust (`harness_append`) | harness headless (`cli/core/harness-writer.mjs`, M2c) |

Dua opsi dari plan induk:
(a) GUI memanggil `runAgentLoop` — konsolidasi total, risiko tinggi (loop GUI
    terikat UI: approval overlay, TTS, notifikasi, browser bridge, sub-agent
    intercom, archiver — semua asing bagi `runAgentLoop` murni);
(b) ADR divergensi + test paritas kontrak.

Bukti pengukuran (grep 2026-09-26): kedua loop memanggil gerbang governance
YANG SAMA (supervisor/verifier/budget), sehingga (b) cukup untuk menjamin
"tidak ada loop yang melewatkan gerbang" tanpa menyentuh `planning.js`
(B-11 freeze) maupun loop GUI.

## Keputusan

**Pilih (b): GUI mempertahankan loop-nya; headless memakai `runAgentLoop`.**
Keduanya WAJIB memanggil modul kontrak yang sama — itulah pengunci paritas:

1. `objectiveVerifier.evaluateEvidence` + `gateCompletion` +
   `buildReplanObservation` dengan `MAX_VERIFY_REPLANS` — klaim "selesai"
   tanpa bukti tool ditolak, di kedua host.
2. `trajectorySupervisor.createTrajectorySupervisor` — deteksi stagnasi,
   kedua host.
3. `planStepBudget.resolvePlanStepBudget` — batas langkah, kedua host.
4. `classifyObjectiveKind` — klasifikasi objektif, kedua host.

Perubahan apapun pada keempat modul ini harus lolos test paritas (di bawah)
di kedua loop, atau ADR ini harus direvisi.

### Test paritas kontrak (DoD M3)

`tests/loopParity.test.mjs`: tabel gerbang (supervisor/verifier/budget/
classifier) × dua loop (GUI rung, headless `runAgentLoop`) — sebuah skenario
governance harus menghasilkan keputusan setara di kedua loop:
- klaim selesai tanpa tool (kind non-konversasional) → REJECTED di keduanya;
- klaim selesai dengan bukti tool sukses → COMPLETE di keduanya;
- budget tercapai tanpa kemajuan → TERMINATE `failed` di keduanya;
- supervisor melihat tool gagal berulang → hint keluar di keduanya.

## Konsekuensi

- Migrasi loop GUI TIDAK dijadwalkan; `grep runAgentLoop src/hooks` boleh
  tetap kosong selama test paritas hijau (acceptance H1 versi ADR).
- Fitur GUI-only (approval overlay, TTS, archiver) tak perlu diangkat ke inti.
- Perbaikan governance cukup SATU kali di modul bersama; kedua loop otomatis
  ikut (dibuktikan test paritas).
- Risiko sisa: loop GUI punyá path yang tidak lewat modul bersama (mis.
  kategori router). Dipantau lewat review; bila paritas mulai bocor,
  opsi (a) dibuka kembali lewat ADR baru.

## Akar masalah "agent berjam-jam vs agent kita gagal" (jawaban owner)

Dokumentasi PRD tidaklah kurang jelas — sebaliknya, gerbang quality kita
(EV, supervisor, verifier) justru LEBIH KETAT daripada benchmark publik.
Akar masalahnya spesifik dan terukur:

1. **Waktu-pada-ungu diperlakukan sebagai kegagalan**: `outcome: needs_user`
   menghentikan loop. Model benchmark berjalan berjam-jam karena mereka
   **menghabiskan waktu nyata menunggu** — jangan tiru angka jamnya, tiru
   siklusnya.
2. **Bukti progres tidak dikonsumsi siapa pun**: headless runner memanggil
   `progressEvaluator.evaluateProgress` tetapi hanya menyimpan record (outcome
   stagnasi diabaikan — TODO terdokumentasi); GUI bahkan TIDAK memanggilnya
   (hanya import `isFailure/isMalfunction`). Keduanya butuh aturan eksplisit:
   "bukti progres nyata menolak penutupan dini".
3. **Verifikasi perluas**: `MAX_VERIFY_REPLANS = 2` (replan ketat) vs
   sesi panjang: beri jalur "lanjut kerja" (bukan replan) ketika bukti
   progres nyata ada — teks gate di ADR paritas.
4. **Consolidation adalah kebutuhan observability** — PR46: `unnecessary
   action` masih `null` karena tidak ada instrumen. Tool yang sukses tapi
   tidak relevan = buang step; itu yang membuat sesi panjang terlihat gagal
   di kertas. (Dipelajari lewat benchmark harness, bukan dikonsumsi mentah.)

### Divergensi yang DIKETAHUI dan sengaja diakui (bukan disembunyikan)

- **Budget floor**: GUI menaikkan budget minimal ke `GOAL_MODE_FLOOR = 48`
  (useAbelinkPlan.js:788); headless mengikuti `resolvePlanStepBudget` apa
  adanya + ekstensi +16. Ini divergensi SENGJA (host butuh budget beda) —
  tidak dikunci test paritas, tapi harus tetap tercatat di sini.
- **needs_user**: terminal di KEDUA host (headless agentRunner:307; GUI
  menghentikan proses agentic dan menampilkan bubble). Paritas = keduanya
  berhenti; remediasi R1 mengubah keduanya sekaligus lewat modul bersama.

## Remediasi yang disetujui (terjadwal, bukan hari ini)

| # | Remediasi | Efek | Waktu |
|---|---|---|---|
| R1 | `needs_user` → nilai default "lanjut heuristik" + jendela ask_human | loop tidak mati saat model bertanya | M5 |
| R2 | Konsumsi `evaluateProgress` untuk gate anti-penutupan-dini: headless pakai record yang sudah ada; GUI mulai memanggilnya | konsolidasi tool relevan naik, step terbuang turun | M5 |
| R3 | Bounded "work-resume" (bukan replan) saat bukti progres ada | sesi panjang tanpa melanggar kontrak verify | M5 |
| R4 | Instrumentasi PR46 `unnecessaryActionRate` | bukti bukan tebakan | M5/M6 |

Semua remediasi menjaga prinsip induk: tanpa fallback model, tanpa emoji,
gate verify tetap wajib — yang berubah adalah SIKLUS kapan loop berhenti.
