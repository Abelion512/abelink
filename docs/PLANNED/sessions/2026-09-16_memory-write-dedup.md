# Session 2026-09-16 — Memory write-gate dedup (Lapis 1)

## Keputusan

- Topik: duplikat memori (keluhan user) — bertahap Lapis 1 dulu: cegah di
  tulis. Lapis 2 (groomer berkala) + Lapis 3 (grup tampilan) = observasi
  dulu, eksekusi bila bukti masih kotor.
- Audit temukan lubang: dedup 0.82 hanya di plan loop
  (`useAbelinkPlan.js:1099-1121`) via Orama; `insertMemory` (`db.js:279`)
  tulis buta sehingga 3 penulis lain (music, relational, YT context)
  selalu lolos.
- Fix: write-gate di `insertMemory` — cosine >= 0.85 se-tipe
  (profile/preference) -> return id existing tanpa tulis. Tanpa vektor =
  fail-open tetap tulis. Reuse `cosineSimilarity` dari `vectorLoader`
  (tanpa siklus impor: db.js sudah impor generateVector dari sana).
- PR #41 ke main, TANPA merge (stacked #37-#40).
- Observe positif: fix Paket 1 bekerja — tool-calls sid 1 kini gabung grup
  sesi benar (8 tool tercatat, termasuk analyze-screen).

## Berkas berubah (PR #41, +73/-1)

- `src/api/db.js`: `MEMORY_WRITE_DEDUP_SIMILARITY=0.85` (+ komentar
  ponytail) + gate di `insertMemory`.
- `tests/memoryWriteDedup.test.mjs` (baru): 4 kasus mock vektor
  (skip-duplikat, tulis-beda, notes exempt, fail-open).

## Hasil verifikasi

- `bunx vitest run` full: 77 files, 864 tests passed (860+4).
- `bun run lint`: 0 errors, 927 warnings (= baseline; warning db.js
  pre-existing `catch(_)`).
- Return id existing aman: tidak ada caller yang pakai return value
  insertMemory (semua fire-and-forget `await`).

## Batasan dikenal

- Threshold 0.85 hanya tangkap near-duplikat; mirip-tapi-beda tetap
  ditulis -> groomer manual/otomatis yang urus (threshold 0.60).
- Dedup lama di plan loop (Orama 0.82, update-in-place) dibiarkan: lapis
  pertahanan kedua, tak konflik (gate db cegah dulu, sisa lolos ditangani).
- Merge berurutan #37->#41 + rebase tiap lapis. CI cloud = billing.

## Ponytail debt ledger (sesi ini)

- Scan O(n) per insert se-tipe (baca semua row + cosine di JS). Cukup
  untuk skala memori personal (ratusan); pindah ke Orama/incremental bila
  insert terasa lambat (bukti profiling dulu).
- Hanya profile/preference yang di-gate (sejalan groomer + dedup lama).
  notes/learn tak di-gate (volume bebas, bukan identitas user).
- Lapis 2/3 ditunda: eksekusi bila user masih lihat duplikat setelah
  Lapis 1 hidup seminggu (bukti, bukan firasat).
