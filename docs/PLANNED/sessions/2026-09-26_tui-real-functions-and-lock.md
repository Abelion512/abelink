# 2026-09-26 (lanjutan) — TUI fungsi nyata, diagnosa input kosong, kunci ulang delegate_coding

## Permintaan
1. TUI sekarang "cuma tampilan"; `/` harus seperti CLI ink, `/effort`+`/model`
   belum menampilkan seperti claude-code, popup sesi tak muncul, dan startup
   langsung masuk sesi baru padahal user mungkin mau resume.
2. Kenapa kadang input kosong?
3. Apakah CLI/TUI/GUI disimpan ke trajectory? Kalau ya, baca chat TUI lalu buat
   plan migrasi fitur pluggable GUI -> TUI/CLI.
4. Lanjutkan paritas opencode (palette ctrl+p, dialog sesi, bottom cap);
   effort/model tetap diisi sendiri tapi di-cache + refresh berkala.
5. Kunci ulang `delegate_coding` ke opencode/hermes; bagaimana di TUI/CLI?

## Jawaban ringkas
- **Trajectory: TIDAK.** GUI menulis harness JSONL via Rust `harness_append`;
  CLI/TUI hanya menyimpan `~/.config/abelink/cli-sessions/*.json` (max 50 pesan,
  tanpa step/tool/trace). Bukti: `~/.local/share/abelink*/harness/2026-09-26`
  tidak ada padahal TUI dipakai hari ini. `cli/tui/usageStats.mjs` cuma membaca.
- **Input kosong: bukan bug "userInput tidak masuk"** (itu sudah diperbaiki pagi
  ini). Dari sesi nyata: prompt sama `jawab singkat: 1+1 berapa?` -> `Ya? Perlu
  apa.` (07:35) lalu `2` (07:44); `halo, who are you?` -> `Maksud?`. Hipotesis:
  combo async 9Router membalas `finish_reason: in_progress` dengan teks parsial
  yang lolos guard (guard hanya menolak bila teks KOSONG). Belum diterapkan
  patch buta; butuh instrumentasi dulu.
- **delegate_coding di TUI/CLI: belum ada** — hanya di renderer
  (`agentTools.js`). Rencana memindahkannya ke channel sidecar `coding:delegate`.

## Perubahan kode
- **Kunci ulang agen coding** ke opencode/hermes (permintaan #5): `PREFERRED_CODING_AGENTS`
  kembali 2 entri + filter deteksi dipulihkan; `agentTools.js` tetap impor dari
  bridge (satu sumber); deskripsi `core-tools.js`/`toolCatalog.js`/`planning.js`
  dikembalikan; test `codingAgentBridge` menambah kasus "codex/claude TIDAK
  terdeteksi walau binary ada (locked)".
- **TUI fungsi nyata** (`bin/abelink-tui-v2.tsx`, `cli/tui/App.tsx`):
  - Overlay generik berkategori: `kind: 'model' | 'commands' | 'sessions'`.
  - `ctrl+p` / `/commands` -> command palette (daftar + deskripsi, ↑↓, Enter,
    filter). Sebelumnya `App` memanggil `props.onCommands` yang tidak pernah
    dioper -> tombol mati.
  - `/sessions` -> dialog sesi (Enter = lanjut via `/continue <id>`), menggantikan
    daftar teks.
  - Layar awal (hero + versi + tips + arahan resume) saat belum ada pesan.
  - Bottom cap prompt `▀` (pola opencode prompt/index.tsx).
- `cli/tui/theme.mjs`: `TUI_COMMANDS` + `/commands`; `bin/abelink-tui.mjs`:
  `parseSlashCommand` kenal `commands`; `cli/tui/engine.mjs`: case `commands`
  (mode pipe = daftar teks); `TUI_HELP` diperbarui.
- `docs/PLANNED/2026-09-26_tui-parity-and-pluggable-migration.md` (BARU): jawaban
  trajectory + diagnosa input kosong + tabel paritas + PLAN-T1..T4 (trajectory
  headless, finish_reason, retry 1x), PLAN-D1..D3 (cache/refresh metadata
  model-effort), dan rencana migrasi pluggable (registry surface-aware +
  channel `coding:delegate`).

## Verifikasi
- `bunx vitest run` subset CLI/agen: **7 files / 182 tests hijau**; lint exit 0.
- PTY tmux (140x36) tiga keadaan: (1) home hero + bottom cap `▀▀▀` + sidebar;
  (2) `ctrl+p` menampilkan 14 perintah + deskripsi + hint; (3) `/sessions`
  menampilkan 10 sesi tersimpan dengan outcome/waktu/prompt.

## Batasan dikenal
- Dialog effort bergaya slider claude-code dan dialog model kaya deskripsi BELUM
  (masuk PLAN-D3); streaming token TUI masih `TUI_STREAM_ENABLED=false`.
- Trajectory headless masih PLAN; selama belum ada, bug intermiten sulit
  dibuktikan.
- `delegate_coding` belum tersedia di TUI/CLI (PLAN-E5).
- Patch `in_progress` sengaja TIDAK diterapkan tanpa bukti (hindari patch buta).
