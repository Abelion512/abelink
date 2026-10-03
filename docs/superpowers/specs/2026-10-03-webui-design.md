# SPEC — WebUI Abelink (React TS + serve Bun + approval auto + jembatan data)

Tanggal: 2026-10-03 | Status: disetujui owner (interview brainstorming) | Mentahan: `design/v1/` + `design/abelink_ai_os_dashboard.html`

## 0. Keputusan terkunci (interview)

1. Visual: hitam-putih + hijau/merah saja, gold dicabut, no orb, BG foto v1 sebagai aset lokal.
2. AI-slop WebUI: eksekusi impeccable, font display berkarakter, larangan nested-div/border-dalam-border/elemen tanpa fungsi, tangga ponytail.
3. Serve: `bun run web` pola opencode (127.0.0.1 + buka browser otomatis), WebUI React TS, desktop tetap default.
4. Scope bertahap: home dulu, 5 page review 1-per-1 (projects, memory, studio, network, settings).
5. Approval: auto-default + deny-list, pola dipelajari dari user (file + restu), web dulu desktop nyusul, deny-list awal isi pola `rm -rf ~`-kelas.
6. Prinsip repo direvisi: internet selalu boleh, model cloud-first, klaim 100% lokal ditarik.
7. Data: satu sumber kebenaran, Vault Obsidian tetap satu-satunya. Jembatan: A-murah dulu (renderer dorong snapshot), A-penuh ala Hermes (sidecar SQLite) menyusul bila chat web dibutuhkan.

## 1. Arsitektur

```
bun run web
  └─ server Bun (127.0.0.1, port 49xxx bebas, preseden 49719)
       ├─ serve bundle React (webui/dist, hasil vite build)
       ├─ GET /health, GET /api/snapshot (baca snapshot terakhir)
       ├─ POST /api/push-snapshot (hanya dari localhost + token file 0600 — renderer dorong)
       ├─ approval engine: cek allow-file → deny-list → auto-allow pola baca → usulkan rule baru
       └─ buka browser otomatis (preseden: opencode web)
renderer desktop (tidak diubah perilakunya, +1 fungsi dorong)
  └─ tiap perubahan sesi/chat → POST snapshot ke server lokal (best-effort, gagal diam)
```

Preseden: opencode `web` (https://opencode.ai/docs/web/) untuk pola serve; Hermes `AIAgent` + SQLite tunggal (https://hermes-agent.nousresearch.com/docs/developer-guide/architecture) untuk satu sumber kebenaran; Anthropic permission modes + auto mode classifier (https://docs.anthropic.com/en/docs/claude-code/permissions) untuk auto-default + deny-list.

## 2. Visual (Seksi 2 terkunci)

- Dasar hitam-putih (kaca gelap `#07090d`-kelas + teks putih/abu), hijau = ready/active/success/go, merah = error/stop/destruktif/offline. Warning non-blokir = putih + ikon (tanpa warna ketiga).
- Font display berkarakter (serif editorial untuk headline, lihat referensi ArtVista/Archevo), sans hanya body/UI kecil. Tanpa sans generik di mana-mana.
- BG: file foto v1 sebagai aset lokal (`webui/src/assets/bg-night-city.jpg` — konversi dari PNG referensi, optimasi ukuran). Tanpa orb; focal point = konten, bukan dekorasi.
- Approval menyatu bahasa visual: kaca gelap, isi to-the-point (aksi + target + risiko), 3 tombol (sekali / selalu / tolak). Tanpa kotak-dalam-kotak.
- Page: home dulu (+penyesuaian kecil dari mockup lama). projects/memory/studio/network/settings masing-masing direview 1-per-1 sebelum dibangun — tidak borongan.

## 3. Approval engine (web saja, desktop tetap rfd)

- Urutan cek per aksi: allow-file (hasil restu user + bawaan) → deny-list → auto untuk pola baca → pola baru = usulkan rule (prompt sekali, format approval §2) → setelah restu, tidak pernah ditanya lagi untuk pola itu.
- Allow-file: JSON di data dir (`~/.local/share/abelink/web-allow.json`, format manusiawi, bertahan antar sesi). Usulan rule baru tertulis di file hanya setelah restu eksplisit.
- Deny-list awal (tertulis, bisa ditambah dari file): hapus rekursif/pola `rm -rf ~`-kelas, tulis di luar workspace, `git push`/publish, kirim data ke luar localhost, ubah allow-file/deny-list itu sendiri.
- Belajar pola (digital cloning): engine mencatat pola aksi yang direstui/ditolak; pola berulang yang direstui naik jadi usulan allow permanen. Tidak ada model ML — pencocokan pola deterministik (prefix/perintah + target). Bisa diaudit penuh dari file.
- Desktop: tetap `APPROVAL_ACTIONS` rfd sampai web terbukti aman (keputusan migrasi terpisah).

## 4. Jembatan data (A-murah)

- Renderer desktop: fungsi `pushSnapshot()` — baca ringkasan sesi/chat terakhir dari Dexie → POST ke `127.0.0.1:<port>/api/push-snapshot` dengan token file 0600 (preseden token bridge). Best-effort: gagal = diam, tidak mengganggu desktop.
- Server: simpan snapshot terakhir di memori DAN file JSON data dir (survive restart; dibaca saat start bila ada). Endpoint baca tanpa auth (localhost saja, preseden bridge browser).
- A-penuh (sidecar SQLite ala Hermes) TIDAK dikerjakan sekarang — pintu dibuka bila chat web dibutuhkan. Jangan campur ke fase ini.
- Larangan: web tidak punya store sendiri (tidak ada localStorage data, tidak ada duplikat Vault).

## 5. Endpoint (Fase 1: dashboard read-only)

| Endpoint | Arah | Status |
| --- | --- | --- |
| `GET /health` | baca | ada (PR #133) |
| `GET /api/snapshot` | baca (snapshot nyata dari renderer) | baru, A-murah |
| `POST /api/push-snapshot` | tulis (localhost + token) | baru, A-murah |
| `GET /api/chat-readonly` (sintetis) | baca | dipertahankan sementara, dilabeli, dihapus setelah snapshot nyata jalan |
| Jalur tulis lain (task, command, config) | — | DILARANG sampai approval engine (§3) hidup + dispek |

## 6. Batasan jujur

- Tidak ada angka palsu: belum tersambung = dilabeli.
- Tidak ada jalur tulis sebelum approval engine hidup.
- Internet boleh (CDN, fonts, model cloud) — prinsip 100% lokal dicabut (§0.6).
- `bun.lock` tetap tanpa dep baru untuk server; WebUI React boleh dep build-nya sendiri (terisolasi di `webui/`).
- Zona beku tetap: ports 49712/49713/1420, wire frame engine, skema Dexie (hanya dibaca, tidak diubah), K9.

## 7. Testing

- Server: curl `/health` + `/api/snapshot` 200; traversal `..%2f` 404; push tanpa token 401.
- Renderer dorong: unit test push best-effort (gagal diam, tidak throw ke UI).
- Approval: tiap pola deny-list ada 1 test (minta izin, tidak auto); pola allow bawaan ada 1 test (tidak prompt).
- Vitest suite tetap 1836 baseline (atau naik bila test baru ditambah — tidak boleh turun).
