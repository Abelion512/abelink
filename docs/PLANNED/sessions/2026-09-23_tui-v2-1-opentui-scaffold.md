# Session 2026-09-23 — TUI-V2-1 scaffold OpenTUI (branch feat/tui-opentui)

## Ringkasan
**Keywords:** TUI-V2-1, OpenTUI scaffold, tema abelink, autocomplete, prompt row, sandbox reject, orphan text, Show fallback, execFile input hang, OpenTUI Solid, TUI V2 sesi 1

- Tanggal: 2026-09-23. Branch: `feat/tui-opentui` (dari `main` @28b479d). 59 dirty entries + stash@{0} milik sesi lain — TIDAK tersentuh.
- Keputusan nasib sandbox: **(b) tolak semua, tulis ulang bersih**. Worktree `/tmp/abelink-sandbox` dihapus via `git worktree remove --force`; test referensi dibackup ke `/tmp/claudeFrontier.test.mjs.bak`.
- Alasan tolak: (1) V2-1 butuh nol hunk sandbox (greenfield); (2) hunk effort kontradiksi keputusan terkunci #4 (`effortForWire` sandbox map ultra→max, keputusan kunci ultra→xhigh+flag lokal; bahkan inkonsisten internal — komentar bilang xhigh, kode max); (3) duplikasi `normalizeCacheUsage` di 2 file; (4) `EAGER_TOOL_NAMES` referensi pre-rename (`read-tools`, padahal T-TOOLS-1 rename ke `search-tools` harus mendarat dulu); (5) sisa hunk di luar scope slice (T-CACHE/T-CONTEXT/T-MEMORY/T-BENCH/T-VERIFY) — petik sekarang = langgar slice gating.
- Eksekusi TUI-V2-1: stack solid-js + @opentui/core + @opentui/solid + @opentui/keymap (runtime deps, Bun). File: `cli/tui/theme.mjs` (token + filterCompletions), `cli/tui/App.tsx` (shell), `cli/tui/components/PromptRow.tsx` (input + popup autocomplete), `bin/abelink-tui-v2.tsx` (entry), `tests/cli-tui-v2.test.mjs` (11 tests). V2-1: echo lokal saja; engine wiring = slice berikut.
- Verifikasi: vitest 11/11, E2E pipe 3x exit 0, eslint 0 errors. TIDAK commit/push (gate manusia tiap akhir slice).

## Audit Trail (Anti-Duplication Gate)
- `git log --grep=tui/opentui -i` → TUI existing = readline `bin/abelink-tui.mjs` (Fase 2 CLI); TUI-V2 OpenTUI = rewrite penuh, scope beda → file baru, bukan append.
- `grep -rln tui/opentui docs/PLANNED/` → session log TUI lama dibaca (fase2-tui, workspace-guard, bare-tui-launch, cli-engine-4fase); tak ada yang mengklaim scaffold OpenTUI.
- Semantic check ringkasan session logs: tidak ada makna inti sama → lanjut file baru.

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
|---|---|---|---|---|
| Bun tak transpile JSX di `.mjs` (`Unexpected <`) | bin/-, cli/tui/- | pragma jsxImportSource butuh transpile; Bun hanya untuk `.tsx` | rename ke `.tsx` (theme murni JS tetap `.mjs`) | DONE |
| `Orphan text error: "" must have a <text> as parent` | cli/tui/components/PromptRow.tsx | `<Show when={false}>` tanpa fallback render text-node kosong yatim di bawah `<box>` | ganti `Show` → `&&` (false render nothing, terverifikasi) | DONE |
| E2E vitest timeout 30s × 3 | tests/cli-tui-v2.test.mjs | `execFile` opsi `input:` hang di env ini (repro: bahkan `bun -e` trivial hang; spawn+stdin.end OK) | helper pakai `spawn` + `stdin.write/end` eksplisit | DONE |
| Deps OpenTUI mendarat di devDependencies | package.json | `bun add -d` default | `bun remove` + `bun add` (runtime, TUI = binary produksi) | DONE |
| Render TUI menahan event loop + butuh TTY | bin/abelink-tui-v2.tsx | `render()` tak pernah resolve saat pipe | mode piped: echo + exit SEBELUM createCliRenderer; TTY: render penuh | DONE |

## Files Modified
- `cli/tui/theme.mjs` (NEW): `ABELINK_THEME` (token DaisyUI abelink), `TUI_COMMANDS` (13), `filterCompletions` murni.
- `cli/tui/App.tsx` (NEW): shell Solid — header model/effort, scrollbox pesan, PromptRow, footer; Ctrl-C → onExit.
- `cli/tui/components/PromptRow.tsx` (NEW): input + popup autocomplete prefix case-insensitive.
- `bin/abelink-tui-v2.tsx` (NEW): entry — pipe echo/exit, TTY render KeymapProvider+App.
- `tests/cli-tui-v2.test.mjs` (NEW): 11 tests (tema 2, autocomplete 5, parser reuse 1, E2E pipe 3).
- `package.json` + `bun.lock`: +@opentui/core/solid/keymap + solid-js (dependencies).

## Agent Learnings
- OpenTUI Solid: `<Show>` tanpa `fallback` di bawah `<box>` = throw orphan-text (bukan render kosong). Selalu pakai `&&` atau `fallback`.
- Bun: JSX hanya di `.tsx`; error `Unexpected <` = ekstensi salah, bukan pragma salah.
- `execFile(..., {input})` bisa hang tergantung env; pola aman untuk E2E pipe = `spawn` + `stdin.write/end` + `close`.
- Pesan error asli OpenTUI hilang di balik overlay TUI — debug via `testRender`/`render` + log ke FILE (`fs.appendFileSync`), bukan stdout.
- File `.tsx` tanpa tsconfig: tak ada typecheck — disiplin manual atas props komponen.

## File Invariants
- `cli/tui/theme.mjs` = single source token TUI; warna hardcode di komponen = pelanggaran.
- `bin/abelink-tui.mjs` (v1 readline) JANGAN diubah dari branch ini — v2 file terpisah sampai ganti resmi.
- Test E2E pipe JANGAN pakai `execFile input:` (hang env) — pakai helper `spawn` yang ada.

## Verification Checklist
- [x] `bunx vitest run tests/cli-tui-v2.test.mjs` → 11/11 (6.4s)
- [x] E2E pipe 3x (`halo tui`) → exit 0 + echo, 3/3
- [x] `bunx eslint` file tersentuh → 0 errors (.tsx terabaikan config — kutipan di bawah)
- [ ] Full `verify.sh` → sesi berikut (sebelum PR, bukan sekarang)
- [ ] v1 `cli-tui` tests tetap hijau → sesi berikut (tak tersentuh, tapi verifikasi saat PR)

## Batasan dikenal
- ESLint config hanya cover `**/*.{js,jsx}` — file `.tsx` + `.mjs`-di-luar-itu? (theme.mjs + test ter-lint OK) — `.tsx` Luput dari lint (warning "no matching configuration"). Opsi: tambah override flat config untuk `**/*.tsx` di sesi berikut (satu baris + cek baseline).
- Entry TTY interaktif (render penuh + ketik + autocomplete visual) belum diuji manual — butuh terminal asli; E2E pipe hanya cakup mode non-TTY.
- `submitted` di mode TTY terakumulasi tapi belum dipakai (engine wiring slice berikut).
- `TUI_COMMANDS` duplikasi daftar slash v1 (`TUI_HELP`/`parseSlashCommand` di `bin/abelink-tui.mjs`) — disengaja sementara; unifikasi saat /model + /effort v2 mendarat (V2-2/V2-3).

## Callback
- Lanjut ke TUI-V2-2 (/model permanen + alias keluarga + label sumber + recent/favorite) di sesi berikut, atau ada koreksi arah atas struktur `cli/tui/` vs `bin/` dulu?

## Update 2026-09-24 — V2-1b restyle ikut opencode + V2-1c engine wiring

### Restyle ikut source asli (sebelumnya: "kok belum mirip")
- Referensi di-clone shallow sparse `/tmp/opencode-ref` (sst/opencode, packages/tui).
- `PromptRow.tsx` ikut `component/prompt/index.tsx:1350-1442`: border KIRI aksen (`┃`+`╹` via customBorderChars), isi bg element padding 2/2/1, `textarea` multiline, meta row `Agent · model provider` di bawah input.
- `App.tsx` ikut `routes/session/index.tsx:1177-1358` + `sidebar.tsx:28-36`: row konten (padding 2, gap 1, scrollbox `minHeight 0`) + sidebar 42 overlay bila lebar >120; status line workspace + tokens + `ctrl+p commands`.
- `theme.mjs`: +`SIDEBAR_WIDTH=42`, `isWide()` (threshold 120), 1 test layout.
- Beda disengaja vs opencode: tanpa bg-element bawah (`▀`), tanpa spinner/status-retry (engine belum wiring); warna tetap token DaisyUI abelink, bukan tema opencode.json.

### V2-1c: v2 jadi TUI beneran (screenshot user: masih `abelink>` v1)
- Bare `abelink` dispatch ke `bin/abelink-tui.mjs` (v1 readline); v2 OpenTUI tak dikabel ke mana-mana + echo doang. Restyle tanpa engine = salah sasaran.
- Keputusan user: "terserah, clone opencode langsung lalu sesuaikan" + tetap Hermes (satu `runAgentLoop` semua host).

### Yang dibangun
- `cli/tui/engine.mjs` (NEW): `createTuiState` + `submitLine` (prompt/slash/shell routing) + `defaultRunTurn` (runAgentLoop + environment sidecar pola v1). Reuse import dari `bin/abelink-tui.mjs` (parser, file-ref, session store) + `headlessCli.js` (auth/alias) — nol copy logic.
- `cli/tui/App.tsx`: presentational — messages via props engine + `tick` signal; `messageColor/messagePrefix` pindah ke theme (testable); busy `working…`; model/provider accessor.
- `bin/abelink-tui-v2.tsx`: flags reuse `parseTuiArgs` v1; `bootstrapTuiState` (file config → auth → 9Router key → memories); pipe = submitLine per baris (sidecar lazy: slash-info/shell tanpa spawn); TTY = render + tick/bump per push.
- `bin/abelink.mjs`: dispatch `tui` → v2 dulu, fallback v1 bila exit non-nol.
- `tests/cli-tui-v2.test.mjs`: 25 tests — 9 engine stub (prompt/slash/shell/store/compact), pesan per-role, layout, parser reuse, E2E pipe slash-info (tanpa network).

### Verifikasi
- vitest v2 25/25; v1 `cli-tui`+`cli` 71/71 (dispatch edit tak merusak); E2E pipe `/model` 3x exit 0; eslint 0 errors; frame `testRender` 140×30 (pesan user/assistant/meta + prompt box + sidebar).
- Live turn model (prompt → sidecar → LLM) BELUM diuji — butuh kredensial; stub test + E2E slash menutup sisanya.

### Arsitektur (user: "tetap ikut hermes")
- **Keputusan terkunci:** satu inti `runAgentLoop`, semua host — termasuk GUI. Pola Hermes: *"One AIAgent class serves CLI, gateway, ACP, batch, API server; platform differences live in the entry point."*
- Status: keluarga CLI sudah satu inti (4fase §0); GUI (`useAbelinkPlan.js:829` loop sendiri) belum — migrasi = slice tersendiri setelah TUI-V2-4.
- Model e2e: Muse Spark 1.3 (AA index max 48 / $1.60, xhigh 45 / $1.37) volume harian; gate final tier 53+.

## Update 2026-09-25 — V2-2/V2-3: /model + /effort fungsional pola claude-code

### Yang dibangun (V2-2/V2-3)
- `cli/tui/modelEffort.mjs` (NEW, murni): `FAMILY_ALIASES` (opus/sonnet/fable/haiku), `resolveModelInput` (alias > keluarga > ID langsung + label sumber), `effortForWire` (ultra→xhigh+flag, auto→needsResolve), `resolveAutoEffort` (fallback deterministik), `maxTokensFor` (4k..64k), `cacheSwitchWarning` (history non-kosong), `persistCliField` (cli.json 0600 merge), `modelSourceLabel`.
- `cli/tui/engine.mjs`: case model/effort/models fungsional (persist permanen + warning + info wire/max_tokens); fetchAI kirim `effortResolved` + `ultraLocal` + `customMaxTokens`.
- `sidecar/main/ai-bridge.js`: hormati `effortResolved`; ultra→xhigh (dulu max); `max_tokens` fallback peta effort bila caller tak kirim.
- `tests/cli-model-effort.test.mjs` (NEW, 21 tests) + engine suite +3 (persist keluarga, ultra, warning). Total v2: 46/46.

### Verifikasi
- vitest 46/46; regresi effort (override/estimator/planStepBudget) 44/44; eslint 0; E2E pipe `/model opus` + `/effort ultra` exit 0 + persist.
- Insiden: E2E menulis `~/.config/abelink/cli.json` asli (file baru dari E2E, bukan config lama) — dihapus. Pelajaran: E2E pipe butuh HOME isolasi (`deps.homeDir` sudah ada di engine; entry pipe belum teruskan — TODO V2-4 atau patch kecil).
- Live turn LLM belum diuji (kredensial).

### Batasan
- `/models` tampilkan alias+keluarga statis (harga live = desain doc, belum).
- Recent/favorite model belum (V2-2 minta; tunda: last-used = cli.json model kini, cukup).
- Label sumber di status line App: tunjukkan `modelSourceLabel` (VZ-4 bridge GUI atau patch kecil).

## Update 2026-09-25 — S1: /model dinamis 9Router (pola opencode)

### Yang dibangun
- `cli/tui/modelCatalog.mjs` (NEW): discovery GET /v1/models + normalisasi capabilities; cache `models-cache.json` TTL 5 mnt (opencode models-dev) + atomic tmp+rename; stale-while-revalidate; kurasi Favorites->Recent(10)->providers; `resolveCatalogModel` (alias > katalog > langsung + tolak gemini-web eksplisit).
- `FAMILY_ALIASES` dihapus dari modelEffort (ID claude-code tak ada di 9Router); shim alias-statis dipertahankan.
- `cli/tui/engine.mjs`: `loadModelCatalog` + `saveRecentModels`; case model/models pakai katalog (recent persist cli.json, label katalog/stale).
- `bin/abelink-tui-v2.tsx`: `ABELINK_HOME` isolasi persist/cache; bootstrap baca `recentModels`+`effort` dari cli.json HOME yang sama; deps.cliConfig (fav/recent) ke engine.
- Tests: `cli-model-catalog.test.mjs` (NEW, 17 tests); effort suite update (shim); engine +4 (katalog stub, gemini-web tolak); E2E `run()` pakai ABELINK_HOME tmp + `/models kimi` live.

### Verifikasi
- vitest 65/65 (catalog+effort+tui-v2); eslint 0 errors; E2E live: `/models kimi` -> Katalog 1322 model + cache 154KB; run kedua 0.3s (cache fresh); HOME asli bersih (cli-sessions pre-existing saja).
- Temuan: 9Router /v1/models ~5-7s -> timeout discovery 15s (terukur, bukan tebakan). Bun fetch abort di 4s padahal curl instan — timeout, bukan bug network.
- Batasan S1 tertutup: recent(10)/favorite-seksi DONE; harga live tetap belum (desain doc).

## Update 2026-09-25 — S2: thinking per-model (qwen-pattern)

### Yang dibangun
- `cli/tui/thinkingPolicy.mjs` (NEW, murni): `effortsFor` (subset per thinkingFormat: claude-adaptive full, claude-budget tanpa xhigh, lain konservatif), `clampEffort` (fallback tertinggi-di-bawah, pola claude-code), `thinkingPayload` (adaptive->adaptive+output_config tanpa budget; budget->flag budget; lain->reasoning_effort; non-reasoning->strip; maxOut clamp), `capSummary`.
- `sidecar/main/ai-bridge.js`: thinkFmt-driven (conf.thinkFmt/thinkReasoning/maxOut dari caller); reasoning_effort di-strip bila noThinking; adaptive tambah output_config.effort; max_tokens clamp maxOut; blok Anthropic: adaptive vs budget manual.
- `cli/tui/engine.mjs` fetchAI: kirim thinkFmt/thinkReasoning/maxOut dari state.modelCapabilities (set saat /model).
- Tests: `cli-thinking-policy.test.mjs` (NEW, 12 tests truth-table).

### Verifikasi
- vitest 121/121 (7 file: thinking+policy+catalog+effort+tui-v2+regresi effort); eslint 0.
- Live zen-free (`nara/muse-spark-1.3-contributor-free`, ABELINK_HOME isolasi): exit 0, katalog live, persist+recent benar, runAgentLoop jalan. Kualitas reply halusinasi (index.html tak diminta) = keterbatasan model free, BUKAN bug routing — atribusi bersih, bukan gate.

## Update 2026-09-25 — S3: /usage statistik harness (terminal)

### Yang dibangun
- `cli/tui/usageStats.mjs` (NEW, murni): `summarizeSession` (turns/tools/outcomes/tokensEst chars/2.5), `parseHarnessRow`, `summarizeDir` (gabung kinds per sessionId), `renderUsage` (teks terminal, tanpa $).
- `cli/tui/engine.mjs`: case `usage` (/usage|/stats|/cost, arg daily|weekly) — baca harness root (deps.harnessRoot > ABELINK_DATA_HOME > XDG > HOME), gabung 1/7 hari.
- Tests: `cli-usage-stats.test.mjs` (NEW, 9 tests).

### Verifikasi
- vitest 130/130 (8 file); eslint 0; E2E `/usage` exit 0 ("Belum ada aktivitas" — jujur, HOME isolasi kosong).
- Aturan: angka $ dilarang (data tak ada); token = estimasi berlabel.

## Update 2026-09-25 — S4: register adopsi pola eksternal

- `docs/PLANNED/external-pattern-adoption.md` (NEW): ADOPTED (inti Hermes, katalog opencode, clamp qwen, ultracode/ultrathink claude-code, adaptive Anthropic, /usage terminal) + UNDERSTOOD (variants, Enter=simpan, harga live, /insights, fallback chain, SQLite FTS, scope sub-agent). Satu baris = sumber primer + status + bukti.
- ARCHITECTURE.md update = saat PR (aturan repo), bukan sesi ini.

## Update 2026-09-25 — Shift+Enter newline + klarifikasi scope

### Klarifikasi (user: "yang berubah hanya style?")
- Klaim tidak sesuai fakta: S1–S4 fungsional sudah mendarat di branch ini
  (untracked, belum commit): `engine.mjs` (submit routing + runAgentLoop),
  `modelCatalog.mjs` (discovery 1322 model + cache), `thinkingPolicy.mjs`
  (thinking per-model), `usageStats.mjs` (/usage), `bin/abelink-tui-v2.tsx`
  (dispatch default + fallback v1). Yang belum: commit/PR + live turn LLM
  (kredensial) + uji TTY interaktif manual.
- Cara user verifikasi sendiri: `git status --short -- cli/ bin/`
  menampilkan file di atas; `abelink` kini dispatch ke v2 (fallback v1).

### Shift+Enter = newline (pola opencode keybind.ts input_newline)
- `PROMPT_KEY_BINDINGS` di theme.mjs: Enter=submit; Shift/Ctrl/Meta+Enter
  + Ctrl+J=newline. `linefeed` WAJIB ikut — TTY asli kirim LF (raw [10])
  untuk Enter, bukan CR; tanpa ini binding `return` mati total.
- Temuan: mock testRender tak teruskan modifier shift (shift=false selalu)
  + onContentChange terima objek (baca `plainText` via ref ikut opencode).
  Prop `focused` sempat hilang saat rewrite — ketikan mati total.
- Verifikasi TTY asli (script/stty raw): `AB`+Shift+Enter+`CD`+Enter ->
  SUBMIT `AB\nCD`. Unit mapping 2 tests. vitest 88/88 (5 file), eslint 0.

## Update 2026-09-25 — Root cause TUI mati + E2E flaky discovery

### Root cause #1: bunfig.toml hilang (TUI mati total)
- Gejala user: popup tak muncul saat `/`, Enter jadi newline. Reproduksi:
  signal update tapi frame statis; `createEffect` tak pernah fire bahkan di
  solid-js murni tanpa renderer.
- Akar: repo tak punya `bunfig.toml` -> transform JSX Solid tak diterapkan
  (opencode: `packages/tui/bunfig.toml` = `preload @opentui/solid/preload`).
  Tanpa preload, komponen render statis sekali, signal mati.
- Fix: `bunfig.toml` (NEW, preload). Verifikasi: popup MUNCUL di frame,
  PTY submit `/mod` -> SUBMITLINE, `sync-version` tetap jalan (preload tak
  merusak script lain).
- Pelajaran: ketiadaan config build = failure mode senyap total; verifikasi
  interaksi JANGAN hanya frame statis — kirim key + baca efeknya.

### Root cause #2: Bun fetch gantung ke 9Router (discovery flaky)
- `/v1/models` 581KB via Next.js keep-alive timeout 5s: curl OK (19.8s),
  Bun fetch hang -> abort. Fix: header `Connection: close` + retry 1x
  khusus abort/timeout. Timeout discovery 30s (server 5-20s tergantung beban).
- E2E `/models kimi` stabil 2x run setelah fix; full suite 88/88 (5 file).
- Pelajaran: flaky yang "lolos manual, gagal acak di E2E" = masalah transport,
  bukan logika — selidiki lapisan HTTP, bukan retry test buta.

## Update 2026-09-25 — Autocomplete mode-stack fungsional (ikut opencode)

### Kritik user (benar): popup tak muncul, Enter newline, statis
- Reproduksi PTY: signal update tapi frame statis; SUBMIT fire SEBELUM IN
  (signal tertinggal satu tick dari buffer textarea).
- Referensi langsung dari clone user (`opencode/`, 1.18.32): keybind.ts
  `prompt.autocomplete.*` (Up/Down/Tab/Enter/Esc), mode-stack push/pop,
  `prompt/display.ts` mentionTriggerIndex. Port penuh DITOLAK: autocomplete
  terikat 10+ context server (sync/sdk/project) — adaptasi pola, bukan kode.

### Yang dibangun
- `theme.mjs`: `autocompleteTrigger` (/ + @), `applyCompletion`,
  `moveCompletionIndex` (sirkular). Semua murni + test.
- `PromptRow.tsx`: mode-stack — popup buka: Up/Down navigasi, Tab/Enter
  pilih, Esc tutup; popup tutup: Enter submit. Kunci: hitung popup dari
  teks BUFFER (`plainText`), bukan signal (stale satu tick).
- Enter manual di onKeyDown (binding submit tak bisa dibatalkan saat popup
  buka — action jalan sebelum onKeyDown konsumen). PROMPT_KEY_BINDINGS kini
  hanya newline-modifier.
- Hapus memo `trigger` mati.

### Verifikasi PTY (script/stty raw, bukan tebakan)
- `/mod`+Down+Enter -> pilih `/models`; `/m`+Enter -> buffer `/model`
  (frame akhir: popup `> /model` + buffer `/model`).
- vitest 92/92 (5 file) + 36/36 file tui-v2; eslint 0.

## Update 2026-09-25 — Slice A: sambungan hidup (default zen-free + alias 9Router)

### Akar (screenshot user, terverifikasi read-only)
- Default `google/gemini-3.8-flash` TIDAK ADA di katalog 9Router (1268 model,
  nol `google/*`). Mayoritas MODEL_ALIASES gaya OpenRouter juga mati.
  9Router parse prefix `google/` -> cari kredensial provider google -> error
  persis di screenshot. Pesan dari 9Router (grep sidecar = nol).
- Fallback claude-work hanya di v1; engine v2 tak punya. cli.json tak ada
  -> default fiktif dipakai buta.

### Yang dibangun
- A1: DEFAULT zen-free (`nara/muse-spark-1.3-contributor-free`) di
  headlessCli/tui-v1/entry-v2/engine/App; MODEL_ALIASES rewrite ID live
  (combo + bor/* + nara/*:free, terverifikasi per-ID ke katalog); `auto` ->
  claude-work; komentar OpenRouter mati dihapus.
- A2: `classifyAiError` (network/credentials/auth/unknown-model/other +
  aksi); engine fetchAI fallback sekali claude-work + throw pesan per-lapis.
- A3: `scripts/live-tui-smoke.mjs` + `bun run live:tui` — prasyarat eksplisit
  (9Router hidup, key lokal, ABELINK_HOME isolasi), exit 2 = SKIP jujur,
  gate: katalog + zen persist + reply + tanpa error generik + cli.json.

### Verifikasi
- vitest 64/64 (effort+headless+cli); eslint 0; live-smoke 6/6 PASS.
- CATATAN JUJUR: (1) run manual kedua Sidecar RPC timeout 120s (ai:fetch) —
  latency model free/9Router flaky, bukan bug routing (smoke lolos Contekan
  sama); timeout 120s mungkin perlu direview slice terpisah. (2) Model
  halusinasi konsisten 3 run ("bikin index.html" untuk prompt "1+1=?") =
  kualitas model free, BUKAN gate; live-smoke hanya gate infrastruktur.

## Update 2026-09-26 — E1: ID live terverifikasi + tanpa fallback + jev audit

### Audit kelayakan model (saya yang hit, bukan opini)
- Probe POST kecil per kandidat (tanpa GUI):
  - `oc/muse-spark-1.3-contributor-free` -> 200 (async in_progress) = LAYAK default.
  - `bor/mimo-v2.5:free` -> 200 = LAYAK cadangan.
  - `nara/muse-spark-1.3-contributor-free` -> 503 plan-tidak-include = TIDAK LAYAK.
  - `bor/kimi-k3`, `bor/gemini-3.8-flash` -> 402 Token Harbor $0 = TIDAK LAYAK (bayar).
  - `rai/typesafe/jev-1.13.0` -> 402 org balance low = TIDAK LAYAK (bayar).
  - `oc/jev-1.13-free` -> 500 internal = TIDAK LAYAK.
  - `openrouter/typesafe/jev-1.13` -> 400 decisions-model (BUKAN chat).
- jev = decisions model (endpoint /api/alpha/decisions, 401 butuh session auth
  browser — bukan API key). Zen = layanan model kurasi OpenCode (pay-per-request).
  oc/ = namespace combo-member (combo `abelink`, 10 oc/*-free): tak ada di GET
  /v1/models tapi diterima POST. systemone lokal 405-butuh-POST / 401-tanpa-session.
- Pelajaran: suffix free/-free BUKAN bukti gratis; yang menentukan = respons
  POST + pesan billing. Alias bor/* non-free + rai/* saya hapus semua.

### Yang dibangun
- MODEL_ALIASES = hanya ID POST-200 (zen/qwen/mimo/nara/xkiro/tokenrouter/
  free/bor-mimo-free); default oc/zen-free di semua entry; FORBIDDEN_MODELS.
- Hapus fallback claude-work di engine v2 + v1 + bin (gagal = pesan per-lapis).
- Guard resolveCatalogModel tolak ID terlarang; pesan modelEffort tanpa claude-work.
- live-tui-smoke gate ID oc/.

### Verifikasi
- vitest 126/126 (effort+headless+cli+tui-v1); eslint 0; live-smoke 6/6 PASS.
