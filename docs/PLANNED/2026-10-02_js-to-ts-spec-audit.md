# AUDIT — `js-to-ts-spec.md`: mana keputusan owner, mana karangan agen

Tanggal: 2026-10-02 | Audit atas permintaan owner
Objek: `js-to-ts-spec.md` (549 baris, 8 commit, terakhir `8028171e` #120)
Method: baca penuh + verifikasi silang tiap klaim faktual terhadap `git ls-files`, `grep`, dan isi file langsung. Tidak ada klaim di dokumen ini yang dibiarkan hanya karena tertulis.

## Ringkasan

Spec ini **bukan homogen**. Isinya tiga lapisan yang tercampur dalam satu file tanpa
pemisah visual:

| Lapisan | Jumlah | Status |
| --- | --- | --- |
| **A. Keputusan owner** (LOCKED, dari interview 2026-09-28) | 11 item (K1-K7, K9-K10, K13-K14) | Berwenang. Tidak diubahsepihak. |
| **B. Keputusan agen** yang dicatat seolah-olah keputusan | 3 item (K8, K11, K12) | Boleh, tapi harus tetap ditandai "keputusan agen". |
| **C. Fakta terukur** | §3.2, §3.3, §13, §14 | Terverifikasi. 4 angka sudah basi. |
| **D. Karangan agen** | §5 partly, §6, §7, §8, §9, §12, §15 | Rencana kerja agen. Bukan standar. |

Yang paling penting: **stuff yang paling sering dikutip downstream justru yang
paling lemah epistemiknya.** §6 (Wave Plan) dan §8 (Protokol Eksekusi) adalah
karangan agen murni, tapi karena berlabel "spec", subsections-nya dibaca seperti
kontrak.

## A. Keputusan owner — LOCKED (baris 19-37)

Sumber tunggal: interview 2026-09-28. Verifikasi: session log
`docs/PLANNED/sessions/2026-09-28_w0-governance-ts-migration.md` mengutip
"keputusan interview owner K1..K14" dan memakai K1-K10 dalam eksekusi W0.
Jejak ini konsisten, jadi blok ini dianggap sah.

| # | Keputusan | Diterapkan? |
| --- | --- | --- |
| K1 | 100% TS tanpa sisa, tanpa pengecualian `.mjs` | Ya — grep zona = 0 file JS ✅ |
| K2 | Ikut rekomendasi agent untuk urutan scope | Ya |
| K3 | Spec baru jadi roadmap induk, dokumen lama SUPERSEDED | Ya (W0) |
| K4 | Eksekusi otonom penuh, tanpa tanya per langkah | Ya |
| K5 | Extension: konversi ke TS source + build step MV3 | Ya — **dengan revisi** (lihat §K di bawah) |
| K6 | Config root semua ke TS | Ya (W8) |
| K7 | Semua entry `node` → `bun` | Ya (W6) |
| K9 | Tests ikut `.ts` penuh | Ya — **angka basi** (lihat C1) |
| K10 | Handoff marker hapus + arsipkan | Ya, **dengan modifikasi** (lihat A2) |
| K13 | `verify.sh` tambah tsc sekarang | Ya (W0, `verify.sh:19-22`) |
| K14 | Kedalaman tipe tiered | Ya |

### A1 — K5 ("build step MV3") sudah direvisi oleh owner, spec masih menyalin bentuk lama

K5 berbunyi "konversi ke TS source + build step MV3". Yang terjadi: **build step
dengan bundler**, karena spec §6 W8 mengarang `esbuild` bundle + folder output
`dist-extension/`. Owner menegur ini saat W8 berjalan (§16 "Koreksi W8").

Faktanya sekarang: **service worker MV3 boleh modul ES** (`"background":
{"type": "module"}`, Chrome ≥ 91). Aturan "background.js wajib klasik tanpa
import" adalah batasan warisan kita sendiri di `verify.sh`, bukan standar Chrome.
Karena itu `scripts/build-extension.ts` memakai esbuild dengan `bundle: false,
format: 'esm'` — transpile, bukan bundle.

Jadi K5 sendiri tidak salah; yang salah adalah §6 yang mengarang bentuk
implementasinya. Status: **K5 berlaku, §6 W8 dibatalkan oleh koreksi owner §16.**

### A2 — K10 ("hapus + arsipkan") dieksekusi berbeda dari kalimatnya

K10 bilang hapus marker. W0 tidak menghapus fisik; marker dibungkus komentar
`[SUPERSEDED 2026-09-28]` supaya sejarah tersimpan. Alasan tercatat di session log
W0: owner juga meminta dokumentasi workflow, jadi penyimpanan sejarah dipilih.
Status: **deviasi yang sah dan terdokumentasi**, bukan pelanggaran diam-diam.

## B. Keputusan agen yang duduk di tabel "Keputusan Interview (LOCKED)"

Tiga baris di §2 ditulis eksplisit "**Keputusan agent:**" — K8 (any policy),
K11 (cadence PR), K12 (anti-tabrakan). Penamaannya sudah jujur di dalam selnya.
Yang bermasalah hanya kata "LOCKED" di header tabel, yang menyiratkan
14 baris itu seragam milik owner.

Status ketiganya: **berlaku, asalkan tidak dibaca ulang sebagai perintah owner.**
Kalau suatu saat owner bilang "K8 harusnya error", itu bukan pelanggaran spec —
spec tidak pernah menyatakan itu sebagai keputusan owner.

## C. Fakta terukur — 4 angka sudah basi, 1 klaim salah

| # | Lokasi | Klaim | Kenyataan `main` sekarang |
| --- | --- | --- | --- |
| C1 | §2 K9 + §3.2 + §16 | test "169 file" (§2/§3.2) lalu "173 rename" (§16) | **174 file `.ts`** = 171 `*.test.ts` + 2 `*.harness.ts` + 1 `setup-bun.ts`. Angka 169 dan 173 keduanya salah. |
| C2 | §15 D2 | "W8 **WAJIB** menambah job: esbuild extension + zip + upload ke GitHub Release" | **TIDAK DIJALANKAN.** `grep -in "extension\|zip\|esbuild" .github/workflows/release.yml` = 0 hit. Job yang ada hanya `guard`/`verify`/`publish`. D2 adalah kewajiban yang ditandai WAJIB tapi tidak pernah terealisasi, dan tidak tercatat sebagai pengecualian di mana pun. |
| C3 | §5 | "Empat tsconfig (base, root payung, node, renderer) + sub-config extension" | **Enam**: `tsconfig.base.json`, `.json`, `.node.json`, `.renderer.json`, `.tests.json` (W7), `.extension.json` (W8). `tests.json` tidak pernah masuk §5. |
| C4 | §4.1 | pengecualian "serta satu file vendor `sidecar/node_modules/`" | Benar, tapi `.gitignore`-based; `extension/**/*.js` (artefak transpile) juga ada dan **tidak** disebut §4.1 — hanya dicatat di §16. |

### C5 — Klaim "AGENTS.md + ARCHITECTURE.md: setiap path diverifikasi ada" setengah benar

§16 DoD butir 7 menyatakan semua path di kedua dokumen sudah diverifikasi terhadap
`git ls-files`. Yang ditemukan:

- `AGENTS.md:54` → "schema v30" ✅ benar (terverifikasi: `db.ts` punya `db.version(30)`).
- `AGENTS.md:24` → masih **"schema version 22, 12 stores"** ❌ basi. Ini persis
  kategori yang §16 DoD butir 7 janjikan sudah dibersihkan.

Jadi butir 7 DoD **belum tuntas**, dan ini bukan interpretasi — `db.ts` jelas
memiliki `version(30)`.

## D. Karangan agen — tidak boleh dibaca sebagai standar

Blok berikut ditulis fully oleh agen dan tidak pernah dikonfirmasi owner:

| Blok | Isi | Why hearsay |
| --- | --- | --- |
| §5 | Arsitektur toolchain target, konvensi specifier per-zona | Turunan keputusan teknis agen |
| §6 | Wave plan W0..W9 | Rencana kerja agen. §6 W8 bahkan **salah** dan sudah dibatalkan owner |
| §7 | Urutan/dependency antar-wave | Derivasi §6 |
| §8 | Protokol eksekusi otonom (pre-flight, loop, halt condition) | Agen. Prinsipnya sehat, angka halt condition-nya (>200 error, 1 jam) karangan |
| §9 | Risk register (L/I/mitigasi) | Penilaian agen |
| §12 | Bukti wajib di session log | Agen |
| §15 | D1/D2/D3 hasil `plan-eng-review` | **Skill review, bukan owner.** D2 tidak dieksekusi (C2) |

Yang perlu terjadi: blok ini berguna sebagai rekaman eksekusi, tapi label
"spec" membuat downstream mengira ada jaminan. Addendum §16 sudah bergerak ke
arah yang benar — hanya belum berlaku retroaktif ke §6/§8.

## E. MarkahOLDER: instruksi yang sudah diberikan owner di luar spec

§16 baris pertama memuat arahan owner 2026-09-30, empat butir, masih berstatus
TODO/PLAN pascamigrasi:

1. **MCP pluggable** (stdio + Streamable HTTP) → PLAN ditulis & merged
   (`docs/PLANNED/2026-10-02_mcp-pluggable-stdio-http.md`, #122). sisi server = P3.
2. **Fix extension connect tanpa delay** → belum ada PLAN.
3. **Prioritas = infrastruktur agentic + self-improvement**, bukan tuning model cloud.
4. **Referensi mutlak**: Anthropic, OpenAI, hermes-agent, NVIDIA, Moonshot,
   Google Research, Muse Research, DeepSeek quantization.

Butir 4 inilah yang berselisih dengan §6 W8: saat spec mengarang
`esbuild bundle` tanpa cek dokumentasi Chrome, itu karena secara tidak sadar
spec dianggap sebagai sumber standar sendiri — persis yang lalu ditegur owner.

---

# YANG PERLU KONFIRMASI OWNER

Enam item. Semuanya **bukan** "apakah agent benar" — semuanya keputusan yang
milik owner, dan saya tidak akan mengubahnya sendiri.

| # | Item | Posisi agen | Kenapa harus owner |
| --- | --- | --- | --- |
| **O1** | **D2 tidak dieksekusi** — release.yml tidak punya job extension (zip + upload) | Sebaiknya **dibatalkan resmi**. Extension sudah transpile-only, dan zip Chrome Web Store butuh store key yang tidak ada di repo. Menjadikan ini "belum dikerjakan" adalah status yang lebih jujur. | Ini satu-satunya item §15 yang ditandai WAJIB lalu hilang tanpa jejak. Membatalkan kewajiban tetap adalah keputusan, bukan sekadar pembcaten. |
| **O2** | **K8 any policy** — ratchet baseline (2161/208/max 2369) menggantikan target `error` di zona kontrak | Ratchet diterima secara teknis. | Target awal owner = `error`. Ratchet adalah **penyesuaian**. Perlu dicatat eksplisit sebagai keputusan owner, bukan sekadar fakta yang tercatat di §16. |
| **O3** | **K10 deviasi** (marker dibungkus komentar, tidak dihapus fisik) | Diterima, alasannya kuat. | Deviasi dari kalimat literal owner. Perlu dicatat bahwa owner menyetujui bentuk ini, atau K10 ditulis ulang. |
| **O4** | **`AGENTS.md:24` masih "schema v22"** — DoD butir 7 belum tuntas | **Perbaiki sekarang.** Ini bug dokumentasi, bukan keputusan. | Bukan butuh konfirmasi, tapi butuh izin edit AGENTS.md di PR terpisah dari audit ini. |
| **O5** | **Angka test 169/173 → 174** | Perbaiki sekarang (fakta terukur). | Bukan keputusan. |
| **O6** | **Status blok §5-§9, §12, §15** | Tambahkan banner di awal: "rencana kerja agen, bukan standar". | Mengubah status epistemik dokumen yang owner sendiri tegur cara pakainya. Perlu izin owner karena menyentuh metadata tata kelola dokumen. |

## Yang TIDAK perlu konfirmasi (sudah jelas)

- Semua butir §A (K1-K7, K9, K13-K14) — ada jejak interview, dieksekusi konsisten.
- Nomor PR dan squash commit di §16 — terverifikasi terhadap `git log`.
- Kontrak beku §11 — masih berlaku, tidak ada PR yang melanggarnya.
- Klaim zero-JS di zona migrasi — terverifikasi `git ls-files`, termasuk `.cjs`.

## Rekomendasi urutan

1. **O4 + O5** sekarang — dua fakta terukur, tanpa risiko politis, satu PR docs
   kecil. Selesaikan janji DoD butir 7 yang belum tuntas.
2. **O1** — putuskan: batalkan D2 atau memang mau extension zip di release. Kalau
   batal, tulis alasannya di §15 supaya tidak muncul lagi sebagai kewajiban hantu.
3. **O2 + O3** — satu PR yang mencatat persetujuan owner untuk dua deviasi yang sudah
   terjadi dan berjalan baik.
4. **O6** — banner epistemik di spec, supaya §6/§8 tidak lagi dibaca
   sebagai standar di PR-PR berikutnya.