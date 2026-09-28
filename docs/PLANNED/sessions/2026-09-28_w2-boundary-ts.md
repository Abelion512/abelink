# Session 2026-09-28 — W2: boundary src/api -> TS (W2-1..W2-7b, berjalan)

Mode: build otonom penuh (owner: "execute aja semua, lapor hasil kerja").
Branch per-PR (squash ke main): W2-1 #93, W2-2 #94, W2-3 #96, W2-4 #97,
W2-5 #99, W2-6 #100, W2-7a #101, W2-7b #102.

## Apa & kenapa

Fase 2 spec `js-to-ts-spec.md`: seluruh boundary `src/api` dikonversi ke
TypeScript murni dengan disiplin parity-first: `git mv` + anotasi tipe,
logika runtime eksak. PR W2-1 juga mengirim `tsconfig.renderer.json`
(B-20, digabung agar tidak ada config kosong TS18003) dan
`typecheck:renderer` masuk `bun run typecheck` + CI.

## Yang sudah dikonversi (8 PR)

| PR | Berkas | Catatan kontrak |
| --- | --- | --- |
| #93 W2-1 | `tauri-bridge.ts` (709 brs) + tsconfig.renderer.json | `Window['api']` augmentasi via `typeof api`; guard types:[] tetap |
| #94 W2-2 | `db.ts` (1.228 brs) | Dexie schema v30 FROZEN; interface baris semua store |
| #96 W2-3 | `headlessCli.ts` + `agentRunner.ts` | Kontrak AgentOptions/Environment/RunResult terkunci tipe |
| #97 W2-4 | core, providerRegistry, archPolicy, benchArch, circuitBreaker, providerDetect, fetchError | Kontrak fetchAI wire frame; vite client types utk import.meta.env |
| #99 W2-5 | `planning.ts` (912 brs) | B-11: prompt string DIKUNCI; hanya anotasi tipe |
| #100 W2-6 | contextCompactor, memoryGroomer, sessionCompactor | CompactionResult + invariant coverage tetap |
| #101 W2-7a | vectorCore, vectorLoader, vectorMemory, embedding.worker, whisperWorker | new URL worker .ts; vite build terverifikasi |
| #102 W2-7b | oramaStore (877 brs), ragPipeline, turnPairMigrator | OramaIndex cast di boundary (vector[384] vs generics lib) |

## Pola teknis berulang (catatan utk W2-8+)

1. **Augmentasi `Window.api` tidak terlihat lintas program**: modul yang
   diimpor test node-zone membaca `window.api` via cast lokal
   `{ api?: ... }`, bukan augmentasi dari tauri-bridge.ts.
2. **CFA reset di try/catch**: hasil `await` dalam try yang di-assign ke
   `let` lama ter-infer `never[]` — solusi: anotasi tipe eksplisit di
   deklarasi variabel.
3. **JSDoc `@param {object}` sempit** dari modul tetangga yang belum
   dikonversi → cast di call-site ( Parameters<typeof fn>[n] ).
4. **Ponytail ledger**: rename file ber-marker WAJIB update PONYTAIL.md
   (P-01, P-03, P-05 sudah; test sinkronisasi memaksa).
5. **Test yang membaca source file via path** (dormantPcAutomation)
   ikut diupdate ke `.ts`.
6. **Template string schema Orama** (`vector[384]`) tidak cocok generics
   ketat → cast `Parameters<typeof search>[0..1]` di boundary.

## Verifikasi per PR (semua hijau)

- `bunx tsc --noEmit` (payung) + `-p tsconfig.node.json` + `-p
  tsconfig.renderer.json` = 0 error.
- `bun run lint` exit 0 (2 warning ponytail terdaftar).
- `bunx vitest run` = 1810 pass / 16 skip (baseline tetap).
- `bun run build` (vite) sukses — termasuk transform worker .ts.
- CI GitHub: 6/6 pass tiap PR; merge squash sekuensial + rebase
  bertumpuk (patch-id auto-skip).

## Sisa W2 (belum dikonversi)

- `src/api/*.js` root: 18 file (appIdentity, choiceBus, groq, harness*,
  locale, localWhisper, mic, scraping, selfModel, semverLite,
  skillsCache, sttGuard, sttRouter, taskExecutor, taskStore,
  trajectory, workspaceRag).
- `src/api/ai/*.js`: 28 file (agentDecision, awareness, effortSystem,
  objectiveVerifier, persona, tools, dll).
- Rencana: W2-8 = penutup sisa cluster per-affinity, termasuk
  cross-zone `scripts/semver-lite.mjs`.

## Batasan dikenal

- `tsconfig.node.json` memakai lib DOM (W2-2) karena test node-zone
  mengimpor modul renderer — guard boundary sesungguhnya tetap di
  renderer (types:[]).
- Cast di boundary modul JSDoc sempit sengaja dibiarkan sampai file
  sumbernya dikonversi (W2-8), bukan dianggap selesai selamanya.
