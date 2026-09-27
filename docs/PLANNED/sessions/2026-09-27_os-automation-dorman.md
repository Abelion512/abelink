# Session Log — Keputusan & Eksekusi Dorman os-automation (P0)

- **Tanggal:** 2026-09-27
- **Branch:** `fix/bridge-rc3-g1-mv3-keepalive` (menerus di atas PR #64)
- **Pemicu:** prioritas P0 halaman 5W1H — "putuskan nasib os-automation (osTools/pc-agent)".
- **Keputusan owner (2 tahap ratifikasi):** dorman default, anti over-engineering; adaptasi Wayland ditunda sampai ada kebutuhan nyata.

## Data pemutus (harness logs prod+dev, dibaca langsung — bukan copas)

- Total 1.380 tool call (prod 1, dev 1.379).
- **Surface visual os-read/click/type/key/scroll/ocr/double-click = 0 call** di prod+dev — klaim 5W1H "os-* tak pernah dipakai real" terkonfirmasi untuk jalur visual.
- os-* yang hidup: `os-control-close` 42 (mayoritas plumbing teardown — `useAbelinkPlan` memanggil paksa di 2 titik akhir tugas, bukan otonomi agen), `os-open` 3, `os-search` 1. Subtotal os-* 3,3%.

## Audit de-Windows (catatan owner: "tools Windows diadopsi mentah perlu penyesuaian")

- Mesin automation **sudah Linux-native**: `pc-agent.js` + `linux-daemon.py` (X11/xdotool/mss/pytesseract) + 3 skrip bash Linux; **tidak ada** PowerShell/cmd.exe/notepad di jalur os-*.
- `run-powershell` = alias kompatibilitas ke `run-shell` (tanpa PowerShell nyata) — sesuai kebijakan Linux-only.
- Allowlist `os-open` ternyata **deny list** `.exe/.msi/.bat/.ps1/.sh/.py/...` — keamanan benar, bukan adopsi mentah.
- Sisa debt: 2 docstring "era Win32" (kosmetik) di `linux-daemon.py`.
- **Debt adaptasi nyata = Wayland**: semua visual path X11-only (`require_x11()` Rust + daemon). Wayland melarang injeksi input lintas-aplikasi by design (xdotool tak berlaku); adaptasi butuh ydotool/uinput atau protokol per-compositor. → backlog, bukan kerusakan.

## Perubahan

- `src/api/tools/group-tools.js` — `pc_automation.dormant: true` + `dormantReason` (data + cara aktifkan); definisi TETAP ada (reversible). `loadGroupToolsText` meneruskan jawaban dormant (bug ditemukan saat sanity: sebelumnya null/miss senyap).
- `src/api/ai/planning.js` + `src/api/subagent/subagentExecutor.js` — daftar grup di prompt difilter `!v.dormant` (planner + sub-agent berhenti merekrut); contoh teks prompt tak lagi menyebut `pc_automation`.
- `src/api/tools/core-tools.js` — contoh `read-tools` dibersihkan dari `pc_automation`.
- `src/api/tools/toolCatalog.js` — step 1b `resolveReadToolsQuery`: grup dormant dijawab `isDormant: true` + pesan jujur SEBELUM pencocokan grup biasa.
- `src/pages/Guidebook.jsx` — banner status DORMAN di kategori PC Automation (data + cara aktifkan + catatan X11-only).
- `docs/ARCHITECTURE.md` §6 + `docs/MIGRATION-GAPS.md` — status dorman + data + audit de-Windows.

## Yang TETAP HIDUP (tidak tersentuh)

- `os-open` core tool (direkrut di prompt default; dipromosikan planning untuk buka file hasil tugas).
- Plumbing `os-control-open/close` (overlay + teardown via `executeNativeTool`).
- Emergency stop end-to-end (Ctrl+Shift+S → `pc-agent.js` `triggerEmergencyStopExternal`).
- Seluruh kode mesin (sidecar + Rust `os.rs`) — hanya rekrutmen prompt yang dimatikan.

## Verifikasi

- `tests/dormantPcAutomation.test.mjs` BARU — 7/7: dormant flag + alasan; filter prompt planner & sub-agent; `read-tools pc_automation` jujur (menyebut DORMAN/os-open/Wayland); grup lain tak terdampak; os-open tetap core; plumbing terdaftar; kode mesin tak dihapus.
- Sanity mekanik: `loadGroupToolsText('pc_automation')` → pesan dormant; `advanced_browser` → normal.
- Vitest penuh: **1751/1751 (155 file)** — run pertama sempat 2 flaky (tidak terulang; stderr test crash-path yang memang mensimulasikan ECONNREFUSED).
- `bun run lint`: exit 0, **42 warnings** = baseline persis (2 warning baru dari filter sempat muncul — `([k, v])` → `([, v])` — lalu dibereskan, termasuk memperbaiki regex testnya).

## Batasan & langkah aktifkan kembali

- Dorman = rekrutmen prompt saja; agen masih BISA memanggil `os-click` dsb. bila tahu namanya (tak ada hard block) — hard block sengaja tidak dibuat (anti over-engineering, dan read-tools memberi konteks jujur bila model menemukannya).
- Aktifkan ulang: set `dormant: false` pada `pc_automation` di `group-tools.js` + keputusan owner; sebelum Wayland didukung, surface tetap X11-only.
- Hard block opsional + adaptasi Wayland = backlog, tidak dijadwalkan.
