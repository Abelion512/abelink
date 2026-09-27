# Operating Decisions (ADR ringkas)

Keputusan arsitektur operating model + alternatif yang ditolak dan
alasannya. Setiap entri: konteks → keputusan → konsekuensi → bila
dikaji ulang.

Sumber pola: Hermes AGENTS.md (narrow waist, cache sacred), Anthropic
Building Effective Agents (simplicity, transparency, ACI), Managed
Agents (brain/hands/session), Evals (capability vs regression).

## D1. Adopsi principles, bukan salinan mentah

- Konteks: Hermes (Python, SQLite, server) dan Claude Code (cloud)
  beda runtime dengan Abelink (Tauri + sidecar + Dexie + extension).
- Keputusan: adopsi engineering principles (kontrak, tier, lifecycle,
  metrik); implementasi ditulis ulang mengikuti seam Abelink.
- Konsekuensi: tidak ada dependensi Hermes/Anthropic; pola terasa
  "mirip" tapi kode 100% milik repo.
- Kaji ulang bila: pola menyimpang dari sumber sampai namanya
  menyesatkan — selaraskan atau ganti nama.

## D2. Core kecil, capability di edge

- Konteks: tiap tool inti dikirim tiap API call (biaya abadi).
- Keputusan: bar baru → perluas kode ada → CLI+skill → service-gated
  tool → plugin → MCP catalog → core tool (terakhir). Tool search
  deferred untuk katalog besar.
- Konsekuensi: PR capability wajib tunjukkan kenapa tidak cukup di
  edge (gate review).

## D3. Prompt caching dijaga (deferred invalidation)

- Konteks: rebuild prompt tiap giliran membatalkan cache → biaya
  berlipat.
- Keputusan: perubahan skill/tools/memory berlaku sesi berikut;
  opt-in `--now` setara bila mendesak. Satu-satunya pemutus cache
  yang sah: compression.
- Konsekuensi: UI toggle menjelaskan "berlaku sesi berikut" bila
  relevan.

## D4. Skill trial + reuse terukur (bukan tulis-lalu-lupa)

- Konteks: `should_learn` lama menulis skill tanpa bukti dipakai ulang.
- Keputusan: lahir `trial`; aktif bila reuse > 0 atau lolos eval;
  kedaluwarsa 7 hari; arsip 30 hari tak dipakai (bukan hapus).
  Metrik inti: `reuse_after_patch`.
- Konsekuensi: jumlah skill aktif = yang terbukti berguna.

## D5. Guardian 3-tier, bukan daftar keyword datar

- Konteks: substring `rm ` false-positive; tanpa auto-deny; tanpa
  self-protection.
- Keputusan: hardline (auto-deny) / dangerous (approval) / safe +
  quote-masking + self-dir. Handler menolak hardline tanpa eksekusi.
- Konsekuensi: pesan approval per tier; test 11 kasus di
  `hermes-guardian.test.mjs`.

## D6. Verifikasi kebenaran, bukan format

- Konteks: klaim "Muse 1.3 confirmed" lolos karena cek format
  (ada tool sukses + jawaban panjang).
- Keputusan: `claim-quoted` (kutipan isi), `test-evidence`
  (artefak mentah), `[SEARCH-ERROR]` vs `[NO-RESULTS]`,
  `answer !== completion`.
- Konsekuensi: agen jujur "senjata rusak" alih-alih vonis "info tak ada".

## D7. Browser via extension, bukan CDP (untuk sekarang)

- Konteks: chrome-devtools-mcp (52k stars) punya take_snapshot,
  evaluate_script, wait_for — pola bagus.
- Keputusan: tiru POLA (snapshot konten, wait-for teks, fill sekaligus)
  di extension yang ada; tanpa permission `debugger` (banner kuning
  automation + rewrite transport tidak sepadan).
- Kaji ulang bila: butuh heap snapshot / trace performa / network
  forensik — saat itu CDP layak dipertimbangkan sebagai mode kedua.

## D8. Eval sebagai loop inti, bukan folder pamer

- Konteks: AbelinkBench sudah ada (multi-run, verifier, anti-cheat).
- Keputusan: tiap paket fitur tambah/ubah eval dulu; capability eval
  (pass rendah) vs regression (~100%); baca transcript saat gagal.
- Konsekuensi: `scripts/verify.sh` gate; bedakan "model gagal" vs
  "routing salah" vs "verifier salah".

## D9. Identifier reverse-DNS siap mobile

- Konteks: `abelink-linux` / `abelink.linux.dev` menempel platform.
- Keputusan (teraudit, belum dieksekusi): prod → `dev.abelink`,
  dev → `dev.abelink.dev`; mobile nanti `dev.abelink.android/ios`.
  Prasyarat: cek tabrakan data dir sebelum rename.
