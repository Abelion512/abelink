# Linux Adaptation Design

**Date:** 2026-07-22
**Author:** Abelion
**Status:** Draft

## 1. Problem

Mark Agent v4.0.0 is developed with Windows-only assumptions baked into source code:

- `findstr` (Windows grep) hardcoded in native tools
- `powershell.exe` hardcoded as the only shell executor
- `ffmpeg.exe` / `yt-dlp.exe` path replacement assumes `.exe` suffix
- `active-win` v8 does not support Linux (macOS/Windows only)
- `electron-builder.yml` mirrors npmmirror (Chinese mirror, slow outside CN)
- Path examples in UI/error messages use Windows `D:\` syntax
- No `process.platform` branching anywhere

These cause runtime crashes, silent failures, or degraded UX on Linux.

## 2. Scope

Adapt the existing codebase to run correctly on Linux **without breaking Windows or macOS paths**. No feature additions beyond Linux compatibility.

### 2.1 In-scope

| # | File | Fix |
|---|------|-----|
| 1 | `src/main/native-tools.js` | Platform-aware `grep-search` (findstr → grep on Linux); replace hardcoded `powershell.exe` with platform shell (`bash` on Linux, `powershell.exe` on Windows); cross-platform path examples in error messages |
| 2 | `src/main/whatsapp/media-downloader.js` | Cross-platform ffmpeg/yt-dlp binary path resolution (strip `.exe` assumption) |
| 3 | `src/main/awareness/window-tracker.js` | Replace `active-win` with platform-aware fallback: `active-win` on macOS/Windows, `xdotool` spawn on Linux |
| 4 | `electron-builder.yml` | Remove npmmirror mirror; add Linux desktop icon config |
| 5 | `src/renderer/src/pages/Guidebook.jsx` | Cross-platform path examples in tool descriptions |
| 6 | `src/main/index.js` | Tray icon fallback improvement for Linux (`app.getFileIcon` returns generic icon on Linux; use bundled icon directly) |

### 2.2 Out-of-scope

- CI/CD setup (.github/workflows, etc.)
- Flatpak/Snap/AppImage packaging improvements (only config fix)
- Dockerfile
- Shell scripts (.sh) — nice-to-have, not required for correct operation
- Refactoring beyond minimal platform branching
- Adding test suite

## 3. Approach

Single-file changes with `process.platform === 'win32'` branching. Boring, predictable, no abstraction layer introduced (YAGNI — two platforms don't need a factory).

### 3.1 Platform detection utility

Add a small helper at the top of each affected file rather than a shared module (avoids circular/import issues in Electron context):

```js
const IS_WIN = process.platform === 'win32'
const IS_LINUX = process.platform === 'linux'
const IS_MAC = process.platform === 'darwin'
```

### 3.2 native-tools.js changes

**`grep-search` handler (line 183):**
```js
const cmd = IS_WIN
  ? `findstr /S /I /N /C:"${keyword}" "${dirPath}\\*.*"`
  : `grep -rni "${keyword}" "${dirPath}"`
```

**`run-powershell` handler (line 196-215):**
- Rename to `run-shell` in UI/guidebook (keep `run-powershell` as alias for backward compat with existing prompts)
- Change execution:
```js
const shellCmd = IS_WIN
  ? `powershell.exe -Command "${query}"`
  : `bash -c "${query}"`
const { stdout, stderr } = await execPromise(shellCmd)
```

**Error messages (lines 87, 177):**
```js
// Before: Format salah. Gunakan separator '||' (contoh: D:\file.txt||Halo)
// After:
const pathExample = IS_WIN ? 'D:\\file.txt' : '/home/user/file.txt'
```

### 3.3 media-downloader.js changes

**Binary path resolution (lines 27-30):**
```js
// Current (hardcoded .exe):
const unpackYtdl = unpackFfmpeg.replace(
  /ffmpeg-static[\\/]ffmpeg\.exe/i,
  'youtube-dl-exec\\bin\\yt-dlp.exe'
)

// New:
const ytdlBinary = IS_WIN
  ? 'youtube-dl-exec\\bin\\yt-dlp.exe'
  : 'youtube-dl-exec/bin/yt-dlp'
const unpackYtdl = unpackFfmpeg.replace(
  new RegExp(`ffmpeg-static[\\\\/]ffmpeg${IS_WIN ? '\\.exe' : ''}`, 'i'),
  ytdlBinary
)
```

Verify `ffmpeg-static` and `youtube-dl-exec` packages provide Linux binaries. Both do — this fix unblocks them.

### 3.4 window-tracker.js changes

**`active-win` v8 limitation:** This package only works on macOS and Windows. On Linux it throws.

**Solution — try `active-win` first, fallback to `xdotool` spawn:**
```js
import activeWindow from 'active-win'
import { exec } from 'child_process'

async function getActiveWindow() {
  try {
    if (IS_LINUX) {
      // xdotool-based fallback
      const { stdout } = await util.promisify(exec)(
        'xdotool getactivewindow getwindowname 2>/dev/null && xdotool getactivewindow getactivewindow getclass 2>/dev/null'
      )
      const lines = stdout.split('\n').filter(Boolean)
      return { title: lines[0] || '', owner: { name: lines[1] || 'unknown' } }
    }
    return await activeWindow()
  } catch {
    return null
  }
}
```

**Note:** `xdotool` is not bundled — it must be installed via system package manager (`apt install xdotool`, `pacman -S xdotool`). Document this requirement in README.

### 3.5 electron-builder.yml

```yaml
# Remove line 46:
# electronDownload:
#   mirror: https://npmmirror.com/mirrors/electron/

# Add Linux desktop icon config:
linux:
  target:
    - AppImage
    - snap
    - deb
  maintainer: electronjs.org
  category: Utility
  icon: resources/
```

Note: The icon at `resources/icon.ico` is Windows `.ico` format. For Linux, need a PNG icon. Add `resources/icon.png` (256x256) to the resources folder.

### 3.6 Guidebook.jsx

Change path examples from `D:\project\index.js` to something platform-neutral or dynamically generated:
```jsx
queryFormat="Path Absolut (misal: /home/user/project/index.js atau D:\project\index.js)"
```

### 3.7 Tray icon on Linux

`app.getFileIcon(process.execPath)` on Linux returns Electron's generic icon, not the app icon. Change to use bundled icon directly with platform fallback:
```js
// On Linux, use bundled icon directly since getFileIcon returns generic icon
.then((exeIcon) => {
  tray = new Tray(exeIcon)
  // ...
})
.catch(() => {
  // Fallback: use bundled icon
  const trayIcon = nativeImage.createFromPath(icon).resize({ width: 16, height: 16 })
  tray = new Tray(trayIcon)
  tray.setToolTip('Mark AI Assistant')
})
```

## 4. Files to Modify

| File | Change type |
|------|------------|
| `src/main/native-tools.js` | Modify (platform branching, path examples) |
| `src/main/whatsapp/media-downloader.js` | Modify (binary path regex) |
| `src/main/awareness/window-tracker.js` | Modify (active-win → xdotool fallback) |
| `electron-builder.yml` | Modify (remove bad mirror, add icon path) |
| `src/renderer/src/pages/Guidebook.jsx` | Modify (path examples) |
| `src/main/index.js` | Modify (tray icon fallback) |
| `resources/icon.png` | Add (256x256 PNG for Linux) |

## 5. Dependencies

- **New system dependency (Linux only):** `xdotool` — required for active window tracking. Must be documented.
- **No new npm packages.** `active-win` already in dependencies (just needs fallback on Linux).

## 6. Verification

1. Launch app on Linux (`npm run dev`)
2. Test `grep-search` tool — should return results
3. Test `run-shell` / `run-powershell` tool — should execute bash commands
4. Test WhatsApp YouTube audio download — should produce mp3
5. Test awareness engine — should log active windows (via xdotool)
6. Test tray icon — should show app icon, not generic Electron icon
7. Test `npm run build:linux` — should produce AppImage/snap/deb
8. Verify no regression on macOS (appveyor/CI manual test if available)

## 7. Risks

| Risk | Mitigation |
|------|-----------|
| user without `xdotool` installed → window tracking silently fails | Wrap in try-catch, log warning, return null |
| `ffmpeg-static` Linux binary missing or broken | Already tested to be present; falls back to existing try-catch in caller |
| path normalization bugs (forward/backslash) | Use `path.join` over string concatenation; already used in most places |
| active-win on Linux throws at import, not just at call | Dynamic import `await import('active-win')` on non-Linux platforms only |

## 8. Backward Compatibility

- All changes use `process.platform` branching — Windows behavior is unchanged.
- `run-powershell` tool name preserved as alias for backward compat with AI prompts that reference it.
- Guidebook path examples updated to show both formats.
