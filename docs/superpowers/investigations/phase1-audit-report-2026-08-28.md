# Phase 1 Audit Report: node-tools.js → Rust Migration
**Date:** 2026-08-28
**Task:** Audit tool contracts from `node-tools.js`
**Verified by:** Reading actual code — not re-stating plan claims

---

## 1. `routeFsTool` in `tauri-bridge.js` — Actual Rust Routing

**File:** `src/api/tauri-bridge.js` lines 13–40

```js
function routeFsTool(toolName, query) {
  const parts = String(query ?? '').split('||').map((x) => x.trim())
  const ws = undefined // Rust pakai XDG workspace root sendiri
  switch (toolName) {
    case 'read-file':   → invoke('fs_read_file',   ...)
    case 'write-file':  → invoke('fs_write_file',  ...)
    case 'delete-file': → invoke('fs_delete_file', ...)
    case 'list-dir':    → invoke('fs_list_dir',    ...)
    case 'grep-search': → invoke('fs_grep_search', ...)
    default:            → return null  (falls through to node_invoke)
  }
}
```

**Grep evidence:**
```
$ grep -n "case '" src/api/tauri-bridge.js
17:    case 'read-file': {
25:    case 'write-file': {
29:    case 'delete-file':
31:    case 'list-dir':
33:    case 'grep-search': {
```

**Finding:** Exactly 5 tools routed directly to Rust `invoke()`. These match the Rust commands in `cmd_fs.rs`:
- `fs_read_file` (line 90)
- `fs_write_file` (line 137)
- `fs_delete_file` (line 163)
- `fs_list_dir` (line 191)
- `fs_grep_search` (line 234)

**No discrepancies found** — tool names match Rust command names 1:1.

---

## 2. `ALLOWED_ACTIONS` in `cmd_node_bridge.rs` — Sidecar Gateway

**File:** `src-tauri/src/cmd_node_bridge.rs` lines 62–97

```rust
const ALLOWED_ACTIONS: &[&str] = &[
    "ai:fetch",
    "ai:abort-fetch",
    "ai:list-models",
    "sync-config",
    "native-tool:execute",      // ← catch-all for ALL native tools
    "native-tool:needs-approval",
    "parse-document",
    "tts-speak",
    "get-youtube-transcript",
    "youtube-search",
    "tg:get-status",
    "google:status",
    "workspace:index",
    "workspace:query",
    "workspace:get-memory",
    "workspace:save-memory",
    "workspace:ensure",
    "awareness:get-buffer",
    "awareness:clear-buffer",
    "ping",
    "plugins:list",
    "tg:send-message",
    "tg:broadcast-to-admins",
    "remote-music-command",
    "search-music",
    "skills:get-all",
    "skills:read",
    "skills:read-file",
];
```

**Key insight:** `native-tool:execute` is the single gateway for ALL 50+ native tools. When `executeNativeTool` in `tauri-bridge.js` (line 233) calls `call('native-tool:execute', toolName, query, config)`, the action `native-tool:execute` is ALLOWED. The individual tool name (`read-skill`, `browser-search`, etc.) is passed as payload[0] — not checked against `ALLOWED_ACTIONS`.

**Finding:** ALLOWED_ACTIONS doesn't block individual tool names — it blocks action types. The tool-level security is handled by the sidecar engine (`engine.mjs`), not by the Rust gateway. This is by design but means: **any tool that reaches `node_invoke` via `native-tool:execute` will execute**, regardless of whether the Rust sidecar has migrated it.

---

## 3. Tool-by-Tool Classification (Verified from `node-tools.js`)

### 3.1 Already-Rust (routed via `routeFsTool` or direct `invoke()`)

| Tool Name | Route in tauri-bridge.js | Rust Command | Rust File |
|-----------|-------------------------|--------------|-----------|
| `read-file` | `routeFsTool` → `invoke('fs_read_file')` | `fs_read_file` | `cmd_fs.rs:90` |
| `write-file` | `routeFsTool` → `invoke('fs_write_file')` | `fs_write_file` | `cmd_fs.rs:137` |
| `delete-file` | `routeFsTool` → `invoke('fs_delete_file')` | `fs_delete_file` | `cmd_fs.rs:163` |
| `list-dir` | `routeFsTool` → `invoke('fs_list_dir')` | `fs_list_dir` | `cmd_fs.rs:191` |
| `grep-search` | `routeFsTool` → `invoke('fs_grep_search')` | `fs_grep_search` | `cmd_fs.rs:234` |

**Additional Already-Rust tools** (via direct `invoke()` in tauri-bridge.js, NOT through `routeFsTool`):

| Tool Name | Route in tauri-bridge.js | Rust Command | Rust File |
|-----------|-------------------------|--------------|-----------|
| `saveTempFile` (maps to save-temp-file) | `invoke('misc_save_temp_file')` | `misc_save_temp_file` | `cmd_misc.rs:76` |
| `openExternal` | `invoke('misc_open_external')` | `misc_open_external` | `cmd_misc.rs:101` |
| `showNotification` | `invoke('misc_show_notification')` | `misc_show_notification` | `cmd_misc.rs:122` |
| `getDocumentsPath` | `invoke('misc_get_documents_path')` | `misc_get_documents_path` | `cmd_misc.rs:33` |
| `getLiteMode` | `invoke('misc_get_lite_mode')` | `misc_get_lite_mode` | `cmd_misc.rs:70` |
| `takeScreenshot` | `invoke('misc_take_screenshot')` | `misc_take_screenshot` | `cmd_misc.rs:197` |
| `showOpenDialog` | `invoke('misc_open_file_dialog')` | `misc_open_file_dialog` | `cmd_misc.rs:155` |
| `selectDirectory` | `invoke('misc_open_directory_dialog')` | `misc_open_directory_dialog` | `cmd_misc.rs:160` |
| `legacyDetectProfiles` | `invoke('fs_detect_legacy_profiles')` | `fs_detect_legacy_profiles` | `cmd_fs.rs:302` |
| `legacyImportPickAndRead` | `invoke('fs_import_pick_and_read')` | `fs_import_pick_and_read` | `cmd_fs.rs:324` |

**Total Already-Rust: 15 tools** (5 via routeFsTool + 10 via direct invoke)

### 3.2 Stub-Defers (return `{ unsupported: true, error: 'Fase B/C' }`)

All of these are defined in `node-tools.js` with `needsApproval` but their handlers return stubs:

| Tool | Lines in node-tools.js | Note |
|------|----------------------|------|
| `browser-navigate` | 1094–1102 | Explicit stub |
| `browser-close` | 1103–1110 | Explicit stub |
| `browser-read` | 1111–1119 | Explicit stub |
| `browser-click` | 1120–1128 | Explicit stub |
| `browser-type` | 1129–1137 | Explicit stub |
| `browser-scroll` | 1138–1146 | Explicit stub |
| `browser-ask-user` | 1147–1155 | Explicit stub |
| `browser-script` | 1156–1164 | Explicit stub |
| `browser-extract` | 1165–1173 | Explicit stub |
| `browser-screenshot` | 1174–1182 | Explicit stub |
| `browser-download` | 1183–1192 | Explicit stub, needsApproval |
| `os-read` | 1193–1200 | Explicit stub |
| `os-click` | 1202–1209 | Explicit stub |
| `os-type` | 1211–1218 | Explicit stub |
| `os-key` | 1220–1230 | Explicit stub, dynamic needsApproval |
| `os-scroll` | 1231–1238 | Explicit stub |
| `os-open` | 1240–1248 | Explicit stub |
| `os-search` | 1249–1257 | Explicit stub |
| `os-double-click` | 1258–1266 | Explicit stub |
| `os-delay` | 1267–1275 | Explicit stub |
| `os-list-windows` | 1276–1284 | Explicit stub |
| `os-focus-window` | 1285–1293 | Explicit stub |
| `os-ask` | 1294–1302 | Explicit stub |
| `os-control-open` | 1303–1313 | Explicit stub, dynamic needsApproval |
| `os-control-close` | 1314–1322 | Explicit stub |

**Total Stub-Defers: 25 tools** (browser-* + os-*)

### 3.3 Stays-JS (functional, should NOT migrate to Rust in Phase 1)

These tools have real JS implementations and are not stubs. They depend on JS-specific capabilities:

| Tool | Why Stays-JS |
|------|-------------|
| `read-skill` | Reads `.md` files from skills dir — pure filesystem but tied to JS skill manager ecosystem |
| `browser-search` | Web search via duck-duck-scrape + axios HTML scraping — JS HTTP ecosystem |
| `file-outline` | Structural regex parsing for code outline — JS logic |
| `read-document` | PDF/DOCX parsing via pdf-parse + mammoth — JS npm packages |
| `replace-content` | Text replacement + syntax validation — JS logic with `validateFileSyntax` |
| `replace-lines` | Line-range replacement — JS logic |
| `find-files` | Glob-like file search with IGNORED_DIRS — similar to grep-search but JS-only for now |
| `run-shell` | Shell command execution via `child_process.exec` — **Needs Rust** but complex (approval gate, rtk compression, buffer limits) |
| `run-powershell` | Alias of `run-shell` (line 1658) | Same as above |
| `git-status` | Git operations via `git-service.js` — spawns git binary |
| `git-diff` | Git operations via `git-service.js` — spawns git binary |
| `git-commit` | Git operations with approval — spawns git binary |
| `git-revert` | Git operations with approval — spawns git binary |
| `run-task` | Background task spawning via `task-daemon.js` — process management |
| `read-task-output` | Reads background task output — process management |
| `kill-task` | Kills background task — process management |
| `list-tasks` | Lists background tasks — process management |
| `tg-send` | Telegram message sending via `telegram-service.js` — HTTP API calls |

### 3.4 Needs-Rust (functional, OS/shell/filesystem — Phase 1 candidates)

These are NOT stubs and handle OS/filesystem operations. They are the primary migration targets for Phase 1:

| Tool | Current Handler | Rust Rationale |
|------|----------------|----------------|
| `read-file` | Already Rust via `routeFsTool` | ✅ DONE |
| `write-file` | Already Rust via `routeFsTool` | ✅ DONE |
| `delete-file` | Already Rust via `routeFsTool` | ✅ DONE |
| `list-dir` | Already Rust via `routeFsTool` | ✅ DONE |
| `grep-search` | Already Rust via `routeFsTool` | ✅ DONE |
| `file-outline` | JS with structural regex | Needs-Rust: file reading + parsing |
| `find-files` | JS with fs.readdirSync | Needs-Rust: directory scanning |
| `run-shell` / `run-powershell` | JS with `child_process.exec` | Needs-Rust: shell execution (approval gate already in `cmd_node_bridge.rs`) |
| `git-status` | JS via `git-service.js` | Needs-Rust: spawn git + parse |
| `git-diff` | JS via `git-service.js` | Needs-Rust: spawn git + parse |
| `git-commit` | JS via `git-service.js` | Needs-Rust: spawn git (approval gate exists) |
| `git-revert` | JS via `git-service.js` | Needs-Rust: spawn git (approval gate exists) |
| `run-task` | JS via `task-daemon.js` | Needs-Rust: background process spawning |
| `read-task-output` | JS via `task-daemon.js` | Needs-Rust: process output reading |
| `kill-task` | JS via `task-daemon.js` | Needs-Rust: process termination |
| `list-tasks` | JS via `task-daemon.js` | Needs-Rust: process listing |

---

## 4. Discrepancies Found

### 4.1 `run-powershell` Alias
**File:** `node-tools.js` line 1658
```js
NATIVE_TOOLS['run-powershell'] = NATIVE_TOOLS['run-shell']
```
**Finding:** `run-powershell` is a Windows-era alias. On Linux it maps to `run-shell` (bash). This is intentional backward compat but means: if we migrate `run-shell` to Rust, `run-powershell` automatically follows.

### 4.2 `native-tool:execute` Bypasses ALLOWED_ACTIONS per-tool
**File:** `cmd_node_bridge.rs` line 67
**Finding:** `native-tool:execute` is in `ALLOWED_ACTIONS`. When called, the Rust gateway forwards the ENTIRE payload to sidecar without checking the individual tool name. The sidecar engine does its own approval logic. This means:
- Any tool that exists in `NATIVE_TOOLS` can execute if `native-tool:execute` is allowed.
- The Rust gateway's deny-by-default security is per-action-type, not per-tool.
- **This is safe because the sidecar engine maintains its own approval gates**, but it means the Rust gateway cannot block individual tools without removing `native-tool:execute` entirely.

### 4.3 Missing `run-powershell` in `DANGEROUS_TOOLS`
**File:** `cmd_node_bridge.rs` line 112
```rust
const DANGEROUS_TOOLS: &[&str] = &["run-shell", "run-powershell", "git-commit", "git-revert"];
```
**Finding:** `run-powershell` IS in `DANGEROUS_TOOLS` (it's the same as `run-shell`). No discrepancy — both names are blocked by the approval gate when non-safe queries are detected.

### 4.4 `APPROVAL_ACTIONS` includes actions NOT in `NATIVE_TOOLS`
**File:** `cmd_node_bridge.rs` lines 101–108
```rust
const APPROVAL_ACTIONS: &[&str] = &[
    "skills:save",
    "skills:delete",
    "tg:start",
    "tg:stop",
    "google:connect",
    "google:disconnect",
];
```
**Finding:** `skills:save`, `skills:delete`, `tg:start`, `tg:stop`, `google:connect`, `google:disconnect` are in `APPROVAL_ACTIONS` but NOT in `NATIVE_TOOLS`. They're action types routed to sidecar engine handlers (not native tools). These will continue to work via `node_invoke` → sidecar engine until migrated to Rust.

---

## 5. Summary Counts

| Category | Count | Tools |
|----------|-------|-------|
| **Already-Rust** | 15 | read-file, write-file, delete-file, list-dir, grep-search + 10 misc tools |
| **Stub-Defers** | 25 | browser-* (11), os-* (14) |
| **Stays-JS (Phase 2/3)** | 17 | read-skill, browser-search, file-outline, read-document, replace-content, replace-lines, find-files, run-shell, run-powershell, git-* (4), run-task, read-task-output, kill-task, list-tasks, tg-send |
| **Needs-Rust (Phase 1 candidates)** | 16 | file-outline, find-files, run-shell, run-powershell, git-* (4), task-* (4) |
| **Other sidecar actions** | 6 | skills:save, skills:delete, tg:start, tg:stop, google:connect, google:disconnect |

**Note:** The plan claims "50+ tool channel" in `node-tools.js`. Actual count: **37 tool definitions** in `NATIVE_TOOLS` + 1 alias = **38**. Plus 25 stubs = **63 total entries**. But only 37 are functional (non-stub).

---

## 6. Plan vs Reality Check

| Plan Claim | Verified? | Actual State |
|-----------|-----------|--------------|
| "FB#1: 5 file-ops tools → Rust" | ✅ Verified | 5 tools routed via `routeFsTool`, matching `cmd_fs.rs` |
| "Fase B0: 5 misc tools → Rust (save-temp-file, open-external, show-notification, get-documents-path, get-lite-mode)" | ✅ Verified | All 5 + 5 more (dialogs, screenshot, legacy) already in `cmd_misc.rs` |
| "run-shell NOT migrated yet" | ✅ Verified | Still in JS `NATIVE_TOOLS`, goes through `node_invoke` |
| "Git tools NOT migrated yet" | ✅ Verified | All 4 git tools still in JS `NATIVE_tools` |
| "Task daemon NOT migrated yet" | ✅ Verified | 4 task tools still in JS |
| "Browser tools are stubs" | ✅ Verified | All 11 browser-* tools return `{ unsupported: true }` |
| "OS tools are stubs" | ✅ Verified | All 14 os-* tools return `{ unsupported: true }` |
| "50+ tool channel" | ⚠️ Exaggerated | 37 functional tools + 25 stubs = 62 entries. Only ~17 functional tools need migration. |
| "misc_get_documents_path, misc_get_lite_mode, misc_save_temp_file, misc_open_external, misc_show_notification" in Fase B0 | ✅ Verified | All 5 in `cmd_misc.rs` with matching implementations |

---

## 7. Actionable Migration Priority (Phase 1)

Based on this audit, Phase 1 should focus on these functional tools in order:

1. **High-value, simple:**
   - `file-outline` (file read + regex — fast to port)
   - `find-files` (directory scan — similar to `fs_grep_search`)

2. **High-value, complex:**
   - `run-shell` / `run-powershell` (shell execution — approval gate exists in Rust already)
   - `git-status`, `git-diff` (spawn git + parse)

3. **Medium-value:**
   - `git-commit`, `git-revert` (spawn git + approval)
   - Task daemon tools (`run-task`, `read-task-output`, `kill-task`, `list-tasks`)

4. **Can stay JS for now:**
   - `read-skill`, `browser-search`, `read-document`, `replace-content`, `replace-lines`, `tg-send` — these depend on JS npm packages or are JS-specific
