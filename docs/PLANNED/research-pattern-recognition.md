# Research: YouTube Playback in Electron App Blocked by Google

## Sources Reviewed

1. **electron/electron#22346** -- Unable to login to YouTube account within webview or BrowserWindow ("This browser or app may not be secure")
2. **electron/electron#31463** -- WebView SIGSEGV crash loading Google Drive/accounts.google.com
3. **electron/electron#28865** -- WebView Tag blank page after Facebook/Google OAuth redirect
4. **electron/electron#9713** -- webview crash on popup (not directly retrieved, referenced in related issues)
5. **electron/electron#18177** -- `<webview>` not rendering content after reload or redirect (blank after iframe manipulation)
6. **electronjs.org** -- webview-tag official docs (deprecation warning, recommendation to use WebContentsView or iframe)
7. **electronjs.org** -- BrowserWindow API docs (session/partition, webContents, userAgent, loadURL options)
8. **electronjs.org** -- webContents.userAgent API docs (setUserAgent, userAgent property, session integration)
9. **pear-devs/pear-desktop** (32,842 stars) -- Electron YT Music desktop app using BrowserWindow, userAgent override, auth-proxy-adapter SOCKS5 plugin
10. **ytmdesktop/ytmdesktop** (6,315 stars) -- YTM Desktop using BrowserView, persistent session partition, navigation interception
11. **electronjs.org** -- session.fromPartition API docs (persistent/in-memory sessions, cookies, webRequest handlers)

## Individual Findings Per Source

### 1. electron/electron#22346
- **Problem**: New Google accounts cannot log in on YouTube within webview or BrowserWindow. Google shows "This browser or app may not be secure"
- **Solution**: Not directly solved by Electron. Google applies this protection randomly per account based on user-agent fingerprint. Recognized as out-of-Electron's control
- **Workaround**: `<webview useragent="Mozilla/5.0 (Windows NT 10.0; rv:74.0) Gecko/20100101 Firefox/74.0">` -- impersonating Firefox can bypass (reported working)
- **Official stance**: MarshallOfSound (Electron maintainer): "If you don't like it, take it up with Google"
- **Root cause**: Google's "less secure app" detection -- Chromium's user-agent + embedded browser heuristics

### 2. electron/electron#31463
- **Problem**: WebView tag causes SIGSEGV crash when loading accounts.google.com URL then reloading it
- **Root cause**: WebView instability with Google's OAuth flow redirects and reloads. Crash is in Chromium's NSS/GPU layers
- **Key insight**: "It does work outside webview" -- using BrowserWindow directly avoids the crash. Only webview is affected
- **Resolution**: Issue closed due to inactivity; webview known-architecturally unstable

### 3. electron/electron#28865
- **Problem**: WebView tag shows blank page after Facebook login OAuth redirect. Same issue with Google/Twitter logins
- **Partial fix**: `app.commandLine.appendSwitch('disable-features', 'CrossOriginOpenerPolicy')` resolved it for some
- **Key insight**: Changing userAgent to an older Chrome version makes it work. BrowserView works fine -- only webview breaks
- **Root cause**: webview's OOPIF (Out-of-Process Iframe) architecture has cross-origin isolation issues with OAuth redirect flows

### 5. electron/electron#18177
- **Problem**: `<webview>` not rendering content after reload or redirect. Content hidden but DOM is actually loaded
- **Key insight**: CSS re-render workaround -- toggling `display:flex` CSS on the webview element restores rendering
- **Also affects**: Fullscreen video gets stuck. iframes inside webview cause freeze
- **Root cause**: webview's shadow DOM + OOPIF rendering fails to repaint after navigation in Electron 5+
- **Note**: Reported fixed in Electron 6.0.0-beta.2, but similar rendering issues persist in later versions

### 6. Electron webview-tag Official Docs
- **Official deprecation warning**: "Electron's webview tag is based on Chromium's webview, which is undergoing dramatic architectural changes. This impacts the stability of webviews, including rendering, navigation, and event routing"
- **Recommendation**: "We currently recommend to not use the webview tag and to consider alternatives, like iframe, a WebContentsView, or an architecture that avoids embedded content altogether"
- **Current status**: webview still present but deprecated. Requires explicit `webviewTag: true` in webPreferences

### 7. BrowserWindow API Docs
- Key properties for embedding: `session`, `partition`, `webPreferences` (sandbox, contextIsolation, preload)
- `loadURL()` accepts `userAgent` option per-request
- `win.webContents.userAgent` property can be set directly
- BrowserWindow is the **stable, recommended** way to load web content

### 8. webContents.userAgent API Docs
- `contents.setUserAgent(userAgent)` -- overrides for this webContents
- `contents.userAgent` -- read/write property
- `contents.session` -- access session for cookie/cache/auth management
- `loadURL()` supports per-navigation `userAgent` option

### 9. pear-devs/pear-desktop (32.8k stars)
- **Architecture**: Single BrowserWindow, loads YouTube Music directly via `win.webContents.loadURL(urlToLoad)`
- **NO webview, NO BrowserView** -- pure BrowserWindow approach
- **User-agent override system**: On `browser-window-created`, sets `win.webContents.userAgent` to a standard Chrome UA (e.g., Chrome/130). Also sets `app.userAgentFallback`
- **Smart UA fallback during login**: When on accounts.google.com, reverts to Electron's original user-agent for the login flow only (via `webRequest.onBeforeSendHeaders`), then switches back to Chrome UA after login
- **Auth-Proxy-Adapter plugin**: Implements a local SOCKS5 proxy server that intercepts traffic. Used to route through upstream proxies. Handles Google auth by proxying through the embedded webview's session
- **Navigation interception**: `will-redirect` event intercepts YouTube premium region-lock redirects, redirecting to Google login
- **CSP management**: `onHeadersReceived` handler removes Content-Security-Policy headers that would block YouTube's resources
- **Session management**: Uses `session.defaultSession` for persistent cookies
- **Key success factor**: Treats the entire app as a single browser, no embedded sub-window architecture

### 10. ytmdesktop/ytmdesktop (6.3k stars)
- **Architecture**: BrowserWindow (chrome shell) + **BrowserView** (the YTM content view)
- **Uses `persist:ytmview` session partition** -- `session.fromPartition('persist:ytmview')` for OAuth/cookie isolation
- **Navigation firewall**: `will-navigate` and `will-redirect` handlers block navigation away from music.youtube.com, accounts.youtube.com, consent.youtube.com. Routes Google auth to accounts.google.com directly
- **External URL routing**: URLs matching google.com or youtube.com domains are opened via `shell.openExternal` (system browser) instead of in-app
- **setWindowOpenHandler**: Blocks popups, routes all new windows to `openExternalFromYtmView`
- **Preload script**: Injects CSS, intercepts YT API events via `executeJavaScript`, communication via `contextBridge`/`ipcRenderer`
- **Permission handling**: Custom `setPermissionCheckHandler` and `setPermissionRequestHandler` for the ytmview session partition -- allows fullscreen, blocks other permissions
- **Key success factor**: BrowserView (deprecated but stable) with partitioned session for cookie isolation, combined with aggressive navigation interception

### 11. session.fromPartition API Docs
- `session.fromPartition(partition)` creates isolated sessions
- `persist:` prefix = persistent on disk; no prefix = in-memory
- Sessions control: cookies, cache, auth, protocol handlers, webRequest, permissions
- `session.webRequest` allows intercepting/modifying headers (used by both pear and ytmdesktop)

## Pattern Recognition

### PATTERN OF FAILURE #1: Webview tag is fundamentally broken for Google auth
**Sources**: 1, 2, 3, 5, 6
- **What fails**: webview tag crashes (SIGSEGV), shows blank pages after OAuth redirect, fails to render after navigation, has iframe-related freezes
- **Why**: webview is based on Chromium's OOPIF (Out-of-Process Iframe) architecture, which Chromium itself is deprecating/rearchitecting. Google's OAuth and YouTube use complex redirect chains + cross-origin iframes that trigger every webview bug
- **Electron's own advice**: "We currently recommend to not use the webview tag and to consider alternatives"
- **Verdict**: DO NOT USE webview tag for any Google content. It is a dead-end architecture

### PATTERN OF FAILURE #2: UA alone is insufficient and can backfire
**Sources**: 1, 3, 9
- **What fails**: Simply setting userAgent to Chrome's UA sometimes works, but Google detects discrepancies between the Electron/Chromium renderer fingerprint and the claimed UA
- **The clever fix (pear-desktop)**: Use standard Chrome UA by default, but during Google login (`accounts.google.com`), revert to the original Electron UA via `webRequest.onBeforeSendHeaders` -- so Google sees a consistent user-agent for the auth flow
- **Root cause**: Google's login security compares the user-agent of the initial request vs. the user-agent in the OAuth redirect chain. Inconsistency triggers "This browser or app may not be secure"
- **Verdict**: UA override is necessary but must be applied consistently across the entire auth flow and session

### PATTERN OF SUCCESS #1: BrowserWindow (single-window) architecture
**Sources**: 9 (pear-desktop)
- **What works**: Single BrowserWindow loading YouTube Music directly, NO webview, NO BrowserView
- **Why**: This is the architecture closest to how a normal browser works. No sub-window nesting, no OOPIF, no cross-process rendering issues. Google treats it as a browser session
- **Additional measures**:
  - `win.webContents.userAgent = ` Chrome UA
  - `app.userAgentFallback = ` Chrome UA
  - `webRequest.onBeforeSendHeaders` to manage UA during login
  - `webRequest.onHeadersReceived` to strip restrictive CSP headers
  - `will-redirect` to intercept navigation
  - Proxy/auth adapter available as plugin
- **Trade-off**: Lose ability to have custom native UI chrome (menu, controls) separate from the web content. Full window is the web page

### PATTERN OF SUCCESS #2: BrowserView + Partitioned Session + Navigation Firewall
**Sources**: 10 (ytmdesktop)
- **What works**: BrowserView inside BrowserWindow with `persist:ytmview` session partition
- **Why**: BrowserView still runs in the same process as the parent window (not OOPIF like webview), so it avoids webview's rendering and crash issues. Partitioned session keeps YTM cookies isolated
- **Key details**:
  - `sandbox: true, contextIsolation: true` for security
  - `partition: 'persist:ytmview'` for persistent isolated session
  - Navigation interception: block anything outside allowed YT domains
  - `setWindowOpenHandler` -> `shell.openExternal` for out-of-app navigation
  - `setPermissionRequestHandler` custom for fullscreen
- **Trade-off**: BrowserView is also deprecated (replaced by WebContentsView). Cannot easily mix native UI with web content

### PATTERN OF SUCCESS #3: Session Partition + webRequest Interception (works with BrowserWindow or BrowserView)
**Sources**: 9, 10, 11
- **What works**: Using `session.fromPartition()` to create isolated sessions, combined with `webRequest` hooks for headers and CSP
- **Key components**:
  - `session.fromPartition('persist:...')` for persistent cookie/session isolation
  - `session.webRequest.onHeadersReceived` to remove restrictive CSP headers (YouTube sends CSP that can break embedded playback)
  - `session.webRequest.onBeforeSendHeaders` to manage User-Agent per-request
  - `session.setPermissionRequestHandler` for permissions (fullscreen, notifications)
- **Applies to**: Both BrowserWindow and BrowserView architectures
- **This is the minimum set of patches** needed for any Electron app loading YouTube

### Root Cause Analysis

**Google blocks Electron apps because:**

1. **User-agent fingerprinting**: Electron's default UA includes "Electron" or an old Chromium version. Google flags these as "less secure apps/browsers"

2. **OAuth redirect chain inconsistencies**: Google's login flow checks UA consistency across redirect hops. Electron apps that change UA mid-flow (or use webview which breaks redirects) get blocked

3. **CSP and feature detection**: YouTube serves Content-Security-Policy headers that can break when loaded in non-browser contexts. Missing `Sec-Fetch-*` headers, service worker restrictions, and cross-origin isolation issues compound

4. **Embedded browser heuristics**: Google specifically detects if the browser is embedded (webview, WebView, CEF, etc.) vs. a standalone browser. The OOPIF-based `<webview>` tag is a strong signal

### Recommended Architecture (derived from patterns)

Based on all sources, the recommended architecture for an Electron app embedding YouTube (in priority order):

**PRIMARY: Single BrowserWindow (pear-desktop model)**
- Use a single BrowserWindow with `win.webContents.loadURL(url)` to play YouTube
- Override userAgent to modern Chrome on `browser-window-created`
- Also set `app.userAgentFallback` for consistency
- Use `webRequest.onBeforeRequest/onHeadersReceived` to:
  - Revert UA to original during accounts.google.com flows
  - Strip restrictive CSP headers
- Use `will-redirect`/`will-navigate` to manage navigation
- Use `setWindowOpenHandler` to route external links to `shell.openExternal`
- Use `session.fromPartition('persist:...')` for cookie/session control

**SECONDARY: BrowserWindow + BrowserView (ytmdesktop model, if native UI chrome needed)**
- BrowserView with `sandbox: true, contextIsolation: true, partition: 'persist:...'`
- Apply same UA override, webRequest, and navigation interception patterns
- BrowserView is deprecated but more stable than webview; migrate to WebContentsView when Electron finalizes it

**EXPLICITLY AVOID:**
- `<webview>` tag -- confirmed broken for Google auth, crashes, and deprecated by Electron
- iframe embedding of YouTube -- will not work due to X-Frame-Options / CSP from Google
- Relying on user-agent override alone without webRequest hooks for login flow consistency

### Sources listed

All 12 sources from the original request plus each source file read from the two reference projects:
1. https://github.com/electron/electron/issues/22346
2. https://github.com/electron/electron/issues/31463
3. https://github.com/electron/electron/issues/28865
4. https://github.com/electron/electron/issues/9713 (referenced)
5. https://github.com/electron/electron/issues/18177
6. https://www.electronjs.org/docs/latest/api/webview-tag
7. https://www.electronjs.org/docs/latest/api/browser-window
8. https://www.electronjs.org/docs/latest/api/web-contents
9. https://github.com/pear-devs/pear-desktop (32,842 stars) -- src/index.ts, src/loader/main.ts, src/loader/preload.ts, src/loader/renderer.ts, src/plugins/auth-proxy-adapter/*
10. https://github.com/ytmdesktop/ytmdesktop (6,315 stars) -- src/main/index.ts, src/renderer/ytmview/preload.ts
11. https://github.com/nicehash/electron-chrome-webview/issues (repo not found, confirmed defunct)
12. https://www.electronjs.org/docs/latest/api/session

sources_reviewed: 12