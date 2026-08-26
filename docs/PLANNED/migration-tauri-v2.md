# Migration Plan — Electron → Tauri v2 (Rust)

Status: AKTIF — eksekusi berjalan (branch `tauri-migration`) · Tanggal: 2026-08-24
Prinsip: **semua diganti yang ringan, fungsi tidak berkurang malah nambah.**

---

## 0. Strategi (keputusan utama)

Upstream (`tauri-v2-migration`) memakai pola **hybrid sidecar**: shell Tauri (Rust) +
Node engine berjalan sebagai *child process* yang di-bridge lewat stdio
(`cmd_node_bridge.rs` → `node_invoke`), renderer pindah ke `frontend/` dan preload
diganti `frontend/api/tauri-bridge.js`.

Kita adopsi pola yang sama, dengan rencana penggantian bertahap modul sidecar → Rust
native supaya akhirnya benar-benar ringan (bukan cuma pindah kegemukan Node ke sidecar).

**END-STATE (final): FULL RUST.** Sidecar JS hanya scaffold fase A/B — target akhir
nol JS di runtime backend; seluruh channel jadi `.rs`.
Platform target: **Linux-only murni** (Windows/macOS dilayani upstream).

```
Fase A  Shell Tauri + Node sidecar  → paritas 100% cepat
Fase B  Port modul panas → Rust     → berat turun bertahap
Fase C  Sidecar dibunuh             → murni Rust + daemon Python (PC agent)
```

## 1. Peta penggantian komponen ("npm→bun, electron→tauri, apa lagi")

| # | Komponen sekarang | Pengganti | Fase | Catatan |
|---|---|---|---|---|
| 1 | npm | bun | ✅ selesai | lockfile: commit `bun.lock`, CI ikut bun |
| 2 | Electron 39 shell | Tauri 2.11 (Rust, wry/WebKitGTK) | A | bundle 150MB+ → ±20MB; RAM 350–500MB → ±100–150MB |
| 3 | preload/contextBridge (`window.api`) | `frontend/api/tauri-bridge.js` (invoke) | A | API surface SAMA → renderer nyaris tak tersentuh |
| 4 | Main process Node (`src/main/**`) | Node sidecar (jalan terus dulu) | A→B | upstream: `cmd_node_bridge.rs`; kita tiru lalu kikis |
| 5 | `node-tools.js` file ops | Rust `std::fs` commands | B | read/write/list/grep/find-files |
| 6 | `run-shell`/task-daemon | `tokio::process::Command` (bash) | B | spawn background task tetap ada |
| 7 | Tray + global shortcut | tauri tray-icon + global-shortcut plugin | B | feature flags `tray-icon` sudah dipakai upstream |
| 8 | Screenshot desktopCapturer | `screenshots` crate / daemon `mss` | B | Linux: daemon python sudah bisa |
| 9 | pc-agent (spawn daemon python/ps1) | tauri shell sidecar spawn — hampir 1:1 | B | `linux-daemon.py` TETAP hidup apa adanya |
| 10 | awareness/window-tracker (`active-win`) | daemon wmctrl/xdotool (sudah ada) | B | hilangkan dep npm `active-win` (native build ribet) |
| 11 | TTS `msedge-tts` (npm) | edge-tts sidecar python ATAU Rust ws impl | C | paling ringan: python `-t` one-shot |
| 12 | Telegram `telegraf` | **teloxide** (Rust) — fase C | C | long-poll harus hidup walau window tutup |
| 13 | AI HTTP client `ai-bridge.js` | awalnya tinggal di sidecar; akhirnya `reqwest` + streaming | C | rate-limit/backoff port ke Rust |
| 14 | browser-agent multi-session BrowserWindow | Tauri WebviewWindow per sesi + `eval()` DOM script | **C (tersulit)** | overlay cursor & unblock mode port manual |
| 15 | plugin-loader (dynamic ESM import) | eksekusi plugin di **Web Worker renderer** (sandbox) | C | ekosistem plugin JS tetap hidup tanpa V8 di main |
| 16 | skills watcher fs.watch | `notify` crate | B | trivial |
| 17 | youtube-dl-exec / ffmpeg-static | binary sama, dikirim via Tauri resources | B | tanpa perubahan perilaku |
| 18 | googleapis (calendar/gmail) | tetap di renderer (gapi/fetch) | — | OAuth flow di webview |
| 19 | Dexie + Orama + transformers.js | **tetap** (renderer IndexedDB/WASM) | — | lazy-load wasm sudah kita buat |
| 20 | electron-builder (NSIS/AppImage/deb) | tauri bundler | A | AppImage/deb + MSI nanti |
| 21 | electron-updater | tauri-plugin-updater | A | endpoint generic updater sama |
| 22 | CI build.yml (electron) | tauri-action workflow | A | trigger PR → base {versi} tetap |

## 2. Tahapan eksekusi

### Fase 0 — Persiapan (½ hari)
- [ ] Branch kerja: `tauri-migration` dari `5.5.0` (policy tetap: PR → {versi} → master)
- [ ] Install toolchain: `rustup`, system deps Linux (`libwebkit2gtk-4.1-dev`, `libappindicator3`, dll.)
- [ ] Clone lokal `Mazees/mark-agent` branch `tauri-v2-migration` sebagai referensi (JANGAN merge)
- [ ] Bekukan 5.5.x: hanya bugfix; fitur baru masuk backlog Tauri

### Keputusan struktur (FINAL — standard resmi Tauri v2 / create-tauri-app)
```
src/           # React renderer (pindahan src/renderer/**) — index.html & vite.config.* di root
src-tauri/     # Rust backend — nama standard Tauri, JANGAN diganti
sidecar/       # Node engine masa transisi (fase A–B), dibunuh di fase C
resources/     # binary eksternal (ffmpeg, yt-dlp, icon) — standard Tauri resources
```
Bukan `frontend/` ala upstream — kita pegang konvensi framework langsung.

### Fase A — Shell swap + paritas (target: app jalan identik)
- [x] A1: scaffold `src-tauri/` standard Tauri (capabilities/default.json, tauri.conf.json)
- [x] A2: migrasi `src/renderer/**` → `src/` + index.html & vite.config ke root (layout standard di atas)
- [x] A3: `tauri-bridge.js` = facade `window.api` penuh (±70 method preload sekarang) → invoke
- [x] A4: Node sidecar bridge (tiru `cmd_node_bridge.rs`) → SEMUA handler lama hidup tanpa port
- [x] A5: tray + singleton + deep-link + updater plugin
- [ ] A6: bundler AppImage/deb + CI tauri-action
- **Acceptance A:** semua tool inti (chat, memory, browser, PC-agent, telegram, TTS) berperilaku sama; RAM idle < 200MB; installer < 40MB

### Fase B — Kikis sidecar (ringan bertahap, urut murah→berat)
- [x] B0 (2026-08-26): cluster **lite & misc** → `src-tauri/src/cmd_misc.rs`
      (`misc_get_documents_path`, `misc_get_lite_mode`, `misc_save_temp_file`,
      `misc_open_external`, `misc_show_notification`). Handler sidecar + entri
      allowlist/approval di `cmd_node_bridge.rs` dibersihkan; `ping` sengaja tetap
      di sidecar (health-check proses engine). Bonus: perbaikan kehilangan `body`
      pada `showNotification` saat dipanggil posisional `(title, body)`.
Urutan port: (5) file ops → (6) shell/task → (16) watcher → (7) tray/shortcut → (8) screenshot → (9) pc-agent spawn → (10) tracker → (17) resources binary → (11) TTS
- Aturan: satu PR per modul, acceptance = tool-parity test + benchmark RAM/startup turun
- Setiap modul Rust yang matang: hapus dari sidecar entry

### Fase C — Yang berat
- [ ] C1: Telegram → teloxide (Rust), uji long-poll saat window ditutup
- [ ] C2: AI client streaming → reqwest (+ SSE parsing Groq/Gemini-web)
- [ ] C3: browser-agent → WebviewWindow per sesi + injected DOM tagger + eval loop
      (port: blocking overlay, animated cursor, ask-user unblock, preview thumbnail broadcast)
- [ ] C4: plugin runtime → Web Worker sandbox + API minimal (fs via invoke, net via fetch)
- [ ] C5: bunuh sidecar sepenuhnya → release "Mark Light" 6.x

## 3. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Paritas browser-agent (eval JS antar-webview beda perilaku dgn executeJavaScript Electron) | Prototype C3 lebih awal di spike 2 hari SEBELUM commit ke C3 penuh |
| Token OAuth Linear/GitHub & keytar storage | tauri-plugin-stronghold / keyring crate |
| Autoupdate channel beda format | parallel-run: electron-updater utk 5.x, tauri-updater utk 6.x |
| Multi-monitor & fullscreen egg (window-state IPC) | event listener Tauri `WindowEvent::Resized/FullScreen` |
| Regresi tak terdeteksi | checklist tool-parity otomatis (script smoke test invoke semua command) |

## 4. Metrik sukses (vs Electron 5.5.0)

- RAM idle: ≤ 150MB (dari ±400MB)
- Installer AppImage: ≤ 40MB (dari 120MB+)
- Cold start: ≤ 1.5s (dari 3–4s)
- Semua acceptance checklist fase A ✓ tanpa pengecualian fungsi

---
Referensi: upstream `tauri-v2-migration` (frontend/api/tauri-bridge.js, src-tauri/src/cmd_node_bridge.rs),
docs/PLANNED/sessions/2026-08-24_linear-integrasi-5.5.0.md (backlog B1–B4 tetap valid untuk 5.5.x).
