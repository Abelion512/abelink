# Pengukuran Beban Berat — Baseline Mesin Owner (Fase A)

Tanggal: 2026-10-03. Worktree: `.worktrees/measure` (branch `docs/measure-heavy-load`, base main @ 6532c5d3).
Semua angka = output perintah nyata. Metode: kutip perintah + nilai.

## 1. Baseline idle sistem

Perintah:

```bash
free -m; uptime
```

Output (13:29):

```text
Mem:  7789 total, 5887 used, 866 free, 1918 buff/cache, 1902 available
Swap: 6143 total, 3170 used, 2973 free
13:29:53 up 7:01, 1 user, load average: 3.43, 1.87, 1.65
```

Perintah:

```bash
ps aux --sort=-%mem | head -15
```

5 besar (RSS): `opencode` 1043876 KB (13.0%), `opencode` 903332 KB (11.3%),
`brave --type=renderer` 494872 KB (6.2%), `brave` (browser utama) 324512 KB (4.0%),
`delta-app` 277352 KB (3.4%). Sisanya: hermes gateway, WebKitWebProcess,
next-server, cinnamon, coucou.

Status: RAM 75.6% terpakai + swap 51.6% terpakai SEBELUM Abelink jalan.
Mesin sudah dalam kondisi tekanan memori (konteks keluhan owner valid).

## 2. Proses Brave nyata

Perintah:

```bash
ps -o pid,rss,comm -C brave | sort -k2 -n -r | head -30
```

Biner nyata: `brave` (paket `/opt/brave.com/brave/brave`, launcher `/usr/bin/brave-browser`).
18 proses brave total (`pgrep -c -x brave` = 18), 10 di antaranya renderer
(`pgrep -c -f "brave --type=renderer"` = 10).

Top RSS (KB): 500184 (renderer), 324324 (browser utama), 225980 (renderer),
141544 (renderer), 134224 (renderer). Total RSS semua proses brave:

```bash
ps -o rss= -C brave | awk '{s+=$1} END {print s/1024 " MB"}'
# -> 1840.2 MB
```

Catatan: jumlah tab browser tidak bisa dihitung pasti dari CLI (satu renderer
bisa melayani beberapa tab); yang terukur = 10 proses renderer, total 1.84 GB.

## 3. Jalur headless sidecar (pengganti dev.sh penuh)

`bash scripts/dev.sh` penuh butuh `tauri dev` = compile Rust dari nol
(`src-tauri/target/` tidak ada di worktree ini) + jendela WebKitGTK.
Di tengah swap 51% itu tidak dijalankan (risiko OOM + waktu puluhan menit).
Sebagai gantinya diukur jalur yang SAMA yang dipakai GUI untuk engine:
`bun sidecar/engine.ts` langsung (package.json: `"harness": "bun sidecar/engine.ts"`).

### 3a. Boot engine sampai `engine:ready`

```bash
START=$(date +%s.%N); echo '' | timeout 60 bun sidecar/engine.ts | head -c 600
# START=1791009087.185603446 NOW=1791009090.820806502 -> 3.6 detik
# stderr kosong. 90+ channel terdaftar.
```

### 3b. `browser:status` (bridge tanpa ekstensi)

```bash
printf '%s\n' '{"id":7,"action":"browser:status","payload":[]}' | timeout 30 bun sidecar/engine.ts
# START=1791010987.631 NOW=1791010991.135 -> 3.5 detik
# {"id":7,"success":true,"data":{"ready":true,"port":49712,
#   "sessions":[{"id":"default",...,"connected":false,...}]}}
```

Bridge naik di `127.0.0.1:49712` (flavor prod), native-host manifest terdaftar
untuk 6 profil browser (chrome, chromium, brave, edge, dst.), tetapi
`connected:false` — tidak ada sesi ekstensi yang terhubung di mesin ini.

### 3c. `browser:read-dom` — BLOCKED (hang, evidence)

```bash
printf '%s\n' '{"id":1,"action":"browser:read-dom","payload":[]}' \
  | timeout 60 bun sidecar/engine.ts
# exit=124 (timeout 60s habis), tidak ada respons id:1.
# Hanya engine:ready + log "[BrowserBridge] listening on 127.0.0.1:49712".
```

Penyebab di kode: `sidecar/main/browser/bridge-core.ts:33`
`COMMAND_TIMEOUT_MS: 90000` — perintah menunggu ekstensi via long-poll sampai
90 detik sebelum gagal. Tanpa ekstensi terpasang, `read-dom` gantung penuh.
Ini perilaku by-design (fail-slow, bukan fail-fast) dan temuan ukur yang sah:
latensi `browser:*` tanpa ekstensi = 90 detik (timeout), bukan milidetik.
Rekomendasi tindak lanjut: pertimbangkan fail-fast saat `connected:false`
(sebelum `dispatchCommand`), di luar scope doc ini.

### 3d. Smoke `ping` (kontrol jalur stdio sehat)

```bash
printf '%s\n' '{"id":9,"action":"ping","payload":[]}' | timeout 30 bun sidecar/engine.ts
# {"id":9,"success":true,"data":"pong"} — 1.2 detik (termasuk boot engine).
```

### 3e. Bootstrap `dev.sh --no-launch` (tanpa GUI/cargo)

```bash
START=$(date +%s); timeout 120 bash scripts/dev.sh --no-launch | tail -15
# START=1791011022 NOW=1791011039 -> 17 detik, exit=0.
# bun install: no changes [9.11s]. sidecar binary: bundle 1599 modules [6.8s].
# dev namespace: data=~/.local/share/abelink-dev bridge=49713 id=abelink.linux.dev.
# port 1420 free, no cargo build holders.
```

## 4. Memori akhir + delta

Perintah `free -m; uptime` (14:03, setelah semua uji headless):

```text
Mem:  7789 total, 6692 used, 187 free, 1829 buff/cache, 1097 available
Swap: 6143 total, 5681 used, 462 free
14:03:25 up 7:35, 1 user, load average: 14.88, 11.99, 8.59
```

Delta vs baseline: RAM used +805 MB, available -805 MB, swap used +2511 MB,
load 1-min 3.43 -> 14.88. Penyebab dominan: compile sidecar (`bun build`,
1599 modul) + `bun install` check + engine headless berulang — BUKAN Abelink
GUI (tidak pernah dijalankan). Beban ukur ini sendiri memperberat mesin.

## 5. Yang TIDAK terukur (blocked-with-evidence, untuk owner di mesin utama)

- `tauri dev` penuh (langkah 3 brief: waktu start -> `loop poll jalan`):
  butuh compile Rust dari nol tanpa `src-tauri/target/` di tengah swap >90%.
  Tidak dijalankan; risiko OOM nyata (available sempat 187 MB).
- `browser:*` end-to-end dengan ekstensi: `connected:false`, tidak ada sesi
  ekstensi di environment ini. Butuh: pasang ekstensi MV3 (`bun run build:extension`,
  load unpacked), pairing ke port dev 49713, tab aktif, lalu ulangi 3c —
  ekspektasi latensi milidetik–detik, bukan 90s timeout.
- Waktu handshake GUI (`loop poll jalan` di log prod): butuh instansi GUI;
  titik timing preseden ada di `docs/PLANNED/2026-10-03_extension-connect-no-delay.md`
  (server.ts:124-130, bridge-core.ts:268-279).

## Ringkasan angka (5 baris)

| # | Titik ukur | Angka |
|---|------------|-------|
| 1 | Baseline: RAM used / swap used | 5887 MB / 3170 MB (dari 7789 / 6143) |
| 2 | Brave nyata: 18 proses, total RSS | 1840.2 MB (top renderer 500184 KB) |
| 3 | Boot sidecar headless -> `engine:ready` | 3.6 detik, stderr kosong |
| 4 | `browser:read-dom` tanpa ekstensi | hang 60s+ (timeout perintah 90s, `connected:false`) |
| 5 | Delta akhir: RAM +805 MB, swap +2511 MB, load 14.88 | beban dari tooling ukur, bukan GUI |

Skenario terdefinisi untuk pengulangan owner: langkah 1–5 brief ini +
perintah di atas; ganti 3a–3c dengan `bash scripts/dev.sh` penuh +
`browser:read-dom` via ekstensi terpairing bila mesin utama punya headroom.
