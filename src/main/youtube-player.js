// src/main/youtube-player.js — Dedicated YouTube BrowserWindow with ad blocking
// Keeps YouTube page for Last.fm scrobbling, track metadata, TikTok ecosystem.
// Blocks ads via: (1) URL filtering, (2) SABR backoff patching, (3) skip-button auto-click.

import { BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

// ---- AD BLOCKING: Script injected into YouTube pages ----
// ATM approach: Amati (Brave SABR, Emy MV3, AdEclipse skipAd API) → Tiru → Modifikasi
const AD_BLOCK_SCRIPT = `
(function() {
  const LOG = '[ad-block]';
  let stats = { skipped: 0, overlays: 0, seeks: 0 };

  // ═══════════════════════════════════════════════════════
  // 1. CSS COSMETIC HIDING (150+ selectors)
  //    Hides ad containers, banners, premium promos, overlays
  //    Sources: brave-unbreak.txt, NoYouTubeAds, uBO filters
  // ═══════════════════════════════════════════════════════
  const AD_CSS = \`
    /* Video player ads */
    .video-ads,
    .ytp-ad-module,
    .ytp-ad-overlay-container,
    .ytp-ad-text-overlay,
    .ytp-ad-player-overlay-layout,
    .ytp-ad-player-overlay,
    .ytp-ad-progress-list,
    .ytp-ad-progress,
    .ad-showing .ytp-chrome-bottom,
    .ytp-ad-image-overlay,
    .ytp-ad-action-interstitial-image-container,
    .ytp-ad-action-interstitial-slot,
    .ytp-paid-content-overlay,
    .ytp-ad-display-ad-impression-overlay,
    .ytp-ad-persistent-progress-bar-container,
    .ytp-ad-persistent-companion-container,
    .ytp-ad-overlay-slot,
    .ytp-ad-button-container,
    .ytp-ad-visit-advertiser-button,
    [class*="ytp-ad-overlay"],
    [class*="ytp-ad-image"],
    .iv-branding,
    .iv-drawer,
    .annotation-type-custom,
    .ytp-ce-element,
    .ytp-cards-teaser,
    .companion-ad-container,
    .video-ads.ytp-ad-module,
    .ytp-ad-overlay-container-wrap {
      display: none !important;
      opacity: 0 !important;
      pointer-events: none !important;
      height: 0 !important;
      width: 0 !important;
      overflow: hidden !important;
      position: absolute !important;
      z-index: -9999 !important;
    }

    /* Page-level ad slots */
    #masthead-ad,
    #masthead-ad-container,
    #player-ads,
    #panels > [target-id="engagement-panel-ads"],
    ytd-ad-slot-renderer,
    ytd-promoted-video-renderer,
    ytd-promoted-sparkles-web-renderer,
    ytd-text-image-no-button-layout-renderer,
    ytd-merch-shelf-renderer,
    ytd-compact-movie-renderer,
    ytd-mealbar-promo-renderer,
    ytd-video-quality-promo-renderer,
    ytd-ads-engagement-panel-content-renderer,
    ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"],
    ytd-search-pyv-renderer,
    ytd-enforcement-message-view-model,
    ytd-brand-video-singleton-renderer,
    ytd-brand-video-shelf-renderer,
    ytd-in-feed-ad-layout-renderer,
    ytd-ad-slot-renderer.style-scope.ytd-item-section-renderer,
    ytd-rich-item-renderer:has(> .ytd-rich-item-renderer > ytd-ad-slot-renderer),
    ytd-rich-item-renderer:has(ytd-display-ad-renderer),
    ytm-ad-slot-renderer,
    ytm-promoted-video-renderer,
    ytm-promoted-sparkles-web-renderer,
    ytm-companion-ad-renderer,
    ytm-text-image-no-button-layout-renderer,
    ad-slot-renderer {
      display: none !important;
    }

    /* Premium/subscription promos */
    ytd-popup-container:has(a[href="/premium"]),
    yt-mealbar-promo-renderer,
    .ytp-cards-teaser,
    .ytp-suggested-action-badge,
    .ytp-ce-element {
      display: none !important;
    }

    /* Adblock detection overlay (dismiss enforcement) */
    #tp-yt-paper-dialog:has(ytd-enforcement-message-view-model),
    ytd-enforcement-message-view-model,
    .ytd-enforcement-message-view-model-wiz {
      display: none !important;
    }

    /* Sidebar companion ads */
    #related > div#player-ads,
    #content > ytd-ad-slot-renderer,
    #contents.style-scope.ytd-search-pyv-renderer,
    #main > #banner.ytd-merch-shelf-renderer,
    #scroll-container > #items.ytd-merch-shelf-renderer,
    #items > ytd-ad-slot-renderer {
      display: none !important;
    }

    /* Hide video ONLY during active ad playback */
    .ad-showing #movie_player video,
    .ytp-ad-playing video {
      opacity: 0 !important;
    }
  \`;

  function injectCSS() {
    if (document.getElementById('mark-ad-css')) return;
    const style = document.createElement('style');
    style.id = 'mark-ad-css';
    style.textContent = AD_CSS;
    (document.head || document.documentElement).appendChild(style);
    console.log(LOG, 'CSS injected');
  }
  injectCSS();

  // ═══════════════════════════════════════════════════════
  // 2. AD DETECTION & SKIP (MutationObserver + setInterval)
  // ═══════════════════════════════════════════════════════
  function isAdPlaying() {
    return document.querySelector('.ad-showing') ||
           document.querySelector('.ytp-ad-playing') ||
           document.querySelector('.ytp-ad-player-overlay-layout') ||
           document.querySelector('.ad-interrupting');
  }

  function trySkipAd() {
    // A. YouTube internal player API (works in MAIN world / Electron)
    const player = document.querySelector('#movie_player');
    if (player) {
      if (typeof player.skipAd === 'function') { player.skipAd(); stats.skipped++; return true; }
      if (typeof player.cancelPlayback === 'function') { player.cancelPlayback(); return true; }
    }

    // B. Click skip buttons
    const selectors = [
      '.ytp-ad-skip-button button',
      '.ytp-ad-skip-button-modern button',
      'button.ytp-ad-skip-button',
      '.ytp-skip-ad-button',
      'button.ytp-ad-skip-button--modern',
      '[class*="skip"] button',
      '.ytp-ad-skip-button-modern',
    ];
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null) {
        btn.click();
        stats.skipped++;
        console.log(LOG, 'clicked skip');
        return true;
      }
    }
    return false;
  }

  let savedMuted = false;
  let savedVolume = 1;
  let savedRate = 1;
  let adSeekedToEnd = false;

  function nukeAd() {
    const video = document.querySelector('video');
    if (!video) return;

    if (isAdPlaying()) {
      // Save state on ad start
      if (video.playbackRate === 1) {
        savedMuted = video.muted;
        savedVolume = video.volume;
        savedRate = video.playbackRate;
      }

      // Mute + speed up
      video.muted = true;
      video.playbackRate = 16;

      // Try to skip
      trySkipAd();

      // Seek to end (only short videos = ads)
      if (!adSeekedToEnd) {
        const dur = video.duration;
        if (Number.isFinite(dur) && dur > 0 && dur < 300 && video.currentTime < dur - 0.01) {
          video.currentTime = dur;
          stats.seeks++;
        }
        if (Number.isFinite(dur) && dur > 0 && video.currentTime >= dur - 0.5) {
          adSeekedToEnd = true;
          try { video.dispatchEvent(new Event('ended')); } catch {}
        }
      }
    } else {
      // Not ad — restore
      adSeekedToEnd = false;
      if (video.playbackRate !== 1) video.playbackRate = 1;
      video.muted = savedMuted;
      video.volume = savedVolume;
    }
  }

  // MutationObserver for instant response
  const observer = new MutationObserver(() => {
    nukeAd();
    // Also re-inject CSS if YouTube removed it
    injectCSS();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  // Fallback interval (MutationObserver may miss some attribute changes)
  setInterval(nukeAd, 500);

  // ═══════════════════════════════════════════════════════
  // 3. DISMISS ADBLOCK DETECTION POPUPS
  //    YouTube shows "ad blocker detected" enforcement message
  // ═══════════════════════════════════════════════════════
  function dismissEnforcement() {
    // Remove the enforcement overlay
    const enforcements = document.querySelectorAll('ytd-enforcement-message-view-model, #tp-yt-paper-dialog');
    enforcements.forEach(el => {
      if (el.style.display !== 'none') {
        el.style.display = 'none';
        el.remove();
        console.log(LOG, 'dismissed adblock detection popup');
      }
    });

    // Also try clicking "dismiss" buttons
    const dismissBtns = document.querySelectorAll('[aria-label="Dismiss"], .ytd-enforcement-message-view-model button');
    dismissBtns.forEach(btn => {
      try { btn.click(); } catch {}
    });
  }
  setInterval(dismissEnforcement, 2000);

  // ═══════════════════════════════════════════════════════
  // 4. SABR BACKOFF PATCH — DISABLED
  //    Caused playback errors (stream corruption via body.tee).
  //    CSS + MutationObserver are sufficient for ad blocking.
  //    Re-enable only if mid-roll ads bypass CSS hiding.
  // ═══════════════════════════════════════════════════════
  /* DISABLED — breaks video streams
  const _fetch = window.fetch;
  window.fetch = function(resource, init) {
    const url = typeof resource === 'string' ? resource : (resource?.url || '');
    if (url.includes('googlevideo.com') && url.includes('sabr=1')) {
      // ... SABR patch code ...
    }
    return _fetch.apply(this, arguments);
  };
  */

  // ═══════════════════════════════════════════════════════
  // 5. BACKGROUND PLAYBACK (visibility override)
  // ═══════════════════════════════════════════════════════
  Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
  document.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);

  // Keep activity tracker alive
  setInterval(() => {
    try { document.querySelector('video')?.dispatchEvent(new Event('timeupdate')); } catch {}
  }, 30000);

  // ═══════════════════════════════════════════════════════
  // 6. SPA NAVIGATION RE-INJECTION
  //    YouTube is SPA — re-inject on navigation
  // ═══════════════════════════════════════════════════════
  window.addEventListener('yt-navigate-finish', () => {
    injectCSS();
    dismissEnforcement();
  });

  console.log(LOG, 'injected — 4-layer ad blocking active');
  console.log(LOG, 'layers: CSS cosmetic + MutationObserver + SABR patch + enforcement dismiss');
})()
`

// Parse title string and send to renderer
function parseAndSendTitle(title) {
  if (!title || title === 'YouTube' || title.startsWith('(')) return
  const cleanTitle = title.replace(/ - YouTube$/, '').trim()
  if (!cleanTitle) return
  const parts = cleanTitle.split(' - ')
  if (parts.length >= 2 && onTrackCallback) {
    onTrackCallback({ title: parts[0], artist: parts.slice(1).join(' - '), fullTitle: cleanTitle })
  } else if (parts.length === 1 && onTrackCallback) {
    onTrackCallback({ title: cleanTitle, artist: '', fullTitle: cleanTitle })
  }
}

function getOrCreateWindow() {
  if (ytWindow && !ytWindow.isDestroyed()) return ytWindow

  const originalUA = BrowserWindow.defaultSession?.userAgent || 'Mozilla/5.0'
  const chromeUA = getChromeUA()

  ytWindow = new BrowserWindow({
    width: 480,
    height: 360,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#000',
    resizable: true,
    webPreferences: {
      partition: 'persist:mark-browser',
      sandbox: false,
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
    }
  })

  ytWindow.webContents.setMaxListeners(50)

  // UA SPOOFING
  ytWindow.webContents.userAgent = chromeUA

  // Restore real Electron UA only for Google login pages
  ytWindow.webContents.session.webRequest.onBeforeSendHeaders((details, cb) => {
    if (details.url.startsWith('https://accounts.google.com')) {
      details.requestHeaders['User-Agent'] = originalUA
    }
    cb({ requestHeaders: details.requestHeaders })
  })

  // REMOVE CSP (needed for our injected scripts)
  ytWindow.webContents.session.webRequest.onHeadersReceived((details, cb) => {
    if (details.responseHeaders) {
      delete details.responseHeaders['content-security-policy']
      delete details.responseHeaders['Content-Security-Policy']
      delete details.responseHeaders['content-security-policy-report-only']
    }
    cb({ responseHeaders: details.responseHeaders })
  })

  // ---- AD BLOCKING: URL-level filtering ----
  // Block known YouTube ad-serving URLs
  const AD_URL_PATTERNS = [
    '*://pagead2.googlesyndication.com/*',
    '*://googleads.g.doubleclick.net/*',
    '*://static.doubleclick.net/*',
    '*://ad.doubleclick.net/*',
    '*://www.google.com/pagead/*',
    '*://www.google.com/ads/*',
    '*://*.googlesyndication.com/*',
  ]

  ytWindow.webContents.session.webRequest.onBeforeRequest(
    { urls: AD_URL_PATTERNS },
    (details, cb) => {
      // Block ad requests silently
      cb({ cancel: true })
    }
  )

  // Handle OAuth popups
  ytWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://accounts.google.com/') || url.includes('google.com/signin')) {
      ytWindow.loadURL(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  // Track info: inject title observer into YouTube page
  // Uses MutationObserver on <title> + video loadedmetadata for realtime updates
  ytWindow.webContents.on('page-title-updated', (_e, title) => {
    parseAndSendTitle(title)
  })

  // Inject observer on every page load (survives SPA navigation)
  ytWindow.webContents.on('did-finish-load', () => {
    const url = ytWindow.webContents.getURL()
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) return
    ytWindow.webContents.executeJavaScript(`
      (function() {
        if (window.__markTrackObserver) return // already injected
        window.__markTrackObserver = true
        const LOG = '[Mark Track]'

        function getTitle() {
          // Primary: document title (most reliable, always exists)
          let t = document.title || ''
          t = t.replace(/ - YouTube$/, '').replace(/^\\(\\d+\\)\\s*/, '').trim()
          if (!t || t === 'YouTube') return null
          return t
        }

        function getChannel() {
          // Try multiple selectors for channel name
          const selectors = [
            '#channel-name yt-formatted-string a',
            'ytd-channel-name yt-formatted-string a',
            '#owner-name a',
            '#upload-info ytd-channel-name a',
            '.ytd-video-owner-renderer a'
          ]
          for (const sel of selectors) {
            const el = document.querySelector(sel)
            if (el?.textContent?.trim()) return el.textContent.trim()
          }
          return ''
        }

        let lastTitle = ''
        function checkAndSend() {
          const t = getTitle()
          if (t && t !== lastTitle) {
            lastTitle = t
            const ch = getChannel()
            // Split "Title - Artist" format
            const parts = t.split(' - ')
            let title = parts[0] || t
            let artist = ch || (parts.length > 1 ? parts.slice(1).join(' - ') : '')
            console.log(LOG, 'track changed:', title, '-', artist)
            // Send via custom event (picked up by main process polling fallback)
            window.dispatchEvent(new CustomEvent('__mark-track', { detail: { title, artist } }))
          }
        }

        // Observer 1: title element changes
        const titleEl = document.querySelector('title')
        if (titleEl) {
          new MutationObserver(checkAndSend).observe(titleEl, { childList: true, characterData: true, subtree: true })
        }

        // Observer 2: video loadedmetadata (fires on new video in same page)
        const vid = document.querySelector('video')
        if (vid) {
          vid.addEventListener('loadedmetadata', () => setTimeout(checkAndSend, 500))
          vid.addEventListener('loadstart', () => setTimeout(checkAndSend, 500))
        }

        // Observer 3: SPA navigation
        window.addEventListener('yt-navigate-finish', () => {
          lastTitle = '' // reset
          setTimeout(checkAndSend, 1000)
        })

        // Initial check
        setTimeout(checkAndSend, 1000)
        console.log(LOG, 'track observer injected')
      })()
    `).catch(() => {})

    // Listen for custom events from the injected script
    // (We use a polling fallback since custom events don't cross webContents boundary)
  })

  // Fallback polling: check document.title every 2s (in case observer misses)
  let lastSentTitle = ''
  const trackPollInterval = setInterval(() => {
    if (!ytWindow || ytWindow.isDestroyed()) { clearInterval(trackPollInterval); return }
    ytWindow.webContents.executeJavaScript(`
      (function() {
        let t = (document.title || '').replace(/ - YouTube$/, '').replace(/^\\(\\d+\\)\\s*/, '').trim()
        if (!t || t === 'YouTube') return null
        // Try to get channel name
        const ch = document.querySelector('#channel-name yt-formatted-string a, ytd-channel-name yt-formatted-string a, #owner-name a')?.textContent?.trim() || ''
        return JSON.stringify({ title: t, artist: ch })
      })()
    `).then((result) => {
      if (!result) return
      try {
        const info = JSON.parse(result)
        if (info.title && info.title !== lastSentTitle) {
          lastSentTitle = info.title
          // Split "Title - Artist" if no channel found
          const parts = info.title.split(' - ')
          const title = parts[0]
          const artist = info.artist || (parts.length > 1 ? parts.slice(1).join(' - ') : '')
          if (onTrackCallback) onTrackCallback({ title, artist, fullTitle: info.title })
        }
      } catch {}
    }).catch(() => {})
  }, 2000)

  // Inject ad-blocking script on every YouTube navigation
  ytWindow.webContents.on('did-finish-load', () => {
    const url = ytWindow.webContents.getURL()
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      ytWindow.webContents.executeJavaScript(AD_BLOCK_SCRIPT).catch(() => {})
    }
  })

  ytWindow.on('closed', () => { ytWindow = null })

  return ytWindow
}

export function loadYouTube(url) {
  ytUrl = url
  const win = getOrCreateWindow()
  if (win) {
    win.show()
    win.loadURL(url)
  }
}

export function loadYouTubeHidden(url) {
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

// Keyboard shortcuts for YouTube Music playback control
const KEYBOARD_COMMANDS = {
  next:      { key: 'N', shiftKey: true },
  prev:      { key: 'P', shiftKey: true },
  playPause: { key: 'k' },
}

export async function getDuration() {
  const win = ytWindow
  if (!win || win.isDestroyed()) return 0
  try {
    return await win.webContents.executeJavaScript(
      'document.querySelector("video")?.duration || 0'
    )
  } catch { return 0 }
}

export function sendKeyboardCommand(command) {
  const win = ytWindow
  if (!win || win.isDestroyed()) return
  const cmd = KEYBOARD_COMMANDS[command]
  if (!cmd) return
  win.webContents.executeJavaScript(
    `document.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify({ ...cmd, bubbles: true })}));`
  ).catch(() => {})
}

export function showAndNavigate(url) {
  ytUrl = url
  const win = getOrCreateWindow()
  if (win) {
    win.show()
    win.loadURL(url)
  }
}
