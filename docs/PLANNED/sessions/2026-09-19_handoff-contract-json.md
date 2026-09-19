# Sesi Kerja: 2026-09-19 — Handoff Contract JSON (#6)

## Konteks & Tujuan
Adopsi Backlog #6 dari `docs/OPERATING-ADOPTION.md`:
Mengadopsi pola Handoff Contract JSON untuk durable multi-turn agent sessions ala Hermes & Anthropic:
- Menjamin setiap transisi sesi durable (checkpoint, pause, transition, resume) menuliskan kontrak JSON eksplisit dan deterministik yang memuat 7 field wajib:
  1. `objective`: tujuan task/step (string).
  2. `done`: daftar deliverables yang selesai (array of strings).
  3. `remaining`: daftar langkah tersisa (array of strings).
  4. `blocked`: alasan pemblokiran (null atau array of strings).
  5. `artifacts`: daftar berkas yang dihasilkan (array of { path, contentHash, summary } atau strings).
  6. `verified`: status verifikasi bukti eksekusi dunia nyata ({ isVerified, stepsCompletedCount, stepsRemainingCount }).
  7. `next_action`: rekomendasi aksi konkret berikutnya yang harus langsung dieksekusi (string).
- Memungkinkan sesi yang di-resume membaca state ringkas dan terstruktur tanpa membebani context window dengan seluruh riwayat chat panjang.

## Perubahan Kode
1. **`src/api/ai/handoffContract.js` (Baru)**:
   - `MANDATORY_HANDOFF_FIELDS` (7 field wajib).
   - `validateHandoffContract(contract)`: verifikasi ketat struktur dan tipe data kontrak.
   - `buildHandoffContract(taskWithSteps, options)`: ekstraksi status deterministik dari task dan steps.
   - `formatHandoffContractPrompt(contract)`: perakitan prompt markdown terstruktur untuk agen ReAct.
2. **`src/api/taskStore.js`**:
   - Menyimpan `handoffContract` pada setiap `checkpointAgentTaskStep`.
   - Menyimpan `handoffContract` pada setiap `transitionAgentTask`.
   - Mengekspor `generateTaskHandoff(taskId, options)`.
3. **`src/api/engine/taskRuntime.js`**:
   - Menyertakan `handoffContract` pada hasil `getResult(taskId)`.
   - Mengekspor `getTaskHandoffContract(taskId, options)` dan re-ekspor fungsi-fungsi kontrak.
4. **`tests/handoffContract.test.mjs` (Baru)**:
   - 7 unit test menguji validasi 7 field wajib, pembangunan kontrak dari task aktif/selesai/gagal, dan perakitan prompt.

## Verifikasi
- `bunx vitest run tests/handoffContract.test.mjs tests/durableResume.test.mjs tests/taskRuntime.test.mjs`: 20/20 lolos (100% passed).
- `bunx eslint`: 0 error, 0 warning.
