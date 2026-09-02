# MARK Linux: Final Audit — Application Parity + CI/CD + Release Infrastructure

**Date**: 2026-08-30  
**Branch**: `linux` (`Abelion512/mark-agent-linux`)  
**Scope**: `.github/` workflows, branch trigger coverage, CI/CD parity, application parity reconciliation  
**Result**: READ-ONLY AUDIT. No source changes implemented.

`★ Insight ─────────────────────────────────────`
**Why this audit matters beyond code review**: CI/CD is the guarantee that "tests pass" actually means tests ran. A workflow that exists but doesn't trigger for your branch gives you false confidence — the most dangerous kind. This audit checks not just *what exists* but *what actually fires*.
`─────────────────────────────────────────────────`

---

## Part A: Application Parity (Electron → Tauri/Linux)

### Section 1: Window Configuration

| # | Feature | Electron | Tauri Linux | Status | Root Cause | Priority |
|---|---------|----------|-------------|--------|------------|----------|
| 1.2 | Transparent window | `transparent: true` + `backgroundColor: '#00000000'` | `transparent: false`, `#0b0f0c` bg | **Platform limitation** | WebKitGTK does not render window-level transparency/backdrop-filter like Chromium | Document |
| 1.9 | Vibrancy/blur | `vibrancy: 'ultra-dark'` + native effect | CSS `backdrop-filter: blur()` | **Platform limitation** | WebKitGTK partial support; compositor-dependent | P1 |
| 1.10 | Window opacity | `setOpacity()` API | `--win-alpha` CSS var only (HTML background) | **Tauri v2 API gap** | Tauri v2 removed `setOpacity()`; alpha only for HTML bg | P1 |
| 1.3 | Frameless | `frame: false` | `decorations: false` + custom React titlebar | **MATCH** | Both remove native decor; Linux uses React replacement | — |
| 1.4 | Always on top | `alwaysOnTop: true` | Not configured | **MIGRATION GAP** | Not set in `tauri.conf.json` | P2 |
| 1.5 | Resizable | `resizable: true` | `resizable: true` | **MATCH** | Same | — |
| 1.6 | Minimum size | `minWidth/minHeight` | `minWidth: 940`, `minHeight: 600` | **MATCH** | Same | — |
| 1.7 | Fullscreen toggle | `setFullScreen()` | Fully wired: UI → bridge → `window_fullscreen_toggle` → Rust `set_fullscreen()` | **MATCH** | All paths verified present | — |
| 1.8 | Titlebar style | `titleBarStyle: 'hiddenInset'` | Custom React titlebar in `App.jsx` | **INTENTIONAL LINUX DIFFERENCE** | Linux uses React-drawn titlebar | — |
| 1.11 | Shadow | Native macOS | CSS shadow | **INTENTIONAL LINUX DIFFERENCE** | No native shadow API on Linux | — |
| 1.12 | Window drag | `-webkit-app-region: drag` | `data-tauri-drag-region` + `plugin:window\|start_dragging` | **MATCH** | Mapped via bridge | — |
| 1.13 | Window state emit | `w.on('resize')` | `emit_window_state()` + `onWindowState` listener | **MATCH** | Same pattern | — |

### Section 2: IPC & Preload Bridge

| # | Feature | Electron | Tauri Linux | Status | Notes |
|---|---------|----------|-------------|--------|-------|
| 2.1 | Invoke | `ipcRenderer.invoke` | `window.api.invoke()` facade | **MATCH** | Different mechanism, same result |
| 2.2 | Direct Rust cmd | `ipcRenderer.handle` | `invoke('cmd_name', {args})` → Rust | **MATCH** | Same pattern |
| 2.3 | Sidecar bridge | custom protocol | `invoke('node_invoke')` → Rust → bun sidecar | **MATCH** | Same semantic |
| 2.4 | Event listeners | `ipcRenderer.on` | `window.api.on('channel')` + `listen()` | **MATCH** | Same pattern |
| 2.5 | Event Rust→JS | `ipcMain.on` → `webContents.send` | `app.emit('channel')` + `listen()` in bridge | **MATCH** | Same semantics |
| 2.6 | Context bridge | `contextBridge.exposeInMainWorld` | Manual `window.api = api` install in `main.jsx` | **MATCH** | Different mechanism, same result |
| 2.7 | Approval flows | `dialog.showMessageBox` | `confirm_on_main_thread()` + `rfd::MessageDialog` | **MATCH** | Native dialog both |

### Section 3: Permissions & Capabilities

| # | Feature | Electron | Tauri Linux | Status | Notes |
|---|---------|----------|-------------|--------|-------|
| 3.1 | Implicit caps | All Chromium permissions implicit | Explicit capability grant needed | **MIGRATION GAP** | Tauri requires `capabilities/default.json` + command-level gates |
| 3.2 | Shell/execute | `shell.openExternal` implicit | `misc_open_external` with approval gate | **MATCH** | Same: xdg-open with approval |
| 3.3 | File system | `fs.promises` + node remote | `invoke('fs_*')` sandboxed to XDG workspace | **MIGRATION GAP** | Tauri adds path validation; Electron had broader access |
| 3.4 | Dialog permissions | `dialog.showOpenDialog` | `misc_open_file_dialog` via rfd | **MATCH** | Same native rfd |
| 3.5 | Notification | `new Notification()` | `misc_show_notification` → `notify-send` | **MATCH** | Same |
| 3.6 | Camera/mic | `getUserMedia` + auto-grant | `getUserMedia()` via Web API | **PARTIAL** | Ported via Web API; UX diff: explicit permission dialog vs Electron auto-grant |
| 3.7 | HTTP/network | implicit Chromium | CSP + `connect-src` allows specific origins | **MATCH** | Tauri explicit vs Electron implicit |
| 3.8 | System tray | `Tray` + `Menu` | `TrayIconBuilder` + Ayatana AppIndicator | **MATCH** | Same pattern |
| 3.9 | Global shortcuts | `globalShortcut` | `tauri_plugin_global_shortcut` + `on_shortcut()` | **MATCH** | Same mechanism |
| 3.10 | Auto-launch | `app.setLoginItemSettings` | **Intentional Linux difference** | **INTENTIONAL LINUX DIFFERENCE** | Linux uses `~/.config/autostart/*.desktop`, not app-internal settings |
| 3.11 | Read/write paths | Node `fs` + `app.getPath` | `invoke('fs_*')` + `workspace_root()` | **MIGRATION GAP** | Tauri adds sandboxing; Electron had broader access |
| 3.12 | WebView new tabs | `session.setPermissionCheck` | CSP + `allow-popups` | **MATCH** | Tauri explicit vs Electron implicit |

### Section 4: Media

| # | Feature | Electron | Tauri Linux | Status | Notes |
|---|---------|----------|-------------|--------|-------|
| 4.1 | Camera | `getUserMedia` + `desktopCapturer` | `getUserMedia()` via Web API | **PARTIAL** | Ported; explicit permission required (UX diff) |
| 4.2 | Microphone | `getUserMedia` | `getUserMedia()` via Web API | **PARTIAL** | Same as camera |
| 4.3 | Screen capture | `desktopCapturer` + `page.mediaDevices` | `misc_take_screenshot` → native tools | **MIGRATION GAP** | Different implementation (native tools vs CDP) |
| 4.4 | Notifications | `new Notification()` | `misc_show_notification` → `notify-send` | **MATCH** | Same |
| 4.5 | Audio playback | HTML5 Audio | HTML5 Audio | **MATCH** | Unchanged |

### Section 5: Filesystem & Shell

| # | Feature | Electron | Tauri Linux | Status | Notes |
|---|---------|----------|-------------|--------|-------|
| 5.1 | Open file dialog | `dialog.showOpenDialog` | `misc_open_file_dialog` → rfd | **MATCH** | Same native rfd |
| 5.2 | Save file dialog | Implicit via node `fs` | **No command exists** | **MIGRATION GAP** | Not in Electron reference either; missing in Tauri |
| 5.3 | Read/write files | `fs.promises` + Node remote | `invoke('fs_read_file')`, `invoke('fs_write_file')` | **MIGRATION GAP** | Tauri adds path sandboxing |
| 5.4 | Open external | `shell.openExternal` | `misc_open_external` → `xdg-open` | **MATCH** | Same |
| 5.5 | Open in system | `shell.openPath` | `misc_open_file_dialog` + `os_open` → `xdg-open` | **MATCH** | Same |
| 5.6 | Path resolution | `app.getPath` | `app.path().document_dir()` + `XDG_DATA_HOME` | **INTENTIONAL LINUX DIFFERENCE** | XDG paths vs Electron app paths |

### Section 6: System Integration

| # | Feature | Electron | Tauri Linux | Status | Notes |
|---|---------|----------|-------------|--------|-------|
| 6.1 | Tray | `Tray` + `ContextMenu` | `TrayIconBuilder` + Ayatana AppIndicator | **MATCH** | Same pattern |
| 6.2 | Global shortcuts | `globalShortcut.register` | `tauri_plugin_global_shortcut` | **MATCH** | Same mechanism |
| 6.3 | Auto-launch | `app.setLoginItemSettings` | **Intentional Linux difference** | **INTENTIONAL LINUX DIFFERENCE** | Linux uses DESKTOP files |
| 6.4 | Power monitor | `powerMonitor.on('suspend')` | Not ported | **PLATFORM LIMITATION** | Missing; not in Linux Tauri product spec |
| 6.5 | Window focus | `BrowserWindow.on-focus` | `WindowEvent::Focused` + `emit_window_state()` | **MATCH** | Same event pattern |

### Section 7: Browser Automation

| # | Feature | Electron | Tauri Linux | Status | Notes |
|---|---------|----------|-------------|--------|-------|
| 7.1 | Browser control | Puppeteer CDP | `invoke('browser:navigate')` via sidecar | **MATCH** | Same via sidecar |
| 7.2 | Screenshot | `page.screenshot()` | `misc_take_screenshot` → native tools | **MIGRATION GAP** | Different implementation |
| 7.3 | DOM interaction | `page.evaluate()` via CDP | `invoke('browser:read-dom')` via sidecar | **MATCH** | Same via sidecar |

### Section 8: App Lifecycle

| # | Event | Electron | Tauri Linux | Status | Notes |
|---|--------|----------|-------------|--------|-------|
| 8.1 | App ready | `app.whenReady()` | Tauri lifecycle | **MATCH** | Same |
| 8.2 | Window all closed | `app.on('window-all-closed')` | `on_window_event` handler | **MATCH** | Same |
| 8.3 | Before quit | `app.on('before-quit')` | `.on_window_event()` | **MATCH** | Same |
| 8.4 | Second instance | `app.on('second-instance')` | `tauri_plugin_single_instance` | **MATCH** | Same via plugin |

### Section 9: UI/Styling

| # | Feature | Electron | Tauri Linux | Status | Notes |
|---|---------|----------|-------------|--------|-------|
| 9.1 | CSS backdrop-filter | Chromium native | WebKitGTK partial | **Platform limitation** | WebKitGTK partial; compositor-dependent |
| 9.2 | Transparency | CSS opacity + `transparent` window | `#0b0f0c` bg + `--win-alpha` CSS var | **Platform limitation** | Window not transparent; alpha only HTML bg |
| 9.3 | Animations | CSS + GSAP | CSS + GSAP | **MATCH** | Same libraries |
| 9.4 | Monaco editor | Monaco | Monaco | **MATCH** | Unchanged |
| 9.5 | Video/Canvas | HTML5 | HTML5/WebKitGTK | **MIGRATION GAP** | WebKitGTK rendering differences |
| 9.6 | Fonts | @fontsource | @fontsource | **MATCH** | Unchanged |
| 9.7 | DaisyUI | v4.x | v5 (forest theme) | **MIGRATION GAP** | DaisyUI v5 API differences |
| 9.8-9.13 | CSS layout | Standard CSS | Standard CSS | **MATCH** | All unchanged |

### Section 10: Feature Categories (Reconciled)

| Status | Count | Items |
|--------|-------|-------|
| **MATCH** | ~35 | IPC, permissions (most), tray, shortcuts, lifecycle, UI styling (most), browser automation |
| **PARTIAL** | 2 | Camera/mic (permission UX diff), screen capture (different impl) |
| **MIGRATION GAP** | 6 | Save dialog, fs sandboxing, screen capture, transparency/blur, DaisyUI v5, always-on-top |
| **INTENTIONAL LINUX DIFFERENCE** | 3 | Auto-launch, path resolution, titlebar style |
| **PLATFORM LIMITATION** | 4 | WebKitGTK transparency, backdrop-filter, power monitor, xdotool X11-only |
| **Tauri v2 API GAP** | 1 | Window opacity (`setOpacity` removed) |
| **FUTURE FEATURE** | 0 | — |

`★ Insight ─────────────────────────────────────`
**Key finding**: The previous audit had contradictory entries for transparency. The canonical view: **native window transparency** (Electron's `transparent: true`) is a **Platform limitation** on WebKitGTK. **CSS backdrop-filter blur** (Electron's `vibrancy`) is ALSO a **Platform limitation** — but these are SEPARATE features. Native transparency = window chrome is see-through. Blur = CSS `backdrop-filter` on HTML elements. Both fail on WebKitGTK but for slightly different reasons. Don't conflate them.
`─────────────────────────────────────────────────`

---

## Part B: Platform Limitations

These are NOT bugs or gaps. They are boundaries imposed by the runtime. Document, don't fix.

| Limitation | Cause | Impact | Mitigation |
|------------|-------|--------|------------|
| **WebKitGTK backdrop-filter** | Partial CSS filter support in WebKitGTK | Blur effects behind panels don't render | CSS fallback: solid backgrounds + opacity |
| **WebKitGTK window transparency** | GTK/Wry doesn't support `transparent: true` like Chromium | No frosted-glass window chrome | Use solid `#0b0f0c` background |
| **Tauri v2 `setOpacity()` removed** | API deliberately dropped in v2 | No window-level fade | `--win-alpha` CSS var for HTML bg only |
| **xdotool X11-only** | xdotool uses X11 protocol directly | Wayland sessions can't use input simulation | P2: add `wtype`/`ydotool` fallback |
| **WebKitGTK media permissions** | Requires explicit OS dialog | UX diff from Electron auto-grant | Show helpful UI when permission denied |
| **Linux tray fragmentation** | AppIndicator vs StatusNotifierItem | Some DEs show tray, some don't | Document DE requirements; test on GNOME/KDE/XFCE |

`★ Insight ─────────────────────────────────────`
**Why platform limitations matter for open-source**: Contributors on different DEs will hit these differently. A GNOME user and a KDE user may see different tray behavior, different blur support, different permission dialogs. Documenting this upfront prevents "it works on my machine" bug reports.
`─────────────────────────────────────────────────`

---

## Part C: Repository Infrastructure (CI/CD)

### Section 1: `.github/workflows/tauri.yml` — Complete Audit

```yaml
on:
  push:
    branches: ["tauri-migration", "5.5.0", "master", "linux"]     # ✅ linux included
  pull_request:
    branches: ["5.5.0", "master", "tauri-migration", "linux"]     # ✅ linux included
```

**Jobs:**

| Job | Trigger | Runs on `linux` branch | What it does | Artifacts |
|-----|---------|------------------------|---------------|-----------|
| `secrets` | push + PR to monitored branches | ✅ Yes | `gitleaks/gitleaks-action@v2` full-history scan | None |
| `frontend` | push + PR to monitored branches | ✅ Yes | `bun install` → `vitest run` → `vite build` | None |
| `rust` | push + PR to monitored branches | ✅ Yes | Install WebKitGTK deps → `cargo check` | None |
| `bundle` | `if: github.ref == 'refs/heads/tauri-migration' \|\| startsWith(github.ref, 'refs/tags/')` | ❌ **NO** | Full `bun tauri build` → upload AppImage+deb | `mark-light-linux` |

**Issues found:**

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| CI-1 | `bundle` job never runs on `linux` branch | **P0** | `if:` condition only matches `tauri-migration` branch or tags. Push to `linux` → only `secrets`+`frontend`+`rust` run, never `bundle`. The full Tauri build (which catches bundling errors, missing assets, broken Tauri config) is never validated on PRs to `linux`. |
| CI-2 | `cargo check` vs `cargo build` | P1 | `cargo check` validates type-checking but doesn't catch linking errors, missing native deps, or Tauri build plugin issues. `bundle` job uses `bun tauri build` which does a full build — but `bundle` never runs on `linux` PRs. |
| CI-3 | No Bun version pinning | P2 | `oven-sh/setup-bun@v2` uses latest Bun. Version drift could cause different behavior locally vs CI. |
| CI-4 | No failure gating between jobs | P1 | `secrets`, `frontend`, `rust` are independent (no `needs:`). A PR could merge with failing tests if only the `secrets` job passes. Actually: GitHub PR checks require ALL jobs in a workflow to pass, so this is fine. **Not an issue.** |
| CI-5 | `webkit2gtk-4.1` vs `4.0` | P2 | Uses `libwebkit2gtk-4.1-dev`. This is correct for Tauri v2 + modern Ubuntu. Verify the runner image has this package available. Ubuntu-latest (currently 24.04) has it. |
| CI-6 | No `cargo test` | P2 | Only `cargo check` runs. Rust unit/integration tests never execute in CI. |

**Verification source**: GitHub Actions — `on: push/pull_request` triggers confirmed in workflow YAML. However, `bundle` job gating is a workflow logic gap.

### Section 2: `.github/workflows/codeql.yml` — Complete Audit

```yaml
on:
  push:
    branches: [ "5.5.0" ]           # ❌ linux NOT included
  pull_request:
    branches: [ "5.5.0" ]           # ❌ linux NOT included
  schedule:
    - cron: '38 3 * * 0'            # ✅ Weekly Sunday scan
```

**Analysis:**

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| CI-7 | CodeQL doesn't cover `linux` branch | **P0** | `branches: ["5.5.0"]` only. Push/PR to `linux` → CodeQL never runs. This is a **stale filter from the old migration architecture**. The `5.5.0` branch appears to be the old Electron version tag. The `linux` branch is the active development line but has ZERO CodeQL coverage. |
| CI-8 | CodeQL covers `actions` ecosystem | P2 | Includes `actions` language analysis. Good practice for supply-chain security. |
| CI-9 | CodeQL uses `build-mode: none` for JS/TS | P1 | `javascript-typescript` with `build-mode: none` means CodeQL does an autobuild. This is usually fine for JS/TS but may miss some build-step vulnerabilities. Acceptable for this project. |
| CI-10 | CodeQL Rust `build-mode: none` | P1 | Same as above. Rust autobuild should work for standard Cargo projects. Tauri-specific build steps (codegen, plugins) should be detected. |

**Root cause**: The CodeQL workflow was likely created for the `5.5.0` branch (the Electron version line) and never updated when the `linux` Tauri branch became the active development line.

**Verification source**: GitHub Actions — branch filter confirmed in workflow YAML. No `linux` branch listed.

### Section 3: `.github/workflows/release.yml` — Complete Audit

```yaml
on:
  push:
    tags: ["v*"]                    # ✅ Triggers on version tags
```

**Jobs:**

| Job | Depends on | What it does | Verification |
|-----|------------|---------------|-------------|
| `guard` | — | `sync-version --check` + tag vs `tauri.conf.json` version match | ✅ `bun run sync-version --check`; manual tag/version comparison |
| `verify` | `guard` | Gitleaks → vitest → vite build → WebKitGTK deps → `cargo check` | ✅ All steps verified |
| `publish` | `verify` | `bun tauri build` → collect AppImage+deb → upload-artifact → `gh release create` | ✅ Full build + GitHub Release |

**Analysis:**

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| CI-11 | Prerelease detection | P2 | `case "$TAG" in *-*) FLAGS="--prerelease" ;; esac` — correct. Tags like `v1.0.0-alpha.1` → prerelease. |
| CI-12 | `concurrency: cancel-in-progress: false` | P2 | Correct: don't cancel a running release if a new tag is pushed. |
| CI-13 | No SBOM or checksums | P1 | Release artifacts have no SHA256 checksums or SBOM. For open-source, users can't verify download integrity. |
| CI-14 | No code signing | P2 | AppImage and deb are unsigned. Linux desktop integration may show warnings. Acceptable for early alpha. |
| CI-15 | Version gate uses `sync-version` | ✅ | `bun run sync-version --check` ensures `tauri.conf.json` ↔ `package.json` ↔ `Cargo.toml` versions are aligned. |
| CI-16 | Artifact upload only, no GitHub Release assets in `bundle` job | P1 | `tauri.yml`'s `bundle` job uploads artifacts but doesn't create a GitHub Release. `release.yml` creates the Release but `tauri.yml`'s `bundle` runs on a different trigger. This means PR builds produce artifacts but no Release. **This is correct design — artifacts on PR, Release only on tag.** |
| CI-17 | `GH_TOKEN` used for release creation | ✅ | `secrets.GITHUB_TOKEN` — correct for same-repo releases. |

### Section 4: `.github/workflows/upstream-sync.yml` — Complete Audit

```yaml
on:
  repository_dispatch:
    types: [upstream-pushed]       # ✅ Webhook trigger
  schedule:
    - cron: '0 6 * * *'            # ✅ Daily at 06:00
```

**Analysis:**

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| CI-18 | `LOCAL = 'master'` but active branch is `linux` | **P0** | `scripts/auto-detect-upstream.mjs:13` compares `master..upstream/master`. The `linux` branch is the active development line but the script syncs to `master`. This means: (a) upstream changes applied to `master` (not `linux`), (b) `linux`-specific changes on `master` could be overwritten. |
| CI-19 | `ATM` classification marks Electron files for auto-merge | **P0** | The script classifies files matching `src/main/`, `src/preload/`, `electron-vite.config`, etc. as `ATM` (automatically merge). These are ELECTRON files that don't exist in the Tauri fork. If upstream ever adds changes touching these paths, the script would classify them as ATM — but since the files don't exist locally, `git merge` would fail or produce conflicts. More critically: the `ATM` pattern was designed for the old migration architecture where the fork tracked Electron's `src/main/` + Tauri's `src-tauri/`. This architecture assumption is stale. |
| CI-20 | No conflict resolution | P1 | `git merge ${c.hash} --no-edit` — no merge strategy specified. If upstream and `linux` branch diverge, merge will produce conflicts that the workflow can't resolve. |
| CI-21 | No notification on failure | P2 | If sync fails, no notification sent. Silent failure. |
| CI-22 | Diff report uploaded but not consumed | P2 | `upstream-diff-report.json` is uploaded as artifact but no downstream job processes it. Dead artifact. |
| CI-23 | `git remote add upstream` every run | P1 | Adds upstream remote every run (with `|| true`). Should use `git remote set-url` or check first. Minor — doesn't break anything. |

### Section 5: Dependabot

```yaml
package-ecosystem: 'npm'
  groups:
    electron:                    # ❌ Stale — project is Tauri, not Electron
      patterns: ['electron', 'electron-*', '@electron-toolkit/*']
    react:
      patterns: ['react', 'react-*', '@types/react*']
    dev:
      patterns: ['eslint*', 'prettier*', 'vite', '@vitejs/*']
  ignore:
    - dependency-name: 'electron'  # ❌ Stale — no electron in package.json
      update-types: ['version-update:semver-major']
```

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| CI-24 | Dependabot groups `electron` deps | P2 | Project uses Tauri, not Electron. `electron` and `@electron-toolkit/*` groups are dead code in dependabot config. No dependencies matching these patterns exist in `package.json`. |
| CI-25 | Dependabot ignores `electron` major updates | P2 | Since no `electron` dependency exists, this ignore rule is moot. |
| CI-26 | No Rust/Cargo dependabot | **P1** | Only `npm` and `github-actions` ecosystems monitored. `src-tauri/Cargo.toml` dependencies (tauri, reqwest, serde, etc.) have no automated update checks. |
| CI-27 | GitHub Actions updates monthly | P2 | Monthly is fine for Actions, but npm is weekly — reasonable gap for a fast-moving frontend project. |

### Section 6: Issue Templates

| Template | Status | Notes |
|----------|--------|-------|
| `bug_report.yml` | ✅ Good | Version dropdown includes `v4.x`, `v3.x`, `Built from source (main branch)` — should add `v1.x (linux/tauri)` option |
| `feature_request.yml` | ✅ Good | Standard template with problem/solution/alternatives |
| `config.yml` | ✅ Good | Links to Discord + Wiki |

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| CI-28 | Bug report version dropdown missing Linux/Tauri option | P2 | `Built from source (main branch)` is the closest match but doesn't represent the `linux` Tauri branch specifically. |

### Section 7: Security Policy

`SECURITY.md` exists and is reasonable:
- References Electron's IndexedDB for secrets (slightly stale but correct for the project's history)
- Lists threat model: local-first, sandbox, no telemetry
- Reporting instructions: draft advisory, not public issue

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| CI-29 | SECURITY.md references Electron sandbox | P2 | Mentions `sandbox: true` and `BrowserWindow sandbox` which are Electron concepts. Tauri's security model is different (capabilities-based). Should update to reference Tauri capabilities + `resolve_contained()` path validation. |
| CI-30 | No `pre-release` security advisory template | P2 | Fine for alpha, but should be addressed before stable. |

---

## Part D: Branch Trigger Coverage

### Verified Triggers for `linux` Branch

| Workflow | Push to `linux` | PR targeting `linux` | PR from feature branch → `linux` |
|----------|----------------|----------------------|----------------------------------|
| `tauri.yml` | ✅ secrets, frontend, rust | ✅ secrets, frontend, rust | ✅ secrets, frontend, rust |
| `tauri.yml` → `bundle` job | ❌ Never | ❌ Never | ❌ Never |
| `codeql.yml` | ❌ Never | ❌ Never | ❌ Never |
| `release.yml` | ❌ Tag-only | ❌ Tag-only | ❌ Tag-only |
| `upstream-sync.yml` | ✅ Schedule + dispatch | N/A | N/A |
| Dependabot | ✅ Weekly npm | N/A | N/A |

### Critical Gaps

1. **`tauri.yml` bundle job**: Never runs on `linux` branch. Full Tauri build (AppImage + deb) is only built on `tauri-migration` branch pushes or tags. PRs to `linux` get `cargo check` but never `bun tauri build`.

2. **CodeQL**: Zero coverage on `linux`. The `5.5.0` branch filter is stale from the old migration architecture.

3. **No PR preview artifacts**: The `bundle` job produces AppImage+deb artifacts, but only on `tauri-migration` pushes. Contributors can't download a preview build from PRs to `linux`.

---

## Part E: CI/CD & Repository Infrastructure Parity

| Infrastructure | Expected | Current | Status | Root Cause | Action |
|----------------|----------|---------|--------|------------|--------|
| **CI: Secrets scan** | Gitleaks on all pushes/PRs | ✅ Runs on `linux` push + PR | **MATCH** | — | — |
| **CI: Frontend test** | vitest on all pushes/PRs | ✅ Runs on `linux` push + PR | **MATCH** | — | — |
| **CI: Frontend build** | vite build on all pushes/PRs | ✅ Runs on `linux` push + PR | **MATCH** | — | — |
| **CI: Rust check** | `cargo check` on all pushes/PRs | ✅ Runs on `linux` push + PR | **MATCH** | — | — |
| **CI: Tauri full build** | `bun tauri build` on all pushes/PRs to `linux` | ❌ Only on `tauri-migration` + tags | **CI/CD GAP** | `if:` condition missing `linux` branch | Add `linux` to bundle job trigger |
| **CI: Rust tests** | `cargo test` | ❌ Only `cargo check` | **CI/CD GAP** | Not configured | Add `cargo test` step |
| **CI: Artifact upload on PR** | Preview builds downloadable | ❌ Bundle job doesn't run on `linux` PRs | **CI/CD GAP** | Same as above | Add `linux` to bundle trigger |
| **CodeQL: JS/TS** | Scans `linux` branch | ❌ Only `5.5.0` | **CI/CD GAP** | Stale branch filter | Add `linux` to CodeQL branches |
| **CodeQL: Rust** | Scans `linux` branch | ❌ Only `5.5.0` | **CI/CD GAP** | Same | Add `linux` to CodeQL branches |
| **Secret scanning (Gitleaks)** | On all pushes/PRs | ✅ `linux` included | **MATCH** | — | — |
| **Release: Version sync** | Tag ↔ tauri.conf.json match | ✅ `sync-version --check` | **MATCH** | — | — |
| **Release: Frontend verify** | vitest + build on tag | ✅ In `verify` job | **MATCH** | — | — |
| **Release: Rust verify** | `cargo check` on tag | ✅ In `verify` job | **MATCH** | — | — |
| **Release: AppImage + deb** | Built on tag | ✅ In `publish` job | **MATCH** | — | — |
| **Release: GitHub Release** | Created on tag | ✅ `gh release create` | **MATCH** | — | — |
| **Release: Prerelease detection** | `*-alpha*` tags → prerelease | ✅ `case *-*)` | **MATCH** | — | — |
| **Release: Checksums** | SHA256 for artifacts | ❌ None | **FUTURE** | Not implemented | Add when releasing stable |
| **Release: Code signing** | Signed AppImage/deb | ❌ None | **FUTURE** | Not implemented | Add for stable release |
| **Dependency updates: npm** | Dependabot weekly | ✅ Active | **MATCH** | Stale electron group config | Clean up electron groups |
| **Dependency updates: Rust/Cargo** | Automated Cargo updates | ❌ None | **CI/CD GAP** | No Cargo dependabot config | Add Cargo ecosystem |
| **Dependency updates: GitHub Actions** | Monthly | ✅ Active | **MATCH** | — | — |
| **Upstream sync: Detection** | Detect upstream changes | ✅ Daily schedule + webhook | **MATCH** | Stale branch assumption | Fix LOCAL branch ref |
| **Upstream sync: Safe classification** | AUTO/REVIEW/ATM | ✅ Implemented | **MATCH** | Stale Electron patterns in ATM | Clean ATM patterns |
| **Branch protection** | Required checks before merge | **UNVERIFIED** | **UNVERIFIED** | Cannot verify from repo alone | Check GitHub repo settings |
| **SBOM** | Software Bill of Materials | ❌ None | **FUTURE** | Not implemented | Add for stable release |

---

## Part F: Local Verification vs GitHub CI

### Classification of Previous Audit Claims

| Claim from Previous Audit | Source | CI Verified? |
|---------------------------|--------|--------------|
| Frontend tests pass | ✅ `vitest run` in CI | **A: Both** — CI runs vitest; local agents also verified |
| Frontend build succeeds | ✅ `bun run build` in CI | **A: Both** — CI runs vite build; local verified |
| Rust `cargo check` passes | ✅ `cargo check` in CI | **A: Both** — CI runs on PRs; local verified |
| Gitleaks secret scan passes | ✅ Gitleaks in CI (both `tauri.yml` + `release.yml`) | **B: GitHub CI only** — Never run locally |
| Tauri full build (AppImage+deb) | ❌ `bundle` job doesn't run on `linux` | **UNVERIFIED on `linux` branch** — Last verified on `tauri-migration` branch |
| Camera/mic ported | ✅ `getUserMedia` in frontend code | **A: Both** — Code trace + local testing |
| Fullscreen wired | ✅ `window_fullscreen_toggle` command + UI | **A: Both** — Code trace verified |
| Save file dialog missing | ✅ No command in Rust codebase | **A: Both** — Code audit (not CI) |
| Transparency classified | ✅ WebKitGTK limitation | **A: Both** — Code audit + commit history |
| Vibrancy/blur classified | ✅ CSS `backdrop-filter` in code | **A: Both** — Code audit |
| Auto-launch classified | ✅ No command exists | **A: Both** — Code audit |

### Summary

| Source | Count |
|--------|-------|
| **A: Both (local + CI)** | 7 |
| **B: GitHub CI only** | 1 (Gitleaks) |
| **C: Neither (code audit only)** | 3 (save dialog, transparency, auto-launch classification) |
| **D: Unverifiable** | 1 (branch protection) |

`★ Insight ─────────────────────────────────────`
**Critical distinction**: "Tests pass" from CI means something different than "tests pass" from local execution. CI catches environment-specific issues (wrong Bun version, missing system deps, platform-specific compilation). Local testing catches logic bugs. Both are necessary. The key finding: **the `bundle` job (full Tauri build) has NEVER run on the `linux` branch** — meaning AppImage/deb build failures would only be caught at release time, not during development.
`─────────────────────────────────────────────────`

---

## Part G: Final Classification Model

| Classification | Meaning | Count |
|---------------|---------|-------|
| **MATCH** | Feature parity achieved | ~35 |
| **PARTIAL** | Works but with meaningful difference | 2 |
| **MIGRATION GAP** | Missing or broken during Electron→Tauri migration | 6 |
| **INTENTIONAL LINUX DIFFERENCE** | Different by design for Linux platform | 3 |
| **PLATFORM LIMITATION** | Cannot be fixed; runtime boundary | 4 |
| **CI/CD GAP** | CI workflow deficiency | 7 |
| **UNVERIFIED** | Cannot confirm from repo alone | 1 |
| **FUTURE FEATURE** | Not in Electron reference; enhancement only | 0 |

---

## Part H: Recommendations

### Must Fix Before Merge (P0)

| # | Issue | Action |
|---|-------|--------|
| **CI-1** | `bundle` job never runs on `linux` branch | Add `linux` to `if:` condition in `tauri.yml` bundle job |
| **CI-7** | CodeQL doesn't cover `linux` branch | Add `linux` to CodeQL `branches:` filter |
| **CI-18** | Upstream sync targets `master` not `linux` | Change `LOCAL = 'master'` to `LOCAL = 'linux'` in `auto-detect-upstream.mjs` |
| **CI-19** | Upstream sync has stale Electron `ATM` patterns | Audit and remove/replace Electron-specific patterns in `classifyFile()` |

### Must Fix Before Linux Release (P1)

| # | Issue | Action |
|---|-------|--------|
| **CI-2** | Only `cargo check`, no `cargo build` on PRs | Ensure `bundle` job runs on `linux` PRs (fixes CI-1) |
| **CI-6** | No Rust tests in CI | Add `cargo test` step |
| **CI-13** | No artifact checksums | Add SHA256 checksums to release artifacts |
| **CI-26** | No Cargo dependabot | Add `package-ecosystem: cargo` to `dependabot.yml` |
| **CI-29** | SECURITY.md references Electron | Update to Tauri security model |
| **1.4** | Always-on-top not configured | Add `alwaysOnTop: false` (explicit) or implement if needed |
| **5.2** | Save file dialog missing | Add `misc_save_file` Rust command + frontend bridge |

### Must Document (P1)

| # | Item | Action |
|---|------|--------|
| **Platform** | WebKitGTK backdrop-filter limitation | Add to README or docs |
| **Platform** | Tauri v2 `setOpacity()` removal | Add to docs |
| **Platform** | Camera/mic permission UX diff | Add help text in UI |
| **Platform** | xdotool X11-only | Add Wayland fallback note |

### Future Improvements (P2+)

| # | Item |
|---|------|
| Bun version pinning in CI |
| Wayland fallback for xdotool (`wtype`/`ydotool`) |
| SBOM generation for releases |
| Code signing for release artifacts |
| PR artifact upload (preview builds) |
| Clean up stale Electron references in dependabot |
| Update bug report template with Linux/Tauri version option |
| Upstream sync conflict resolution strategy |
| Notifications on sync failure |

---

## Appendix: Workflow Coverage Matrix

```
Branch: linux (active development)
├── push to linux
│   ├── tauri.yml: secrets ✅
│   ├── tauri.yml: frontend ✅
│   ├── tauri.yml: rust ✅
│   ├── tauri.yml: bundle ❌ (NEVER RUNS)
│   ├── codeql.yml: ❌ (NEVER RUNS)
│   ├── release.yml: ❌ (tag-only)
│   ├── upstream-sync.yml: ✅ (schedule)
│   └── dependabot: ✅ (weekly)
│
├── PR targeting linux
│   ├── tauri.yml: secrets ✅
│   ├── tauri.yml: frontend ✅
│   ├── tauri.yml: rust ✅
│   ├── tauri.yml: bundle ❌ (NEVER RUNS)
│   ├── codeql.yml: ❌ (NEVER RUNS)
│   └── release.yml: ❌ (tag-only)
│
└── PR from feature branch → linux
    ├── tauri.yml: secrets ✅
    ├── tauri.yml: frontend ✅
    ├── tauri.yml: rust ✅
    ├── tauri.yml: bundle ❌ (NEVER RUNS)
    └── codeql.yml: ❌ (NEVER RUNS)
```

`★ Insight ─────────────────────────────────────`
**The dangerous pattern here**: CI *exists* for the `linux` branch, so everything looks green on PRs. But the most important job — full Tauri build with bundling — silently doesn't run. A contributor could merge a PR that breaks AppImage generation and they'd never know until someone tries to release. This is worse than no CI — it's CI that provides false confidence.
`─────────────────────────────────────────────────`

---

## Appendix: Reconciled Parity Items (from previous audit contradictions)

| Item | Previous Contradiction | Resolution |
|------|----------------------|------------|
| **Transparency** | Listed as both P0 gap and Platform limitation | **Platform limitation** — WebKitGTK cannot render window-level transparency. Commit `866d872` explicitly set `transparent: false` as a deliberate choice, not a migration oversight. |
| **Fullscreen** | Listed as both missing and implemented | **MATCH** — Full path verified: UI → `window.api.windowFullscreen()` → `invoke('window_fullscreen_toggle')` → Rust `set_fullscreen()`. No action needed. |
| **Camera/Mic** | Listed as P0 (missing), P0 (false positive), P1 (partial) | **PARTIAL** — Ported via standard Web API. Works, but requires explicit permission dialog (UX diff from Electron auto-grant). Not a code gap. |
| **Save dialog** | Listed as P0 (gap) and "not parity gap" | **MIGRATION GAP** — No `save-file` command exists in Tauri. Electron also lacked a dedicated `showSaveDialog` in the reference code path (it used implicit `node fs`). This is a new feature opportunity, not a regression. Classified as **MIGRATION GAP** because the general filesystem write path exists but the dialog-mediated save workflow doesn't. |
| **Auto-launch** | Listed as P0 gap and intentional difference | **INTENTIONAL LINUX DIFFERENCE** — Never part of Linux product spec. Linux users manage autostart via `.desktop` files. |
| **Vibrancy/blur** | Listed as P1 and Platform limitation | **Platform limitation** — WebKitGTK partial `backdrop-filter` support. Cannot be fixed in code. |
| **Window opacity** | Listed as P1 gap and Tauri v2 gap | **Tauri v2 API gap** — `setOpacity()` removed in v2. `--win-alpha` CSS var is the workaround. |

---

*Audit complete. No source changes implemented. All findings are read-only observations.*
