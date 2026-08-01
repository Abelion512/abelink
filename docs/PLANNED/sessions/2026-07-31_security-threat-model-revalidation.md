# Session: Security Threat Model — Personal-Use Revalidation vs Official Docs

## Ringkasan

**Tanggal:** 2026-07-31  
**Branch:** `feat/performance-and-readibility`  
**Files touched:** audit-only (baca: `src/main/index.js`, `src/main/native-tools.js`, `src/main/pc-agent.js`, `src/main/browser-agent.js`, `src/preload/index.js`, `src/renderer/src/api/db.js`, `src/renderer/src/api/groq.js`, `src/renderer/src/api/ai/approval-modes.js`, `src/main/computer/policy-engine.js`, `src/main/computer/quarantine.js`, `docs/PLANNED/sessions/2026-07-29_security-audit-fixes-threat-model.md`)  
**Ringkasan:** Audit keamanan penuh (skill `security-review`, 7 subagent paralel) menghasilkan 4 Critical + 10 High. User mengklarifikasi threat model: **personal use, user = owner, scope sebebas browser** (bebas login/logout akun, ganti akun sekejap). Plan direthink menjadi 4 lapis (self-preservation → containment → credential hygiene → sandbox), lalu diverifikasi terhadap sumber resmi (Claude Code permission docs via Context7, Electron security checklist via Context7). **Temuan kunci:** sesi 2026-07-29 sudah pernah implement + rollback 3 item inti plan (sandbox, webSecurity, run-cli approval) dengan alasan yang sama — plan final harus menghormati keputusan rollback itu.

---

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
|---------|------|------------|-----|--------|
| Audit menemukan 4 Critical + 10 High (path traversal, sandbox:false, API key plaintext, dangerousAllowBrowser, dll) | multi | Default security-review framework = enterprise mindset, mismatch dengan personal use | Re-think threat model: "Containment, not lockdown" — proteksi dari konten asing, bukan dari user | 🔴 Belum dieksekusi (plan) |
| `sandbox: true` pernah dicoba & di-rollback | `src/main/index.js:65` | preload butuh `require()` (`@electron-toolkit/preload`, `path`, `url`) | **Tetap `false`** — hormati keputusan 2026-07-29. Catatan: riset Electron docs menunjukkan sandboxed preload punya polyfilled `require` untuk `url`/`events`/`timers` — alasan rollback sebagian besar tidak valid, tapi keputusan user adalah final | ⚠️ Keputusan lama dipertahankan |
| `webSecurity: true` pernah dicoba & di-rollback | `src/main/index.js:66` | Renderer `file://` origin perlu fetch lintas-origin ke AI endpoint arbitrer (Groq/LM Studio/Custom) — CORS blok | **Tetap `false`** — konsisten dengan "user bebas configure provider apa pun". Verifikasi Electron docs: memang "Bad practice" secara umum, tapi di personal single-user dengan renderer file://, ini trade-off sadar | ⚠️ Keputusan lama dipertahankan |
| `run-cli` needsApproval pernah dicoba & di-rollback | `src/main/native-tools.js:294` | Power user automation — approval tiap langkah kontraproduktif | **Tetap `false`** + pertahankan `isDangerousCommand()` heuristic + RSI audit log | ⚠️ Keputusan lama dipertahankan |
| `connect-src *` pernah dicoba ketat & di-rollback | `src/renderer/index.html:17` | User bisa configure AI provider apa pun — allowlist tidak bisa ekshaustif | **Tetap `*`** dengan `script-src` tanpa `unsafe-eval` sebagai lapisan proteksi utama | ⚠️ Keputusan lama dipertahankan |
| Path traversal di native-tools (read/write/delete/replace-lines) | `src/main/native-tools.js:58-184` | Tidak ada `path.resolve()` + sandbox check — query langsung jadi path | **BELUM pernah dicoba** — tetap prioritas P0. `policy-engine.assessPathRisk()` sudah ada tapi tidak di-enforce | 🔴 Belum dieksekusi |
| Self-preservation tidak di-enforce | `src/main/computer/policy-engine.js` (`self: MAX`) | policy-engine advisory saja, tidak dipanggil di `native-tool:execute` | Enforce `assessPathRisk()` di main process `native-tool:execute` — block `MAX` di semua mode (termasuk bypass) | 🔴 Belum dieksekusi |
| Deny rules global | — | Tidak ada deny list eksplisit | Claude Code docs: deny rules berlaku universal termasuk `bypassPermissions` — implementasi deny list (`~/.mark`, `/etc`, `.env`, `wa-auth`) di main process | 🔴 Belum dieksekusi |
| console.log bocorkan config + API key | `src/renderer/src/api/db.js:212` | `console.log('Configuration saved:', data)` | Hapus / log field name saja | 🔴 Belum dieksekusi |
| `dangerouslyAllowBrowser: true` | `src/renderer/src/api/groq.js:61` | STT dipanggil langsung dari renderer | Downgrade ke P2 (personal use: key milik user di mesinnya sendiri). Konsisten dengan keputusan 07-29 | ⚠️ Plan direvisi |
| API key plaintext di IndexedDB | `src/renderer/src/api/db.js:15-83` | Dexie config table tanpa enkripsi | Downgrade ke P2 — risiko nyata hanya via backup/cloud-sync bocor, bukan serangan | ⚠️ Plan direvisi |
| Template literal injection browser-agent type | `src/main/browser-agent.js:454` | Escape hanya `\` `'` `\n` — `${}` lolos | Ganti ke `JSON.stringify(value)` | 🔴 Belum dieksekusi |
| IPC tanpa validasi sender | `src/main/index.js` (semua handler) | Tidak ada `validateSender(e.senderFrame)` | Tambah validateSender di handler kritis (`native-tool:execute`, `save-session-knowledge`, `parse-document`) — rekomendasi resmi Electron | 🔴 Belum dieksekusi |
| `innerHTML` pada hasil scrape | `src/renderer/src/api/scraping.js:27,73` | Parsing HTML via innerHTML | Ganti ke `DOMParser` | 🔴 Belum dieksekusi |
| Webview tanpa partition terpisah | `src/renderer/src/App.jsx:193-198` | Sesi scraping berbagi session main window | Tambah `partition="persist:scraper"` | 🔴 Belum dieksekusi |
| Escaping HTML tidak lengkap | `src/main/pc-agent.js:156` | Hanya `<` di-escape | Escape `& < > "` lengkap | 🔴 Belum dieksekusi |
| WA auth plaintext di disk | `src/main/whatsapp/baileys-service.js:258` | `useMultiFileAuthState()` default | Downgrade ke P2 (risiko hanya via backup/cloud-sync) | ⚠️ Plan direvisi |

---

## Files Modified

Tidak ada file yang dimodifikasi — sesi ini audit + plan + verifikasi riset. Semua temuan menunggu keputusan eksekusi.

---

## Agent Learnings

### Pattern Konkret

1. **Selalu baca session log lama sebelum audit ulang** — 7 file session log keamanan sudah ada di `docs/PLANNED/sessions/`. Sesi 2026-07-29 sudah implement + rollback persis item yang saya rekomendasikan ulang (sandbox, webSecurity, run-cli, connect-src). Tanpa baca itu dulu, plan saya akan repeat mistake yang sudah dibayar dengan waktu implementasi + rollback.

2. **Threat model adalah keputusan user, bukan temuan audit** — skill `security-review` default OWASP enterprise mindset. Output "4 Critical" (API key plaintext, sandbox:false) itu salah alamat untuk personal single-user app: key milik user di mesinnya sendiri bukan rahasia dari user. Ancaman #1 di personal AI agent = **prompt injection → tool abuse**, bukan pencurian kredensial.

3. **Verifikasi vs sumber resmi mengubah prioritas** — Claude Code docs mengkonfirmasi: deny rules berlaku di semua mode termasuk bypass (menguatkan Lapis 0), sandbox hanya Bash tool (menguatkan sandbox = P2), `webSecurity:false` = bad practice tapi di personal file:// context adalah trade-off sadar. Riset eksternal menaikkan confidence plan, tidak mengubah arah.

4. **Sumber riset yang gagal** — `docs.anthropic.com/agent-security` 404/redirect mati; Tavily & You.com research butuh API key yang tidak tersedia. Context7 + WebFetch (Electron docs) cukup untuk verifikasi inti.

### File Invariants

| File | Invariant |
|------|-----------|
| `src/main/index.js:65-66` | `sandbox: false` + `webSecurity: false` — keputusan rollback 07-29, jangan ubah tanpa diskusi user |
| `src/main/native-tools.js:294` | `run-cli` `needsApproval: false` — keputusan rollback 07-29, power user automation |
| `src/renderer/index.html:17` | `connect-src *` — keputusan rollback 07-29, provider AI arbitrer |
| `src/main/computer/policy-engine.js` | `self: MAX` — sudah ada, tinggal di-enforce (belum) |
| `src/renderer/src/api/ai/approval-modes.js` | 5 mode selaras Claude Code 6 mode (minus `dontAsk`) — jangan ubah struktur |

### Verification Checklist

- [ ] Baca `docs/PLANNED/sessions/2026-07-29_security-audit-fixes-threat-model.md` sebelum mengeksekusi fix apa pun
- [ ] Jangan sentuh `sandbox`, `webSecurity`, `run-cli`, `connect-src` tanpa konfirmasi ulang user
- [ ] Enforce `assessPathRisk()` (MAX block) + deny list global — satu-satunya prioritas P0 yang belum pernah dicoba
- [ ] Hapus `console.log` API key (`db.js:212`)
- [ ] `JSON.stringify(value)` untuk browser-agent type action
- [ ] `validateSender` di handler kritis (rekomendasi Electron)

---

## Callback

Plan final (setelah verifikasi + sejarah rollback) punya satu prioritas yang **belum pernah dicoba dan tidak pernah di-rollback**: enforce `policy-engine` + deny list global di `native-tool:execute` — melindungi `~/.mark` dan file sistem dari AI yang di-prompt-inject, tanpa menghalangi automation (tidak menambah approval, hanya hard-block path berbahaya). Mau saya eksekusi itu sekarang (±1-2 jam), atau Anda ingin membahas komponen lain plan dulu?
