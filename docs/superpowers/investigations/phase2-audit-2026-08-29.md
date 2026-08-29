# Phase 2: Sidecar Module Rust Migration Audit
**Date:** 2026-08-29

## 1. `sidecar/main/pc-agent.js` (1017 lines)

| Aspect | Analysis |
|--------|----------|
| **APIs Used** | `child_process.spawn` (Python daemon, shell scripts)<br>`electron.app`, `BrowserWindow`, `globalShortcut`, `screen`<br>`fs` (file existence, path join)<br>`JSON.parse/stringify` (native JSON) |
| **OS-Native (Rust Candidate)** | • UI Automation read via daemon (JSON protocol over stdin)<br>• Click/double-click/key/type/scroll actions via daemon<br>• Application launch (`open-app`)<br>• Window listing and focus (`list-windows`, `focus-window`)<br>• Emergency stop state management<br>• Daemon stdout/stderr parsing and command routing |
| **JS-Only (Must Stay)** | • Overlay DOM rendering (HTML/CSS/JS)<br>• `globalShortcut` registration for Ctrl+Shift+S<br>• `BrowserWindow` creation and lifecycle<br>• Promise chain for command serialization<br>• Python daemon process management (spawn/kill)<br>• Shell script fallback (`runScriptFallback`)<br>• State machine (stop/resume/emergency)<br>• IPC bridge to frontend via overlay page-title events |
| **Required Rust Crates** | `tauri` (already present: webview, global-shortcut)<br>`serde`/`serde_json` (already present: JSON parsing)<br>`tokio` (already present: async runtime)<br>`log` (already present)<br>`rfd` may be needed for file dialogs<br>`anyhow` or `thiserror` for error handling<br>`dirs` or similar for path resolution<br>`serde_json::from_reader` for streaming JSON parsing |
| **Migration Notes** | Heavy JS logic is process/spawn orchestration + UI. Core automation (click, type, read) is daemon-based. The overlay window pattern is Electron-specific. Python daemon would need Rust replacement or keep spawn for transitional period. Shell scripts (.ps1/.sh) would need reimplementation. |

## 2. `sidecar/main/telegram/telegram-service.js` (767 lines)

| Aspect | Analysis |
|--------|----------|
| **APIs Used** | `telegraf` (Telegram Bot API wrapper)<br>`https.Agent` (HTTP keep-alive)<br>`desktopCapturer` (Electron screen capture)<br>`child_process.execFile` (yt-dlp)<br>`ffmpeg-static`, `ffmpeg` paths<br>`fs` (file I/O)<br>`path`, `os` (filepath utilities)<br>`electron.ipcMain` (IPC handlers)<br>`yts` (YouTube search) |
| **OS-Native (Rust Candidate)** | • Message processing loop<br>• File download (HTTP fetch → file write)<br>• Admin authentication gate<br>• Message history management<br>• Broadcast distribution logic<br>• Pending request tracking<br>• Markdown→HTML conversion<br>• Screenshot capture and send<br>• File path sanitization and validation |
| **JS-Only (Must Stay)** | • `Telegraf` bot framework (Telegram webhook/long-polling)<br>• `desktopCapturer.getSources()` (Electron screen API)<br>• `ipcMain.handle/on` event handlers<br>• FFmpeg binary resolution paths (platform-specific)<br>• yt-dlp subprocess execution<br>• Electron window (`botWindow`) communication<br>• Telegram API rate limiting (setTimeout for 5min cleanup) |
| **Required Rust Crates** | `teloxide` or `tauri-plugin-teletype` for Telegram bot (or keep telegraf vianapi bridge)<br>`reqwest` for HTTP downloads<br>`tokio` (already present)<br>`serde`/`serde_json` (already present)<br>`russcord` or custom HTTP client for file downloads<br>`image` for screenshot manipulation<br>`mime_guess` for file MIME types<br>`anyhow`/`thiserror` for error handling<br>`uuid` for message ID generation |
| **Migration Notes** | `Telegraf` is pure JavaScript Node.js library with no native Rust equivalent. The `telegraf` bot instance with its middleware pattern (`bot.command`, `bot.on`, `bot.catch`) is deeply tied to JS. Electron IPC handlers (`ipcMain`) are Tauri/Electron API. FFmpeg integration requires subprocess spawning. YouTube download via yt-dlp subprocess is JS-bound. May need `napi-rs` or `tauri-plugin` bridge to call existing JS Telegram code, or rewrite bot logic in Rust using `teloxide`. |

## 3. `sidecar/main/awareness/window-tracker.js` (66 lines)

| Aspect | Analysis |
|--------|----------|
| **APIs Used** | `active-win` (native module - reads active window via platform APIs)<br>`electron.powerMonitor` (system idle detection)<br>`setInterval` (60s polling)<br>`console.log` (debug output) |
| **OS-Native (Rust Candidate)** | • Active window detection via platform APIs (X11 on Linux, WinAPI on Windows, Cocoa on macOS)<br>• Idle time detection from OS<br>• Buffer management for tracking events<br>• `powerMonitor.getSystemIdleTime()` native call<br>• Window title/app name extraction |
| **JS-Only (Must Stay)** | • `active-win` native module interface (npm package loading)<br>• `powerMonitor` from Electron (Tauri alternative would be `tauri-plugin-window-state` or direct syscalls)<br>• `setInterval` timer registration<br>• Buffer array management (`push`, `shift`)<br>• `console.log` for debug output<br>• Module-level state (`buffer`, `intervalId`, `wasIdle`) |
| **Required Rust Crates** | `tauri-plugin-window-manager` or custom `sinners` crate for idle detection<br>`winit` for window events (if not using Tauri)<br>`raw-window-handle` for platform window introspection<br>`serde` for any JSON serialization (not currently used)<br>`chrono` (already present: time formatting)<br>`anyhow` for error handling |
| **Migration Notes** | This is the smallest/most migrate-able module. `active-win` uses platform-specific APIs: `WM_GETTEXT` on Windows, `_NET_ACTIVE_WINDOW` on X11, `NSWorkspace` on macOS. In Rust: `winapi`/`user32` crate for Windows, `x11` or `smithay` crate for Linux, `objc`/`core-foundation` for macOS. `powerMonitor.getSystemIdleTime()` reads `/proc/stat` on Linux or `GetLastInputInfo` on Windows - easily replicated in native Rust. The 60s polling interval and buffer array are simple logic that maps directly to Rust. |

## Summary & Recommendations

| Module | Migration Priority | Complexity | Notes |
|--------|-------------------|------------|-------|
| `window-tracker.js` | **High** | Low | Simple logic, native APIs available in Rust, minimal JS-specific code |
| `telegram-service.js` | **Low** | Very High | `Telegraf` is Node.js-specific; bot framework or full rewrite needed |
| `pc-agent.js` | **Medium** | High | Overlay UI is Electron-specific; automation daemon could migrate to Rust CLI tool |