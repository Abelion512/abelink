# Sesi: Security Review Deep Dive + Skill Mapping

**Tanggal:** 2026-07-29
**Branch:** `feat/model-fallback-abelink`
**Aktivitas:** Security review full codebase (6 Critical findings), mapping available ZCode security skills, attempt SonarQube integration

---

## Ringkasan

Sesi dimulai dari perintah "Find vulnerability". Dilakukan security review mendalam terhadap 8 file inti menggunakan skill `security-review` (OWASP Top 10 framework). Ditemukan **6 Critical, 3 Warnings, 3 Suggestions**.

Setelah user menandai 7 security skills (`secure-coding`, `security-and-hardening`, `sonar-analyze`, dll.), semuanya diload dan dijalankan instruksinya. SonarQube integration gagal karena CLI belum terinstall.

---

## Temuan Security (Detail di security review sebelumnya)

### 🔴 Critical (6)
1. **`webSecurity: false`** + `sandbox: false` + `connect-src *` — Full credential exfiltration via XSS
2. **CSP `script-src 'unsafe-eval'`** — XSS exploitation vector
3. **Plugin `index.js` code generation** — No input sanitization, RCE via IPC
4. **API keys di IndexedDB** — `groqApiKey`, `cerebrasApiKey`, `customApiKey`, `lastfmApiKey` plaintext
5. **`run-shell` tanpa `maxBuffer` limit** — OOM / crash via large output
6. **`grep-search` incomplete escaping** — shell metacharacter injection (`'`, `;`, `|` not escaped)

### 🟡 Warning (3)
7. `webviewTag: true` di main window
8. `open-external` tanpa validasi protokol
9. Last.fm API key exposed via preload

### 🔵 Suggestion (3)
11. Model registry `writeFileSync` tanpa sanitasi path
12. Security headers tidak lengkap (`X-Content-Type-Options`, `X-Frame-Options`)
13. TTS temporary file path prediktif

---

## Interaksi dengan CLAUDE.md Rules

CLAUDE.md punya beberapa banned patterns yang relevan:
- **"Jangan pindahin AI stack ke main process"** — Tidak konflik dengan encryption API key via IPC bridge
- **"Jangan hardcode API keys"** — Tapi API keys di Dexie juga masalah; solusi: `safeStorage` di main process
- **`9Router (http://localhost:20128)`** — Custom router perlu dicek apakah API key ikut tersimpan di config

---

## Skill yang Diload & Dieksekusi

| Skill | Hasil |
|-------|-------|
| `security-review` (default) | ✅ Loaded, framework dipakai untuk review |
| `security-review` (abelion-skills) | ✅ Loaded, versi dengan format report berbeda |
| `security-and-hardening` | ✅ Loaded, checklist & pola pencegahan |
| `secure-coding` | ✅ Loaded, OWASP Top 10 2025 patterns |
| `sonar-analyze` | ⏳ Butuh SonarQube MCP (belum setup) |
| `sonar-list-issues` | ⏳ Butuh SonarQube MCP |
| `sonar-dependency-risks` | ⏳ Butuh SonarQube MCP |
| `sonar-quality-gate` | ⏳ Butuh SonarQube MCP |
| `sonar-integrate` | ⏸️ **Stopped di Step 1** — CLI `sonar` tidak di PATH, menunggu persetujuan install |
| `searching-sourcegraph` | ⏸️ MCP tools tidak tersedia di environment |

---

## Learnings untuk AI Agent Masa Depan

### 1. Skill `security-and-hardening` punya SSRF prevention pattern konkret

`references/security-checklist.md` (referenced, not read) — tapi pola `assertSafeUrl()` di skill content sudah cukup: allowlist scheme + host, DNS resolve check, `redirect: 'error'`. Untuk Electron app, `setWindowOpenHandler` sudah handle pop-up blocking.

### 2. `secure-coding` skill updated for OWASP 2025

OWASP Top 10 2025 punya perubahan urutan:
- A03: Software Supply Chain Failures (naik signifikan)
- A06: Insecure Design (baru, sebelumnya A04)
- A08: Data Integrity Failures (baru)
- LLM01-10: Added to AI section

Untuk project ini, relevan: A06 (webSecurity), A08 (plugin code gen integrity), supply chain (plugin npm install).

### 3. SonarQube CLI integration flow

Dari `sonar-integrate` skill:
1. Check `which sonar` → install via `curl ... install.sh | bash` (perlu approval)
2. `sonar auth login -o <org-key>` → browser-based OAuth
3. `sonar integrate claude` → config MCP + secrets hooks
4. Restart session setelah integrate

**Gagal di langkah 1 karena CLI tidak ada.**

### 4. Dua versi `security-review` skill

Ada dua path:
- `~/.zcode/skills/security-review/` — versi OWASP standar
- `/media/abelion/Isaf/ican/project/skills/abelion-skills/security-review/` — versi kustom Abelion

Keduanya mirip tapi format report berbeda. Skill invoke memilih yang terdaftar di system-reminder.

### 5. Environment tidak punya Sourcegraph MCP tools

Skill `searching-sourcegraph` terload tapi MCP tools (`keyword_search`, `nls_search`, `deepsearch`) tidak ada di tool list. Alternatif: `grep`/`Bash`/`Agent(code-explorer)`.

---

## Files Dibaca (Full Content)

| File | Baris | Alasan |
|------|-------|--------|
| `src/main/ai-bridge.js` | 419 | AI HTTP client, API keys, model registry |
| `src/main/index.js` | 513 | Main process, security config (webSecurity, sandbox) |
| `src/main/native-tools.js` | 420 | Shell execution, escaping audit |
| `src/main/browser-agent.js` | 492 | Browser automation sandbox |
| `src/main/plugins/plugin-loader.js` | 197 | Plugin code gen, npm install |
| `src/preload/index.js` | 131 | IPC bridge exposure |
| `src/renderer/index.html` | 21 | CSP policy |
| `src/renderer/src/api/db.js` | 335 | Dexie schema, API key storage |
| `src/renderer/src/api/ai/core.js` | 78 | Renderer-side AI wrapper |
| `src/renderer/src/pages/Configuration.jsx` | ~100 | Config UI, key fields |
| `CLAUDE.md` | 44 | AI agent rules |
| `docs/PLANNED/sessions/*.md` | 15 files | Prior session logs |

---

## Status

- **Security review code reading** ✅ Selesai — 6 Critical, 3 Warning, 3 Suggestion
- **CLAUDE.md cross-check** ✅ Selesai — tidak ada konflik dengan rekomendasi fix
- **Skill mapping** ✅ Selesai — 7 skills loaded, 4 butuh MCP setup
- **SonarQube integration** ⏸️ Dihentikan — CLI belum install, nunggu approval user
- **Actual code fixes** ❌ Belum ada — semua finding masih open
