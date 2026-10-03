# Prototipe Server + WebUI BERDAMPINGAN (Fase B)

Status: prototipe bukti konsep. Desktop Tauri tetap DEFAULT dan tidak disentuh.
Branch: `feat/server-webui-prototype`. TIDAK merge — controller review + merge.

## 1. Arsitektur

Pola mark-agent (diverifikasi controller 2026-10-03 dari
github.com/Mazees/mark-agent): UI pindah web (Express + WS `/stream` + Edge
App Mode), otomasi desktop TETAP native via daemon lokal. Prototipe ini meniru
pola itu pada level struktur, dengan dua penyimpangan sadar:

- Transport: stdlib `node:http` via runtime Bun (`Bun` menjalankan `.ts`
  langsung, tanpa build). BUKAN Express — repo ini runtime Bun dan tambah
  dependensi dilarang bila stdlib cukup (`git diff bun.lock` kosong).
- UI: 1 halaman HTML statis, tanpa build step, tanpa framework (mark-agent
  memakai Edge App Mode; di sini browser biasa cukup untuk bukti konsep).

Transport localhost mengikuti arsitektur server lokal:
https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
(bind localhost).

```text
browser biasa ──HTTP 127.0.0.1:49719──> prototype/server.ts (Bun, stdlib saja)
   │                                          ├─ GET /health (bukti hidup)
   │                                          ├─ GET /api/chat-readonly (state SINTETIS)
   │                                          └─ GET / (+ /index.html) WebUI statis
   └── getUserMedia preview LOKAL (video element, tanpa kirim ke mana pun)

   TIDAK ADA jalur ke: src-tauri/, src/, sidecar engine, extension,
   Dexie/IndexedDB asli, APPROVAL_ACTIONS, ports beku.
```

## 2. File baru (HANYA ini — `git diff --stat` tidak boleh tunjuk file lain)

| File | Isi |
| ---- | --- |
| `prototype/server.ts` | Server HTTP lokal: stdlib `node:http` + `node:fs/promises` + `node:path` + `node:url`. Bind WAJIB `127.0.0.1` (preseden `sidecar/main/browser/bridge-core.ts` HOST). 2 endpoint + serve statis `prototype/webui/` dengan traversal guard (normalize + prefix check, probe `/../package.json` -> 404). Port konflik -> exit 2. |
| `prototype/webui/index.html` | 1 halaman statis, tanpa build, tanpa framework. 3 tombol: cek health, tampilkan sesi, `getUserMedia` preview lokal. |
| `docs/PLANNED/2026-10-03_server-webui-prototype.md` | Doc ini. |

Port: **49719** — di luar ports beku 49712/49713/1420, dicek kosong via `ss`
saat start (`PORT_49719_FREE`, bind hanya `127.0.0.1` terkonfirmasi `ss -tln`).

## 3. Cara jalan

```bash
# dari worktree / branch feat/server-webui-prototype
bun prototype/server.ts
# -> [proto] listening on http://127.0.0.1:49719
```

Buka `http://127.0.0.1:49719/` di browser: 3 tombol (health, sesi, camera).
Camera butuh konteks aman (localhost termasuk) + izin browser; stream hanya
dipasang ke `<video>`, tidak ada upload/WebSocket kirim frame.

## 4. Bukti hidup (quote perintah + output, 2026-10-03)

```bash
$ curl -s -w "\nHTTP %{http_code}\n" http://127.0.0.1:49719/health
{"ok":true,"proto":"server-webui","port":49719}
HTTP 200

$ curl -s -w "\nHTTP %{http_code}\n" http://127.0.0.1:49719/api/chat-readonly
{"ok":true,"readonly":true,"sessions":[{"id":"proto-session-1","title":"Sesi contoh (sintetis)","messageCount":2,"updatedAt":"2026-10-03T07:10:48.943Z"}],"note":"Snapshot sintetis Fase B. Bukan baca Dexie/IndexedDB asli."}
HTTP 200

$ curl -s -o /dev/null -w "index HTTP %{http_code} %{content_type}\n" http://127.0.0.1:49719/
index HTTP 200 text/html; charset=utf-8

$ curl -s -o /dev/null -w "traversal HTTP %{http_code}\n" "http://127.0.0.1:49719/../package.json"
traversal HTTP 404

$ curl -s -w "\nHTTP %{http_code}\n" http://127.0.0.1:49719/nope
{"ok":false,"error":"not-found"}
HTTP 404
```

## 5. Angka perbandingan (RSS server vs Fase A)

Metode: `ps -o pid,rss,vsz,etime,comm -p <PID>` (sesuai brief: `ps -o rss=`).

| Sampel | RSS | Catatan |
| ------ | --- | ------- |
| Serving (curl 4 endpoint berurutan) | **62780 KB (~61.3 MB)** | PID 667506, elapsed 00:28 |
| Idle +60 detik setelah serving | **46612 KB (~45.5 MB)** | PID sama, elapsed 01:03, `/health` tetap 200 |

Pembanding Fase A
(`docs/PLANNED/2026-10-03_heavy-load-measurement.md`): GUI Abelink
(WebKitGTK) TIDAK terukur langsung — blocked-with-evidence (risiko OOM saat
available sempat 187 MB, §5 doc itu). Angka terdekat yang terukur di Fase A:

- Total 18 proses `brave` (Chromium, kelas pembanding terdekat untuk "WebUI
  di browser"): **1840.2 MB** total RSS, top renderer 500184 KB (~488 MB).
- Boot sidecar headless (`bun sidecar/engine.ts`) -> `engine:ready`: 3.6 dtk.

Server prototipe (~46–61 MB RSS, idle-stabil turun) berada satu orde di bawah
satu proses renderer browser (~488 MB) dan dua orde di bawah total browser
(~1.84 GB). Ini angka proses Bun murni tanpa WebKitGTK — BUKAN klaim "lebih
ringan" untuk app lengkap: WebUI penuh masih butuh browser untuk render
(lihat batasan §6), jadi perbandingan ini hanya valid sebagai biaya proses
server pendamping, bukan total biaya solusi.

## 6. Batasan jujur

1. **Approval gate TIDAK direplika.** Prototipe read-only + camera preview
   saja; tidak ada endpoint tulis, tidak ada `APPROVAL_ACTIONS`, tidak ada
   dialog `rfd`. Jalur tulis butuh spek tersendiri (gate native tidak bisa
   direplika di browser tanpa native host).
2. **`/api/chat-readonly` = state SINTETIS**, bukan baca Dexie/IndexedDB asli.
   Skema Dexie zona beku — tidak diduplikasi ke prototipe. Renderer/GUI tetap
   satu-satunya pemilik state chat nyata.
3. **Biaya browser tidak termasuk** di angka §5. WebUI penuh tetap butuh
   browser untuk render halaman; angka RSS hanya proses server pendamping.
4. **Camera preview belum teruji end-to-end** di environment ini (headless,
   tanpa kamera/peramban GUI): tombol + `getUserMedia` wiring ada, status
   sukses/gagal ditampilkan di halaman. Butuh verifikasi di mesin dengan
   kamera + browser.
5. **Startup lambat pertama kali** (~10–13 dtk sebelum `listening`): transpile
   Bun di mesin berat (konsisten temuan Fase A), bukan cacat server.
   `curl` dalam 5 dtk pertama -> `connection refused`; tunggu log `listening`.
6. **2 error tsc terisolasi diperbaiki** sebelum smoke (`import.meta.dir`
   butuh augmentasi Bun-only -> pola existing `fileURLToPath`+`dirname`
   ala `scripts/build-manifest.ts`; `Response` wrapper -> interface
   `StaticHit` + `Buffer`). Gate penuh `typecheck:node` di §7.

## 7. Gates (status)

1. `bun run typecheck:node` exit 0 — ✅ (log background kosong = tanpa error;
   ~10 mnt di mesin berat, konsisten temuan Fase A). Catatan jujur:
   `prototype/**` TIDAK masuk `include` tsconfig.node.json (menambahkannya
   akan melanggar gate 3), jadi gate ini berarti program node existing tetap
   hijau. Sebagai asuransi, `prototype/server.ts` lolos `tsc --strict`
   single-file (`TSC_SINGLE_OK`) + `eslint` bersih (tanpa output).
2. Server start + `/health` 200 via curl — ✅ (§4).
3. `git diff --stat` HANYA `prototype/**` + 1 doc — ✅ (terverifikasi saat
   commit; `bun.lock`/`package.json` diff kosong = tanpa dep baru).
4. Corrupt-char scan bersih — ✅ (`rg` U+FFFD atas file baru: `SCAN_CLEAN`).
5. Commit + push branch, TIDAK merge — ✅ (lihat report Fase B).
