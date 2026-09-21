# PR #47 — Wiring the architecture axis into the benchmark execution path

Status: **design / plan**. No runtime change in this document's commit.
Prasyarat: PR #46 sudah merged ke `main` (`b61d7e1`).

## 1. Masalah

PR #46 menambahkan guard yang jujur: `evaluation/abelink-adapter.mjs`
mendeklarasikan `ARCH_AXIS_IN_BENCH_PATH = false`, nilainya direkam sebagai
`identity.architectureAxisWired`, dan `compareArmReports()` menolak menyatakan
perbandingan valid selama flag itu belum `true` eksplisit
(`architecture-not-executed-by-harness`). Konsekuensinya **eksperimen A
(vanilla vs basic) deferred**.

Alasannya, dengan bukti kode:

- `grep -rn "ABELINK_BENCH_ARCH\|benchArch" sidecar/` → **0 hit**. Sisi engine
  tidak pernah membaca sumbu arsitektur.
- `currentBenchArch()` hanya dipakai dua berkas renderer:
  `src/hooks/agent/useAbelinkPlan.js:34,776` dan
  `src/api/subagent/subagentExecutor.js:13,145`.
- `evaluation/abelink-adapter.mjs` menggerakkan sidecar langsung (`ai:fetch` +
  `native-tool:execute`) dengan loop ReAct minimalnya sendiri (~35 baris), dan
  memakai `arch` hanya untuk (a) mengekspor env ke child, (b) melaporkannya di
  `trajectory.meta`. Tidak ada cabang logika di loop-nya.

Jadi `--arch vanilla` dan `--arch basic` berjalan **identik** di harness: dua arm
yang sama dengan label berbeda.

## 2. Apa sebenarnya yang dikendalikan sumbu arch

Terverifikasi di kode (dua tempat, semantik sama):

| Kontrol | basic (default) | vanilla | Lokasi |
| --- | --- | --- | --- |
| Trajectory supervisor | `createTrajectorySupervisor()` aktif | `null` (tidak ada catatan trajectory, tidak ada hint strategi) | `useAbelinkPlan.js:776-780`; `subagentExecutor.js:145-146` |
| Verify gate saat model klaim selesai | `gateCompletion()` dijalankan; bila belum lengkap → `[VERIFICATION GATE]` replan, maksimum `MAX_VERIFY_REPLANS = 2`, lalu `sessionOutcome = 'failed'` | gate di-`skip`: klaim model dipercaya, terminal reason `verify:skipped-vanilla` | `useAbelinkPlan.js:1344-1356`; `subagentExecutor.js:266-275` |

Modul yang dipakai keduanya **sudah pure dan importable dari Node**:
`objectiveVerifier.js` (`evaluateEvidence`, `gateCompletion`,
`classifyObjectiveKind`, `MAX_VERIFY_REPLANS`, `VERIFICATION_STATE`),
`trajectorySupervisor.js` (`createTrajectorySupervisor`, `DIRECTIVE`),
`progressEvaluator.js`, `strategyLib.js`.

Yang belum ada bukan logikanya, melainkan **loop yang mengonsumsinya di jalur
benchmark**.

## 3. Kenapa boundary yang ada belum menyelesaikannya

`evaluation/bench/boundary-abelink.mjs` — implementasi "boundary ABELINK" yang
kontraknya tertulis di `boundary-spec.mjs` — ternyata **membungkus
`runAbelinkAgent`**, yaitu loop adapter benchmark yang sama. Ia memenuhi kontrak
transport (`startRun`/`sendPrompt`/`endRun`/`abortRun`) tetapi mewarisi
keterbatasan yang sama: runtime renderer tidak ikut berjalan. Jadi memakai
boundary itu untuk eksperimen A tidak mengubah apa pun pada sumbu arch.

## 4. Opsi

| Opsi | Isi | Penilaian |
| --- | --- | --- |
| **A. Ekstraksi loop** | Pindahkan loop orkestrasi dari `useAbelinkPlan.js` (2404 baris, hook React) ke modul framework-agnostic, lalu konsumsi dari hook **dan** dari bench. | Paling jujur: bench benar-benar mengukur loop aplikasi. Tapi refactor besar pada inti runtime, berisiko, butuh desain + beberapa tahap. |
| **B. Konsumsi modul governance yang sama di loop bench** | Loop benchmark menjalankan tahap supervisor + verify gate dengan memanggil **modul pure yang sama** yang dipakai renderer, dikendalikan kebijakan arch yang sama. | Kecil, tidak menduplikasi logika (memakai modul asli), dan mengubah arm secara nyata. Batasnya harus dinyatakan jujur: yang diukur adalah "modul governance yang dipasang di loop benchmark", bukan loop renderer. |
| **C. Menjalankan bench di dalam aplikasi** | Mode bench di renderer (transport + UI plumbing) | Paling berat; menyentuh UI/runtime dan tidak menambah nilai pengukuran dibanding A. |

**Rekomendasi: B sebagai slice pertama, A sebagai arah jangka panjang.** B
memenuhi syarat minimum eksperimen yang sah (kedua arm benar-benar berbeda),
tanpa membuka refactor besar tanpa desain. A tetap dicatat sebagai pekerjaan
tersendiri supaya klaim fidelitas penuh tidak dipalsukan.

## 5. Rencana slice (opsi B)

1. **Kebijakan arch tunggal (pure).** Modul baru
   `src/api/ai/archPolicy.js`: `getArchPolicy(arch)` →
   `{ supervisorEnabled, verifyGateEnabled, completionClaimTrusted }`, plus
   helper terminal reason (`verify:skipped-vanilla` vs `verify:<state>`).
   Dua call site renderer dipindahkan ke kebijakan ini (tanpa perubahan perilaku;
   dibuktikan truth-table + suite penuh). Ini juga menghapus cabang inline yang
   saat ini terduplikasi di dua berkas.
2. **Loop benchmark menghormati kebijakan itu** (`evaluation/abelink-adapter.mjs`):
   - `basic`: tiap observasi tool diberi ke `createTrajectorySupervisor()`; bila
     ada directive baru, hint disuntikkan sebagai observasi berikutnya. Saat model
     menyatakan selesai, `evaluateEvidence()` + `gateCompletion()` dijalankan atas
     tool yang sudah dieksekusi; bila belum lengkap → `buildReplanObservation()`
     disuntikkan dan loop lanjut, dibatasi `MAX_VERIFY_REPLANS`.
   - `vanilla`: berhenti pada klaim model (kontrol), tanpa supervisor.
   - Tahap baru dicatat di trace (`kind: 'verify'` / `'supervisor'`) agar bisa
     diaudit dan dihitung metrik.
3. **Flip `ARCH_AXIS_IN_BENCH_PATH = true`** — hanya setelah (2) benar-benar
   mengubah jalannya run, bukan sebagai perubahan dokumentasi. Flag tetap ada
   supaya klaim itu bisa diverifikasi ulang.
4. **Test deterministik**: model tiruan berskenario (bukan LLM) → (a) vanilla
   berhenti di klaim pertama, basic melakukan minimal satu replan; (b) hint
   supervisor hanya muncul di basic; (c) replan terbatas `MAX_VERIFY_REPLANS`;
   (d) laporan arm mencatat `architectureAxisWired: true` sehingga
   `compareArmReports()` menjadi valid; (e) no-regression suite + smoke.

Kriteria selesai:

- dua arm fixture yang sama menghasilkan trajectory berbeda saat gate/supervisor
  relevan (bukan label);
- `run.mjs --suite pr46 --arch vanilla` + `--arch basic --baseline-report` bisa
  menghasilkan `comparison.valid: true`;
- `evaluation/smoke.mjs` menguji perbedaan itu secara offline.

## 6. Batas kejujuran (yang tetap TIDAK diukur oleh opsi B)

- Loop benchmark **bukan** loop renderer: prompt assembly, memori, streaming,
  TTS, dan integrasi UI berbeda. Hasil berbasis B berarti "modul governance
  (supervisor + verify gate asli) yang dipasang pada loop benchmark".
- Fidelitas penuh menuntut opsi A (ekstraksi loop) — perubahan terpisah.
- Sampai ada run provider nyata, tetap **tidak ada angka** yang diklaim.

## 7. Risiko

- Perubahan renderer wajib behavior-preserving → truth-table test + suite penuh
  (`bunx vitest run`, 1294 test saat ini) + `bun run build`.
- Replan di jalur benchmark tidak boleh mengubah perilaku produksi: kebijakan
  hanya aktif lewat env bench.
- `ARCH_AXIS_IN_BENCH_PATH` **tidak boleh** di-flip tanpa langkah (2) mendarat.

## 8. Urutan kerja

1. `archPolicy.js` + migrasi dua call site renderer + test truth-table.
2. Loop benchmark + trace stage + test deterministik.
3. Flip flag + dokumentasi (benchmark contract, `evaluation/README.md`,
   `AGENTS.md`, `docs/ARCHITECTURE.md`) + verifikasi penuh.
4. Baru setelah itu: jalankan eksperimen A dengan model/provider exact dan
   laporkan `report.measurement` — atau lanjut ke opsi A bila fidelitas penuh
   dianggap perlu.
