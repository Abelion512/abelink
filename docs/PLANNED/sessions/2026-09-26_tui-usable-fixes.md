# Session 2026-09-26 — TUI benar-benar bisa dipakai (bukan cuma tampilan)

Branch: `feat/tui-opentui`. Keluhan pemilik: **"TUI nya gabisa dipakai... eh malah tampilan doang
yang ditiru."** Semua temuan di bawah direproduksi dulu di PTY asli (tmux `capture-pane`), bukan
dibaca dari kode saja. Tidak commit/push.

## Temuan akar (urutan dampak)

### T1 — **Prompt user TIDAK PERNAH dikirim ke model** (penyebab utama "TUI gabisa dipakai")
- Gejala: user mengetik `jawab singkat: 1+1 berapa?` → model membalas
  `[THOUGHT]: Input kosong. Minta klarifikasi minimal.` / `Ya? Perlu apa.`
- Akar: `planning.js:520` merakit `messages = [{ role:'system', content: systemPrompt }, ...previousTurns]`.
  `userInput` dipakai untuk klasifikasi/playbook/supervisor, **tidak pernah** ditambahkan sebagai
  pesan user. `runAgentLoop` menerima `prompt` tapi hanya menyalurkannya sebagai argumen
  `getNextAction(prompt, loopMessages, ...)`. LoopMessages sesi baru = `[]` (tanpa initialHistory)
  → model hanya menerima system prompt.
- Kenapa GUI tak kena: `useAbelinkPlan.js` punya loop sendiri dan mengirim thread chat (termasuk
  pesan user). Ketiga pemanggil `runAgentLoop` (bin/abelink.mjs, bin/abelink-tui.mjs,
  cli/tui/engine.mjs) semuanya kena.
- Kenapa tak tertangkap gate: `live-tui-smoke` hanya cek "reply non-kosong" —
  "Ya? Perlu apa." lolos. Gate lama menyamarkan bug ini.
- Fix: `src/api/ai/agentRunner.js` menyisipkan `{ role:'user', content: prompt }` setelah
  seeding `initialHistory` (initialHistory = konteks lama saja, jadi tidak dobel).
- Bukti sesudah fix (PTY): `> jawab singkat: 1+1 berapa?` → `[THOUGHT]: 1+1=2. Jawab langsung.`
  → `2` → `completed`.

### T2 — **Enter mati total saat popup autocomplete terbuka**
- Gejala: ketik `/model` + Enter → **tidak terjadi apa pun** (inilah asal "slash command ga jalan").
- Akar: teks `/model` sudah persis sama dengan baris yang di-highlight, jadi `acceptSelected()`
  menulis teks yang sama → popup tetap buka → Enter berikutnya mengulang hal yang sama. Dead end.
- Fix: `PromptRow.resolveEnter()` — kalau buffer sudah **persis** sama dengan kandidat terpilih,
  jalankan (submit), bukan "pilih".

### T3 — Baris popup/picker saling menumpuk (render rusak)
- Gejala: `>iAAA satul— Katalog`, `——LDaftaramodelo+ealias`, `memuatmkatalog…`.
- Akar: box berisi **teks saja** kena `flexShrink` default (1) di dalam kolom ber-`gap` →
  tinggi diperas < jumlah baris → baris saling menimpa. Dibuktikan dengan probe minimal:
  tanpa `flexShrink: 0` rusak, dengan `flexShrink: 0` rapi.
- Fix: `flexShrink: 0` pada box popup + picker.
- Bonus: picker juga dijadikan **overlay** (`position:'absolute'`, `bottom:7`) ala dialog opencode —
  menambah baris picker tidak lagi memeras PromptRow/status line (sebelumnya status line ikut rusak,
  `/meAbelinkl·omuse-spark…`).

### T4 — Tidak ada cara memilih model (picker)
- `/model` tanpa arg cuma mencetak satu baris "Model aktif"; `/models` menumpahkan teks panjang.
- Yang dibangun (pola opencode `dialog-model.tsx`): picker overlay interaktif
  Aktif → Recent → Favorit → Alias → Katalog; `↑↓` navigasi, `Enter` pakai, `Esc` batal,
  **ketik = filter**; jendela 12 baris (`visibleWindow`, murni+testable); baris terpilih ditandai `>`.
- Wiring: `engine.modelPickerRows()` (baris + katalog), `App.tsx` (overlay + keyboard), entry
  (state picker + intercept `/model`|`/models` tanpa arg). Recent **tidak** difilter keberadaannya
  di katalog — ID combo (`oc/...`) memang tak ada di GET `/v1/models` tapi sah dipakai.
- Bukti (PTY): filter `mimo` → 31 baris; Enter → `Model: mimo -> mimo` + persist `cli.json`;
  label prompt berubah jadi `Abelink · mimo 9router`.

### T5 — Pesan baru tidak tampil sampai event berikutnya (TUI tampak beku)
- Akar: `pushMessage` tidak memberi tahu UI; `bump()` hanya di `onEvent`/`finally`, jadi prompt user
  sendiri tak terlihat selama turn panjang.
- Fix: hook `state.onPush` dipanggil `pushMessage`; entry memasang `state.onPush = bump`.

### T6 — Textarea tidak dikosongkan setelah submit / setelah picker
- Fix: `submitNow()` mengosongkan textarea; `createEffect` mengosongkan saat picker tertutup
  (pilih **atau** batal) supaya teks filter tidak ikut terkirim sebagai prompt berikutnya.

### T7 — Sidecar nyangkut (proses orphan)
- Bukti: 4 proses `bun sidecar/engine.mjs` tertinggal dari sesi TUI yang sudah mati.
- Akar: `exit()` TUI v2 hanya `renderer.destroy()`; `createSidecarClient` tidak punya cleanup.
- Fix: `exit()` memanggil `sidecar.dispose()` sebelum destroy + `process.once('exit', kill)` di
  `createSidecarClient`. Verifikasi: `/exit` → jumlah sidecar turun (7 → 6). 4 orphan lama
  dibersihkan manual (hanya yang parent-nya sudah mati; sesi milik user tidak disentuh).

### T8 — Label model di prompt tidak refresh
- Akar: Solid hanya tracking signal; `state.model` mutasi objek biasa → `<text>` tidak pernah
  di-render ulang.
- Fix: `modelLabel` boleh accessor + membaca `props.tick?.()`.

### T9 — `TUI_HELP` menyebut alias yang sudah dihapus
- Sebelum: `(alias: gemini, fable, kimi, deepseek, qwen, glm, grok, gpt, free, auto)` — tidak ada
  satu pun di `MODEL_ALIASES` sekarang. Fix: sebut alias riil + jelaskan `/model` tanpa arg = picker.

## File berubah (sesi ini)

- `src/api/ai/agentRunner.js` (T1)
- `cli/tui/engine.mjs` (T1 wiring lama, T4 `modelPickerRows`, T5 `onPush`)
- `cli/tui/App.tsx` (T3, T4, T8)
- `cli/tui/components/PromptRow.tsx` (T2, T3, T4, T6, T8)
- `cli/tui/theme.mjs` (T4 `visibleWindow`)
- `bin/abelink-tui-v2.tsx` (T4, T5, T7)
- `bin/abelink-tui.mjs` (T7 anti-orphan, T9 help)
- `tests/cli-tui-v2.test.mjs` (+`visibleWindow` 4 test), `tests/cliHeadless.test.mjs` (+regresi T1)

## Verifikasi

- **PTY asli (tmux)**: `/help` jalan; `/model` → picker; filter `mimo` → 31 baris; Enter → model
  berganti + persist + label ikut; `Esc` batal + textarea bersih; prompt nyata → `[THOUGHT] 1+1=2`
  → jawaban `2`; `/exit` mematikan sidecar.
- `bunx vitest run`: **1676 test, 2 gagal** — `cli-tui-v2 > pipe /models kimi (live 9Router)` dan
  `telegramStart > token invalid`: keduanya **lolos saat dijalankan isolasi** (timeout jaringan di
  bawah beban suite paralel; pesan errornya `Discovery gagal (The operation was aborted.)` /
  `Test timed out in 60000ms`). Bukan regresi sesi ini, tapi gate merah acak.
- `bunx eslint --no-cache` file tersentuh → 0 error. `.tsx` masih "no matching configuration"
  (butuh parser TS; lihat batasan).

## Batasan dikenal

- **`.tsx` tetap nol lint/typecheck** (belum ditutup; butuh devDependency `typescript-eslint`/parser).
- Gate live rapuh: `/models` E2E bergantung 9Router yang terukur 5–26 s, timeout discovery 30 s
  (+1 retry) → merah acak saat server dingin. Kandidat perbaikan: naikkan timeout discovery,
  atau tandai test live sebagai skippable (pola `live-tui-smoke` exit 2).
- `working…` masih indikator teks saja (belum spinner/streaming token).
- Baris `Recent` menyimpan alias apa adanya (`zen-free`) sementara `recentModels` menyimpan ID
  hasil resolve — dua bentuk, keduanya resolve saat start. Rapikan bila menyentuh persist lagi.
- Picker memuat katalog dari cache/disk; saat cache kosong muncul `memuat katalog…` beberapa detik
  (9Router lambat) — belum ada progress bar.

## Callback

1. Tutup blind spot `.tsx` (toolchain TS) — satu PR kecil sebelum refactor JS→TS.
2. Rapikan gate live `/models` supaya tidak merah acak, lalu lanjut slice TUI berikutnya
   (dialog `/effort`, riwayat prompt, stash) dengan pola yang sama: demo PTY + gate.
