# Session Log — Pengukuran MV3 Keepalive di Chrome Nyata

- **Tanggal:** 2026-09-27
- **Branch:** `refactor/m2c-headless-observability`
- **Permintaan owner:** "Ukur keepalive MV3 di Chrome nyata: berapa sering service worker suspensi dan apakah handshake self-heal menutupnya."
- **Konteks:** sesi sebelumnya memverifikasi audit koneksi secara hermetik (`tests/browserAuditVerify.test.mjs`, 12 test). Klaim platform MV3 (alarm `abelink-bridge-keepalive periodInMinutes: 1`, suspensi idle ~30s) saat itu masih ASUMSI — sesi ini mengukurnya di Chrome sungguhan.

## Metode (bebas-distorsi)

- Chrome: **Google Chrome 153.0.8010.36** nyata, headed (DISPLAY :0), profil harness terpisah (`--user-data-dir` tmp), tanpa flag pengubah kebijakan suspensi.
- Extension dimuat via CDP **`Extensions.loadUnpacked`** + `--enable-unsafe-extension-debugging` (Chrome 137+ menghapus `--load-extension`; sumber: developer.chrome.com blog Juni 2025, chromedevtools.github.io Extensions domain).
- **Debugger tidak pernah menempel ke service worker** (attach CDP mem-pin SW hidup dan memalsukan hasil). Observasi lifecycle = sweep HTTP `/json/list` 4 Hz + debounce 1.2s (dua sweep tanpa target SW = suspensi).
- Bridge ASLI (`sidecar/main/browser/server.mjs`) jalan di child process pada port kanonik dev 49713, token file di XDG tmp. Aktivitas inbound extension diobservasi via delta `lastSeenAt` (admin `/sessions`) — bukan sniffing TCP (kolisi flavor prod/dev).
- "Tangan user" = `chrome.runtime.sendMessage({type:'start'})` dari popup asli (Runtime.evaluate di tab popup, bukan SW target) — sekali di awal.
- FAITHFUL HARNESS: manifest native messaging host disalin ke `<user-data-dir>/NativeMessagingHosts/` (Chrome mencari manifest di dalam user-data-dir; bukti probe) + `ABELINK_DATA_HOME` Chrome diarahkan ke token tmp agar helper dev membaca token harness.

## Artefak (harness, reusable — tanpa perubahan kode app)

- `scripts/mv3-keepalive-measure.mjs` — parent harness; mode `full` (S1-S3b, ~19 menit), `ABELINK_MV3_QUICK=1` (smoke), `ABELINK_MV3_MODE=s3only` (S0+S3s+S3c, ~6 menit). Laporan JSON di `~/.local/share/abelink-mv3-measure/mv3-keepalive-report.json`.
- `scripts/mv3-measure-bridge-child.mjs` — child bridge asli + admin kecil (`/start-bridge`, `/stop-bridge`, `/hold-bridge` (sink TCP: poll menggantung), `/drop-session` (+`regenToken`), `/dispatch`, `/sessions`).
- `scripts/mv3-native-host-probe.mjs` — probe `chrome.runtime.sendNativeMessage` dari konteks popup (tanpa attach SW).

## Temuan

- **F1 — Steady-state (bridge hidup, loop poll jalan): 0 suspensi.** Long-poll 25s + backoff 1.5s menajaga aktivitas; gap inbound 17-27s (poll timeout 25s + backoff). Long-poll = keepalive paling efektif; klaim "suspensi ~30s saat aktif" TIDAK terjadi.
- **F2 — Outage (bridge mati, loop fast-fail tiap 1.5s): 0 suspensi.** Resolusi fetch (gagal pun) mereset timer idle MV3.
- **F3 — Outage total (loop tidak jalan): SW suspensi ~30s setelah aktivitas terakhir, dan alarm keepalive membangunkan SW persis tiap 60.0s** (wake #3-#6: delta 60.0s; suspensi 30.0-30.2s; run-1 juga 60.0s). Alarm `periodInMinutes: 1` TERUKUR akurat — dua asumsi platform dari audit kini terbukti.
- **F4 — Poll menggantung (koneksi setengah-terbuka, disimulasikan sink TCP `hold-bridge`): SW TETAP hidup** (fetch in-flight menahan SW) dan perintah tersaji 1.5s setelah bridge hidup kembali.
- **F5 — Self-heal session-drop (token valid): TERBUKTI.** Sesi di-drop → dispatch → tersaji 21ms (loop hidup) dan 1.5s (pasca-outage).
- **F6 — Self-heal token basi (regen file token): TERBUKTI dengan helper hidup.** Loop 401 → `getTokenViaNativeHost` → token baru dari file → poll 200 → perintah tersaji **1.8s**; pasca: `running:true, lastError:null`. Keberhasilan bergantung ketersediaan helper NMH.

## Temuan tambahan (gap nyata, bukan artefak)

- **Gap G1 — `tryAutoResume` tidak punya pemulihan 401.** Ia hanya konsultasi helper bila token session-storage kosong. Dengan token basi-terisi (tanpa helper terjangkau), ia handshake 401 berulang tanpa pernah minta token baru. Kondisi ini hanya tercapai bila helper gagal + SW pernah suspensi; loop hidup menutupnya lewat jalur 401 loop.
- **Gap G2 — Redundansi keepalive.** Selama `wantConnected`, alarm keepalive 60s tidak lagi memegang peran menahan suspensi (F1/F2: loop sendiri cukup); ia kini berperan sebagai detektor loop-mati (branch `!loopActive` → `loop()`). Arsitektur tetap sehat tanpa perubahan.

## Implikasi ke rekomendasi audit sebelumnya

- RC3 (latch `startError`) tetap prioritas 1 — tidak berubah.
- RC1a (TTL 5 menit): pengukuran ini MENGUATKAN posisi keduanya; extension membuktikan pulih otomatis lewat handshake reseed, jadi TTL ketat aman untuk kasus normal (self-heal F5/F6). Pilihan relax 15m tinggal fallback defensif, bukan kebutuhan terukur.
- RC4/RC5 tidak tersentuh pengukuran ini.

## Verifikasi

- Run valid: s3only (hold + S3c) x2, quick x2, run-1 (outage alarm-cycle). Laporan akhir: `~/.local/share/abelink-mv3-measure/mv3-keepalive-report.json`.
- `bun run lint`: **exit 0, 0 error** (1012 warnings = baseline terdaftar).
- Pasca-run: tidak ada proses Chrome/child tersisa; manifest NMH prod+dev menunjuk data home asli (`ensureNativeHost` dipanggil ulang di finally — pola afterAll `browserAuditVerify`); token tmp terhapus.
- Bukti helper: probe langsung — prod host `ok:true tokenLen:32`; dev host `ok:false "token file missing"` hanya karena file tmp sudah dibersihkan (saat run file ada, S3C_SERVED membuktikannya).

## Batasan

- Satu mesin, satu versi Chrome (153), Linux Mint/X11; perilaku MV3 bisa berbeda antar versi/OS.
- Profil harness ≠ profil harian (tanpa extension lain yang bisa menjaga SW lewat pesan).
- Varian "dispatch SAAT SW suspensi" tidak terwujud sebagai kasus terpisah: SW tidak pernah suspensi selama ada fetch in-flight (F2/F4); ketika loop tidak jalan, alarm selalu membangunkan dalam ≤60s — jalur pemulihannya sama dengan yang sudah terbukti (F5/F6 + temuan run-1).
- Fase smoke memakai durasi pendek (40-60s per fase); temuan alarm-cycle berasal dari run-1 + run-2 (window >4 menit, 6 siklus konsisten).

## Langkah lanjut (menunggu keputusan owner)

1. Eksekusi fix RC3 (retry/reset latch `startError`) — kini dengan bukti pengukuran penuh.
2. Patch kecil G1: di `tryAutoResume`, bila handshake 401 `token-stale`/`token-unknown` → panggil `getTokenViaNativeHost` sekali sebelum menyerah (menutup jalur pemulihan terakhir yang sempit).
3. Opsional: dokumentasikan di `docs/ARCHITECTURE.md` §6 bahwa keepalive MV3 kini TERUKUR (alarm 60.0s, suspensi ~30s idle, self-heal e2e terbukti di Chrome nyata) — menutup bagian "runbook manual" untuk lapisan `chrome.*`.
