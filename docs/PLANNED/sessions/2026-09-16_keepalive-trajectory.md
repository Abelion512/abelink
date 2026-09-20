# Session 2026-09-16 — Extension keepalive + trajectory sessionId + overlay

## Keputusan

- Paket 1 dari peta scan 4-kelas (state volatil, identitas hilang, logging
  bypass, guard mati). Prompt recon 3-baris BATAL: smart-system via
  verify-gate + blocked-challenge (mekanisme, bukan koreografi prompt).
- Root cause putus: Chrome suspend SW idle; `running` memori reset,
  resume `setTimeout` mati. Fix: `wantConnected` persist + one-shot
  `chrome.alarms` + guard di tryAutoResume.
- Root cause 1/8 tool-calls: `activeConfig` buang sessionId/turn -> grup
  `agentic-xxx`. Fix: teruskan keduanya; hapus `!![t]`; observasi sintetis
  ikut file via `logSyntheticObservation`.
- PR #40 ke main, TANPA merge (stacked #37/#38/#39).

## Berkas berubah (PR #40, +89/-22)

- `extension/background.js`: wantConnected set/clear, alarms resume
  one-shot + handler, tryAutoResume guard + re-arm, overlay tebal
  (frame 6px/glow 0.9/blink 0.7, kursor 32px stroke putih,
  ripple 4px/60px/0.7s).
- `src/hooks/agent/plan/toolDispatcher.js`: sessionId+turn ke activeConfig.
- `src/api/tools/index.js`: hapus `!![toolName]`.
- `src/hooks/agent/useAbelinkPlan.js`: `logSyntheticObservation` +
  3 titik (repeat-cache, spiral-stop, circuit-open).
- `tests/browser-flavor.test.mjs`: pairing-guard ikut logika baru.
- `tests/toolCallCoverage.test.mjs`: unknown-tool ekspektasi false.

## Hasil verifikasi

- `bunx vitest run` full: 76 files, 860 tests passed.
- `bun run lint`: 0 errors, 927 warnings (= baseline; helper tanpa
  try/catch luar agar tidak nambah warning).
- `node --check extension/background.js` OK.
- Dev restart fresh: vite 200, bridge 401, jendela difokuskan.
- Verifikasi sisa (butuh aksi user): reload extension di Chrome, tutup
  popup 6+ mnt -> `browser:status` tetap connected; jalankan sesi browser
  -> `harness:diagnose --session` tool-calls == observations.

## Batasan dikenal

- Merge berurutan #37->#38->#39->#40 + rebase tiap lapis.
- Paket 2 (identitas subagent/os/main_chat/write-file) + Paket 3
  (logging bypass sisa, bug || 0.5, konstanta) = antrean TASK.md.
- Extension wajib reload manual di Chrome setelah update.
- CI cloud merah = billing; verifikasi lokal penuh.

## Ponytail debt ledger (sesi ini)

- Overlay literal di tempat (tanpa const config/CSS). Satukan bila ganti
  nilai >2x lagi.
- `wantConnected` hanya di storage.session (hilang saat browser tutup =
  benar: niat sesi, bukan preferensi). `pairing` tetap di local.
- `logSyntheticObservation` best-effort tanpa throw; kegagalan tulis log
  tak terdeteksi (pola file ini: teardown catch kosong juga sama).
- `checkTools` tanpa `!![t]`: tool asing kini lewat choke (dicatat benar)
  lalu jalur plugin fallback tetap jalan (urutan routing tak berubah).
