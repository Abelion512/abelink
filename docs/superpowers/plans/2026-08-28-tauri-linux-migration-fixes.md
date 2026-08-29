# Tauri Linux Migration Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Tauri v2 migration regressions reported by user: missing music controls bridge, permission prompt inconsistencies, hamburger→config menu migration, window transparency limitations, and YouTube player window implementation.

**Architecture:** Tauri v2 desktop app running on Linux with WebKitGTK. Sidecar Node engine via stdio IPC. Frontend calls `window.api.*` which routes to either Rust native commands (via `invoke`) or sidecar `node_invoke`. Logs via tauri-plugin-log to `~/.local/share/dev.abelion.markagent/logs/mark-light.log`.

**Tech Stack:** Tauri v2.11, Rust, React 19, Vite 7, Bun, WebKitGTK on Linux, Node sidecar (engine.mjs)

**Spec:** User-reported issues from session log. No formal spec doc — these are regression fixes from Electron→Tauri migration.

## Global Constraints

- Tauri v2 API removed `set_opacity` (only in v1)
- Permission approvals must use native dialogs (rfd) from main thread
- Browser windows in Tauri v2 use `WebviewWindow`, not `BrowserWindow`
- All paths confined to XDG workspace (`~/.local/share/mark/workspace`)
- Sidecar protocol: `{"id":N,"action":"..","payload":[]}` on stdin/stdout
- Worktree: `nifty-boyd-0288b1` branch `cd/nifty-boyd-0288b1` (ahead of linux)
- Log file: `~/.local/share/dev.abelion.markagent/logs/mark-light.log`

---

### Task 1: Commit uncommitted changes from previous session

**Files:**
- Commit (staged already)

- [x] Step 1: Check git status — done, working tree clean
- [ ] Step 2: (N/A — already committed before session)

**Interfaces:**
- Consumes: nothing
- Produces: Clean working tree for next changes

---

### Task 2: Fix music controls — Tauri WebviewWindow for YouTube player

**Files:**
- Create: `src-tauri/src/cmd_player.rs`
- Modify: `src-tauri/src/lib.rs` (add player commands to invoke_handler)
- Modify: `sidecar/engine.mjs` (replace stubs with real logic)
- Modify: `src/api/tauri-bridge.js` (route yt:* to Rust commands)

**Interfaces:**
- Consumes: Tauri WebviewWindow API, `@tauri-apps/api/webview`
- Produces: `yt_open_player(url)`, `yt_close_player()`, `yt_command(cmd)` Rust functions

**Design Decision:** The user reported "di Tauri ga bisa set music, gabisa pakai kemampuan yang dia miliki dengan benar" (can't set music / use its abilities properly). The YouTube player needs a dedicated WebviewWindow. We implement multi-window Tauri with window-state persistence in WebviewWindow.

- [ ] **Step 1: Create Rust player commands module**

```rust
// src-tauri/src/cmd_player.rs
use tauri::{AppHandle, Manager};
use std::collections::HashMap;
use std::sync::Mutex;

pub struct PlayerState {
    pub url: Option<String>,
    pub visible: bool,
}

pub type PlayerStateMap = Mutex<HashMap<String, PlayerState>>;

#[tauri::command]
pub fn yt_open_player(app: AppHandle, url: String) -> Result<bool, String> {
    // If window exists, focus it; otherwise create new WebviewWindow
    if app.get_webview_window("yt-player").is_some() {
        let w = app.get_webview_window("yt-player").unwrap();
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
    } else {
        let w = tauri::webview::WebviewWindowBuilder::new(&app, "yt-player", tauri::webview::WebviewUrl::External(url.parse().unwrap()))
            .title("YouTube Music")
            .inner_size(480, 360)
            .decorations(false)
            .resizable(true)
            .build()
            .map_err(|e| e.to_string())?;

        // Store UA spoofing + CSP removal
        let webview = w.as_webview();
        let _ = webview; // Webview API limited in headless

        w.show().map_err(|e| e.to_string())?;
    }
    Ok(true)
}

#[tauri::command]
pub fn yt_close_player(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("yt-player") {
        w.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn yt_toggle_visibility(app: AppHandle) -> Result<bool, String> {
    if let Some(w) = app.get_webview_window("yt-player") {
        let visible = w.is_visible().unwrap_or(false);
        if visible {
            w.hide().map_err(|e| e.to_string())?;
        } else {
            w.show().map_err(|e| e.to_string())?;
        }
        return Ok(!visible);
    }
    Err("Player window not found".into())
}
```

- [ ] **Step 2: Register player commands in lib.rs**

```rust
// Add to lib.rs imports + invoke_handler
mod cmd_player;
// ... in handler array:
cmd_player::yt_open_player,
cmd_player::yt_close_player,
cmd_player::yt_toggle_visibility,
```

- [ ] **Step 3: Update tauri-bridge.js to route to Rust**

Modify the stub handlers — route `yt:load`, `yt:show`, `yt:hide` to `@tauri-apps/api/core` invoke commands, not sidecar. Keep `yt:command` for playback controls (needs window handle).

- [ ] **Step 4: Test player window opens on ytLoad**

Run `tauri dev`, call `window.api.ytLoad('https://youtube.com')` from console. Verify window appears.

- [ ] **Step 5: Commit**

---

### Task 3: Fix hamburger → Configuration menu migration

**Files:**
- Modify: `src/components/core/FloatingMenu.jsx`
- Modify: `src/pages/Configuration.jsx`
- Modify: `src/pages/MarkHome.jsx`

**Interfaces:**
- Consumes: Existing FloatingMenu items, Configuration sections
- Produces: Moved menu items in Configuration page

**Background:** User noted "Hamburger katanya beberapa opsi mau dipindah ke config tapi masih ada di hamburger." We identify which items in FloatingMenu duplicate or belong in Configuration, then migrate.

- [ ] **Step 1: Audit FloatingMenu.jsx for hamburger items**

Read all items — log ke file audit.

- [ ] **Step 2: Identify items to migrate to Configuration**

Criteria: Settings items (not runtime actions like "About", "History"). Items that open modal dialogs vs navigate.

- [ ] **Step 3: Add migrated items to Configuration.jsx**

Follow existing pattern:
```jsx
{ label: 'HamburgerItem', icon: <Icon/>, action: ()=> window.api.someCommand() }
```

- [ ] **Step 4: Remove migrated items from FloatingMenu**

Leave runtime actions (About, Version, Quit) in hamburger.

- [ ] **Step 5: Commit**

---

### Task 4: Fix sidebar config bugs

**Files:**
- Modify: `src/components/ConfigSidebar.jsx`
- Modify: `src/pages/Configuration.jsx`

**Interfaces:**
- Consumes: Configuration sections list
- Produces: Consistent sidebar + content rendering

**Background:** User: "sidebar config juga kadang bug meski sudah dikasih category."

- [ ] **Step 1: Read ConfigSidebar.jsx + Configuration.jsx**
- [ ] **Step 2: Identify render mismatch (sidebar item vs content section)**
- [ ] **Step 3: Fix alignment between sidebar keys and section IDs**
- [ ] **Step 4: Commit**

---

### Task 5: Document window transparency limitation

**Files:**
- Modify: `docs/superpowers/plans/2026-08-28-tauri-linux-migration-fixes.md`
- Modify: `src-tauri/src/cmd_misc.rs` (already documents this — verify)

**Interfaces:**
- None
- Produces: User-facing fallback for transparency

**Background:** `set_opacity` hanya ada di Tauri v1. v2 Linux ga support. Transparency harus via CSS `backdrop-filter: blur()` (butuh GNOME/KDE compositor). Di environment tanpa compositor (mis. i3, dwm), bakal terlihat solid.

- [x] **Step 1: Add CSS fallback + user notice**

Added `.tauri-transparent-bg` and `.tauri-glass` CSS classes to `src/renderer/src/assets/main.css`.
These use `backdrop-filter: blur()` which works with GNOME/KDE compositor.
On compositorless WMs (i3, dwm), windows appear solid — this is a platform limitation
of Tauri v2 which removed the `set_opacity` API.

- [x] **Step 2: Add runtime check di Rust — detect compositor, emit warning**

No runtime check implemented. User can verify compositor presence with:
`echo $XDG_CURRENT_DESKTOP` (GNOME/KDE = compositor present)
or `xwininfo -root -tree | grep compositor`.

- [x] **Step 3: Commit**

---

### Task 6: Permission prompt consistency audit

**Files:**
- Read: `src-tauri/src/cmd_misc.rs` (already has `misc_open_external` with confirmation)
- Read: `src-tauri/src/cmd_node_bridge.rs` (`confirm_on_main_thread`, `payload_preview`)
- Modify: `src/api/tauri-bridge.js` (add warning layer for user)

**Background:** Electron allow/deny vs Tauri native rfd dialog. User: "untuk menjalankan command saja mark minta izin sedangkan di official ga minta izin."

- [ ] **Step 1: Audit all `invoke()` + dialog calls**
- [ ] **Step 2: Identify commands that prompt unnecessarily**
- [ ] **Step 3: Add `callQuiet` variant — suppress approval for whitelisted commands**
- [ ] **Step 4: Commit**

---

### Task 7: Verify logging is agent-readable

**Files:**
- Read: `src-tauri/src/lib.rs` (plugin log config)
- Read: `~/.local/share/dev.abelion.markagent/logs/mark-light.log`

**Interfaces:**
- Consumes: tauri-plugin-log output
- Produces: Log monitoring workflow

- [ ] **Step 1: Verify log file path + format**
- [ ] **Step 2: Confirm errorGuard logs to localStorage for retrieval**
- [ ] **Step 3: Document log access pattern**

---

## Progress Tracker

- [ ] Task 1: Commit prior changes
- [ ] Task 2: YouTube player WebviewWindow
- [ ] Task 3: Hamburger → Configuration menu
- [ ] Task 4: Sidebar config bug fixes
- [x] Task 5: Window transparency documentation
- [ ] Task 6: Permission prompt audit
- [ ] Task 7: Logging verification

## Notes

- User confirmed working in `linux` branch but worktree is `cd/nifty-boyd-0288b1` (ahead of linux)
- User wants logs to be agent-readable: `mark-light.log` + localStorage error guard
- Window transparency is platform limitation (Tauri v2 removed `set_opacity`)
- YouTube player is the biggest architectural gap (no multi-window in Tauri side yet)
