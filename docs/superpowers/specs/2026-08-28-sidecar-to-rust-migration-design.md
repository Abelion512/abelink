# Sidecar-to-Rust Migration Design

**Date:** 2026-08-28
**Author:** Abelion + Claude (ponytail mode)
**Status:** Draft — awaiting user approval

## 1. Problem

MARK migrasi dari Electron ke Tauri v2 untuk mengurangi RAM (target: 4GB hardware).
Frontend (React) + Rust backend sudah jalan. Namun **50+ tool channel** masih berjalan di
`sidecar/engine.mjs` (Node.js/Bun) — legacy masa transisi yang menambah:

- **~80-150 MB RAM** tambahan (Node.js process + V8)
- **Dua runtime** di satu app (Rust + Node.js)
- **Maintenance burden** — dua basis kode, dua ecosystem dependency
- **Boot time** — sidecar perlu spawn + init sebelum tool tersedia

Goal: **eliminate Node.js runtime entirely** — semuanya native Rust.

## 2. Scope

Migrasi seluruh sidecar tool ke Rust commands bertahap (Strangler Fig pattern).
Frontend React TIDAK berubah — hanya `tauri-bridge.js` yang di-update route.

### 2.1 In-scope (Fase 1 — prioritas tinggi)

| # | Sidecar Module | Target Rust | Rationale |
|---|---------------|-------------|-----------|
| 1 | `node-tools.js` | `commands/tools/` | Inti agent — 50+ tool channel (list-dir, read-file, execute-command, web-search, dsb) |
| 2 | `systemInfo.js` | `commands/system/` | RAM/CPU/distro detection — critical untuk Lite Mode (≤4GB target) |
| 3 | `fsGuard.js` | `commands/fs/` | Safe fs wrapper — security boundary, replacement untuk `window.__TAURI__` fs plugin |
| 4 | `pc-agent.js` | `commands/pc/` | OS control — shell exec, screenshot, webcam, audio control |

### 2.2 In-scope (Fase 2 — prioritas menengah)

| # | Sidecar Module | Target Rust | Rationale |
|---|---------------|-------------|-----------|
| 5 | `telegram-service.js` | `commands/telegram/` | Telegram Bot API — bisa pakai `reqwest` + native TLS |
| 6 | `git-service.js` | `commands/git/` | Git automation — spawn `git` binary, parse output (atau pakai `git2` crate) |
| 7 | `window-tracker.js` | `commands/awareness/` | Window tracking — `x11rb` / `wlroots` / `xdotool` spawn |

### 2.3 Out-of-scope (tetap JS di frontend)

| Module | Alasan tetap JS |
|--------|----------------|
| `ai-bridge.js` | Web API calls (Gemini/Groq/LM Studio) — JS-first ecosystem |
| `gemini-web.js` | Web automation — browser control, bukan OS-level |
| `plugin-loader.js` | User-created CommonJS plugins — butuh JS runtime |
| `skill-manager.js` | Skill registry — JS data structure, UI integration |
| `workspace-rag.js` | RAG indexing — Dexie/Orama di frontend |

## 3. Approach

**Strangler Fig Pattern** — migrasi bertahap tanpa downtime.

```
Phase 1: Rust commands dibikin, frontend route ke Rust atau sidecar (dual-path)
Phase 2: Semua tool pindah ke Rust, sidecar minim (cuma AI/web/plugin)
Phase 3: Hapus sidecar sepenuhnya
```

### 3.1 Architecture

```
┌─────────────────────────────────────────────────────────┐
│  FRONTEND (React 19 + Vite — unchanged)                 │
│                                                          │
│  src/api/tauri-bridge.js                                │
│    ├── tools.listDir() → invoke("tools:list_dir")      │
│    ├── tools.readFile() → invoke("tools:read_file")    │
│    ├── system.getInfo() → invoke("system:get_info")    │
│    ├── fs.readFile() → invoke("fs:read_file")          │
│    ├── pc.screenshot() → invoke("pc:screenshot")       │
│    └── telegram.send() → invoke("telegram:send")       │
│                                                          │
└───────────────────────┬─────────────────────────────────┘
                        │ invoke() / events
┌───────────────────────▼─────────────────────────────────┐
│  RUST BACKEND (src-tauri/src/)                           │
│                                                          │
│  main.rs → tauri::Builder                                │
│    ├── commands/tools/ (list_dir, read_file, shell, web)│
│    ├── commands/system/ (get_info, lite_mode_check)     │
│    ├── commands/fs/ (read_file, write_file, safe_delete)│
│    ├── commands/pc/ (screenshot, webcam, audio)         │
│    ├── commands/telegram/ (send_message, polling)       │
│    ├── commands/git/ (status, diff, log)                │
│    └── commands/awareness/ (window_track, active_window)│
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 3.2 IPC Contract

Setiap tool channel punya **synchronous** (`invoke`) dan **async** (event emitter) variant:

```rust
// Synchronous — request/response
#[tauri::command]
async fn tools_list_dir(path: String) -> Result<Vec<DirEntry>, String>

// Async — event emitter (long-running ops)
#[tauri::command]
async fn pc_start_screenshot_stream(window: Window) -> Result<(), String>
// emits: "screenshot:frame" event via window.emit()
```

### 3.3 Error Handling

- Semua command return `Result<T, String>` — error message dikirim ke FE sebagai-is
- FE handle error via `try/catch` pada `invoke()` — existing pattern tidak berubah
- Timeout: 30s default per command (configurable via `tauri.conf.json`)

### 3.4 Dependencies Rust (Cargo.toml tambahan)

```toml
[dependencies]
# Existing
tauri = { version = "2", features = ["tray-icon", "devtools"] }
serde = { version = "1", features = ["derive"] }
tokio = { version = "1", features = ["full"] }

# Phase 1 additions
tauri-plugin-shell = "2"           # shell exec (replaces node-tools)
tauri-plugin-fs = "2"              # file system (replaces fsGuard)
sysinfo = "0.30"                   # system info (replaces systemInfo)
image = "0.25"                     # screenshot encoding
screenshots = "0.5"                # native screenshot capture

# Phase 2 additions
reqwest = { version = "0.12", features = ["json", "rustls-tls"] }
teloxide = "0.12"                  # Telegram Bot API (atau manual reqwest)
git2 = "0.18"                      # Git bindings (atau spawn git binary)

# Phase 3 additions (optional)
x11rb = "0.13"                     # X11 window tracking (Linux)
```

## 4. Implementation Plan

### Phase 1 (2 minggu) — OS Layer

**Week 1:**
- [ ] Audit `node-tools.js` — extract 50+ tool signatures (name, params, return)
- [ ] Implement `commands/tools/` — start dengan `list_dir`, `read_file`, `execute_command`
- [ ] Update `tauri-bridge.js` — route ke Rust command, fallback ke sidecar untuk tool belum migrated
- [ ] Test: `cargo test` + manual verify via devtools console

**Week 2:**
- [ ] Implement `commands/system/` — `get_info`, `lite_mode_check`
- [ ] Implement `commands/fs/` — `read_file`, `write_file`, `safe_delete`
- [ ] Implement `commands/pc/` — `screenshot`, `shell_exec`
- [ ] Frontend: update semua FE caller untuk pakai Rust command

### Phase 2 (1 minggu) — Services

**Week 3:**
- [ ] `commands/telegram/` — polling + send_message
- [ ] `commands/git/` — status, diff, log (spawn `git` binary)
- [ ] `commands/awareness/` — window tracking (xdotool spawn or x11rb)

### Phase 3 (1 minggu) — Cleanup

**Week 4:**
- [ ] Audit sidecar modules — yang belum migrated: keep or rewrite?
- [ ] Remove sidecar if empty, or reduce to minimal (AI bridge only)
- [ ] Update docs (README, tracker, CLAUDE.md)
- [ ] Final verification: `bun run verify` → green

## 5. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Rust learning curve | Reuse existing patterns from `cmd_player.rs`, `cmd_fs.rs` — codebase sudah ada contoh |
| Plugin system (JS) perlu JS runtime | Tetap di frontend — tidak usah pindah ke Rust |
| Telegram Bot stateful (long-polling) | Use `tauri::async_runtime::spawn` + event emitter |
| Git operations complex | Spawn `git` binary via `tauri-plugin-shell` — avoid `git2` complexity (YAGNI) |
| x11rb/wlroots fragmentation Linux | Fallback: spawn `xdotool` via shell (udah terpasang di target) |

## 6. Success Criteria

- [ ] `sidecar/engine.mjs` **dihapus** atau **kosong** (<50 LOC)
- [ ] RAM usage **≤50 MB** untuk idle app (vs Electron 150-500MB)
- [ ] Semua tool channel jalan via Rust `invoke()`
- [ ] `bun run verify` → green (vitest + cargo check + build)
- [ ] Zero `node:` atau `bun:` import di `src-tauri/`

## 7. Future Improvements (Post-Rust — Out of Scope for This Migration)

Setelah Rust backend solid, perbaiki berikut:

| Feature | Current State | Target |
|---------|--------------|--------|
| **Telegram** | Text-only, no context (bot hanya terima response tanpa tahu question user) | Support attachment (photo/file), slash commands untuk skills, context-aware replies |
| **Plugins** | CommonJS di frontend, manual load | Bisa di-load dari Rust (plugin system native) |
| **Connectors (MCP)** | Belum ada | Model Context Protocol untuk external tools |
| **Skills** | Skill registry di frontend | Slash commands (`/skill-name`) end-to-end |
| **Plugin sandboxing** | None | Rust-level sandbox untuk user plugins (security) |

**Gate:** Feature-feature ini **tidak diimplementasikan** sampai Fase 1-3 selesai dan `sidecar/engine.mjs` sudah dihapus/diminimalisir.
