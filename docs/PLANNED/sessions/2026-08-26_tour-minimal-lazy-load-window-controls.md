# Session Log — Tur Setup Minimal + Lazy Load Menyeluruh + Window Controls Wizard

## Ringkasan
**Keywords:** tour minimal required steps, driver.js anchor hantu, filterExistingSteps, spotlight overlay opacity, lazy whisper voice engine, preload boot dihapus, sidecar lazy import getter, engine.mjs load-when-needed, skills cache TTL invalidation, skills-updated event, planning fs scan per giliran, window controls first setup, back button configuration, groq validation fallback whisper-small, mcp connectors lazy design, plugin channel dorman tauri

- **Tanggal:** 2026-08-26 · **Mode:** rencana disetujui user via exit_plan_mode (interview-me dulu)
- **Files touched:** `src/utils/driverTour.js` (baru), `tests/driver-tour.test.js` (baru), `src/api/skillsCache.js` (baru), `docs/PLANNED/mcp-connectors-lazy.md` (baru), `src/pages/Configuration.jsx`, `src/App.jsx`, `src/api/ai/planning.js`, `src/components/core/InputBar.jsx`, `src/pages/Skills.jsx`, `sidecar/engine.mjs`, `src/assets/main.css`
- **Apa & kenapa:** Keluhan user "UI/UX banyak bug" ternyata satu rantai: wizard setup tanpa WindowControls (`App.jsx:!hasConfig`), tur Driver.js menunjuk anchor hantu (`#tour-embed-provider`, `#tour-tg-admin` tak pernah ada; `#tour-groq-key` kondisional), dan validasi Groq memblokir simpan sehingga user terjebak di config. Patch ini: (1) tur dipangkas jadi 3 langkah WAJIB saja dengan filter elemen nyata-terlihat; (2) Whisper tidak lagi di-preload boot — sudah lazy by design di jalankan transkripsi; (3) 8 modul berat sidecar konversi eager→lazy getter sehingga startup instan dan polling awareness tertunda sampai dipakai; (4) daftar skill di-cache (TTL 5 menit + invalidasi event `skills-updated`) sehingga tidak fs-scan tiap giliran agen; (5) WindowControls hadir di cabang wizard + grip dapat `data-tauri-drag-region`; (6) fallback otomatis ke Whisper Small saat setup memilih STT Groq tanpa key (mode normal tetap divalidasi); (7) dokumen desain connector MCP lazy sebagai pegangan fitur berikutnya.
- **Audit Trail (Anti-Duplication Gate):** grep docs `minimal tour|lazy whisper|sidecar lazy|skills cache|mcp connector|back button` → hanya `2026-08-24_linear-integrasi` (tak relevan); `git log --grep lazy|tour` → hanya `2957e50` lazy-load transformers WASM (cakupan beda); semantic check keywords 8 session log existing → tidak ada yang menyentuh scope ini. LULUS.

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
| --- | --- | --- | --- | --- |
| Tur menunjuk `#tour-embed-provider` & `#tour-tg-admin` yang tak ada di DOM mana pun | `Configuration.jsx` (effect tour lama) | Langkah ditulis manual tanpa verifikasi anchor | Tour dipangkas ke 3 langkah wajib + helper `filterExistingSteps` menyaring elemen hantu/hidden sebelum `drive()` | FIXED |
| `#tour-groq-key` kondisional hilang saat default STT=local → spotlight melayang | `Configuration.jsx:1111` vs tour lama | Anchor bergantung state yang belum dipilih | Langkah dihapus dari tur minimal; filter tetap jaga-jaga | FIXED |
| User terjebak di wizard: simpan diblokir STT Groq tanpa key | `handleSaveConfiguration` | Validasi keras tanpa jalur keluar di first-setup | `isFirstSetup` → fallback otomatis `'whisper-small'` + lanjut simpan via `effectiveConfig`; mode normal tetap blokir | FIXED |
| WindowControls hilang saat `!hasConfig` | `App.jsx:365-367` | Cabang wizard merender Configuration telanjang | Fragment `<WindowControls /><Configuration/>` | FIXED |
| Tombol Back "hilang" | `Configuration.jsx:606` | Sudah ada tapi disembunyikan di first-setup (by design); user sedang di mode itu | Tidak diubah untuk wizard (router belum aktif di cabang tsb); akar masalah = bisa simpan. Mode normal Back eksisting berfungsi | AKAR DIPAHAMI |
| Boot mengunduh Whisper meski tak dipakai | `App.jsx` langkah 1.6 | Preload historis | Blok dihapus; `transcribeAudioLocal` sudah lazy (`localWhisper.js:67`) | FIXED |
| Sidecar memuat 8 modul berat saat startup (telegram/google/youtube×2/workspace/tracker/ai/node-tools) | `engine.mjs:25,58,121,133,146,153,166,174` | Top-level await import | Registry `lazy()` getter; semua handler `await getX()`; `engine:ready` kini instan | FIXED |
| Daftar skill di-scan filesystem setiap giliran agen & InputBar mount | `planning.js:58`, `InputBar.jsx:87` | Tidak ada cache | `skillsCache.js`: TTL 5 menit + auto-invalidate event `skills-updated`; Skills.jsx pakai `force:true` | FIXED |
| Overlay redup kurang fokus | `main.css:.driver-overlay` | Opacity 0.7 | Naik ke 0.8 (blur dipertahankan) | FIXED |
| Drag window mati di Tauri | grip `App.jsx` | Tanpa `data-tauri-drag-region` | Atribut ditambahkan | FIXED |
| Channel `plugins:*` dorman di garis Tauri (tidak di engine.mjs maupun ALLOWED_ACTIONS) | — | Wiring belum dipindah ke arsitektur baru | Didokumentasikan; wiring future wajib pola lazy (lihat mcp-connectors-lazy.md) | DOCUMENTED |

## Files Modified

| File | Perubahan |
| --- | --- |
| `src/utils/driverTour.js` | BARU — `isElementVisible`, `filterExistingSteps`, `startDriverTour` |
| `tests/driver-tour.test.js` | BARU — 8 unit test (hantu/hidden/intro/urutan/invalid selector/null driver) |
| `src/api/skillsCache.js` | BARU — cache TTL + invalidasi event |
| `docs/PLANNED/mcp-connectors-lazy.md` | BARU — kontrak connector MCP load-when-needed |
| `src/pages/Configuration.jsx` | Builder `buildSetupTourSteps()` 3 langkah; effect gated `[isFirstSetup, loadingMemory]` + cleanup + ref guard; state `touring` + reveal 6 section; tombol Panduan (FaQuestionCircle); fallback validasi `effectiveConfig` |
| `src/App.jsx` | Hapus preload Whisper; WindowControls di cabang `!hasConfig`; grip `data-tauri-drag-region` |
| `src/api/ai/planning.js` | getSkills → getCachedSkills |
| `src/components/core/InputBar.jsx` | reloadSkills → getCachedSkills |
| `src/pages/Skills.jsx` | loadSkills → getCachedSkills({force:true}) |
| `sidecar/engine.mjs` | Registry `lazy()`; 8 modul dikonversi; handler async mengambil modul sendiri |
| `src/assets/main.css` | `.driver-overlay` opacity 0.7 → 0.8 |

## Agent Learnings
- `git show HEAD:f | npx eslint --stdin` adalah cara cepat baseline warning; bandingkan pesan ternormalisasi (strip nomor baris + collapse spasi) — padding prettier membuat diff mentah 100% false-positive.
- Prettier warning "berpindah bentuk" setelah edit teks class yang sama bukan warning baru; hitung per-kelas pesan, bukan total mentah.
- Driver.js v1 tidak toleran anchor hantu: selalu filter langkah berdasarkan DOM nyata sebelum drive(), dan gate timing pada state halaman (bukan setTimeout buta) plus ref guard untuk StrictMode double-effect.
- Saat merestrukturisasi validasi yang menyuntik `setConfig`, jangan andalkan state untuk save di baris berikutnya — pakai objek efektif lokal.
- Konversi top-level `await import` → lazy getter di dispatcher stdio harus menyapu SEMUA referensi identifier lama termasuk yang dipakai lintas-handler (kasus `tg` di `sync-config`); grep regex daftar method per modul untuk memastikan nol sisa.

## File Invariants
| File | Invariant |
| --- | --- |
| `sidecar/engine.mjs` | `ping` tetap terdaftar (health-check bridge); frame `engine:ready` wajib emit pertama; protokol JSON-lines tak boleh berubah tanpa sinkron `cmd_node_bridge.rs` |
| `src/utils/driverTour.js` | Setiap tour baru WAJIB lewat `startDriverTour`, tidak boleh panggil `driver()` langsung |
| `src/api/skillsCache.js` | Halaman editor skill wajib `{force:true}`; konsumen lain non-force |

## Verification Checklist
- [x] Anti-Duplication Gate lulus (audit trail di atas)
- [x] `bunx vitest run` — 18/18 pass (termasuk 8 test helper baru)
- [x] `bun run build` sukses (1m19s) — JSX seimbang
- [x] eslint file baru: 0 problem; legacy: App.jsx malah turun 28→6 warning, lainnya setara baseline (delta Configuration teridentifikasi sebagai perubahan bentuk pesan prettier kelas yang sama + 1 no-unused-vars berkurang)
- [x] `node --check sidecar/engine.mjs` + grep nol referensi eager usang
- [ ] Smoke runtime `bun tauri dev` (perlu lingkungan build): wizard 3 langkah tepat sasaran, simpan tanpa key masuk main app, rekam suara pertama memicu unduh progres, replay Panduan dari config normal, telegram auto-start saat sync-config berisi token
- [ ] `bash scripts/verify.sh` penuh sebelum push/commit

## Callback
Untuk smoke runtime: mau saya pandu langkah pengujian manualnya satu per satu setelah Anda jalankan `bun tauri dev`, atau langsung lanjut rancang implementasi MCP connector mengikuti dokumen desain yang baru dibuat?

## Update 2026-08-26 — Smoke Runtime Live + 5 Bug Hasil Log Console

User menjalankan `bun run app` di lingkungan agent; console webview ditempel lengkap. Konfirmasi sukses: simpan setup TANPA Groq key berhasil (fallback bekerja), boot tanpa unduh voice engine, pipeline AI hidup lewat lazy getter, WASM SIMD gagal → auto Lite Mode hash embedding sesuai desain. Lima bug baru ditemukan & difix:

| # | Gejala di log | Akar | Fix |
| --- | --- | --- | --- |
| 1 | `(await getTracker()).getActivityBuffer is not a function` tiap check-in | Nama metode salah sejak era lama — ekspor asli `window-tracker.js` = `getBuffer`/`flushBuffer`, plus tracking belum pernah distart | Handler engine pakai nama asli + `startTracking()` sekali (`trackerStarted` guard); guard `powerMonitor?.getSystemIdleTime?.() ?? 0` karena powerMonitor tak ada di runtime bun |
| 2 | `Aksi tidak diizinkan: plugins:list` tiap planning | Channel dorman (tak ada handler + tak ada di allowlist) | Handler `plugins:list` (metadata-only via plugin-loader lazy) + entri ALLOWED_ACTIONS |
| 3 | Unhandled rejection `tg:broadcast-to-admins` tiap giliran | Tak ada handler + UI memanggil tanpa cek koneksi bot | Handler engine baca `latestConfig.tgAdminIds` → loop `sendTelegramMessage`; status disconnected = `{skipped:true}` sunyi; guard ganda di `tauri-bridge.tgBroadcastToAdmins` |
| 4 | `dialog:open-file/directory` ditolak gerbang saat lampir file & pilih workspace | Masih stub Fase B5 | **Dipercepat ke native**: command Rust `misc_open_file_dialog`/`misc_open_directory_dialog` (rfd di main thread, pola mpsc); bridge reroute; stub dihapus dari engine |
| 5 | `TypeError: toolError.message.includes` di useMarkPlan:732 | Reject invoke Tauri berupa string mentah, bukan Error | Normalisasi `typeof === 'string'` sebelum akses `.message` |

Verifikasi tambahan: `engine:ready` instan; uji protokol stdio langsung (stdin dijaga terbuka — EOF prematur = artefak test, bukan bug): awareness→[], broadcast→{skipped:true}, plugins→[], send-message→frame error elegan. Aplikasi live auto-rebuild via watcher tauri dev (1m28s).

Sisa diketahui: `take-screenshot` & `os:*` masih stub Fase B5/B6; WASM SIMD WebKitGTK tak didukung → Lite Mode hash embedding aktif (by design).
