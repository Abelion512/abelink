# Session: 2026-07-28 — Critical Review, Housekeeping, Roadmap

**Objective:** Merespon kritik senior, audit kode, bandingkan dengan official repo, setup worktree, restruktur docs, riset kompetitor, buat spec dan roadmap.

---

## Key Learnings (for Future AI Agents)

### 1. Root Cause: Over-documentation, Under-execution
- 25 planning docs di berbagai folder (`.hermes/plans/`, `docs/sessions/`, `docs/superpowers/`, `docs/references/`)
- Banyak file diklaim/direncanakan tapi **tidak ada di filesystem** — vaporware
- Solusi: pindah SEMUA planning docs ke `docs/PLANNED/`, pisahkan dari kode

### 2. Critical: Push Discipline
- Senior mengkritik **14 unpushed commits + 18 unstaged files**
- User: "abaikan push, kode mentah wajar, commit aja"
- **Kesimpulan:** Jangan push tanpa perintah eksplisit. Commit tetap jalan.

### 3. Orphaned Modules (Dead Code)
- `tool-registry.js` (343 lines) — **zero imports**, tapi di-restore karena bakal dipake untuk tri-layer tools (skills→MCP→plugins)
- `vision-service.js` (88 lines) — **zero imports**, di-restore untuk dual-path vision (Gemini + MiMo)
- `@modelcontextprotocol/sdk@1.29` — installed tapi zero code. Di-uninstall lalu di-reinstall (upgrade ke 1.30)
- **Lesson:** Jangan hapus file sebelum verify dengan author apakah bakal dipake future. Tanya dulu.

### 4. Guard-gate Fixes Applied
- **Empty query false positive:** `preFlightCheck()` reject semua tool dengan `query.trim().length === 0`. Tapi banyak tool legit tanpa query (`music-next`, `browser-read`, `list-dir`). Fix: `NO_QUERY_TOOLS` Set.
- **Singleton scope:** Guard gate dibuat via `createGuardGate()` di dalam React hook — state mati tiap remount. Fix: module-level singleton `getGuardGate()`.

### 5. MiMo Model Discovery
- User menyebut "MIMO" untuk vision. Saya nebak Xiaomi/Tencent/Alibaba/Moonshoot — **salah semua**.
- Pakai `control-browser` skill → search Google → **Xiaomi MiMo-V2.5** (310B MoE, native multimodal, 1M context window)
- **Lesson:** Jangan nebak. Pakai browser skill langsung.

### 6. What Senior Got Right/Wrong
| Benar | Sebagian | Salah |
|-------|----------|-------|
| 14 unpushed = risk | "AI stack di renderer violation" — planning.js pake module cache, survive refresh | Gak ngetes actual run |
| 18 unstaged = mixed state | "Tab reload = agent reset" — MARK SPA, gak ada user reload | Planning.js 600+ line solid |
| 11 vaporware files | — | Lewatin constants/thresholds yang sudah akurat |
| MCP SDK nganggur | — | — |
| Over-documentation | — | — |

### 7. CLAUDE.md Power
- Satu file `CLAUDE.md` dengan rules "jangan nunggu ditag skill" bisa override perilaku default AI agent
- Priority: CLAUDE.md > skills > system prompt
- Butuh ditulis ulang — isi lama basi (daftar file MARK v2 yang gak exist)

### 8. Git Worktree Proper Setup
- `rm -rf .claude/worktrees/fix-bugs-v2` — itu folder copy, bukan git worktree
- `git worktree add ../mark-fix master` — proper worktree DI LUAR repo
- `git worktree prune` — bersihin stale entries
- Sekarang ada 2 worktree: `../mark-fix` (branch `fix/bugs`), `../mark-ref` (branch `master`)

### 9. Competitive Landscape
- 11 agent dibandingkan. MARK unggul di: voice (VAD+STT+TTS), physical browser, hybrid memory, plugin editor, WhatsApp, YouTube Music
- MARK ketinggalan di: MCP, sub-agent, verification loop, self-learning
- MCP = universal connector — semua agent besar pake ini

### 10. Dokumen Baru
| File | Lines | Isi |
|------|-------|-----|
| `FEATURES.md` | 379 | Full spec, constants, file inventory, IPC contract, dev rules |
| `TASK-BREAKDOWN.md` | 441 | P0-P4 roadmap, tiap task ada effort/risk/files/verification |
| `CLAUDE.md` | — | Diupdate dengan skill auto-use rules + banned patterns |

---

## Files Changed

### Created
- `docs/FEATURES.md` — Feature specification
- `docs/TASK-BREAKDOWN.md` — Task breakdown & roadmap
- `tests/stability/100-turn-test.sh` — Stability test script

### Modified
- `CLAUDE.md` — Rewritten with skill auto-use rules + banned patterns
- `AGENTS.md` — Added pointers to FEATURES.md and TASK-BREAKDOWN.md
- `src/renderer/src/api/ai/guard-gate.js` — Empty query fix + singleton pattern
- `src/renderer/src/hooks/agent/useMarkPlan.js` — Import singleton guard-gate

### Deleted
- `.claude/worktrees/fix-bugs-v2/` — Fake worktree folder copy
- `.hermes/plans/` (9 files) → moved to `docs/PLANNED/hermes-plans/`
- `docs/sessions/` (10 files) → moved to `docs/PLANNED/sessions/`
- `docs/superpowers/specs/` (1 file) → moved to `docs/PLANNED/superpowers/`
- `docs/references/` (3 files) → moved to `docs/PLANNED/`
- `docs/error.log`, `docs/CHANGES-UNPUSHED.md`, `docs/laporan/`, `docs/mark-chat-history-*.json` — junk
- `electron.vite.config.1770738054863.mjs`, `electron.vite.config.1770739256144.mjs`, `electron.vite.config.1783046433639.mjs` — stale configs
- `@modelcontextprotocol/sdk` — uninstalled lalu reinstalled (upgrade 1.29→1.30)

### Restored
- `src/renderer/src/api/ai/tool-registry.js` — Restored from commit 6d382c2^ (renamed to 3620950)
- `src/renderer/src/api/ai/vision-service.js` — Restored from commit 6d382c2^ (renamed to 3620950)

---

## Commits
```
6d382c2 chore: housekeeping sprint (29 files, -2740/+2253)
3620950 restore: tool-registry, vision-service, MCP SDK (7 files, +1169/-46)
```

---

## Tech Notes for Debugging

### Guard-gate empty query bug
```javascript
// BEFORE — semua tool dengan query '' kena reject
if (typeof query !== 'string' || query.trim().length === 0) {
  return { allowed: false, degrade: false, reason: `Empty query for tool ${tool}` }
}

// AFTER — no-arg tools exempted via Set
const NO_QUERY_TOOLS = new Set(['music-next', 'music-prev', 'music-toggle', 'browser-read', 'browser-close', 'list-windows', 'screenshot', 'finish', 'stop', 'done'])
```

### Module-level singleton pattern
```javascript
// Module-level singleton — survives React remounts
let _instance = null
export function getGuardGate(config) {
  if (!_instance) _instance = createGuardGate(config)
  return _instance
}
```

### Git worktree quick reference
```bash
git worktree add ../nama-folder nama-branch   # BUAT worktree baru
git worktree list                              # LIHAT semua worktree
git worktree remove ../nama-folder             # HAPUS worktree
git worktree prune                             # BERSIHIN stale metadata
```

### Docs location after cleanup
- All planning/session/reference docs → `docs/PLANNED/`
- Feature spec → `docs/FEATURES.md`
- Task breakdown → `docs/TASK-BREAKDOWN.md`
- Project overview (original) → `AGENTS.md`
- Agent instructions → `CLAUDE.md`