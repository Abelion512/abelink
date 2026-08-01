# Sesi: Dev Activity Report + CLAUDE.md Read + Session Documentation

**Tanggal:** 2026-07-28
**Branch:** `feat/model-fallback-abelink`
**Aktivitas:** Generate development activity report, read CLAUDE.md, document learnings

---

## Ringkasan

Sesi singkat — dimulai dengan permintaan laporan aktivitas development sejak 09:00 hari kerja sebelumnya. Laporan dihasilkan dari git log, tanpa CI (not available). User membalas dengan 5 stand-up bullets sebagai konteks. Dilanjutkan membaca `CLAUDE.md`, dan diakhiri dengan instruksi dokumentasi sesi.

## Learnings (untuk AI agent debugging/changelog)

### 1. CLAUDE.md — Agent Instruction File
- File **wajib dibaca** sebelum claim/keputusan di project ini.
- Lokasi: `./CLAUDE.md`
- Berisi:
  - Skill auto-use policy (tavily, control-browser, context7-mcp)
  - Workflow rules (think-first, git-aware, safety net, verify file exist, baca FEATURES.md dulu)
  - **Banned patterns** — 6 larangan keras (fallback serializer, memory thresholds, hardcode keys, AI stack pindah main, orphan file, VAD params)
  - Model config: primary `9Router:20128` (abelink combo), fallback LM Studio `localhost:1234`, vision dual-path
- **Peringatan:** Jangan sentuh tool-registry.js atau vision-service.js tanpa wiring call path
- **Peringatan:** Jangan ubah memory thresholds (0.3/0.25/0.35) tanpa cross-ref ke 3 file

### 2. Session File Convention
- Lokasi: `docs/PLANNED/sessions/`
- Format nama: `YYYY-MM-DD_deskripsi-singkat.md`
- Struktur: `# Sesi: Title`, tanggal, branch, ringkasan → detail sections
- Tidak ada `.head` file — session files independent, no ordering mechanism
- 12 session files exist sejak 2026-07-23

### 3. Working Tree State (2026-07-28)
Modified 10 files, mostly `package-lock.json` churn (2243±382 lines). Actual logic changes in:
- `browser-agent.js` (19±)
- `plugin-loader.js` (10±)
- `index.js`, `index.html`, `awareness.js`, `core.js`, `persona.js`, `oramaStore.js` (1-2± each)
- `.gitignore` (+1 line)

### 4. CI Status
- **No CI pipeline** — no `.github/workflows`, `.gitlab-ci.yml`, or Jenkinsfile
- Any CI setup would be from scratch

### 5. Branch Context
- Current branch: `feat/model-fallback-abelink`
- 4 commits on 2026-07-27 (model registry, retry 10x, RSI observability, fallback fixes)
- Previous session (2026-07-28_code-review-model-fallback.md) details critical fixes:
  - Hardcoded Last.fm API key → config chain fixed
  - Turn timeout 30s → 90s
  - `cleanAndParse` array guard added
  - tool-registry.js & vision-service.js exist but **zero imports** (YAGNI, hold for PR)

### 6. Key Files Reference
| File | Status |
|------|--------|
| `CLAUDE.md` | ✅ Dibaca — agent rules for this fork |
| `AGENTS.md` | Project architecture, invariants, gotchas |
| `docs/FEATURES.md` | Full feature spec, constants SOT, IPC contract |
| `docs/TASK-BREAKDOWN.md` | Phased roadmap P0-P4 |
| `src/main/ai-bridge.js` | Centralized AI client, model registry, retry logic |
| `src/main/model-registry.json` | Dynamic model combos (mark, abelink, fast, quality) |
| `src/main/native-tools.js` | OS tool registry (read/write/grep/powershell) |
| `src/main/browser-agent.js` | Physical BrowserWindow automation |