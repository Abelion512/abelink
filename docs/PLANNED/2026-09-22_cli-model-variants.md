# CLI Model & Variants — `/model` + Effort ala Opencode/Claude

Date: 2026-09-22
Status: design. Fondasi sudah ada (`MODEL_ALIASES`, `-m`, `--effort`);
doc ini mengunci arah `/model` interaktif (TUI) + variants + last-used.

## Referensi (terverifikasi docs)

- Opencode `/models`: list; model = `provider/model`; **variants** =
  reasoningEffort high/low, thinking budget, cycle via keybind.
  Loading: `--model` flag > config > last used > internal.
- Opencode `run`: non-interaktif + `--continue/--session/-m/--format json`.
- Claude Code: `--permission-mode` + `defaultMode` settings; mode `auto`
  = classifier latar (tidak ditiru — lihat permission-modes doc).

## Keadaan kini

- Alias 19 entri (`MODEL_ALIASES`), default `google/gemini-3.8-flash`.
- `-m` flag, `--effort` ladder, `models [filter]`, `setup` persist cli.json.
- Belum: last-used persist, variant per-model, `/model` interaktif.

## Desain (belum implementasi)

1. **Last-used persist**: setelah run sukses, tulis `{provider, model}`
   ke cli.json (tanpa key). Loading: `--model` > cli.json last-used >
   default. Jujur: last-used ≠ resume sesi.
2. **`models --verbose`**: tampilkan harga OpenRouter per ID (cache 24 jam,
   best-effort; offline = tampilkan alias saja).
3. **Variants**: `MODEL_VARIANTS = { high: {effort}, low, max }` per
   keluarga (anthropic thinking budget, openai reasoningEffort, google
   low/high). Flag `--variant`, cycle key di TUI nanti.
4. **`/model` interaktif (TUI, Fase 2)**: list + ganti mid-session tanpa
   restart loop; tulis last-used.

## Batas

- Tanpa TUI, `/model` belum ada — `-m` + `models` adalah permukaannya.
- Harga live butuh network + key OpenRouter; offline = alias statis.
