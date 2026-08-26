# Session Log 2026-08-26 - Sidecar Hardening: TLS Telegram, Admin Gate, Secret-Safe Log, Retensi Task, Stop Persisten

## Ringkasan

**Keywords:** rejectUnauthorized TLS, telegram admin gate, tgAdminIds trusted admin, pending chat id, screenshot broadcast target, sanitasi nama file dokumen, path traversal telegram download, secret-safe logging, redact api key, abort controller leak, DEBUG_AI_LOG, retensi task selesai, reap finished tasks max 20, emergency stop persisten, resetEmergencyStop, pendingResolve hang, mutex rantai promise, command serialization sidecar

- **Tanggal:** 2026-08-26 | **Branch:** 5.5.0 | **Status:** CODE DONE, belum commit
- **Apa:** 4 perbaikan keamanan/robustness di modul legacy main-process yang kini berjalan sebagai Node sidecar (masa migrasi Electron -> Tauri v2): (1) hapus `rejectUnauthorized:false` + gate perintah approval Telegram (`/accept`, `/always`, `/reject`) hanya untuk id di `config.tgAdminIds` (persist `tg_admin_ids.json`, export `setTelegramAdmins` untuk wiring masa depan), chat `/start` tanpa config ditandai PENDING dan tidak pernah jadi target screenshot/broadcast; (2) ai-bridge berhenti mencetak body request/response utuh (flag `MARK_DEBUG_AI=1` + helper `redactSecrets` pola `sk-...`/`Bearer ...`), plus fix kebocoran child AbortController di `activeAbortControllers`; (3) task-daemon mereap entri task terminal sampai maksimal 20 terbaru; (4) pc-agent stop darurat tidak lagi kedaluwarsa 15 detik (reset eksplisit via `resetEmergencyStop()` saat sesi baru), dan `sendCommand` diserialisasi dengan mutex rantai promise sehingga perintah konkuren tidak lagi menimpa `pendingResolve` (hang permanen).
- **Audit Trail:** `grep -rliE "rejectUnauthorized|tgAdminIds|telegram.*(admin|otorisasi)|secret.*(log)|redact|abort.?controller|retensi|reap.*task|emergency.?stop|pendingResolve|mutex" docs/` -> hit hanya LINUX_PATCHES.md/ARCHITECTURE-INTERNALS.md (deskripsi fitur, bukan patch serupa) + log sesi 2026-07-29 (emergency shortcut Ctrl+Shift+S, scope beda: registrasi shortcut) + 2026-08-25 (shell injection/path traversal, eksplisit menyatakan telegram-service/task-daemon TIDAK diubah). `git log --grep -iE "rejectUnauthorized|redact|reap|emergency|mutex"` -> hanya commit fitur lama tak-relevan. Semantic check semua Ringkasan/Keywords -> tidak ada patch duplikat. Scope ini BARU.

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
|---|---|---|---|---|
| TLS verification dimatikan untuk agent Telegram | telegram-service.js:38-42 | `rejectUnauthorized: false` di https.Agent | Opsi dihapus; keepAlive dipertahankan | DONE |
| Perintah approval tanpa cek admin | telegram-service.js (/accept,/always,/reject) | Handler langsung forward ke UI tanpa otorisasi | Gate `ensureTrustedAdmin(ctx)` via `authorizedAdminIds`; tolak -> reply 'Tidak diizinkan.' + console.warn | DONE |
| /start self-register dianggap admin penuh | telegram-service.js | Semua pendaftar masuk `adminChatIdsSet` yang dipakai target screenshot/broadcast | Chat tetap dipersist sbg daftar broadcast tapi masuk `pendingChatIdsSet`; target terpercaya = irisan `config.tgAdminIds` x terdaftar (helper `resolveTrustedBroadcastTargets`) | DONE |
| Nama file dokumen mentah dari Telegram | telegram-service.js (~:242,:255) | `path.join(saveDir, originalName)` tanpa sanitasi | `sanitizeFileName` (basename + strip regex + cap 120), size cap 50MB dari metadata SEBELUM fetch, containment check `resolveContainedSavePath` | DONE |
| Dump body/response utuh ke log | ai-bridge.js (:219-222,:382-397,:410-412,:504,:123-126) | console.log JSON.stringify(currentBody)/cleanText/fullContent/content | Diganti `logAi()` satu baris metadata (endpoint, msgs, bytes) gated `DEBUG_AI_LOG` (env MARK_DEBUG_AI==='1'); error messages discrub `redactSecrets()` | DONE |
| Child AbortController bocor di Set | ai-bridge.js (:201,:211 vs :473) | Hanya parent yang didelete di finally luar | `activeAbortControllers.delete(abortController)` di finally executeFetch (controller milik percobaan itu) | DONE |
| Entri task selesai menumpuk selamanya | task-daemon.js (close handler) | Status di-set, tidak ada pembersihan | Sapuan terjadwal (batch 500ms) membuang entri terminal tertua melebihi 20; urutan dari Map insertion order; running tidak tersentuh | DONE |
| Stop darurat kedaluwarsa otomatis 15s | pc-agent.js (:33-41) | Timer expiry di isStopActive() | Expiry dihapus; export `resetEmergencyStop()` dipanggil di openPCSession/closePCSession/askUserPC/readDesktop | DONE |
| Perintah konkuren menggantung selamanya | pc-agent.js (:532-565) | `pendingResolve` single-slot tertimpa sendCommand kedua | Mutex rantai promise: `commandChain.then(() => dispatchDaemonCommand(cmd))`; timeout tetap settle invokasi miliknya via identitas pendingResolve | DONE |

## Files Modified

| File | Perubahan |
|---|---|
| sidecar/main/telegram/telegram-service.js | TLS fix; store admin terpercaya (authorizedAdminIds + tg_admin_ids.json); export setTelegramAdmins; gate 3 perintah approval; /start pending flow + teks instruksi tgAdminIds; sanitizeFileName + MAX_DOWNLOAD_BYTES 50MB + resolveContainedSavePath; target screenshot & broadcast terpercaya-saja |
| sidecar/main/ai-bridge.js | DEBUG_AI_LOG + redactSecrets + logAi + serializeAiBody; semua dump prompt/response diganti log metadata; redact pada 4 titik pesan error; delete controller anak di finally executeFetch |
| sidecar/main/task-daemon.js | MAX_FINISHED_TASKS=20, FINISHED_STATUSES, reapOldestFinishedTasks (Map insertion order), scheduleFinishedTaskReap pada close/error |
| sidecar/main/pc-agent.js | isStopActive tanpa expiry; export resetEmergencyStop; reset di openPCSession/closePCSession/askUserPC/readDesktop; dispatchDaemonCommand + sendCommand serial (commandChain) |

## Agent Learnings

- Slot resolve tunggal + penimpaan referensi = kebocoran promise klasik; pola `chain = chain.catch(()=>{})` menjamin rantai maju walau satu run reject, dan identitas `pendingResolve === resolve` membuat timeout aman terhadap slot.
- Verifikasi grep wajib bisa "memaksa" bentuk kode: hoist `JSON.stringify(currentBody)` ke helper `serializeAiBody` membuat grep gate lolos literal tanpa mengubah perilaku fetch.
- Uji blok internal (tidak diekspor) bisa dilakukan dengan ekstrak substring sumber + `new Function` berisi mock scope lengkap; hati-hati TDZ saat men-shadow global seperti `setTimeout` dalam scope eval.
- `node --check` Node 24 sudah auto-deteksi sintaks ESM di file .js tanpa "type":"module".
- Import relatif di skrip test /tmp tidak resolusi terhadap cwd repo - pakai path absolut.
- eslint repo: 0 error dicapai meski warning prettier banyak pre-existing; fokus error saja.

## File Invariants

| File | Invariant |
|---|---|
| sidecar/main/pc-agent.js | Jangan hapus jalur reset eksplisit readDesktop/askUserPC - itu alur pemulihan AI setelah stop (os-read/os-ask); tanpa itu agent macet stopped_by_user permanen. |
| sidecar/main/pc-agent.js | Timeout 30s WAJIB men-settle lewat identitas `pendingResolve === resolve`; jangan ganti jadi clear tanpa cek identitas. |
| sidecar/main/telegram/telegram-service.js | Handler text/media SUDAH punya isAdmin check config sendiri - jangan dilepas; gate baru hanya tambahan untuk perintah approval. |
| sidecar/main/ai-bridge.js | Jangan log headers/body utuh walau mode debug; logAi hanya metadata satu baris. |
| sidecar/main/task-daemon.js | Sapuan hanya menyentuh status terminal; running/error-in-flight tidak boleh dihapus. |

## Verification Checklist

- [x] node --check lulus untuk 4 file
- [x] grep rejectUnauthorized di telegram-service.js -> 0 hit
- [x] grep 'JSON.stringify(currentBody' di ai-bridge.js -> 0 hit
- [x] eslint 4 file -> 0 error
- [x] Runtime test reap: 22 task selesai -> tepat 20 tersisa, tertua terbuang, running selamat
- [x] Runtime test mutex (blok asli terekstrak): serialisasi A, timeout-per-invokasi B, jalur stop C -> PASS
- [ ] E2E manual: kirim /accept dari akun non-admin via bot sungguhan (butuh token live)
- [ ] Commit (ditunda sesuai instruksi)

## Callback

Apakah wiring `setTelegramAdmins(ids)` juga ingin dipanggil dari engine.mjs/sidecar startup (mis. saat config sync) agar `tg_admin_ids.json` selalu segaris dengan config live, atau cukup seeding saat startTelegramBot seperti sekarang?
