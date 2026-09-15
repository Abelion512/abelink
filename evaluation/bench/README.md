# Architecture Benchmark — `evaluation/bench/`

Menilai perilaku sistem (planning, tool, memory, verifikasi, disiplin loop),
bukan kualitas teks akhir. Setiap run menghasilkan trajectory terstruktur yang
dinilai rubrik 0/1 deterministik.

## File

| File | Peran |
| --- | --- |
| `contract.mjs` | Skema trajectory + step + rubrik + laporan |
| `tasks.mjs` | Katalog probe: brain/logic/body/soul/planning/io |
| `capture.mjs` | Kontrak boundary + normalisasi raw step → trajectory |
| `boundary-spec.mjs` | Spesifikasi sisi ABELINK: `startRun`/`sendPrompt`/`endRun`/`abortRun` |
| `evaluator.mjs` | Rubrik deterministik (pure function) |
| `runner-stub.mjs` | Pipeline end-to-end via stub boundary (tanpa ABELINK nyata) |
| `boundary-abelink.mjs` | Boundary live: wrapper tipis `runAbelinkAgent` (sidecar RPC) → raw steps |
| `run-local.mjs` | Satu perintah: `bun evaluation/bench/run-local.mjs [--stub] [--task=ID] [--save]` |
| `stub-baseline.json` | Baseline stub (11 tasks, 54.545%): bandingkan stub-vs-stub saja |
| `contract.mjs` | + `FAILURE_TAXONOMY` (12 ID), `RI_CAPABILITY` (task→RI-01..RI-05), `makeImprovementRecord` |
| `runner.mjs` | Runner laporan |
| `compare.mjs` | Perbandingan antar run (regression gate) |

## Menjalankan

```bash
bun test tests/bench-contract.test.mjs tests/bench-capture.test.mjs
```

Pipeline smoke via stub boundary (tanpa UI, tanpa model):

```js
import { runStubBenchmark } from './evaluation/bench/runner-stub.mjs'
const report = await runStubBenchmark({})
console.log(report.summary)
```

Otomatisasi penuh menunggu boundary ABELINK nyata yang memenuhi
`boundary-spec.mjs`; verifikasi kepatuhan dengan `wrapBoundary()` /
`describeBoundary()` dari `runner-stub.mjs` / `capture.mjs`.
