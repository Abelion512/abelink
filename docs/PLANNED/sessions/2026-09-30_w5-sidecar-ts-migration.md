# Session Log — W5: Sidecar Core ke TypeScript (PR #115)

Tanggal: 2026-09-30 | Branch: `refactor/ts-w5-sidecar` (3 commit: `33477bc0`, `04a40c36`, `9909a041`) | Merge squash: `651774dc`

## Keputusan

1. **Tiga commit bertingkat** alih-alih satu commit monolitik: W5-1 infra leaf (11 file, dependensi tanpa import internal) → W5-2 capabilities+google (18 file) → W5-3 core (20 file). Tiap commit wajib lolos gate penuh, jadi bila W5-3 gagal lama, W5-1/W5-2 tetap aman di branch.
2. **Codemod mekanis dulu, manual untuk sisanya.** `/tmp/w5-fix-codemod.py` menutup TS7006/TS7031/TS7005/TS7034 via posisi tsc (bottom-up): 895 → 393 error. Bug ditemukan & dipulihkan: guard `re.match(r'\s*=', rest)` ikut match `===` → menyuntik `x: any === y` (server.ts, pc-agent.ts 3 titik, telegram-service.ts). Jika dipakai ulang, ganti guard ke `r'\s*=(?!=)'`.
3. **Electron di-decouple dari pc-agent**, bukan dihapus: overlay window kini dynamic import via specifier variabel (`const electronSpecifier = 'electron'`) sehingga tsc tidak resolve modul yang tak dipasang di sidecar, dan runtime bun jatuh ke fallback silent. `showPCOverlay` jadi async; 8 call site memakai `void showPCOverlay()` (fire-and-forget, semantik lama dipertahankan).
4. **`fetchAI` dianotasi eksplisit** `Promise<{content, reasoning}>` + tipe `StreamTokenEvent` — kontrak return yang selama ini implisit kini dikunci; seluruh jalur fallback (gemini-web → custom → local) diverifikasi compiler tetap konsisten.
5. **Zona konvensi specifier dipertahankan:** sidecar/cli/bin = `.ts` eksplisit; renderer `src/` = extensionless. Pengecualian sengaja: `browserTools.ts` masih impor `extension/browser-observation.mjs` (extension dikonversi W8; protokol bridge tidak disentuh).
6. **Referensi basi `.js` di ikuti rename** (ditemukan oleh test tripwire, bukan manual): `selfModel.ts` (4 sumber), `dormantPcAutomation.test.mjs` (osTools.ts), `PONYTAIL.md` P-07/P-08, `headlessSecurity.ts`, `plugin-loader` connections specifier. Ini bukti tripwire bekerja: vitest gagal dulu, baru fix.

## Berkas berubah (W5-3, 70 file)

- Rename 20: `sidecar/main/{ai-bridge,node-tools,pc-agent}.js`, `browser/{bridge-core,server,launcher,native-host,nav-query}.mjs`, `tools/{_shared,fsTools,shellTools,browserTools,osTools,googleTools,commsTools,routerSearch,extract-query}.mjs`, `telegram/{telegram-service,gateway}.mjs`, `plugins/plugin-loader.mjs` → `.ts`
- Importer: engine channels (ai, browser, media, music, os, services, telegram), capabilities (shell-tool, browser-extension), bin, cli, scripts, tests
- Tipe baru: `BridgeSession`/`EnsureUpOptions`/`ReadDomDeps` (browserTools), `StreamTokenEvent` (ai-bridge), launcher option interfaces (deps injection untuk test tetap), gateway opts `Record<string, any>`

## Hasil verifikasi (gate W5-3, commit terakhir)

| Gate | Hasil |
| --- | --- |
| `tsc --noEmit` (root) | exit 0 |
| `tsc --noEmit -p tsconfig.node.json` | exit 0 (dari 892 error) |
| `tsc --noEmit -p tsconfig.renderer.json` | exit 0 |
| `bun run lint` | 0 error / 599 warning `no-explicit-any` (zona kontrak, recorded W9) |
| `bunx vitest run` | **1836 pass / 16 skip** (baseline terjaga) |
| `bun run build` | OK |
| `bun evaluation/smoke.mjs` | OK |
| `timeout 20 bun sidecar/engine.ts` | engine:ready = 1 (86 aksi) |
| CI PR #115 | 6/6 hijau (frontend+build, rust, benchmark smoke, gitleaks, socket x2) |

## Batasan dikenal

1. **599 warning `no-explicit-any`** menumpuk di zona kontrak (sidecar/cli/renderer-agent). Murni recorded, tidak menggagalkan lint. Eskalasi kebijakan any (strict any → unknown bertahap) = agenda W9, bukan wave ini — mengubahnya sekarang berisiko melanggar kontrak wire tanpa pengukuran.
2. **`ensureExtensionUp.lastReason`** ditipe sebagai properti fungsi (intersection type) — pola state-pada-fungsi warisan dipertahankan demi parity test; bisa dinaikkan jadi module-level var saat refactor browser bridge.
3. **Extension `.mjs` belum dikonversi** — import boundary di browserTools sengaja .mjs; W8 yang menyelesaikan.
4. **`import.meta.dir`** (bun) tetap butuh cast `(import.meta as any).dir` — tsc tidak kenal; di-record sebagai pola, bukan di-fix per titik.

## Arahan owner (di-PLAN, bukan eksekusi sesi ini)

1. MCP pluggable: lepas-pasang, transport stdio + Streamable HTTP → TODO/PLAN (kode `mcp-client.ts` saat ini statis).
2. Fix extension connect tanpa delay connection → PLAN setelah migrasi.
3. Prioritas jangka panjang: infrastruktur agentic + self-improvement system ("tangan kaki AI"), bukan tuning model cloud.
4. Referensi mutlak bila tanpa wawancara: amati-tiru-modifikasi Anthropic, OpenAI, hermes-agent, NVIDIA, Moonshot Research, Google Research, Muse Research, DeepSeek quantization.

## Langkah berikutnya

W6: scripts/evaluation/bin → .ts + K7 (semua entry node→bun). Lalu W7 tests, W8 configs+extension, W9 final sweep + eskalasi any-policy + laporan 5W1H.
