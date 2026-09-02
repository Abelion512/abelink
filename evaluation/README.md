# MarkBench — Harness Evaluasi Mark Linux

Harness evaluasi untuk mengukur performa agent Mark secara terukur, auditabel, dan
bebas metrik fabrikasi. Terinspirasi metodologi rilisan model frontier terbaru
(mis. tech blog Kimi K3): evaluasi berbasis **agentic harness** nyata, **verifier
deterministik**, **multi-run averaging**, dan **anti-cheat validator** — bukan
angka simulasi.

## Komponen

| File | Peran |
| --- | --- |
| `mark-adapter.mjs` | Adapter agent: satu child sidecar persisten per run, RPC JSON-lines ter-multipleks per id via `ai:fetch` + `native-tool:execute`. Cleanup dijamin (`SIGTERM` → `SIGKILL` 5s). Durasi wall-clock nyata dicatat di trajectory. |
| `terminal-bench.mjs` | Registry task Terminal-Bench-style. Setiap task punya `prompt` + `verifier` — predikat deterministik yang benar-benar dieksekusi terhadap respons. |
| `deepeval-runner.mjs` | Metrik sekunder opsional (GEval + TaskCompleteness). Dynamic-import; jika paket `deepeval` tidak terpasang atau API key tidak ada, degrade gracefully dan verdict official tetap dipakai. |
| `smoke.mjs` | Gate CI tanpa network: registry task, verifier PASS/FAIL case, parser tool-call quote-aware. |

## Menjalankan

```bash
bun run benchmark:adapter    # self-test adapter (butuh provider AI nyata)
bun run benchmark:echo       # task tb-echo-01 end-to-end (butuh provider AI nyata)
bun run benchmark:deepeval   # task + metrik DeepEval (butuh paket deepeval + API key)
bun evaluation/smoke.mjs     # smoke test tanpa network (dipakai CI)
```

Runner butuh salah satu provider AI yang dikonfigurasi di Mark (gemini-web,
LM Studio lokal, atau endpoint OpenAI-compatible). Tanpa provider, smoke test
tetap bisa jalan karena tidak memanggil LLM.

## Prinsip (anti-fabrikasi)

1. **Metrik nyata atau `null`.** Durasi diukur wall-clock (`startedAt`/`finishedAt`
   di trajectory). Token usage dilaporkan `null` dengan flag `estimated: false`
   sampai provider menyediakan usage asli — tidak ada formula `steps * 1000`.
2. **Verifier deterministik dan dieksekusi.** Predikat JS eksplisit per task,
   diuji PASS/FAIL-nya di smoke CI. Tidak ada eval_script yang ditulis tapi
   tidak pernah dijalankan.
3. **Trajektori lengkap.** Setiap langkah LLM dan tool call dicatat di `stepLog`
   untuk audit manual.

## Roadmap (mengikuti pola benchmark frontier)

- [ ] **Anti-cheat validator** — deteksi respons hard-coded yang kebetulan cocok
      dengan expected ( variasi prompt / sentinel acak per run).
- [ ] **Multi-run averaging** — jalankan tiap task 3x, laporkan mean + pass-rate,
      bukan satu-shot (praktik standar Terminal-Bench 2.1 / DeepSWE).
- [ ] **Task suite lebih berat** — multi-tool, file CRUD, shell, context-length,
      memory — masing-masing dengan verifier deterministik + grader parsial.
- [ ] **Laporan JSON berversi** (`schemaVersion: 1`) per run + perbandingan
      antar-commit (regression gate: skor task tidak boleh turun > X%).
- [ ] **Dashboard renderer** untuk hasil run + notifikasi Telegram yang sudah
      disiapkan di sidecar.
