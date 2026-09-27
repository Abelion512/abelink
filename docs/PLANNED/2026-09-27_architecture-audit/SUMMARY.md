# Audit Arsitektur Abelink — Ringkasan (2026-09-27, rev 32f2816)

Audit read-only sesuai framework evidence-driven. Sumber kebenaran: `evidence.jsonl`
(19 record, satu schema universal). File ini HANYA rendering human-readable.

## A. Observed Architecture (fakta terverifikasi)
- 7 entrypoint nyata: CLI, TUI (v1+v2), desktop renderer, sidecar, bench adapter, cron (E-001).
- Headless (CLI+TUI) memakai `runAgentLoop` via `cli/core/engine-session.mjs` (E-002, E-009).
- GUI memakai loop sendiri (`useAbelinkPlan` -> `getNextAction`) (E-003).
- Paritas kedua loop dikunci ADR-001 lewat 4 gerbang kontrak bersama + test (E-004).
- `src/api/engine/taskRuntime.js` ada dan dipakai renderer (E-005), TIDAK oleh CLI/bench (E-006).
- Satu otoritas persistensi (Dexie/taskStore); CLI memakainya via fake-indexeddb (E-007).
- Tiga batas proses berkontrak: Tauri invoke, node_invoke stdio, bench JSON-lines RPC (E-008).
- Evaluation = konsumen murni (dua adapter, nol runtime) (E-010).
- Keamanan batas renderer->OS dipegang Rust (fs guard + approval native) (E-011).
- "Gateway" yang ada hanya domain-spesifik Telegram (E-012); tidak ada gateway umum (E-013).

## B. Architectural Inferences
- I-001: Canonical execution semantics = pasangan loop + 4 gerbang kontrak bersama,
  bukan satu modul tunggal.
- I-002: Folder eksisting sudah mengexpress batas nyata (api/cli/sidecar/evaluation).

## C. Current Architectural Problems (berbasis bukti)
- C-001: Hipotesis "taskRuntime = canonical runtime" TERFALSIFIKASI — perannya GUI-side.
- C-002: State "bersama" antara CLI dan GUI adalah shared-code, bukan shared-runtime:
  dua instance IndexedDB berbeda (fake-indexeddb di CLI). Kejujuran batas perlu
  keputusan produk.

## E. Klasifikasi Referensi (Hermes/ATM)
| Prinsip | Klasifikasi | Bukti |
|---|---|---|
| One canonical runtime, many surfaces | ADAPT (sudah jalan via gerbang kontrak, bentuk berbeda) | E-002/E-004/E-009 |
| Gateway service boundary umum | NOT_APPLICABLE saat ini (prasyarat: kebutuhan remote/multi-klien) | E-012/E-013/U-001 |
| Web/dashboard boundary | NOT_APPLICABLE (tidak ada requirement) | E-001 |
| Evaluation sebagai konsumen runtime | ADOPT (sudah terpenuhi, dua adapter) | E-010 |
| Desktop/backend terpisah | ADAPT (renderer + Rust shell + sidecar sudah terpisah proses) | E-008/E-011 |

## F-G. Proposed Boundary Model
Tidak ada perubahan struktur yang direkomendasikan. Struktur eksisting
(src/api | cli | sidecar | evaluation | src-tauri) SUDAH memetakan:
runtime-domain / surface-headless / proses-integrasi / konsumen / native-shell.

## H. Migration Priorities
- JANGAN: migrasi folder ala Hermes (D-001 NOT_APPLICABLE).
- INVESTIGATE: state lintas proses CLI<->GUI (D-002) — dua opsi jelas
  (sidecar sebagai pemilik store via RPC ATAU dua instance + kontrak sinkronisasi),
  dipicu kebutuhan produk, bukan estetika folder.
- Pertahankan: ADR-001 + test paritas sebagai pengunci semantik eksekusi.

## I. Confidence / Unknowns
- U-001: Kebutuhan gateway umum belum ditetapkan (butuh keputusan produk remote/multi-klien).
- Scope audit: kode statis + docs; tidak ada tracing runtime panjang.

## Coverage
- OBSERVED: 13 · INFERRED: 2 · CONTRADICTION: 2 · UNKNOWN: 1 · DECISION: 2
- Confidence: HIGH 16 · MEDIUM 3 · LOW 0
- Kecocokan jumlah: `tests/architectureAudit.test.mjs` memvalidasi JSONL
  terhadap schema + jumlah di atas.
