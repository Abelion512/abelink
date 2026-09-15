# Session: Engine Task Runtime Boundary Extraction (2026-09-15)

Boundary extraction, bukan rewrite. `taskStore.js` tetap otoritatif.

## Invariant (mengikat)

```text
taskRuntime.js → taskStore.js / taskExecutor.js → persistensi + verifikasi lama
```

`taskRuntime.js` = kebijakan level runtime-boundary saja (adapter injection,
event fan-out, derived `getResult`). Dilarang menjadi implementasi lifecycle
kedua. Bila butuh semantik transisi baru, ubah `taskStore.js` — bukan facade.

## Berkas berubah

- `src/api/engine/taskRuntime.js` (baru): facade isomorfik delegate-only
  (create/get/list/start/checkpoint/pause/resume/cancel/getResult +
  `configureTaskRuntime`/`pauseStaleTasks`/`deleteTask`/`buildStepCheckpoint`).
- `sidecar/engine/channels/tasks.mjs` (baru): `tasks:*` → facade + fan-out
  event via `emit()` registry.
- `sidecar/engine.mjs`: import channel tasks.
- `src/hooks/agent/useAbelinkPlan.js`: durable calls lewat facade
  (create/start-step/checkpoint/transition/resume); `buildStepCheckpoint`
  async (lazy import) — perilaku sama.
- `src/App.jsx`: startup `pauseStaleAgentTasks` → `pauseStaleTasks`.
- `tests/taskRuntime.test.mjs` (baru): lifecycle, result, failed, unknown,
  restart, injected store + events, channel round-trip, headless import.
- `scripts/headless-task-runtime.mjs` (baru): bukti lifecycle penuh di Bun
  tanpa window/React/Tauri lewat store ASLI (Dexie + fake-indexeddb, shim yang
  sama dipakai vitest). Tanpa adapter injeksi: ini jalur default yang kelak
  dipakai CLI sebelum headless store permanen mendarat.
- `docs/ARCHITECTURE.md` §9: diagram + aturan boundary.

## Headless status

`bun scripts/headless-task-runtime.mjs` LOLOS: create→start→checkpoint→
pause→resume→cancel→getResult tanpa window/React/Tauri lewat store ASLI.
Tanpa IndexedDB dan tanpa shim → facade error eksplisit (fail-fast), bukan
sukses palsu. In-memory store buatan tangan DITOLAK saat ponytail review:
duplikasi semantik store; shim yang sama dengan vitest lebih jujur.

## Batasan dikenal

1. Produksi Bun tanpa shim IndexedDB: facade fail-fast eksplisit (disengaja).
   Headless store permanen tetap langkah berikutnya; injeksi darurat via
   `configureTaskRuntime({ store })`.
2. Cancel kooperatif: `cancelled` persist + event; operasi native in-flight
   tidak di-kill (tanpa abort propagation; timeout bridge 300s).
3. `task.waiting_user` / `task.approval_required` belum di-emit (tanpa stream
   palsu sebelum wiring dispatcher).
4. `getResult().text` = gabungan `outputSummary` step completed yang tersimpan
   di Dexie (bukan rekontruksi chat); artifact file tetap dibaca via tool
   read-file seperti hari ini.

## Verifikasi

- `bunx vitest run`: 74 files / 841 tests LOLOS (termasuk `durableResume` lama).
- `bun evaluation/smoke.mjs`: LOLOS.
- `bun run lint`: 0 errors (warnings pre-existing; file baru 0 warnings).
- `bun run sync-version --check`: sinkron 1.1.0-alpha.5.
- `cargo check --manifest-path src-tauri/Cargo.toml`: OK.

## Langkah aman berikutnya (di luar scope ini)

1. Headless store permanen (pengganti Dexie untuk Bun/CLI) — desain sendiri.
2. Wire `requestApproval`/`requestUserInput` dispatcher → event
   `approval_required`/`waiting_user` nyata.
3. CLI consume `tasks:*` — setelah (1).
