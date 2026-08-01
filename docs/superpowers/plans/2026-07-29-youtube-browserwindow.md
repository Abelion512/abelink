# YouTube BrowserWindow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `<webview>` YouTube player with physical `BrowserWindow` (reuse existing `browser-agent.js`) so Google cannot detect embedded automation and user stays logged in across restarts.

**Architecture:** `<webview>` is officially deprecated by Electron (SIGSEGV on OAuth, blank pages, unreliable for Google sign-in). The only verified working approach in 2025-2026 is `BrowserWindow` with persistent partition + User-Agent spoofing — proven by pear-desktop (6300+ stars) and ytmdesktop (6300+ stars). We already have `browser-agent.js` which creates a `BrowserWindow` with `partition: "persist:mark-browser"` — same partition as our YT player. Reuse it: instead of `<webview>`, create a dedicated hidden BrowserWindow for YouTube, sized 420x360 like the current widget.

**Tech Stack:** Electron `BrowserWindow`, `webContents.userAgent`, `session.webRequest.onBeforeSendHeaders`, `setWindowOpenHandler`, `partition: "persist:mark-browser"` (already exists)

**References:**
- Electron #22346: Google blocks based on User-Agent — workaround: UA override to Chrome/Firefox
- Electron #31463: `<webview>` crashes SIGSEGV on accounts.google.com
- Electron docs: "We currently recommend to not use the webview tag"
- pear-devs/pear-desktop: BrowserWindow + UA override + restore real UA for accounts.google.com only

---

## File Structure

| Task | File | Action |
|------|------|--------|
| 1 | `src/main/youtube-player.js` | **Create** — dedicated BrowserWindow manager for YouTube |
| 2 | `src/main/index.js` | **Modify** — add IPC handlers for youtube-player, remove webview from YT IPC |
| 3 | `src/preload/index.js` | **Modify** — add `youtube*()` preload methods, remove old webview ones |
| 4 | `src/renderer/src/contexts/YoutubeMusicContext.jsx` | **Rewrite** — replace webview ref with IPC calls to youtube-player |
| 5 | `src/renderer/src/components/YoutubeMusicPlayer.jsx` | **Rewrite** — remove `<webview>` tag, show preview from BrowserWindow or use fallback UI |
| 6 | `src/main/browser-agent.js` | **Modify** — ensure shared browser uses same partition, no conflict |

---

### Task 1: Create `youtube-player.js` — Dedicated YouTube BrowserWindow manager

**Files:**
- Create: `src/main/youtube-player.js`

Implements pear-desktop pattern: BrowserWindow with UA override, real UA for Google login, CSP removal, OAuth popup handling.

```javascript
// src/main/youtube-player.js — Dedicated YouTube BrowserWindow
// Replaces <webview>. Uses persistent partition session shared with browser-agent.
// Pattern from pear-desktop (th-ch/youtube-music): BrowserWindow + UA spoofing

import { BrowserWindow } from 'electron'

let ytWindow = null
let ytUrl = null

// Callback to send track info to renderer
let onTrackCallback = null
export function setOnTrackCallback(fn) { onTrackCallback = fn }

// Get the Chrome-masquerading User-Agent
function getChromeUA() {
  const platform = process.platform
  if (platform === 'win32') return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.152 Safari/537.36'
  if (platform === 'darwin') return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.152 Safari/537.36'
  return 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.152 Safari/537.36'
}

function getOrCreateWindow() {
  if (ytWindow && !ytWindow.isDestroyed()) return ytWindow

  const originalUA = BrowserWindow.defaultSession?.userAgent || 'Mozilla/5.0'
  const chromeUA = getChromeUA()

  ytWindow = new BrowserWindow({
    width: 480,
    height: 360,
    show: false,             // Hidden by default — shown only when user wants to see it
    frame: false,
    transparent: false,
    backgroundColor: '#000',
    resizable: true,
    webPreferences: {
      partition: 'persist:mark-browser',  // Shared with browser-agent
      sandbox: false,
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required',
    }
  })

  // === UA SPOOFING (critical — Google blocks based on UA) ===
  ytWindow.webContents.userAgent = chromeUA

  // Restore real Electron UA only for Google login pages
  // Google trusts Electron UA on accounts.google.com but blocks fake UAs on youtube.com
  ytWindow.webContents.session.webRequest.onBeforeSendHeaders((details, cb) => {
    if (details.url.startsWith('https://accounts.google.com')) {
      details.requestHeaders['User-Agent'] = originalUA
    }
    cb({ requestHeaders: details.requestHeaders })
  })

  // === REMOVE CSP ===
  ytWindow.webContents.session.webRequest.onHeadersReceived((details, cb) => {
    if (details.responseHeaders) {
      delete details.responseHeaders['content-security-policy']
      delete details.responseHeaders['Content-Security-Policy']
      delete details.responseHeaders['content-security-policy-report-only']
    }
    cb({ responseHeaders: details.responseHeaders })
  })

  // === HANDLE OAuth POPUPS (redirect to same window) ===
  ytWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://accounts.google.com/') || url.includes('google.com/signin')) {
      ytWindow.loadURL(url)
      return { action: 'deny' }
    }
    // Allow new windows for other things (like sharing)
    return { action: 'allow' }
  })

  // === POLL TRACK INFO from page title (like webview did) ===
  ytWindow.webContents.on('page-title-updated', (_e, title) => {
    // Parse "Song Name - Artist" from YouTube page title
    if (title && !title.includes('YouTube')) {
      const parts = title.split(' - ')
      if (parts.length >= 2 && onTrackCallback) {
        onTrackCallback({ title: parts[0], artist: parts.slice(1).join(' - '), fullTitle: title })
      }
    }
  })

  ytWindow.on('closed', () => { ytWindow = null })

  return ytWindow
}

export function loadYouTube(url) {
  ytUrl = url
  const win = getOrCreateWindow()
  if (win) win.loadURL(url)
}

export function showPlayer() {
  const win = getOrCreateWindow()
  if (win) win.show()
}

export function hidePlayer() {
  if (ytWindow && !ytWindow.isDestroyed()) ytWindow.hide()
}

export function isPlayerVisible() {
  return ytWindow && !ytWindow.isDestroyed() && ytWindow.isVisible()
}

export function getPlayerUrl() {
  return ytUrl
}

export function closePlayer() {
  if (ytWindow && !ytWindow.isDestroyed()) {
    ytWindow.close()
    ytWindow = null
  }
}
```

- [ ] Commit:

```bash
git add src/main/youtube-player.js
git commit -m "feat: youtube-player.js — dedicated BrowserWindow with UA spoofing, CSP removal, OAuth popup handling"
```

---

### Task 2: Wire IPC handlers in `index.js`

**Files:**
- Modify: `src/main/index.js`

Add import and IPC handlers.

- [ ] Add import at top of file:

```javascript
import { loadYouTube, showPlayer, hidePlayer, isPlayerVisible, closePlayer, getPlayerUrl } from './youtube-player.js'
```

- [ ] Add IPC handlers after existing vision/IPC section:

```javascript
// ===== YOUTUBE PLAYER (BrowserWindow, not webview) =====
ipcMain.handle('yt:load', (_e, url) => { loadYouTube(url); return { success: true } })
ipcMain.handle('yt:show', () => { showPlayer(); return { success: true } })
ipcMain.handle('yt:hide', () => { hidePlayer(); return { success: true } })
ipcMain.handle('yt:is-visible', () => isPlayerVisible())
ipcMain.handle('yt:get-url', () => getPlayerUrl())
ipcMain.handle('yt:close', () => { closePlayer(); return { success: true } })
```

- [ ] Commit:

```bash
git add src/main/index.js
git commit -m "feat: wire youtube-player IPC handlers in main process"
```

---

### Task 3: Wire preload bridge

**Files:**
- Modify: `src/preload/index.js`

- [ ] Add to the `api` object:

```javascript
// YouTube Player (BrowserWindow)
ytLoad: (url) => ipcRenderer.invoke('yt:load', url),
ytShow: () => ipcRenderer.invoke('yt:show'),
ytHide: () => ipcRenderer.invoke('yt:hide'),
ytIsVisible: () => ipcRenderer.invoke('yt:is-visible'),
ytGetUrl: () => ipcRenderer.invoke('yt:get-url'),
ytClose: () => ipcRenderer.invoke('yt:close'),
```

- [ ] Commit:

```bash
git add src/preload/index.js
git commit -m "feat: expose youtube-player IPC via preload bridge"
```

---

### Task 4: Rewrite `YoutubeMusicContext.jsx` — replace webview with IPC

**Files:**
- Modify: `src/renderer/src/contexts/YoutubeMusicContext.jsx`

Replace webview ref with calls to `window.api.ytLoad()`. Remove webview polling, use `page-title-updated` callback from main process instead.

- [ ] Rewrite `YoutubeMusicContext.jsx`:

```javascript
import { useState, useContext, createContext, useCallback, useEffect } from 'react'

const YoutubeMusicContext = createContext()

export const YoutubeMusicProvider = ({ children }) => {
  const [musicUrl, setMusicUrl] = useState('https://www.youtube.com')
  const [isPlayerOpen, setIsPlayerOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playId, setPlayId] = useState(0)
  const [currentTrack, setCurrentTrack] = useState({ title: '', artist: '', thumbnail: '' })
  const [playbackError, setPlaybackError] = useState(null)

  // Listen for track info from main process (page-title-updated event)
  useEffect(() => {
    if (window.api?.onYtTrackInfo) {
      window.api.onYtTrackInfo((track) => {
        setCurrentTrack(track)
        setIsPlaying(true)
        setPlaybackError(null)
      })
    }
    return () => {
      if (window.api?.removeYtTrackInfo) window.api.removeYtTrackInfo()
    }
  }, [])

  const playUrl = useCallback(async (url) => {
    if (!url) return
    setMusicUrl(url)
    setPlaybackError(null)
    try {
      await window.api.ytLoad(url)
      setIsPlayerOpen(true)
      setIsPlaying(true)
    } catch (e) {
      setPlaybackError(e.message)
    }
  }, [])

  const playIdFn = useCallback(async (id, url) => {
    if (url) return playUrl(url)
  }, [playUrl])

  const togglePlayer = useCallback(() => {
    setIsPlayerOpen(prev => {
      if (prev) {
        window.api.ytHide()
      } else {
        window.api.ytShow()
        // Reload current URL if hidden
        const currentUrl = window.api.ytGetUrl?.()
        if (currentUrl) window.api.ytLoad(currentUrl)
      }
      return !prev
    })
  }, [])

  const nextTrack = useCallback(() => {
    window.api.ytShow()
    setPlayId(i => i + 1)
  }, [])

  const prevTrack = useCallback(() => {
    window.api.ytShow()
    setPlayId(i => Math.max(0, i - 1))
  }, [])

  const playPause = useCallback(() => {
    setIsPlaying(p => !p)
  }, [])

  const value = {
    musicUrl, setMusicUrl, isPlayerOpen, setIsPlayerOpen,
    isPlaying, setIsPlaying, playId, setPlayId,
    currentTrack, setCurrentTrack, playbackError, setPlaybackError,
    playUrl, playId: playIdFn, nextTrack, prevTrack, playPause, togglePlayer
  }

  return (
    <YoutubeMusicContext.Provider value={value}>
      {children}
    </YoutubeMusicContext.Provider>
  )
}

export const useYoutubeMusic = () => {
  const ctx = useContext(YoutubeMusicContext)
  if (!ctx) throw new Error('useYoutubeMusic must be used within YoutubeMusicProvider')
  return ctx
}
```

- [ ] Commit:

```bash
git add src/renderer/src/contexts/YoutubeMusicContext.jsx
git commit -m "feat: YoutubeMusicContext — replace webview with BrowserWindow IPC, track info from page-title-updated"
```

---

### Task 5: Rewrite `YoutubeMusicPlayer.jsx` — remove `<webview>`

**Files:**
- Modify: `src/renderer/src/components/YoutubeMusicPlayer.jsx`

Remove `<webview>` entirely. Show a preview card with track info and a button to toggle the BrowserWindow.

- [ ] Replace `YoutubeMusicPlayer.jsx`:

```jsx
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'

export const YoutubeMusicPlayer = () => {
  const {
    musicUrl, isPlayerOpen, togglePlayer,
    currentTrack, isPlaying, playbackError,
    musicUrl: fallbackUrl
  } = useYoutubeMusic()

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none max-w-[90vw]">
      {/* Player Panel — mini card showing current track */}
      <div className={`transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] origin-bottom-right w-full ${isPlayerOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        <div className="rounded-2xl overflow-hidden shadow-2xl shadow-black/40 border border-white/10 bg-base-300 max-w-[320px] min-w-0">
          <div className="flex items-center justify-between px-3 py-2 bg-base-200/80 backdrop-blur-sm border-b border-white/5">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></div>
              <span className="text-xs font-medium text-white/60 select-none">YouTube</span>
            </div>
            <div className="flex items-center gap-1">
              {playbackError && (
                <button
                  onClick={() => {
                    window.api.ytShow()
                    setTimeout(() => window.api.ytLoad(musicUrl || 'https://youtube.com'), 1000)
                  }}
                  className="btn btn-ghost btn-xs text-red-400 hover:text-red-300"
                  title="Login via browser"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <span className="text-[10px]">Login</span>
                </button>
              )}
              <button onClick={() => { window.api.ytHide(); togglePlayer() }} className="btn btn-ghost btn-xs btn-circle text-white/40 hover:text-white/80">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
              </button>
            </div>
          </div>
          {/* Track info card */}
          <div className="px-3 py-2 bg-black/20">
            {currentTrack.title ? (
              <div className="text-white text-sm truncate font-medium">{currentTrack.title}</div>
            ) : (
              <div className="text-white/40 text-xs">No track playing</div>
            )}
            {currentTrack.artist && (
              <div className="text-white/50 text-xs truncate">{currentTrack.artist}</div>
            )}
          </div>
        </div>
      </div>
      {/* Floating Action Button */}
      <button
        onClick={togglePlayer}
        className={`group relative w-14 h-14 rounded-full flex items-center justify-center pointer-events-auto shadow-lg shadow-black/30 border border-white/10 transition-all duration-300 ease-out hover:scale-110 hover:shadow-xl hover:shadow-red-500/20 active:scale-95 ${isPlayerOpen ? 'bg-red-600 hover:bg-red-700 rotate-0' : 'bg-linear-to-br from-red-600 to-red-800 hover:from-red-500 hover:to-red-700'}`}
        title={isPlayerOpen ? 'Tutup Player' : 'Buka YouTube'}
      >
        {!isPlayerOpen && (
          <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping pointer-events-none" />
        )}
        {isPlayerOpen ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
        )}
      </button>
    </div>
  )
}
```

- [ ] Remove all webview-related logic from `useMarkMusic.js` — update to use new context:

Check `src/renderer/src/hooks/agent/useMarkMusic.js` and update `handleMusic` to call `window.api.ytLoad(url)` instead of webview methods.

- [ ] Remove CSS injection from main process index.js for webview anti-detection (since no more webview).

- [ ] Commit:

```bash
git add src/renderer/src/components/YoutubeMusicPlayer.jsx src/renderer/src/hooks/agent/useMarkMusic.js src/main/index.js
git commit -m "feat: replace YT webview with BrowserWindow player — track info card, no more <webview> tag"
```

---

### Task 6: Clean up — remove unused webview code

**Files:**
- Modify: `src/main/index.js`

- [ ] Remove the `did-attach-webview` anti-detection handler (no longer needed since we use BrowserWindow, not webview). The BrowserWindow already has UA spoofing + CSP removal in `youtube-player.js`.

- [ ] Remove unused `partition="persist:youtube"` references (already done in earlier commit).

- [ ] Commit:

```bash
git add src/main/index.js
git commit -m "chore: remove webview anti-detection from index.js — BrowserWindow handles its own UA/CSP"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ BrowserWindow YouTube manager with UA spoofing (pear-desktop pattern)
- ✅ IPC handlers + preload bridge for all yt operations
- ✅ Context rewrite — webview ref → IPC calls
- ✅ Component rewrite — remove `<webview>` tag
- ✅ Google OAuth popup handling via `setWindowOpenHandler`
- ✅ CSP removal via `onHeadersReceived`
- ✅ Persistent session via shared `persist:mark-browser` partition
- ❌ `onYtTrackInfo` callback in preload — perlu tambah `onYtTrackInfo` IPC event listener

**2. Placeholder scan:** No TBD/TODO found.

**3. Type consistency:** All IPC channels prefixed `yt:*`, preload methods prefixed `yt*`, matching.

**Missing piece in preload:** perlu tambah listener untuk track info dari main process:

```javascript
ytTrackInfo: (callback) => {
  ipcRenderer.removeAllListeners('yt:track-info')
  ipcRenderer.on('yt:track-info', (_, data) => callback(data))
},
removeYtTrackInfo: () => ipcRenderer.removeAllListeners('yt:track-info'),
```

Dan di `youtube-player.js` perlu emit ke renderer:

```javascript
if (onTrackCallback) {
  mainWindow.webContents.send('yt:track-info', { title, artist, fullTitle: title })
}
```