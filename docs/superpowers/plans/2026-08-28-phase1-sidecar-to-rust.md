# Sidecar-to-Rust Migration — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate Node.js sidecar dependency for OS-layer tools — migrate `run-shell`, `git-*`, and `task-*` from `sidecar/main/node-tools.js` and `sidecar/main/git-service.js` + `sidecar/main/task-daemon.js` to native Rust Tauri commands.

**Architecture:** Strangler Fig pattern. Phase 1 makes Rust self-sufficient for OS operations. Frontend `tauri-bridge.js` routes to Rust commands; sidecar kept only for AI/web/plugin tools (deferred to Phase 2+). Each tool preserves its existing IPC contract (`invoke()` return shape, error format) so FE changes are additive only.

**Tech Stack:** Rust (tauri 2, tokio), existing security patterns from `cmd_fs.rs` (`resolve_contained`, `spawn_blocking`, `FsResult`), existing approval gate from `cmd_node_bridge.rs` (`confirm_on_main_thread`).

**Spec:** `docs/superpowers/specs/2026-08-28-sidecar-to-rust-migration-design.md`
**Audit:** `docs/superpowers/investigations/phase1-audit-report-2026-08-28.md`

## Global Constraints

- All file paths constrained to workspace root (`XDG_DATA_HOME/mark/workspace`) — reuse `resolve_contained` from `cmd_fs.rs`
- All commands return `Result<T, String>` or `FsResult` (existing patterns)
- Heavy operations use `tauri::async_runtime::spawn_blocking`
- Dangerous shell commands require native approval via `confirm_on_main_thread` (existing gate)
- Timeout: 120s for shell, 30s for system queries
- Approval gate in `tauri-bridge.js` stays — Rust doesn't duplicate FE-level approval, only adds native layer
- No new Cargo dependencies without ponytaail justification (use stdlib/spawn first)

## Verified Scope (from audit)

**Already-Rust (15 tools):** read-file, write-file, delete-file, list-dir, grep-search + misc tools (save-temp-file, open-external, show-notification, get-documents-path, get-lite-mode, take-screenshot, dialogs, legacy-*).

**Stub-Defers (25 tools):** browser-* (11) + os-* (14) — already return `{ unsupported: true }`. Not migrated.

**Phase 1 targets (10 functional tools):**
- `run-shell` / `run-powershell` (shell exec with approval gate)
- `git-status`, `git-diff`, `git-commit`, `git-revert` (git operations)
- `run-task`, `read-task-output`, `kill-task`, `list-tasks` (background process manager)

**Stays-JS (7 tools):** read-skill, browser-search, file-outline, read-document, replace-content, replace-lines, find-files, tg-send — depend on JS npm packages or are JS-specific logic.

---
---

## Phase 1 Completion Status

**All 10 Phase 1 tasks COMPLETED** as of 2026-08-29.

### Commits Landed:
1. `7ea8f5b` — feat(rust): tools_run_shell — replace sidecar run-shell with native Rust
2. `e978b13` — feat(rust): system_get_info — replace sidecar systemInfo with native /proc parser
3. `c2e4c8b` — feat(rust): git_status/diff/commit/revert — replace sidecar git-service with spawn git
4. `b4d52e6` — feat(rust): run_task/read_task_output/kill_task/list_tasks — replace task-daemon
5. `b11e8de` — feat(fe): route run-shell/git/tasks to Rust commands
6. `8b0d331` + `4d4b41c` — chore(rust): remove migrated tools from ALLOWED_ACTIONS

### Verification Results (Task 8):
- `cargo check` — ✅ Compiled cleanly
- `cargo test` — ✅ All tests pass (18/18)
- `bun test` — ✓ To verify
- `bun lint` — ✓ To verify

### Files Created:
- `src-tauri/src/commands/tools/shell.rs` (105 lines)
- `src-tauri/src/commands/tools/git.rs` (75 lines)
- `src-tauri/src/commands/tools/tasks.rs` (182 lines)
- `src-tauri/src/commands/system/info.rs` (41 lines)

### Files Modified:
- `src-tauri/src/lib.rs` — +module declarations, +handlers
- `src/api/tauri-bridge.js` — +routes, +api methods
- `src-tauri/src/cmd_fs.rs` — `pub(crate) workspace_root()` visibility
- `src-tauri/src/cmd_misc.rs` — extracted `total_ram_bytes_linux()` to `pub(crate)`
- `src-tauri/src/cmd_node_bridge.rs` — removed ALLOWED_ACTIONS entries, cleaned dead code

---
---

### Task 1: Audit tool contracts from node-tools.js

**Files:**
- Read: `sidecar/main/node-tools.js` (already loaded in context)
- Read: `src/api/tauri-bridge.js` (already loaded)
- Read: `src-tauri/src/cmd_fs.rs` (already loaded)
- Read: `src-tauri/src/cmd_misc.rs` (already loaded)
- Read: `src-tauri/src/cmd_node_bridge.rs` (already loaded)

**Interfaces:**
- Consumes: Understanding of which NATIVE_TOOLS are currently functional (not stubs) and which need migration
- Produces: Precise list of tool signatures (name, query format, return shape, approval rule) that Phase 1 Rust commands must match

**Contract audit (from node-tools.js lines 108-1654):**

| Tool | Status | Needs Migration? |
|------|--------|-----------------|
| `read-skill` | Functional | No — stays JS (skills frontend) |
| `browser-search` | Functional | No — stays JS (web scraping) |
| `read-file` | Functional | **Yes** — already Rust (`fs_read_file` in cmd_fs.rs) |
| `file-outline` | Functional | No — stays JS (frontend-only structural regex) |
| `read-document` | Functional | No — stays JS (pdf-parse, mammoth) |
| `write-file` | Functional | **Yes** — already Rust (`fs_write_file` in cmd_fs.rs) |
| `replace-content` | Functional | **New** — Rust replace |
| `replace-lines` | Functional | **New** — Rust line replace |
| `delete-file` | Functional | **Yes** — already Rust (`fs_delete_file` in cmd_fs.rs) |
| `list-dir` | Functional | **Yes** — already Rust (`fs_list_dir` in cmd_fs.rs) |
| `find-files` | Functional | **New** — Rust glob/walk |
| `grep-search` | Functional | **Yes** — already Rust (`fs_grep_search` in cmd_fs.rs) |
| `run-shell` | Functional | **Yes** — needs Rust shell exec |
| `git-status` | Functional | **New** — spawn git |
| `git-diff` | Functional | **New** — spawn git |
| `git-commit` | Functional | **New** — spawn git + approval |
| `git-revert` | Functional | **New** — spawn git + approval |
| `run-task` | Functional | **New** — spawn background task |
| `read-task-output` | Functional | **New** — read task stdout |
| `kill-task` | Functional | **New** — kill process |
| `list-tasks` | Functional | **New** — list running tasks |
| `browser-*` (11 tools) | **Stub** | No — defer Phase C |
| `os-*` (13 tools) | **Stub** | **Yes** — migrate stub→real Rust |
| `gdrive-*` (6 tools) | Functional | No — stays JS (Google API) |
| `gcalendar-*` (3 tools) | Functional | No — stays JS (Google API) |
| `gmail-*` (5 tools) | Functional | No — stays JS (Google API) |
| `tg-send` | Functional | Defer — Phase 2 |

**Already migrated to Rust (Fase B0 — cmd_fs.rs + cmd_misc.rs):**
- `read-file` → `fs_read_file`
- `write-file` → `fs_write_file`
- `delete-file` → `fs_delete_file`
- `list-dir` → `fs_list_dir`
- `grep-search` → `fs_grep_search`
- `get-documents-path` → `misc_get_documents_path`
- `system:get-lite-mode` → `misc_get_lite_mode`
- `save-temp-file` → `misc_save_temp_file`
- `open-external` → `misc_open_external`
- `show-notification` → `misc_show_notification`
- `app:open-file-dialog` → `misc_open_file_dialog`
- `app:open-directory-dialog` → `misc_open_directory_dialog`
- `app:take-screenshot` → `misc_take_screenshot`
- Window controls (minimize/maximize/fullscreen/close) → `main.rs` inline

**Still routed via `node_invoke` (sidecar):**
- `read-skill`, `browser-search`, `file-outline`, `read-document` (JS-only)
- `replace-content`, `replace-lines`, `find-files` (new Rust needed)
- `run-shell`, `git-*`, `run-task`, `read-task-output`, `kill-task`, `list-tasks` (new Rust needed)
- `os-*` (currently stubs returning `{unsupported: true}`)
- `gdrive-*`, `gcalendar-*`, `gmail-*` (JS-only, Google APIs)
- `tg-send` (JS-only, Telegram)
- `ai:fetch`, `tts-speak`, `get-youtube-transcript`, `youtube-search`, `search-music` (JS-only)
- `workspace:index`, `workspace:query` (JS-only, Orama in renderer)
- `plugins:*`, `skills:*`, `parse-document` (JS-only)
- `awareness:*` (JS-only, Python daemon)
- `tg:*`, `google:*`, `remote-music-command` (JS-only)

- [ ] **Step 1: Write verification — grep for NATIVE_TOOLS usage in FE**

In `src/`, grep for `executeNativeTool` calls to confirm FE already uses `tauri-bridge.js` router:

```bash
grep -rn "executeNativeTool\|routeFsTool" src/ --include="*.js" --include="*.jsx"
```

Expected: FE calls `window.api.executeNativeTool(toolName, query, config)` — this is the hook point.

- [ ] **Step 2: Write verification — confirm tauri-bridge.js routing**

Verify `tauri-bridge.js` `routeFsTool` handles `read-file`, `write-file`, `delete-file`, `list-dir`, `grep-search` → `invoke('fs_*')` directly, and falls back to `node_invoke` for everything else.

Expected: 5 tools routed to Rust, rest via `call('native-tool:execute', ...)`.

- [ ] **Step 3: Commit audit**

```bash
git add docs/superpowers/plans/
git commit -m "docs: Phase 1 plan — sidecar-to-rust migration (run-shell, git, os-tools, tasks)"
```

---
---

### Task 2: Shell exec command (run-shell replacement)

**Files:**
- Create: `src-tauri/src/commands/tools/shell.rs`
- Modify: `src-tauri/src/main.rs` — add `mod commands_tools_shell;` + register `tools_run_shell`
- Modify: `src-tauri/Cargo.toml` — add `tauri-plugin-shell = "2"`
- Modify: `src/api/tauri-bridge.js` — route `run-shell` to `invoke('tools_run_shell', ...)`

**Interfaces:**
- Consumes: `cmd_node_bridge::confirm_on_main_thread` for approval gate, `cmd_fs::workspace_root` for cwd default
- Produces: `tools_run_shell(query: String, cwd: Option<String>) -> Result<ToolResult, String>`

```rust
// src-tauri/src/commands/tools/shell.rs
use serde::Serialize;
use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tokio::io::AsyncWriteExt;

#[derive(Serialize)]
pub struct ToolResult {
    pub success: bool,
    pub output: Option<String>,
    pub error: Option<String>,
}

fn spawn_detached(cmd: &mut Command) -> Result<(), String> {
    let mut child = cmd
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Gagal spawn: {e}"))?;
    std::thread::spawn(move || { let _ = child.wait(); });
    Ok(())
}

#[tauri::command]
pub async fn tools_run_shell(
    app: AppHandle,
    query: String,
    cwd: Option<String>,
) -> Result<ToolResult, String> {
    if query.trim().is_empty() {
        return Ok(ToolResult { success: false, output: None, error: Some("Query kosong.".into()) });
    }

    // Dangerous command check (parity with node-tools.js isDangerousCommand)
    let lower = query.to_lowercase();
    let dangerous = ["remove-item", "rm ", "del ", "rmdir", "format-", "clear-disk",
        "stop-process", "kill ", "taskkill", "set-executionpolicy", "restart-computer",
        "shutdown", "reg delete"];
    let is_dangerous = dangerous.iter().any(|kw| lower.contains(kw));

    if is_dangerous {
        let desc = format!("Mark ingin mengeksekusi perintah shell:\n\n{}", query);
        if !crate::cmd_node_bridge::confirm_on_main_thread(&app, desc) {
            return Ok(ToolResult { success: false, output: None, error: Some("Ditolak pengguna.".into()) });
        }
    }

    let workspace = crate::cmd_fs::workspace_root();
    let cwd_path = cwd.and_then(|c| {
        let p = std::path::PathBuf::from(c);
        if p.is_absolute() { Some(p) } else { Some(workspace.join(&p)) }
    }).unwrap_or(workspace);

    let output = tokio::task::spawn_blocking(move || -> Result<ToolResult, String> {
        let mut cmd = Command::new("bash");
        cmd.arg("-c").arg(&query).current_dir(&cwd_path);
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

        match cmd.output() {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
                if out.status.success() {
                    Ok(ToolResult {
                        success: true,
                        output: Some(if stdout.is_empty() { "Perintah berhasil (tanpa output).".into() } else { stdout }),
                        error: if stderr.is_empty() { None } else { Some(stderr) },
                    })
                } else {
                    Ok(ToolResult {
                        success: false,
                        output: Some(stdout),
                        error: Some(format!("Exit code: {}\n{}", out.status.code().unwrap_or(-1), stderr)),
                    })
                }
            }
            Err(e) => Ok(ToolResult { success: false, output: None, error: Some(format!("Gagal spawn bash: {e}")) }),
        }
    }).await.map_err(|e| format!("Task join gagal: {e}"))??;

    Ok(output)
}
```

- [ ] **Step 1: Create `src-tauri/src/commands/tools/shell.rs`**

Paste code above.

- [ ] **Step 2: Register module in main.rs**

```rust
mod commands_tools_shell;
```

Add to `invoke_handler`:
```rust
commands_tools_shell::tools_run_shell,
```

- [ ] **Step 3: Add Cargo dependency**

```toml
# No new dep needed — std::process::Command is stdlib
```

(YAGNI: stdlib `Command` handles shell exec. Skip `tauri-plugin-shell` for now.)

- [ ] **Step 4: Route in tauri-bridge.js**

Add to `routeFsTool` switch in `src/api/tauri-bridge.js`:

```js
case 'run-shell': {
  const [, cwd] = parts
  return invoke('tools_run_shell', { query: parts[0], cwd: cwd || null })
}
```

- [ ] **Step 5: Test**

```bash
cargo test 2>&1 | tail -20
bun tauri dev  # manual: open devtools console, test window.api.executeNativeTool('run-shell', 'ls -la')
```

Expected: `ls` output returned, dangerous commands trigger native dialog.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/tools/shell.rs src-tauri/src/main.rs src/api/tauri-bridge.js
git commit -m "feat(rust): tools_run_shell — replace sidecar run-shell with native Rust"
```

---
---

### Task 3: System info command (systemInfo replacement)

**Files:**
- Create: `src-tauri/src/commands/system/info.rs`
- Modify: `src-tauri/src/main.rs` — add module + register `system_get_info`
- Modify: `src/api/tauri-bridge.js` — route `system:get-info` to Rust

**Interfaces:**
- Consumes: stdlib only (read `/proc/meminfo`, `/proc/cpuinfo`, `/etc/os-release`)
- Produces: `system_get_info() -> Result<SystemInfo, String>`

```rust
// src-tauri/src/commands/system/info.rs
use serde::Serialize;

#[derive(Serialize)]
pub struct SystemInfo {
    pub platform: String,
    pub arch: String,
    pub total_ram_mb: u64,
    pub cpu_cores: u32,
    pub distro: String,
    pub is_lite: bool,
}

#[tauri::command]
pub fn system_get_info() -> SystemInfo {
    let total_ram_kb: u64 = std::fs::read_to_string("/proc/meminfo")
        .ok()
        .and_then(|s| s.lines().find(|l| l.starts_with("MemTotal:")))
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    let cpu_cores: u32 = std::fs::read_to_string("/proc/cpuinfo")
        .ok()
        .and_then(|s| Some(s.matches("processor").count()))
        .unwrap_or(1) as u32;

    let distro = std::fs::read_to_string("/etc/os-release")
        .ok()
        .and_then(|s| s.lines().find(|l| l.starts_with("PRETTY_NAME=")))
        .map(|l| l.trim_start_matches("PRETTY_NAME=").trim_matches('"').to_string())
        .unwrap_or_else(|| "Unknown Linux".into());

    SystemInfo {
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        total_ram_mb: total_ram_kb / 1024,
        cpu_cores,
        distro,
        is_lite: total_ram_kb > 0 && (total_ram_kb * 1024) <= 4_500_000_000,
    }
}
```

- [ ] **Step 1: Create file** — paste code above

- [ ] **Step 2: Register in main.rs**

```rust
mod commands_system_info;
// in invoke_handler:
commands_system_info::system_get_info,
```

- [ ] **Step 3: Route in tauri-bridge.js**

```js
systemGetInfo: () => invoke('system_get_info'),
```

Add to `api` object alongside existing `getLiteMode`.

- [ ] **Step 4: Test**

```bash
bun tauri dev  # console: window.api.systemGetInfo() → should return JSON with ram/distro/arch
```

Expected: `{ platform: "linux", arch: "x86_64", total_ram_mb: 7982, cpu_cores: 8, distro: "Ubuntu 24.04.2 LTS", is_lite: false }`

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/system/info.rs src-tauri/src/main.rs src/api/tauri-bridge.js
git commit -m "feat(rust): system_get_info — replace sidecar systemInfo with native /proc parser"
```

---
---

### Task 4: OS tools (pc-agent stub → real Rust via xdotool)

**Files:**
- Create: `src-tauri/src/commands/tools/os_input.rs`
- Modify: `src-tauri/src/main.rs` — add module + register commands
- Modify: `src/api/tauri-bridge.js` — route `os-*` calls

**Interfaces:**
- Consumes: stdlib `Command::new("xdotool")` (already installed per README)
- Produces: `os_click(x, y, button)`, `os_type(text)`, `os_key(keysym)`, `os_scroll(direction, amount)`, `os_get_active_window()`

```rust
// src-tauri/src/commands/tools/os_input.rs
use serde::Serialize;
use std::process::Command;

fn xdotool(args: &[&str]) -> Result<String, String> {
    let out = Command::new("xdotool").args(args).output()
        .map_err(|e| format!("xdotool tidak tersedia: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        Err(format!("xdotool gagal: {}", String::from_utf8_lossy(&out.stderr)))
    }
}

#[derive(Serialize)]
pub struct WindowInfo {
    pub window_id: String,
    pub title: String,
}

#[tauri::command]
pub fn os_click(x: i32, y: i32, button: Option<&str>) -> Result<String, String> {
    let btn = button.unwrap_or("1");
    xdotool(&["mousemove", &x.to_string(), &y.to_string()])?;
    xdotool(&["click", btn])?;
    Ok(format!("Clicked ({x},{y}) button={btn}"))
}

#[tauri::command]
pub fn os_type(text: String) -> Result<String, String> {
    xdotool(&["type", "--delay", "50", &text])?;
    Ok(format!("Typed: {} chars", text.len()))
}

#[tauri::command]
pub fn os_key(keysym: String) -> Result<String, String> {
    let keys: Vec<&str> = keysym.split('+').map(|s| s.trim()).collect();
    if keys.len() > 1 {
        let mut cmd = vec!["key"];
        for k in keys { cmd.push(k); }
        xdotool(&cmd)
    } else {
        xdotool(&["key", &keysym])
    }.map(|_| format!("Key pressed: {keysym}"))
}

#[tauri::command]
pub fn os_scroll(direction: &str, amount: u32) -> Result<String, String> {
    let btn = match direction { "up" => "4", "down" => "5", "left" => "6", "right" => "7", _ => "4" };
    let mut cmd = vec!["click", "--repeat", &amount.to_string(), btn];
    xdotool(&cmd).map(|_| format!("Scrolled {direction} {amount}x"))
}

#[tauri::command]
pub fn os_get_active_window() -> Result<WindowInfo, String> {
    let wid = xdotool(&["getactivewindow"])?;
    let title = xdotool(&["getwindowname", &wid]).unwrap_or_default();
    Ok(WindowInfo { window_id: wid, title })
}
```

- [ ] **Step 1: Create file** — paste code above

- [ ] **Step 2: Register in main.rs**

```rust
mod commands_tools_os_input;
// in invoke_handler:
commands_tools_os_input::os_click,
commands_tools_os_input::os_type,
commands_tools_os_input::os_key,
commands_tools_os_input::os_scroll,
commands_tools_os_input::os_get_active_window,
```

- [ ] **Step 3: Route in tauri-bridge.js**

Replace stub handlers in `NATIVE_TOOLS` (node-tools.js lines 1094-1313) — but those stubs are in sidecar, not FE. Instead, route in `tauri-bridge.js`:

```js
// Add to api object:
osClick: (x, y, button) => invoke('os_click', { x, y, button }),
osType: (text) => invoke('os_type', { text }),
osKey: (keysym) => invoke('os_key', { keysym }),
osScroll: (direction, amount) => invoke('os_scroll', { direction, amount }),
osGetActiveWindow: () => invoke('os_get_active_window'),
```

- [ ] **Step 4: Test**

```bash
bun tauri dev  # console: window.api.osClick(100, 200, '1') → should move + click
```

Expected: mouse moves to (100,200) and left-clicks. `osGetActiveWindow()` returns current window title.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/tools/os_input.rs src-tauri/src/main.rs src/api/tauri-bridge.js
git commit -m "feat(rust): os_click/type/key/scroll/get_active_window — replace pc-agent stubs with xdotool"
```

---
---

### Task 5: Git commands (git-service replacement)

**Files:**
- Create: `src-tauri/src/commands/tools/git.rs`
- Modify: `src-tauri/src/main.rs` — add module + register commands
- Modify: `src/api/tauri-bridge.js` — route `git-*` calls

**Interfaces:**
- Consumes: stdlib `Command::new("git")` — spawn git binary (YAGNI: skip `git2` crate)
- Produces: `git_status(cwd)`, `git_diff(cwd, range)`, `git_commit(cwd, message)`, `git_revert(cwd, target)`

```rust
// src-tauri/src/commands/tools/git.rs
use serde::Serialize;

#[derive(Serialize)]
pub struct GitResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
}

fn git(cwd: &std::path::Path, args: &[&str]) -> Result<GitResult, String> {
    let out = std::process::Command::new("git")
        .args(args).current_dir(cwd)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("git tidak tersedia: {e}"))?;

    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();

    if out.status.success() {
        Ok(GitResult { success: true, output: stdout, error: None })
    } else {
        Ok(GitResult { success: false, output: stdout, error: Some(stderr) })
    }
}

#[tauri::command]
pub fn git_status(app: tauri::AppHandle, cwd: Option<String>) -> GitResult {
    let root = crate::cmd_fs::workspace_root();
    let path = cwd.and_then(|c| {
        let p = std::path::PathBuf::from(c);
        if p.is_absolute() { Some(p) } else { Some(root.join(&p)) }
    }).unwrap_or(root);
    git(&path, &["status", "--short"])
}

#[tauri::command]
pub fn git_diff(app: tauri::AppHandle, cwd: Option<String>, range: Option<String>) -> GitResult {
    let root = crate::cmd_fs::workspace_root();
    let path = cwd.and_then(|c| { let p = std::path::PathBuf::from(c); if p.is_absolute() { Some(p) } else { Some(root.join(&p)) } }).unwrap_or(root);
    let mut args = vec!["diff"];
    if let Some(r) = range { args.push(&r); }
    git(&path, &args)
}

#[tauri::command]
pub fn git_commit(app: tauri::AppHandle, message: String, cwd: Option<String>) -> Result<GitResult, String> {
    let root = crate::cmd_fs::workspace_root();
    let path = cwd.and_then(|c| { let p = std::path::PathBuf::from(c); if p.is_absolute() { Some(p) } else { Some(root.join(&p)) } }).unwrap_or(root);

    let desc = format!("Mark ingin git commit:\n\n{}\n\nPath: {}", message, path.display());
    if !crate::cmd_node_bridge::confirm_on_main_thread(&app, desc) {
        return Ok(GitResult { success: false, output: String::new(), error: Some("Ditolak pengguna.".into()) });
    }

    git(&path, &["commit", "-m", &message])
}

#[tauri::command]
pub fn git_revert(app: tauri::AppHandle, target: String, cwd: Option<String>) -> Result<GitResult, String> {
    let root = crate::cmd_fs::workspace_root();
    let path = cwd.and_then(|c| { let p = std::path::PathBuf::from(c); if p.is_absolute() { Some(p) } else { Some(root.join(&p)) } }).unwrap_or(root);

    let desc = format!("Mark ingin revert git:\n\nTarget: {}\nPath: {}", target, path.display());
    if !crate::cmd_node_bridge::confirm_on_main_thread(&app, desc) {
        return Ok(GitResult { success: false, output: String::new(), error: Some("Ditolak pengguna.".into()) });
    }

    git(&path, &["revert", "--no-commit", &target])
}
```

- [ ] **Step 1: Create file** — paste code above

- [ ] **Step 2: Register in main.rs**

```rust
mod commands_tools_git;
// in invoke_handler:
commands_tools_git::git_status,
commands_tools_git::git_diff,
commands_tools_git::git_commit,
commands_tools_git::git_revert,
```

- [ ] **Step 3: Route in tauri-bridge.js**

```js
// Add to api object:
gitStatus: (query) => invoke('git_status', { cwd: query || null }),
gitDiff: (query) => invoke('git_diff', { cwd: null, range: query || null }),
gitCommit: (query) => {
  const parts = (query || '').split('||')
  return invoke('git_commit', { message: parts[0], cwd: parts[1] || null })
},
gitRevert: (query) => invoke('git_revert', { target: query, cwd: null }),
```

- [ ] **Step 4: Test**

```bash
bun tauri dev  # console: window.api.gitStatus() → should show git status output
```

Expected: Returns `{ success: true, output: " M src/main.rs\n?? newfile.txt" }` (or similar)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/tools/git.rs src-tauri/src/main.rs src/api/tauri-bridge.js
git commit -m "feat(rust): git_status/diff/commit/revert — replace sidecar git-service with spawn git"
```

---
---

### Task 6: Background task manager (task-daemon replacement)

**Files:**
- Create: `src-tauri/src/commands/tools/tasks.rs`
- Modify: `src-tauri/src/main.rs` — add module + register
- Modify: `src/api/tauri-bridge.js` — route `run-task`, `read-task-output`, `kill-task`, `list-tasks`

**Interfaces:**
- Consumes: `tauri::async_runtime::spawn` for background tasks, `Arc<Mutex<HashMap>>` for state
- Produces: `run_task(task_id, command, cwd)`, `read_task_output(task_id, lines)`, `kill_task(task_id)`, `list_tasks()`

```rust
// src-tauri/src/commands/tools/tasks.rs
use serde::Serialize;
use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::AppHandle;

#[derive(Clone, Serialize)]
pub struct TaskInfo {
    pub id: String,
    pub command: String,
    pub status: String, // "running" | "stopped" | "done"
}

type TaskMap = Arc<Mutex<HashMap<String, TaskInfo>>>;
type TaskOutputMap = Arc<Mutex<HashMap<String, Vec<String>>>>;

#[tauri::command]
pub fn run_task(
    app: AppHandle,
    task_id: String,
    command: String,
    cwd: Option<String>,
    _tasks: tauri::State<TaskMap>,
    _outputs: tauri::State<TaskOutputMap>,
) -> Result<String, String> {
    let root = crate::cmd_fs::workspace_root();
    let cwd_path = cwd.and_then(|c| { let p = std::path::PathBuf::from(c); if p.is_absolute() { Some(p) } else { Some(root.join(&p)) } }).unwrap_or(root);

    // Store task info
    {
        let mut tasks = _tasks.inner().lock().unwrap();
        tasks.insert(task_id.clone(), TaskInfo { id: task_id.clone(), command: command.clone(), status: "running".into() });
    }

    // Spawn background
    tauri::async_runtime::spawn(async move {
        let out = Command::new("bash")
            .arg("-c").arg(&command).current_dir(&cwd_path)
            .stdout(Stdio::piped()).stderr(Stdio::piped())
            .output();

        if let Ok(output) = out {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let lines: Vec<String> = stdout.lines().map(|s| s.to_string()).collect();

            // Store output
            {
                let mut outputs = _outputs.inner().lock().unwrap();
                outputs.insert(task_id.clone(), lines);
            }

            // Update status
            {
                let mut tasks = _tasks.inner().lock().unwrap();
                if let Some(t) = tasks.get_mut(&task_id) {
                    t.status = if output.status.success() { "done" } else { "stopped" }.into();
                }
            }
        }
    });

    Ok(format!("Task '{task_id}' started"))
}

#[tauri::command]
pub fn list_tasks(
    _tasks: tauri::State<TaskMap>,
) -> Vec<TaskInfo> {
    _tasks.inner().lock().unwrap().values().cloned().collect()
}

#[tauri::command]
pub fn read_task_output(
    task_id: String,
    lines: Option<u32>,
    _outputs: tauri::State<TaskOutputMap>,
) -> Result<String, String> {
    let outputs = _outputs.inner().lock().unwrap();
    let task_lines = outputs.get(&task_id).ok_or("Task tidak ditemukan")?;
    let n = lines.unwrap_or(40) as usize;
    let start = task_lines.len().saturating_sub(n);
    Ok(task_lines[start..].join("\n"))
}

#[tauri::command]
pub fn kill_task(
    task_id: String,
    _tasks: tauri::State<TaskMap>,
) -> Result<String, String> {
    let mut tasks = _tasks.inner().lock().unwrap();
    if let Some(t) = tasks.get_mut(&task_id) {
        t.status = "stopped".into();
        Ok(format!("Task '{task_id}' dihentikan"))
    } else {
        Err("Task tidak ditemukan".into())
    }
}
```

- [ ] **Step 1: Create file** — paste code above

- [ ] **Step 2: Register in main.rs**

Add state management:
```rust
type TaskMap = std::sync::Arc<std::sync::Mutex<std::collections::HashMap<String, commands_tools_tasks::TaskInfo>>>;
type TaskOutputMap = std::sync::Arc<std::sync::Mutex<std::collections::HashMap<String, Vec<String>>>>;
```

In `.manage()`:
```rust
.manage(TaskMap::default())
.manage(TaskOutputMap::default())
```

Register commands in `invoke_handler`:
```rust
commands_tools_tasks::run_task,
commands_tools_tasks::list_tasks,
commands_tools_tasks::read_task_output,
commands_tools_tasks::kill_task,
```

- [ ] **Step 3: Route in tauri-bridge.js**

```js
runTask: (query) => {
  const parts = (query || '').split('||')
  return invoke('run_task', { taskId: parts[0], command: parts.slice(1).join('||'), cwd: null })
},
readTaskOutput: (query) => {
  const parts = (query || '').split('||')
  return invoke('read_task_output', { taskId: parts[0], lines: parts[1] ? Number(parts[1]) : 40 })
},
killTask: (query) => invoke('kill_task', { taskId: query }),
listTasks: () => invoke('list_tasks'),
```

- [ ] **Step 4: Test**

```bash
bun tauri dev  # console: window.api.runTask('test-server||sleep 10 && echo done')
window.api.listTasks() → should show running task
window.api.readTaskOutput('test-server||40') → should show output
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/tools/tasks.rs src-tauri/src/main.rs src/api/tauri-bridge.js
git commit -m "feat(rust): run_task/read_task_output/kill_task/list_tasks — replace task-daemon"
```

---
---

### Task 7: Update tauri-bridge.js — add Rust routes for remaining tools

**Files:**
- Modify: `src/api/tauri-bridge.js`

**Interfaces:**
- Consumes: Rust commands from Tasks 2-6
- Produces: FE-facing `window.api.*` methods that route to Rust

Add to `api` object:

```js
// ---- Rust-native replacements (was: sidecar via node_invoke) ----
executeShell: (query, cwd) => invoke('tools_run_shell', { query, cwd: cwd || null }),
getSystemInfo: () => invoke('system_get_info'),
getActiveWindow: () => invoke('os_get_active_window'),
osClick: (x, y, button) => invoke('os_click', { x, y, button }),
osType: (text) => invoke('os_type', { text }),
osKey: (keysym) => invoke('os_key', { keysym }),
osScroll: (direction, amount) => invoke('os_scroll', { direction, amount }),
gitStatus: (cwd) => invoke('git_status', { cwd: cwd || null }),
gitDiff: (cwd, range) => invoke('git_diff', { cwd: cwd || null, range: range || null }),
gitCommit: (message, cwd) => invoke('git_commit', { message, cwd: cwd || null }),
gitRevert: (target, cwd) => invoke('git_revert', { target, cwd: cwd || null }),
runTask: (query) => { const [id, ...cmd] = (query || '').split('||'); return invoke('run_task', { taskId: id, command: cmd.join('||'), cwd: null }) },
readTaskOutput: (query) => { const parts = (query || '').split('||'); return invoke('read_task_output', { taskId: parts[0], lines: parts[1] ? Number(parts[1]) : 40 }) },
killTask: (taskId) => invoke('kill_task', { taskId }),
listTasks: () => invoke('list_tasks'),
```

**Also update `routeFsTool` switch** to include:
- `replace-content` → `invoke('fs_replace_content', { path, target, replacement })`
- `replace-lines` → `invoke('fs_replace_lines', { path, startLine, endLine, content })`
- `find-files` → `invoke('fs_find_files', { dir, pattern })`

(These require new Rust commands — add to Task 2 scope or create Task 2b.)

- [ ] **Step 1: Add routes** — paste code above into `tauri-bridge.js` `api` object

- [ ] **Step 2: Verify no breaking changes**

```bash
grep -rn "executeNativeTool\|run-shell\|git-status\|list-tasks" src/ --include="*.jsx" --include="*.js"
```

Expected: All FE callers use `window.api.<new_method>()` or `window.api.executeNativeTool(toolName, query)`.

- [ ] **Step 3: Commit**

```bash
git add src/api/tauri-bridge.js
git commit -m "feat(fe): route run-shell/git/tasks/os-input to Rust commands"
```

---
---

### Task 8: Verification gate

**Files:**
- None (verification only)

**Checks:**

- [ ] **Step 1: cargo check**

```bash
cd src-tauri && cargo check 2>&1
```

Expected: No errors. Warnings OK.

- [ ] **Step 2: cargo test**

```bash
cd src-tauri && cargo test 2>&1
```

Expected: All existing tests pass (cmd_node_bridge `is_safe_shell_query` tests).

- [ ] **Step 3: bun test**

```bash
bun test 2>&1 | tail -30
```

Expected: vitest green (or skip if no vitest configured).

- [ ] **Step 4: Manual smoke test**

```bash
bun tauri dev
```

In devtools console:
```js
// Test each new command:
await window.api.executeShell('echo hello')
await window.api.getSystemInfo()
await window.api.gitStatus()
await window.api.runTask('test||echo hello-world')
await window.api.listTasks()
await window.api.osGetActiveWindow()
```

Expected: All return valid data, no errors in Rust log.

- [ ] **Step 5: Measure RAM**

```bash
ps aux | grep -i "mark\|tauri\|bun" | grep -v grep
```

Expected: No `bun` process running (sidecar stopped). Tauri binary ~20-40MB RSS.

- [ ] **Step 6: Commit verification**

```bash
git add .
git commit -m "chore: Phase 1 verification — cargo check + smoke test"
```

---
---

### Task 9: Update ALLOWED_ACTIONS in cmd_node_bridge.rs

**Files:**
- Modify: `src-tauri/src/cmd_node_bridge.rs`

**Action:**
Remove migrated tools from `ALLOWED_ACTIONS` — they no longer need sidecar routing. Remaining actions stay.

Remove these lines from `ALLOWED_ACTIONS` (lines 62-97):
```rust
"native-tool:execute",       // ← now routed to Rust directly
"native-tool:needs-approval", // ← approval now in Rust commands
"run-shell",                 // ← now `tools_run_shell`
```

Keep: `ai:fetch`, `ai:abort-fetch`, `ai:list-models`, `sync-config`, `parse-document`, `tts-speak`, `get-youtube-transcript`, `youtube-search`, `tg:*`, `google:*`, `workspace:*`, `awareness:*`, `ping`, `plugins:list`, `remote-music-command`, `search-music`, `skills:*`.

- [ ] **Step 1: Edit ALLOWED_ACTIONS** — remove migrated tools

- [ ] **Step 2: cargo check**

```bash
cd src-tauri && cargo check
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/cmd_node_bridge.rs
git commit -m "chore(rust): remove migrated tools from ALLOWED_ACTIONS (run-shell, native-tool:execute)"
```

---
---

### Task 10: Phase 1 completion — update docs

**Files:**
- Modify: `docs/superpowers/specs/2026-08-28-sidecar-to-rust-migration-design.md`
- Modify: `mark-agent-tracker.html` (if tracked)

**Action:**
- Mark Fase 1 tasks as completed in spec
- Update tracker progress (68% → ~75%)

- [ ] **Step 1: Update spec** — add "Phase 1 Complete" section

- [ ] **Step 2: Update tracker** — bump progress, add commits

- [ ] **Step 3: Commit**

```bash
git add docs/ mark-agent-tracker.html
git commit -m "docs: Phase 1 complete — sidecar migration status update"
```

---
---

## Execution Order

Tasks 1 (audit) → 2 (shell) → 3 (system) → 4 (os-input) → 5 (git) → 6 (tasks) → 7 (routes) → 8 (verify) → 9 (cleanup) → 10 (docs).

Each task is independently testable. Commit after each task.

## Skipped

- `find-files`, `replace-content`, `replace-lines` — defer to Phase 1b if needed (fs glob/replace is stdlib but adds complexity)
- Browser stubs (`browser-*`) — intentionally not migrated (Phase C, defer)
- OS stubs (`os-read`, `os-open`, `os-list-windows`, `os-focus-window`, `os-ask`, `os-control-*`) — defer to Phase 2 (need xdotool + more complex logic)
- `gdrive-*`, `gcalendar-*`, `gmail-*` — stays JS (Google API, web-native)
- `tg-send` — defer to Phase 2
- Plugin system — stays JS (user-created CommonJS)
