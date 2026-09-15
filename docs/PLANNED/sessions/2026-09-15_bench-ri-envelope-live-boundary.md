# Session 2026-09-15 — Bench RI envelope + live boundary (Antigravity eddd0cb0 continuation)

Branch: `feat/bench-ri-boundary` (1 commit di atas `main` `f797564`).
Asal: lanjutan thread Antigravity `eddd0cb0-5975-4681-bac0-dbf3ffa67ef7` —
tidak ada salinan lokal thread (`.antigravity/` absent); direkonstruksi dari
`docs/eval/*` untracked + `evaluation/bench/` stub-only + `tasks/plan.md`.

## Ringkasan

**Keywords:** benchmark arsitektur, architecture benchmark, RI protocol, recursive improvement, live boundary, batas eksekusi, run-local, stub baseline, failure taxonomy, taksonomi kegagalan, improvement record, effort wiring.

Sesi ini membangun penggaris, bukan upgrade kemampuan agent (skor live
pertama diperkirakan < stub — itu kebenaran pertama, bukan kemunduran).
Phase 1: branch + baseline stub direkam (11 tasks, 54.545%, avgSteps 2).
Phase 2: envelope RI (`FAILURE_TAXONOMY` 12 ID, `RI_CAPABILITY` task→RI-01..RI-05,
`makeImprovementRecord`) tanpa ubah shape report/task. Phase 3: boundary live
tipis di atas `runAbelinkAgent` + runner satu perintah. Phase 4: effort wiring
via `resolveTaskEffortSync`; guardrail probes (PII/resume) scoped-out.
`verify.sh` LOLOS.

## Audit Trail

`grep -rln "bench|boundary|evaluat|benchmark|RI-0" docs/PLANNED/ docs/` →
hits di `pr2-long-horizon.md`, `2026-09-11_pr2-long-horizon-phase-a.md`,
`2026-09-14_ri-verification-gate-patch.md` + lainnya. Semantic check: log
2026-09-14 = runtime verifier (RI-11/12/13, `objectiveVerifier.js` dkk) —
makna beda dengan patch ini (bench harness: kontrak + boundary + runner).
→ patch benar-benar baru, file baru layak.

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
|---|---|---|---|---|
| Blok RI menelan deklarasi `rubricDiff` saat edit | `evaluation/bench/contract.mjs` | `oldString` tidak menyertakan ulang header fungsi | Perbaiki via edit kedua; verifikasi `typeof rubricDiff === function` | ✅ |
| `run-local.mjs` compare path mati (baseline cuma summary) | `evaluation/bench/run-local.mjs` | `stub-baseline.json` menyimpan summary, bukan report | Rewrite: gate di level summary (delta ≥ 5 → exit 1) | ✅ |
| Stale `.git/index.lock` (2026-09-14 21:52) blokir commit | `.git/` | Proses git crash sesi sebelumnya | Verifikasi no live git process → hapus lock → commit | ✅ |

## Files Modified

| File | Perubahan |
|---|---|
| `evaluation/bench/contract.mjs` | +76: `FAILURE_TAXONOMY`, `RI_CAPABILITY`, `makeImprovementRecord` (append, shape lama utuh) |
| `evaluation/bench/boundary-abelink.mjs` | baru: `createAbelinkBoundary` (wrapper `runAbelinkAgent`, batch yield, scratch `os.tmpdir`, empty-response = failed) |
| `evaluation/bench/run-local.mjs` | baru: runner satu perintah (`--stub`, `--task=ID`, `--save`), stub gate, `makeImprovementRecord` per gagal |
| `evaluation/bench/stub-baseline.json` | baru: baseline stub 54.545% + note stub-vs-stub only |
| `evaluation/bench/README.md` | +4 baris: file baru + kontrak RI |
| `tests/bench-boundary-live.test.mjs` | baru: 6 test offline (compliance, stream, empty-fail, abort, unknown-ctx) |
| `package.json` | +2 script: `bench:local`, `bench:local-stub` |
| `docs/eval/*.md` + `orchestra-eval.txt` | commit (sebelumnya untracked); `.docx` dibuang (bloat biner) |

## Agent Learnings

- Edit `contract.mjs` dengan `oldString` satu baris fungsi = risiko menelan
  deklarasi; selalu sertakan header fungsi di kedua sisi edit.
- Baseline stub WAJIB dicatat maknanya (fake steps → completed): tanpa note,
  54.545% akan disalahbaca sebagai kualitas agent.
- Boundary live: batch yield cukup untuk kontrak async-iterable; streaming
  per-turn tidak dibutuhkan (adapter tidak expose cancel/stream).
- `runBenchmark` tanpa effortResolver pakai `effortHint` (null semua) —
  effort stamping butuh resolver eksplisit dari `resolveTaskEffortSync`.

## File Invariants

| File | Invariant |
|---|---|
| `evaluation/bench/contract.mjs` | Shape `makeReport`/task/rubric JANGAN diubah; RI hanya envelope |
| `evaluation/bench/stub-baseline.json` | Hanya untuk stub-vs-stub; live TIDAK BOLEH dibandingkan ke sini |
| `evaluation/bench/boundary-abelink.mjs` | Scratch HANYA di `os.tmpdir`; jangan tulis ke repo |
| `docs/eval/*.md` | Source of truth protokol; `.docx` jangan dikomit ulang |

## Verification Checklist

- [x] `bun test` bench: 61 pass, 0 fail (55 lama + 6 baru)
- [x] `bun evaluation/bench/run-local.mjs --stub`: delta 0.000 vs baseline
- [x] `bun run lint`: 0 errors (895 warnings pre-existing)
- [x] `bash scripts/verify.sh`: OK VERIFY LOLOS
- [ ] Live smoke 1 task (butuh provider: `ABELINK_BENCH_PROVIDER` + kredensial)
- [ ] Guardrail probes PII/resume (scoped-out, follow-up)

## Callback

Provider apa untuk live smoke pertama (`--task=io-01-read-modify-write`) —
murah (Groq `llama-3.1-8b-instant`) atau smart (Gemini)?
