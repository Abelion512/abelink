# Session log — 2026-09-26 — M2b: `cli/core` + keputusan aset merek

Program: P1 (JS→TS / wave M2b) + P2 (seam Hermes) · Blocker ditutup: **B-9**

## 1. Keputusan aset merek (mark)

**Dipilih: maskot kuning (karakter), bukan foto mobil.** Alasan yang bisa
diperiksa, bukan selera:

| Kriteria | Foto mobil | Karakter kuning |
|---|---|---|
| Legal | **Tidak layak**: logo trident Maserati terlihat di moncong + watermark fotografer (`A. Sciabbarra`) tertanam di piksel | Tidak ada cap pihak ketiga di gambar |
| Legibilitas 16×16 (manifest extension mencantumkan `icon16.png`) | **Gagal**: adegan penuh (lantai, refleksi, latar pabrik), tanpa alpha → jadi coretan | Siluet bulat + dua mata masih terbaca saat diperkecil |
| Semantik produk | Objek (mobil) | Karakter — cocok dengan posisi Abelink sebagai *companion* (persona, mood, relational growth) |
| Sistem desain | Paletnya bersaing dengan tema holografik gelap | Kuning hangat = aksen di atas tema gelap |

Target penggantian (semuanya dari SATU sumber, sesuai TASK.md item 1):
`src-tauri/icons/*` (semua ukuran + `.icns`/`.ico`/iOS/Android via `tauri icon`),
`extension/icons/icon{16,32,48,128}.png`, `resources/icon.png` + `icon.ico`,
`assets/banner-repo.png` (README baris 3).

**Prasyarat yang belum bisa saya penuhi (blocker jujur):** agen tidak bisa
menyimpan biner dari chat, jadi berkas gambar harus ada di repo dulu. Sekaligus
perlu konfirmasi hak pakai maskot: `TASK.md` item 2 (lisensi) masih menggantung,
dan aset pihak ketiga akan membawa masalah yang sama seperti logo Maserati.

**Alat yang dibuat:** `scripts/apply-brand-assets.sh` (+ `bun run brand:icons`).
Menulis ulang **semua** target dari satu PNG persegi agar tidak ada campuran
ikon lama/baru. Dipakai setelah berkas di-drop:

```bash
bash scripts/apply-brand-assets.sh assets/mark-source.png \
  [--banner assets/banner-wide.png]
```

## 2. M2b — `cli/core` diekstraksi dari `bin/abelink-tui.mjs` (B-9)

`bin/abelink-tui.mjs`: **942 → 558 baris**. Modul baru:

| Berkas | Isi |
|---|---|
| `cli/core/paths.mjs` | `ROOT`/`SIDECAR_ENTRY`/`BUN_BIN` dihitung dari lokasi modul (bukan `bin/`) |
| `cli/core/constants.mjs` | `TUI_VERSION`, `EFFORT_LEVELS`, `SESSION_MESSAGE_CAP`, `TUI_STREAM_ENABLED`, batas `@file`, `TUI_HELP` |
| `cli/core/parser.mjs` | `parseSlashCommand`, `resolveTuiModel`, `parseEffortLevel`, `parseShellLine`, `parseTuiArgs`, `buildAiFetchBody` |
| `cli/core/render.mjs` | `renderThoughtLine`, `renderStepLine` |
| `cli/core/files.mjs` | `extractFileRefs`, `resolveFileRefs` (+ shim fs testable), `buildAgentsMd` |
| `cli/core/turn.mjs` | `createTuiTurn`, `makeAbortedToolResult`, `checkTurnAborted`, `nextPromptAction` |
| `cli/core/session-store.mjs` | `loadFase1Store`, `loadTuiSession`, `saveTuiSession`, `listTuiSessions`, `sessionToInitialHistory` |
| `cli/core/sidecar-client.mjs` | `createSidecarClient` (JSON-over-stdio, anti-orphan `process.once('exit')`) |
| `cli/core/index.mjs` | pintu masuk tunggal (barrel) |

`bin/abelink-tui.mjs` tinggal: header + impor + readline loop + `main()` +
`export * from '../cli/core/index.mjs'` (permukaan lama utuh untuk
`tests/cli-tui.test.mjs` yang mengimpor 23 nama dari sana).

**Perubahan perilaku: nol.** Yang berubah hanya lokasi kode. Dua detail yang
gampang salah dan sudah ditangani: (a) path relatif `headlessCli.js` di
`session-store.mjs` jadi `../../src/api/ai/headlessCli.js`; (b) `bin/abelink-tui.mjs`
tidak lagi mengimpor `node:child_process` `spawn`, `node:url`, dan tidak lagi
punya `__dirname`/`ROOT`/`SIDECAR_ENTRY`/`BUN_BIN` (dipakai internal
`sidecar-client`).

Konsumen dipindah ke `cli/core`: `cli/tui/engine.mjs` (impor statis +
`buildAiFetchBody` dinamis), `bin/abelink-tui-v2.tsx` (5 titik impor),
`cli/tui/types.ts` (komentar).

## Verifikasi

| Cek | Hasil |
|---|---|
| `bunx vitest run` | **148 file / 1695 test hijau** |
| `bunx vitest run tests/cli-tui.test.mjs tests/cli-tui-v2.test.mjs` | 104 test hijau (10.5s) |
| `bun run typecheck` / `typecheck:node` | exit 0 / exit 0 |
| `bun run lint` | exit 0 (0 error, 42 warning = intrinsics OpenTUI) |
| `bun run build` | sukses |
| Smoke v1 (pipe) | `printf '/help\n!echo SHELL-OK\n/exit\n' \| bun bin/abelink-tui.mjs` → banner + help + exit 0 |
| Smoke v2 (PTY tmux 140×36) | hero `• Abelink v1.1.0-alpha.5`, sidebar Context/MCP/LSP, tips `/sessions`, footer — parity terjaga |
| DoD B-9 `grep -rn "\.\./bin/" cli/` | kosong (sisa sebutan hanya di komentar asal-usul) |
| `scripts/apply-brand-assets.sh` | 3 guard (tanpa argumen, berkas hilang, tidak persegi) exit 1 dengan pesan jelas; happy path 1024×1024 hijau, lalu aset uji **di-`git checkout --`** (working tree bersih) |

## Berkas berubah

- **Baru**: `cli/core/{paths,constants,parser,render,files,turn,session-store,sidecar-client,index}.mjs`,
  `scripts/apply-brand-assets.sh`
- **Diubah**: `bin/abelink-tui.mjs`, `bin/abelink-tui-v2.tsx`, `cli/tui/engine.mjs`,
  `cli/tui/types.ts`, `package.json` (`brand:icons`),
  `docs/PLANNED/2026-09-26_master-migration-program.md` (M2b ✅, B-9 ✅)

## Batasan dikenal

- `cli/core` masih JS (keputusan D3: engine `.mjs` dulu, tipe di `types.ts`).
  Konversi `.mjs` → `.ts` = M4 saat boundary disentuh, bukan sekarang.
- Ikon belum benar-benar diganti: menunggu berkas sumber + konfirmasi hak pakai
  maskot (`TASK.md` item 1 & 2).
- `resources/icon.png` + `icon.ico` **tidak direferensikan** kode mana pun
  (hanya `TASK.md`); tetap ditulis ulang oleh skrip demi paritas target owner.
- M2c (H5 tool hooks + trajectory headless) belum jalan.
