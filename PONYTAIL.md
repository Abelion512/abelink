# PONYTAIL — Ledger Debt / Gain / Keputusan Pragmatis

## Apa ini
`ponytail:` adalah marker inline di kode untuk **keputusan pragmatis yang sadar** — dipilih sederhana sekarang, dengan kondisi eksplisit kapan harus dinaikkan. Bukan TODO biasa: setiap marker punya kriteria naik, dan ledger ini + test sinkronisasi memastikan tidak ada yang hilang atau basi.

- **DEBT** = kesederhanaan yang dipilih + kriteria kapan harus diganti (dari marker `ponytail:` di kode).
- **GAIN** = perbaikan terukur yang sudah didapat (angka, bukan perasaan).
- Aturan: marker tanpa entri ledger = test merah; entri tanpa marker = hapus entri.

## DEBT (dari marker `ponytail:` di kode — sinkron dengan tests/ponytailLedger.test.mjs)

| Ref | Lokasi | Keputusan | Kriteria naik |
|---|---|---|---|
| P-01 | `src/api/ragPipeline.ts` | API `generateStorableVector` (bukan `generateVector`) untuk Lite Mode | Bila Lite Mode perlu vektor hash berbeda |
| P-02 | `src/api/db.ts` | Threshold near-duplicate sengaja tinggi | Bila user melaporkan memori mirip tak terdeteksi |
| P-03 | `src/api/ai/planning.ts` | Ambang prompt 40 char / digest 120 char | Bila jawaban pendek ikut lolos audit |
| P-04 | `src/api/ai/playbooks.js` | FIFO eviction 50 entri (bukan LRU) | Bila ada data hit-rate yang bilang LRU lebih baik |
| P-05 | `src/api/ai/core.ts` | Satu skema kunci recent-cache untuk custom+lm-studio | Bila dua provider butuh skema kunci berbeda |
| P-06 | `src/api/ai/agentDecision.js` | Shared predicate, ceiling 1 challenge | Bila model terus gagal challenge → tambah retry terukur |
| P-07 | `sidecar/main/services/gemini-web.js` | Rantai kata kunci tunggal (tanpa map per versi) | Bila versi model baru gagal resolve |
| P-08 | `sidecar/main/browser/native-host.mjs` | Python literals wajib double-quote (batasan -c) | Bila migrasi dari `python -c` |
| P-09 | `bin/abelink.mjs` + `bin/abelink-tui.mjs` | auto-mkdir workspace (cermin TUI) | Bila tool mulai validasi workspace sendiri |
| P-10 | `tests/cli-tui-v2.test.mjs` | spawn + stdin.end (execFile `input:` hang di env ini) | Bila execFile bekerja di env CI baru |
| P-11 | `scripts/bump-version.mjs` + `release-version.mjs` | regex footer, bukan parser Conventional-Commits penuh | Bila kasus commit nyata yang salah klasifikasi |
| P-12 | `scripts/release-helper.mjs` | delete+recreate PR data (bukan merge) | Bila ada state rilis yang layak di-merge |
| P-13 | `evaluation/bench/boundary-abelink.mjs` | clamp trace 4k (di bawah bridge clamp 20k) | Bila trace pendek dibutuhkan penuh |
| P-14 | `evaluation/effort-fixtures.mjs` | Loop topologis sekuensial (batch terbatas) | Bila eval node punya async I/O nyata |
| P-15 | `src/assets/main.css` | Keyframes hello-draw sederhana (pengganti motion pathLength, tanpa dep) | Bila animasi boot butuh path drawing asli |
| P-16 | `src/components/Chat/CodeBlock.jsx` | pre/code + CSS (react-syntax-highlighter dep dihapus) | Bila highlight baris-per-baris dibutuhkan di jalur chat |
| P-17 | `src/components/WhatNew.jsx` | Satu komponen timeline tanpa lib baru | Bila kebutuhan visualisasi rilis melampaui chip+search |
| P-18 | `src/components/core/AppleHello.jsx` + `ElasticSlider.jsx` | CSS draw/elastic (motion dep dihapus) | Bila animasi butuh physics asli |
| P-19 | `src/components/core/JarvisOrb.jsx` | Wrapper tipis ke OrbVisualizer CSS (three.js dep dihapus) | Bila orb butuh render 3D nyata |
| P-20 | `src/components/core/MemoryVisualizer.jsx` | LiteGraphView satu-satunya (force-graph dep dihapus) | Bila navigasi memori butuh graph penuh |
| P-21 | `src/pages/AbelinkHome.jsx` | Satu guard home-only untuk semua fixed chrome | Bila chrome dipakai di halaman lain |

## GAIN (perbaikan terukur, dari log sesi 2026-09-27)

| Ref | Apa | Bukti terukur |
|---|---|---|
| G-01 | CI bun 1.4.2 (lockfile v2 konsisten lokal/CI) | install --frozen-lockfile CI hijau; sebelumnya 3 job gagal "Unknown lockfile version" |
| G-02 | Perf-gate baseline refresh | gate LOLOS; parser-valid -50% (0.96→0.48ms) |
| G-03 | Rilis manual + kadens mingguan | Rantai PR alpha (#44→#67→#69→#71) berhenti; uji manual = tepat 1 PR |
| G-04 | Startup sidecar A/B/A/B | Netral terverifikasi ~390-430ms; klaim lazy-load TIDAK di-relicate |
| G-05 | Anti-flake timeout (5 test) | Suite penuh hijau konsisten; fail tetap fail, hanya margin |
| G-06 | Audit arsitektur evidence-JSONL | 19 record; taskRuntime-canonical FALSIFIED; folder-rewrite NOT_APPLICABLE |
| G-07 | Promptfoo adapter + matrix generator | 30 fixture PR46 → JSONL Promptfoo deterministik; 8 test baru |
| G-08 | Aset brand bersih | Semua PNG target dari 1 sumber; istilah era warisan 0 di pohon |

## Kaidah
1. Keputusan pragmatis harus punya kriteria naik — tanpa itu, itu bukan ponytail, itu teknis utang yang disembunyikan.
2. Naikkan satu ponytail = PR kecil + update ledger + gain jujur bila ada.
3. Ledger + marker harus sinkron (test yang menjaga).
