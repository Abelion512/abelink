# Session: Security Audit — Semantic Re-evaluation & Targeted Fixes

## Ringkasan

**Tanggal:** 2026-07-29–30  
**Branch:** `feat/performance-and-readibility`  
**Files touched:** `src/main/index.js`, `src/main/native-tools.js`, `src/renderer/index.html`, `src/renderer/src/api/ai/planning.js`, `.env` → `.env.bak`  
**Ringkasan:** Claude Security scan menghasilkan 19 findings yang diverifikasi. Setelah implementasi awal, user mengkoreksi threat model — ini open-source desktop AI agent untuk single-user / power user, bukan enterprise multi-tenant. Beberapa fix di-rollback karena unintended consequences. Sisa fix yang retain adalah yang melindungi user dari prompt injection dan AI abuse tanpa menghalangi automation. Session log ini mencatat apa yang benar-benar perlu diubah dan apa yang harus tetap seperti aslinya.

---

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
|---------|------|------------|-----|--------|
| `sandbox: true` break preload | `src/main/index.js:65` | preload butuh `require()` untuk `@electron-toolkit/preload` + `path`/`url` | Rollback ke `sandbox: false` | ✅ Done |
| `webSecurity: true` break cross-origin | `src/main/index.js` → removed | Renderer dari `file://` origin perlu fetch ke Groq/LM Studio/localhost/Custom endpoint | Rollback ke `webSecurity: false` | ✅ Done |
| `run-cli` needsApproval blocks automation | `src/main/native-tools.js:294` | Power user menjalankan automation — approval tiap langkah kontraproduktif | Rollback ke `needsApproval: false` (tetap ada `isDangerousCommand()` + RSI audit log) | ✅ Done |
| CSP `connect-src` spesifik blok custom endpoint | `src/renderer/index.html:17` | User bisa configure AI provider apa pun — daftar tidak bisa ekshaustif | Rollback ke `connect-src *` dengan komentar penjelasan | ✅ Done |
| `grep-search` shell injection | `src/main/native-tools.js:198-240` | `exec()` dengan shell string, escaping tidak lengkap (semicolon/pipe unescaped) | Ganti ke `spawn()` dengan arg array, no shell | ✅ Tetep |
| Skill content prompt injection | `src/renderer/src/api/ai/planning.js:186` | `SKILL.md` + plugin descriptions di-inject verbatim ke system prompt | Tambah `sanitizeSkillContent()` + `<skill_data>` wrapper | ✅ Tetep |
| Excel `dangerous-open-external` tanpa URL validation | `src/main/index.js:429-440` | `shell.openExternal(url)` tanpa validasi scheme | Validasi https/http/mailto only via URL parsing | ✅ Tetep |
| `browser-navigate` accept file:// scheme | `src/main/native-tools.js:339` | Tidak reject `file://`, `javascript:`, `data:` | Reject non-http schemes | ✅ Tetep |
| Groq API key hardcoded in `.env` | `.env:2` | File ditinggal di repo root setelah development | Pindah ke `.env.bak` | ✅ Done |
| CSP `unsafe-eval` | `src/renderer/index.html:9` | `script-src 'unsafe-eval'` izinkan arbitrary eval() | Hapus `'unsafe-eval'` — Monaco workers pake `blob:` | ✅ Tetep |

---

## Files Modified

| File | Perubahan |
|------|-----------|
| `src/main/index.js:63-67` | `sandbox: false` (← was true), `webSecurity: false` (← was true) — rollback ke config original karena constraints arsitektural |
| `src/main/index.js:74-84` | `setWindowOpenHandler` — validasi URL scheme https/http/mailto |
| `src/main/index.js:429-440` | `ipcMain.handle('open-external')` — validasi URL dengan try/catch + allowlist scheme |
| `src/main/native-tools.js:293-295` | `run-cli` → `needsApproval: false` (rollback), approval message removed |
| `src/main/native-tools.js:198-256` | `grep-search` — ganti `exec()` dengan `spawn()` + arg array, helper `spawnCapture` |
| `src/main/native-tools.js:339` | `browser-navigate` — reject non-http/https schemes |
| `src/renderer/index.html:8-17` | CSP: `connect-src *` (← specific list), `script-src` tanpa `'unsafe-eval'` (tetep), komentar diperbarui |
| `src/renderer/src/api/ai/planning.js:186-211` | Tambah `sanitizeSkillContent()` — strip instruction-override patterns + `<skill_data>` wrapper |
| `.env` → `.env.bak` | Pindah file berisi Groq API key ke backup |

---

## Agent Learnings

### Pattern Konkret

1. **Threat model mismatch** — Gue apply enterprise security mindset ke personal AI agent. `sandbox: true`, `webSecurity: true`, `connect-src` ketat, `run-cli` approval — semua punya unintended consequences di single-user context. Bedakan: A) Proteksi dari malicious third party (enterprise) vs B) Proteksi user dari AI mereka sendiri (prompt injection).

2. **`webSecurity: false` is NOT always a vulnerability** — Di Electron app dengan renderer dari `file://` origin, ini intentional. Tanpa ini, semua fetch ke API eksternal (Groq, LM Studio, Custom) kena CORS. Dokumentasi Electron sendiri bilang "disable only if you understand the implications."

3. **`sandbox: true` breaks preload** — Sandboxed preload tidak bisa `require()` modul Node biasa. `@electron-toolkit/preload` dan utility functions (`path`, `url`) jadi gak bisa diakses. Untuk apps yang preload-nya cuma contextBridge + IPC calls, sandbox tidak memberi banyak value tambahan.

4. **Don't lock `connect-src` in open-source desktop apps** — User bisa configure AI provider apapun. Daftar endpoint yang diallowlist akan selalu ketinggalan. Lebih baik `connect-src *` dengan catatan bahwa `script-src` tanpa `unsafe-eval` adalah lapisan proteksi utama untuk injection.

### File Invariants

| File | Invariant |
|------|-----------|
| `src/main/index.js:65` | `sandbox: false` — preload butuh Node.js module access |
| `src/main/index.js:66` | `webSecurity: false` — file:// origin perlu cross-origin fetch |
| `src/main/native-tools.js:293` | `run-cli` harus `needsApproval: false` — RSI/automation flow |
| `src/renderer/index.html:17` | `connect-src *` — users configure arbitrary AI provider endpoints |

### Verification Checklist

You can verify the final state of all files:

```bash
# Verify rollbacks
grep -n 'sandbox\|webSecurity' src/main/index.js
grep -n 'needsApproval' src/main/native-tools.js
grep 'connect-src' src/renderer/index.html

# Verify retains (protections)
grep -n 'spawnCapture\|spawn(' src/main/native-tools.js
grep -n 'sanitizeSkillContent' src/renderer/src/api/ai/planning.js
grep -n 'open-external' src/main/index.js

# Verify .env removed
ls .env* 2>/dev/null

# Build check
npm run build
```

---

## Callback

Semua P0-P2 fix sudah diverifikasi build pass. Apakah ada yang ingin ditambahkan sebelum commit?

Ringkasan final: 5 retain (grep-search→spawn, skill sanitizer, open-external validation, browser-navigate scheme filter, CSP tanpa unsafe-eval) + 4 rollback (sandbox→false, webSecurity→false, run-cli→no approval, connect-src→*).
