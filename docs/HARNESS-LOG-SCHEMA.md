# Harness Log Schema v1 (untuk agent & manusia)

v1.1 (deepseek-aligned): + `seq` monotonik (bertahan reload), framing
`turn-start`/`turn-end` (start tiap iterasi; start-tanpa-end = interupsi),
`tokensEst` jujur-estimasi (divisor chars/2.5, sama dengan core.js — BUKAN
usage provider), baris header di artefak export.

Satu kontrak untuk semua trace Abelink: buffer UI (`trajectory.js`),
JSONL Rust (`harness_append`), dan artefak export. Dipetakan dari standar
publik agar tidak menjadi format bikinan sendiri:

- **AgentGuide `trace-schema.json`** (JSON Schema draft 2020-12): required
  `run_id, step_id, timestamp, task, action{tool_call|final_answer|ask_human|reflection},
  observation{ok, data_summary, error, retryable}, metrics, artifacts`.
- **OWASP AOS**: hierarki `session → turnId → stepId` (kami: `sessionId → turn → stepId`).
- **ATSC / OpenTelemetry**: kolom pemetaan di bawah = future (exporter OTel
  eksplisit DITUNDA — tanpa dependensi baru).

## Envelope (wajib di setiap event)

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `v` | int | ya | `1` |
| `ts` | string | ya | RFC3339 UTC (`new Date().toISOString()` renderer / `rfc3339` Rust) |
| `kind` | enum | ya | `reasoning \| tool-call \| observation \| answer \| step \| sub-agent \| session` |
| `id` | string | ya (UI) | unik per entri (`<kind>-<ts>-<rand>`) |
| `seq` | int | ya (v1.1) | monotonik menaik per buffer, bertahan reload |
| `sessionId` | int/string/null | anjuran | sesi chat (`1` = utama); null bila tak tersedia |
| `turn` | int/null | anjuran | indeks langkah loop (`stepCount`); null bila tak tersedia |
| `stepId` | string/null | opsional | sub-langkah / batch index |

`validateHarnessEvent()` di `src/api/trajectory.js` menegakkan `v/kind/ts`;
`sessionId/turn` boleh null (jujur daripada palsu).

## Kinds → kolom standar

| kind | Body | AgentGuide | ATSC |
|---|---|---|---|
| `reasoning` | `prompt≤2000, model, tokensEst(+method), thought, task_status, objective` | thought/reasoning | `thought` |
| `turn-start` | `turn` | turn/start | turn/start |
| `turn-end` | `turn, outcome, reason` | turn/end | turn/end |
| `tool-call` | `tool, args≤1000, result≤2000, success, duration` | action=`tool_call` + observation | `tool.*` |
| `observation` | `observation≤3000, tool` (teks `[OBSERVATION]` apa adanya) | observation | `tool_results` |
| `answer` | `answer≤4000, outcome, verification, objectiveKind` | action=`final_answer` | `agent_output` |
| `step` | `step, total, description, status` | plan.steps | `plan.*` |
| `sub-agent` | `name, parentAgentId` | handoff | multi-agent |
| `session` | (dicadangkan) | run | `agent.run` |

`ask_human` AgentGuide = `browser-ask`/`ask-choice` kami (tool-call biasa +
`needs_user` di outcome answer — tidak perlu kind khusus).

## Caps (batas jujur, bukan sampling diam-diam)

UI buffer: seperti tabel di atas (dipotong di penulis, bukan di render).
Rust: 256K/baris, rotasi 50MB/kind/hari. Export: utuh apa adanya.

## Lokasi & artefak

- UI: localStorage `abelink:trajectory-buffer` (500 entri, survive reload).
- File: `~/.local/share/abelink/harness/<YYYY-MM-DD>/<kind>.jsonl`
  (tiap baris: `{"ts","kind","line"}` dengan `line` = JSON string envelope).
  Kind file: `reasoning`, `tool-calls` (termasuk `resultSummary≤2000`),
  `observations`, `answers`, `bench-*`. Reasoning membawa `emptyThought:true`
  bila parse fallback (jejak tak hilang sunyi).
- Portabel: `bun run harness:export --session <id> [--date YYYY-MM-DD] [--kinds a,b] [--out file]`
  → satu JSONL terurut-ts. Baris pertama SELALU header
  `{v:1, type:'header', schema:'harness-log/v1', session, date, count, exportedAt}`,
  lalu event. File inilah yang ditempel ke agent untuk diagnosis.
