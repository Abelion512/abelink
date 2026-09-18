# Session Log: Tahap 2 — Satu Pintu + Timer Penunggu

Tanggal: 2026-09-18 | Branch: `feat/capability-unified-execute` | Status: selesai, menunggu review/merge

## Keputusan
- executeCapability = satu pintu untuk connector + plugin + skill (policy + audit seragam).
- plugin:execute dipertahankan sebagai alias legacy (kontrak {success,data} utuh untuk toolDispatcher).
- Timer penunggu resmi: waitWithTimeout helper; perilaku wait_subagents identik, jalur kode menyatu.

## Berkas berubah
- `sidecar/main/capabilities/manager.mjs` +161 — cabang plugin/skill di executeCapability + executePluginAction + executeSkillRead (lazy import loader, tanpa cycle).
- `sidecar/engine/channels/services.mjs` +13/-1 — plugin:execute alias via manager.
- BARU `src/hooks/agent/plan/waitHelper.js` — waitWithTimeout({check, timeoutMs, intervalMs, signal, onTick}).
- `src/hooks/agent/plan/agentTools.js` ±42 — cabang wait_subagents pakai helper; buildWaitReport/getAgentCompleteness utuh.
- BARU `tests/capability-unified-execute.test.mjs` (8), `tests/waitHelper.test.mjs` (13+5 waitSubagents).

## Routing rules (plugin)
- actionId `<plugin>:<aksi>` (case/separator-insensitive) atau bare bila unik; 0 cocok → error + daftar kandidat; >1 → error ambiguitas.
- Disabled → CAPABILITY_POLICY_DENIED + audit policy-denied. Args string → {query}; objek diteruskan utuh.
- Skill: actionId = nama skill → isi SKILL.md mentah; tidak ada → error eksplisit. Audit request+result.

## Hasil verifikasi
- 7 file capability/wait: 65/65 hijau. Regresi (configCapabilities, builtinPlugins, toolCallCoverage, objectiveVerifier): 80/80.
- ESLint 6 file: 0 error 0 warning. Lazy-import loader terverifikasi (tanpa cycle).

## Batasan dikenal
- Rust APPROVAL_ACTIONS belum disentuh — gating exec plugin diputuskan Tahap 4.
- Validasi inputSchema di level handler belum ada (handler tak bertipe) — Tahap 4.
- Tanpa backoff/jitter pada polling — tambah bila terbukti chatty.

## Berikutnya
- Tahap 3: registry prompt seragam + kemasan paket + install-git ikut pintu baru.
- Tahap 4: token isolation + enkripsi + refresh otomatis + validasi input ketat + gating Rust.
