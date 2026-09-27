# 2026-09-26 — GUI-TUI satu produk: versi dinamis, adopsi config GUI, katalog used-only

## Konteks
Owner: "kalau Abelink rilis alpha-6 berarti hardcoded `[system] Kamu adalah
Abelink ... v1.1.0-alpha.5` perlu diperbaiki. Model ga perlu load semua, cukup
load yang pernah saya masukkan dan adopsi dari GUI. Ini 1 product GUI-TUI bukan
2 product."

Tiga masalah terpisah:
1. **Versi/identitas** — entry CLI/TUI mem-pin versi literal.
2. **Katalog model** — picker memuat 1300+ model saat dibuka.
3. **Dua kebenaran config** — GUI menyimpan AI config di Dexie (IndexedDB
   WebKitGTK), TUI/CLI punya `~/.config/abelink/cli.json` terpisah; tidak ada
   jembatan.

## Keputusan
- **Versi = package.json, bukan literal.** `bin/abelink.mjs` + `bin/abelink-tui.mjs`
  membaca `package.json` saat modul dimuat; `scripts/sync-version.mjs` sudah
  menyinkronkan package.json dari `src-tauri/tauri.conf.json`, jadi bump
  alpha-6 otomatis ikut tanpa menyunting entry. Blok identitas di
  `src/api/appIdentity.js` memang SUDAH dinamis (`APP_IDENTITY.version =
  pkg.version`) — string yang dikutip owner adalah hasil render runtime, bukan
  literal. Pin yang benar-benar ada hanya di dua entry bin/ dan sudah dihapus.
- **Snapshot config GUI -> file, bukan baca Dexie.** Proses Bun tak bisa membaca
  IndexedDB WebKitGTK. GUI menulis subset field AI ke
  `~/.config/abelink/shared.json` (0600) lewat channel `sync-config` yang SUDAH
  dipanggil setiap `saveConfiguration`; `loadCliFileConfig` membacanya sebagai
  lapis dasar. Precedence: shared.json (GUI) < cli.json home < cli.json repo,
  sehingga aksi eksplisit CLI tetap menang.
- **Provider GUI-only tidak dipaksakan.** `gemini-web` butuh sesi browser Google
  (GUI-only): `sharedConfigToCliConfig` mengembalikan `null` agar CLI jatuh ke
  default jujur, bukan gagal senyap. `lm-studio` dipetakan ke `custom` +
  `customEndpoint` (endpoint OpenAI-compatible yang sama di ai-bridge).
- **Flag eksplisit tetap menang.** `parseCliArgs`/`parseTuiArgs` menandai
  `providerExplicit`/`modelExplicit`; bootstrap hanya mengirim flag ke
  `resolveCliAuth` bila user benar-benar memberi flag. Tanpa ini default
  `provider='custom'`/`model=oc/...` selalu menimpa config GUI.
- **Katalog used-only.** Picker default hanya menampilkan Aktif + Recent +
  Favorit + Alias (tanpa jaringan). Katalog penuh jadi opt-in:
  `/models --all` (live) atau cache disk bila sudah pernah dimuat. `/models
  <filter>` eksplisit tetap boleh live (pencarian), sehingga tes live lama tetap
  valid.

## Berkas berubah
- `bin/abelink.mjs` — VERSION dari package.json; `providerExplicit`/`modelExplicit`;
  `customEndpoint` dari auth.
- `bin/abelink-tui.mjs` — TUI_VERSION dari package.json; flag explicit;
  `TUI_HELP` menjelaskan `/models --all`.
- `bin/abelink-tui-v2.tsx` — bootstrap kirim flag hanya bila eksplisit;
  `/models --all|--refresh` set `deps.loadCatalog`.
- `sidecar/main/shared-config.js` (BARU) — `writeSharedConfig`/`readSharedConfig`/
  `pickSharedAiConfig`, whitelist field AI (token telegram TIDAK ikut).
- `sidecar/engine/channels/ai.mjs` — `sync-config` menulis snapshot (best-effort).
- `src/api/ai/headlessCli.js` — `sharedConfigToCliConfig`, `loadCliFileConfig`
  berlapis + adopsi GUI, `resolveCliAuth` mengembalikan `customEndpoint`.
- `cli/tui/engine.mjs` — `readCachedCatalog`, `modelPickerRows` used-only,
  case `model`/`models` pakai cache kecuali opt-in, endpoint dari auth.
- `cli/tui/App.tsx` — footer picker menampilkan bantuan navigasi + hint.
- `docs/ARCHITECTURE.md` — jembatan config GUI<->CLI/TUI.
- Tests: `tests/cliHeadless.test.mjs` (+5), `tests/cli-model-catalog.test.mjs`
  (+3), `tests/cli-tui-v2.test.mjs` (1 disesuaikan ke opt-in `loadCatalog`).

## Verifikasi
- `bunx vitest run` — **147 files / 1687 tests hijau** (naik dari 1680).
- `bun run lint` — exit 0.
- `grep -rn "1.1.0-alpha.5" bin src` (source, bukan data rilis) — bersih.
- `bin/abelink.mjs --version` = `package.json` = `tauri.conf.json`.
- PTY tmux: `/models` membuka picker instan, 11 baris (Aktif/Alias), footer
  `↑↓ pilih · ... (11 baris) · Katalog penuh: /models --all` — tanpa tumpang
  tindih.
- Adopsi GUI dibuktikan: shared.json `{aiProvider:"groq",groqModel:"llama-3.1-8b-instant"}`
  -> TUI `Model aktif: llama-3.1-8b-instant [langsung/groq]`; `resolveCliAuth`
  mengembalikan `{provider:"groq",model:"llama-3.1-8b-instant",apiKey:"gk-from-gui"}`.
- Frame sidecar `sync-config` end-to-end menulis `shared.json` mode 0600;
  `tgBotToken` TIDAK bocor ke file.

## Batasan dikenal
- Provider GUI `gemini-web` tetap GUI-only; TUI hanya menampilkan default jujur
  (bukan menjalankan gemini-web headless).
- `shared.json` menyimpan key AI agar CLI bisa memakainya (paritas `cli.json`
  yang sudah 0600); bukan jalur baru — Dexie & cli.json sudah plaintext.
- `/model <id>` non-alias tanpa `loadCatalog` memakai cache disk saja (ID
  langsung + warning "tak ada di katalog") — capabilities thinking dari katalog
  hanya tersedia setelah `/models --all`.
- `src/data/releases.json`/`whats-new.json` tetap memuat versi rilis yang
  dideskripsikan (artefak catatan rilis, diregenerasi pipeline), bukan identitas
  runtime.
- `.tsx` masih tanpa lint/typecheck (gap lama: eslint hanya `**/*.{js,jsx}`);
  App.tsx diverifikasi lewat PTY, bukan typecheck.
