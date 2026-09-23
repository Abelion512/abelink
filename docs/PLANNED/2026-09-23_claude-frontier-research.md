# Riset Model Frontier Anthropic (Sep 2026) — Penerapan di Abelink

Sumber primer: `platform.claude.com/docs` ( diverifikasi langsung 2026-09-23).
Fokus: verifikasi tugas panjang, reasoning, tools, context, cache.

## 1. Model lineup (harga/MTok in/out, ctx, default effort)

| Model | Harga | Ctx / out | Effort default | Peran di Abelink |
|---|---|---|---|---|
| `claude-fable-5.1` | $10/$50 | 1M / 128K | high | reasoning berat, tugas long-horizon (sudah alias `fable`) |
| `claude-opus-5-5` | $4/$20 | 1M / 128K | medium | loop utama (kualitas/harga terbaik) |
| `claude-sonnet-5` | $2/$10 | 1M / 128K | high | loop utama hemat / sub-agent lead |
| `claude-haiku-4-5` | $1/$5 | 200K / 64K | — (extended manual) | sub-agent, groomer, summarizer |
| Batch API | −50% | | | AbelinkBench offline runs |
| Cache read | 0.1x (Fable 0.025x, Opus5.5 0.05x) | | | loop ReAct panjang jadi murah |

Ref: https://platform.claude.com/docs/en/models/overview ,
https://platform.claude.com/docs/en/about-claude/pricing

## 2. Verifikasi tugas panjang

- **Structured outputs GA** — `output_config.format: {type: json_schema}` =
  constrained decoding, JSON valid dijamin, tanpa retry.
  Terapan: `getNextAction()` (`planning.js`), `subagentPrompt.js`,
  `taskPlanner.js` — ganti `cleanAndParse`+repair saat provider Claude.
  Ref: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- **Strict tool use** — `strict: true` menjamin `tool_use.input` cocok skema.
  Terapan: `trajectorySupervisor` / tool catalog — hilangkan error koersi tipe.
- **Task budgets (beta)** — `output_config.task_budget` countdown advisory
  (min 20K, jangan mutasi per-turn agar cache awet).
  Terapan: `archPolicy`/`agentDecision` — pasangan model-side untuk
  `MAX_VERIFY_REPLANS=2`.
  Ref: https://platform.claude.com/docs/en/build-with-claude/task-budgets
- **Progress updates (beta `display: updates`)** — 1-2 kalimat status sebelum
  tiap tool call, reasoning tetap hidden.
  Terapan: `SubagentIntercom` HUD — render updates saja.
  Ref: https://platform.claude.com/docs/en/build-with-claude/thinking#progress-updates

## 3. Reasoning

- **Adaptive thinking** — model memutuskan kedalaman berpikir per request;
  non-disableable di Fable/Opus5.5. Thinking = billed output, masuk `max_tokens`.
  Terapan: `archPolicy` — `vanilla` = `disabled` (bila diizinkan),
  `basic` = adaptive.
  Ref: https://platform.claude.com/docs/en/build-with-claude/thinking
- **Effort `low→max`** — satu knob seluruh respons incl. tool calls.
  `low` = tool call lebih sedikit/ringkas (cocok sub-agent).
  Terapan: lead `high`/`xhigh`, sub-agent `low`/`medium` (`subagentExecutor`,
  `strategyLib`).
  Ref: https://platform.claude.com/docs/en/build-with-claude/effort
- **Per-message effort (beta)** — `role: system, content: [], output_config.effort`
  ganti level TANPA invalidasi cache (top-level change = cache restart).
  Terapan: loop `useAbelinkPlan` — turun ke `low` untuk turn ringkasan.
- **Interleaved thinking** — otomatis di model adaptive (think→tool→think→tool
  satu turn); blok + signature wajib diteruskan verbatim.
  Terapan: parser ReAct `planning.js` harus tahan urutan itu.
- **Display `omitted` default** — thinking kosong + signature saja =
  first-token lebih cepat, biaya tetap. Harness: log presence, bukan teks.

## 4. Tools

- **Tool search (`tool_search_tool_regex/bm25_20251119`)** — katalog deferred
  (`defer_loading: true`), model search → API expand inline, cache-preserving,
  ≤10K deferred, potong ctx ~85%.
  Terapan: ganti ekspansi grup manual `read-tools` (`api/tools/group-tools.js`).
  Ref: https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool
- **Programmatic tool calling** — Claude menulis Python di sandbox memanggil
  tools berloop (+11% BrowseComp, −24% token).
  Terapan: `trajectorySupervisor` — evidence = stdout akhir, bukan N tool call.
- **Computer use (`computer_toolset_20260801`, 17 anggota)** — batch in-order,
  koordinat piksel screenshot, stop-on-first-failure.
  Terapan: referensi semantik `pc-agent.js` / `os:*`.
- **Code execution** — sandbox Python3.11+bash, gratis bila web_search/fetch ada.
  Terapan: tetap Bun sidecar default (local-first); cloud hanya fallback.
- **Web search (`web_search_20260318`)** — filter dinamis via code exec,
  `response_inclusion: excluded`, `max_uses`, allow/block domain ($10/1K).
  Terapan: `scraping.js` deepSearch = filter SEBELUM ctx, bukan sesudah.
- **Forced `tool_choice`** — manual hanya `auto`/`none`; adaptive dukung `any`/
  spesifik kecuali Opus5.5/Fable (jangan force tool di model itu).

## 5. Context

- **1M ctx harga standar** — Fable/Opus5.5/Sonnet5 tanpa header/surcharge.
  Terapan: budget `sessionCompactor` 525K naik HANYA dengan ukur recall.
  Ref: https://platform.claude.com/docs/en/build-with-claude/context-windows
- **Server-side compaction (beta `compact-2026-09-04`)** — on-demand + threshold,
  keep-recent-turns verbatim, background, custom summary prompt.
  Terapan: `sessionCompactor`/`contextCompactor` tetap prompt-only non-destruktif
  (delineasi vs `chatSummarizer` berlaku); versi server = referensi recall-first.
  Ref: https://platform.claude.com/docs/en/build-with-claude/compaction
- **Context editing (beta)** — `clear_tool_uses_20250919` (trigger/keep/
  clear_at_least/exclude) + `clear_thinking_20251015` (keep N/`all`).
  Terapan: `contextCompactor` — clearing tool-result = sentuhan paling ringan
  sebelum summarization penuh.
  Ref: https://platform.claude.com/docs/en/build-with-claude/context-editing
- **Memory tool (`memory_20250818`)** — CRUD file `/memories` + protokol
  auto-check + pola multisession (initializer + progress log + end-update).
  Terapan: komplemen durable untuk `vectorMemory`/`oramaStore`/`skillSynthesizer`;
  adopsi disiplin progress-log.
- **Context awareness** — `<budget:token_budget>` + `<system_warning>` countdown
  (Sonnet/Haiku); Opus/Fable pakai task budgets.
  Terapan: tiru lokal di `taskExecutor` (suntik sisa-budget warning).

## 6. Cache (aturan keras prompt assembly)

- `cache_control: ephemeral`, TTL 5 mnt (1 jam = 2x). Write 1.25x, read 0.1x.
  Min: 512 (Fable/Opus5.5/Opus5), 1024 Sonnet5, 4096 Haiku4.5. Maks 4 breakpoint,
  lookback 20 blok, urutan tools→system→messages.
- Breakpoint di akhir PREFIX STATIS, bukan blok yang berubah tiap request
  (timestamp/pesan masuk) — atau tak pernah hit.
- Invalidasi: defs tool, web-search toggle, thinking/effort/budget = miss.
  Effort mid-conversation via per-message form agar cache utuh.
- Metrik: lacak split `cache_read`/`cache_creation`/`input_tokens`
  (usulan `evaluation/metrics.mjs`), bukan total saja.
- Ref: https://platform.claude.com/docs/en/build-with-claude/prompt-caching

## 7. Usulan task konkret (berurutan, satu sesi satu)

1. **T-CACHE-1**: prompt assembly statis-dulu (`planning.js`) + ukur hit rate
   via `usage` split. Dampak: loop cloud murah 10-40x. Tanpa ubah perilaku.
2. **T-VERIFY-1**: `ai-bridge.js` — kirim `output_config.format=json_schema`
   saat provider Anthropic untuk aksi planner; hapus path repair bila guarantee ada.
3. **T-TOOLS-1**: `group-tools.js` — pola deferred catalog ala tool-search
   (client-side dulu: 3-5 tool inti eager, sisanya via `read-tools`).
4. **T-CONTEXT-1**: `contextCompactor` — tahap clearing tool-result lama
   SEBELUM summarization (tiru `clear_tool_uses`: trigger + keep + exclude).
5. **T-EFFORT-1**: `archPolicy` + `subagentExecutor` — peta effort
   lead/sub-agent; effort konstan dalam satu sesi cached.
6. **T-MEMORY-1**: disiplin progress-log ala memory tool untuk
   `skillSynthesizer` (initializer + update akhir sesi).
7. **T-BENCH-1**: `metrics.mjs` — kolom cache read/write + effort per run.

Prinsip: semua fitur server di atas punya padanan client yang sudah dimiliki
Abelink (Dexie/Orama, compactor, read-tools) — pakai fitur cloud hanya untuk
memotong token saat user memilih cloud, bukan dependensi keras (local-first).
