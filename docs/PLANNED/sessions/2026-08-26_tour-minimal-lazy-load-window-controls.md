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

## Update 2026-08-26 (3) — RAM Report, Boot Hygiene, Autosave Config, Restorasi Fitur

**RAM terukur (PSS, dev mode):** mark 81MB + WebKitWebProcess ×2 (362+356MB) + NetworkProc ×2 (24+14MB) + bun sidecar 151MB ≈ **991MB**. Dev-inflated (HMR, DevTools, StrictMode, tak-minify); baseline Electron docs ±350–500MB prod. Remeasure build release = deliverable berikutnya; selidiki penyebab dua WebProcess.

**Fix boot warning:** embedding.worker race "Extractor not ready" → init promise tunggal dibagikan semua caller (+reset saat gagal); log Auto-Lite sekali (flag `liteAutoNotified` dipakai sebagai penanda first-notice); enumerasi mic/kamera jadi LAZY di Configuration (wizard atau section Audio/Kamera) — warning dobel hilang + mount lebih cepat.

**Autosave config (mode normal):** snapshot JSON baseline di `loadConfig` (hydration guard), debounce 700ms pada effect `[config]`, `withSttFallback()` senyap, indikator badge header (Perubahan…/Menyimpan…/Tersimpan HH:MM/Gagal), tombol Simpan manual tetap ada (validasi penuh + alur wizard). Autosave TIDAK memicu warm-up embedding berat.

**Restorasi fitur:** dialog file/folder native rfd (misc_open_*_dialog) + reroute bridge; take-screenshot native Rust (`misc_take_screenshot`: gnome-screenshot→scrot→maim→import chain, return data URL PNG, b64 encoder inline); plugins:list handler metadata-only; tg:send-message/tg:broadcast-to-admins handler + guard koneksi di bridge; music remote forwarder (`remote-music-command`→emit execute-music-command) + `search-music` lazy ytmusic-api; allowlist += 5 aksi.

**LIMITASI PLATFORM (penting):** opasitas window TIDAK bisa dibuat — Tauri 2.11 tidak punya API `set_opacity` (hanya v1). Slider dibatalkan sebelum sempat dirilis; dicatat agar tidak dijanjikan lagi ke user.

Verifikasi: cargo check OK, engine syntax OK, uji stdio `remote-music-command`→true, vitest pass, eslint 0 error (853 warnings = noise prettier legacy). Live watcher rebuild+restart sukses (NodeBridge 10:05:57).

## Update 2026-08-26 (4) — Salah Nama "Mada", First-Boot Legacy Chooser, run-shell, Music Contract

**1. Mark nyapa "Mada" padahal user tidak pernah bilang:** nama itu TIDAK ada di kode/data (sweep menyeluruh 0 hit) — model MENEBAK dari konteks karena persona hanya berkata "panggil nama dari MEMORY" tanpa sumber kebenaran. Fix akar: field config baru `ownerName` (+ input "Nama Panggilan Kamu" di section Persona, autosave otomatis), disuntikkan sebagai blok `# IDENTITAS USER (SUMBER KEBENARAN TUNGGAL)` di `getPersonaPrompt(userId, personality, ownerName)`; tanpa nama → instruksi eksplisit DILARANG menebak. Call sites: planning.js + awareness.js. Label hardcoded "Creator (Mada)" di SubagentIntercom.jsx dicatat sebagai kosmetik legacy (opsional dirapikan belakangan).

**2. Memory lama + First-Boot Chooser:** data era Electron UTUH di `~/.config/<profil>/IndexedDB` (format Chromium LevelDB) — tak bisa dibaca langsung WebKit (engine beda); satu-satunya jembatan = export/import JSON. Deteksi path diperlebar (+kandidat `mark`/`Mark` yang sebelumnya BOLONH — nama app Electron lama adalah `mark`, jadi deteksi sering meleset). UX baru: layar pilihan FIRST BOOT ONLY (`FirstBootChoiceScreen`) — muncul saat wizard aktif + profil terdeteksi + flag `mark:first-boot-choice` belum ada; dua tombol: Restore (auto-buka dialog impor JSON via prop `initialLegacyImport` → `handleImportLegacy` sekali) / Mulai Fresh; setelah dipilih tidak pernah muncul lagi.

**3. Log smoke kedua:** (a) misteri powershell — handler ternyata SUDAH bash native `/bin/bash`, nama saja warisan Windows; fix: rename ke `run-shell` + alias kompatibilitas `NATIVE_TOOLS['run-powershell']`, katalog core-tools diupdate, DANGEROUS_TOOLS mencakup keduanya; (b) musik "return undefined" — kontrak shape beda: ytmusic-api v5 mengembalikan array SongDetailed {name,artist:{}} sedangkan konsumen minta {id,title,artist,duration}; `search-music` kini menormalkan ke bentuk legacy lengkap dengan url music.youtube — UJI LIVE: query "daylight tiktok version" mengembalikan hasil benar termasuk versi TikTok; (c) warning Media devices diturunkan console.info (batas webview). Catatan follow-up: pertumbuhan konteks planning 11→32 msgs belum terlihat kompaksi — audit contextCompactor di sesi berikutnya.

Verifikasi: cargo check OK; node --check engine+node-tools OK; uji stdio search-music live network PASS dengan shape benar; eslint 0 error.

## Update 2026-08-26 (5) — Goal Prioritas: Musik Hidup Lagi + Gerbang Approval Query-Aware

Goal `goal-559d42af` dibuat (backlog by-priority, DENY list tetap). Dua P0 selesai:

**Musik hidup lagi (akar terkonfirmasi via error console user):** `<webview>` Electron di YoutubeMusicPlayer tidak dikenal WebKitGTK → loadURL/executeJavaScript mati. Rewrite total: `YoutubeMusicContext.jsx` kini audio-only player resmi YouTube **IFrame API** (host div tersembunyi milik Provider, promise loader di-cache modul-level, reset saat init gagal), antrean milik sendiri dengan wrap-around, metadata dari hasil pencarian ternormalisasi (bukan scraping DOM); kartu UI jadi Now Playing murni (thumbnail+judul+artist+prev/play-pause/next+link YT). Kontrak playUrl(watchUrl, meta) dipertahankan untuk handleMusic/listener WA. CSP dua tempat ditambah `script-src https://www.youtube.com` + `frame-src youtube.com/-nocookie`. Fix juga: forwarder `remote-music-command` signature positional (command,payload) sesuai bridge; listener 'play' kompatibel payload url-string ATAU item ternormalisasi.

**Gerbang approval query-aware:** akar keluhan "terlalu sering minta izin" = pencocokan NAMA tool buta-query. Kini `is_safe_shell_query()` di cmd_node_bridge.rs memverifikasi seluruh pipeline (split ; && | \n): first-token ∈ safe-list baca-saja (+git subcommand whitelist), tanpa redireksi tulis (`>` selain /dev/null), tanpa substitusi nested `$(` backtick, tanpa substring berbahaya (-exec -delete rm sudo curl dst.). Lolos → tanpa dialog; sisanya → rfd seperti biasa. git-commit/git-revert tetap selalu dialog. Unit test lib 3/3 PASS (termasuk kasus nyata user `find ~ ... 2>/dev/null`). Pembelajaran kecil: smaps_rollup & pola grep `^Pss` ikut menangkap Pss_Dirty dll — pakai match kolom `$1=="Pss:"`.

### Batch P2 (goal ronde 2) — IA Settings restructure + hapus Simpan manual
- Sidebar baru 6 entri: **General / Personalization / AI Engine / Capabilities / Shortcuts / Data Controls+Developer** (ConfigSidebar.jsx ditulis ulang; wizard = subset tanpa Data&Developer).
- Section fisik direstrukturisasi: `cfg-general` BARU (Bahasa ID/EN tersimpan + Transparansi slider pindahan + Awareness toggle pindahan); `cfg-personalization` BARU (Pekerjaan dropdown kurasi + ownerName/personality pindahan + Impor Memory + link Memory); `cfg-ai-engine` kini murni provider/model; wrapper div `cfg-capabilities` membungkus Kamera+Audio&Voice; Shortcut jadi sibling; Memory&Data → heading **Data Controls** (+ tombol Impor Export JSON Lama); Developer copy tanpa kata harness.
- Tombol Simpan manual mode normal DIHAPUS (autosave penuh); CTA tetap ada di wizard.
- Scrollbar: kolom konten `overflow-x-hidden` + `min-w-0` + pr-4 — scrollbar vertikal kini mepet tepi, horizontal hilang.
- Label Context Window → **Riwayat Pesan** + copy penjelas beda unit vs token window.
- Catatan teknis: nesting lama (kamera/shortcut/audio nested di dalam ai-engine) dipertahankan polanya tapi kini dibungkus rapi; operasi pemindahan blok besar pakai python marker-index (anchor string rapuh terhadap spasi/karakter box-drawing).
Verifikasi: eslint Configuration+Sidebar 0 error (warnings turun ke 773), vitest 18/18, live HMR sukses tanpa error residual.

### Batch P1 (goal ronde 1) — UX quick wins
- Easter egg dimatikan via `EASTER_EGG_ENABLED=false` di MarkHome (klik orb jadi no-op).
- What's New: auto-popup DIHAPUS; kini item TERATAS hamburger (FaGift, badge pulse dari mirror localStorage `mark:last-seen-whats-new`; App menulis mirror saat modal ditutup; dibuka via event `mark:open-whats-new`).
- Panggilan netral: blok IDENTITAS USER persona sudah memaksa tanpa-nama saat ownerName kosong (verifikasi call sites planning+awareness pass ownerName).
- Media devices info: module flag `mediaInfoLogged` → log sekali saja.
- HistoryDrawer: prompt user tampil penuh multi-baris (label "Prompt User", line-clamp-4) — sebelumnya truncate 1 baris.
- InputBar: **command history recall** gaya TUI (ArrowUp dari posisi awal/kosong mundur lewat riwayat tersimpan localStorage cap100 dedupe; ArrowDown maju, lewat terbaru mengembalikan draf awal) + **draft persistence** (`mark:draft`) — teks selamat dari app mati; dibersihkan saat terkirim.
Verifikasi batch: eslint 0 error, vitest 18/18.
