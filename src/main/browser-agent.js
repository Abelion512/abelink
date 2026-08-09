import { BrowserWindow, app, screen, session } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { DOM_PARSER_SCRIPT } from './browser-dom-parser.js'

// Anti-bot: Sec-CH-UA client hints claim "Chrome", bukan "Electron" (default).
// Scope partition mark-browser SAJA — defaultSession (main window + API traffic) tak tersentuh.
// session.fromPartition hanya valid setelah app.whenReady() → defer ke app ready.
function initMarkSession() {
  const markSession = session.fromPartition('persist:mark-browser')
  markSession.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
    details.requestHeaders['Sec-CH-UA'] =
      `"Chromium";v="${process.versions.chrome}", "Google Chrome";v="${process.versions.chrome}", "Not.A/Brand";v="99"`
    details.requestHeaders['Sec-CH-UA-Mobile'] = '?0'
    details.requestHeaders['Sec-CH-UA-Platform'] = '"Linux"'
    callback({ requestHeaders: details.requestHeaders })
  })
}

app.whenReady().then(initMarkSession)

let browserWindow = null
let activeAskUser = false
let activeAskUserMessage = ''
let globalAskUserResolve = null
let isForceClosing = false
let appIsQuiting = false

app.on('before-quit', () => { appIsQuiting = true })

let tikTokCookiesImported = false

// Import TikTok session cookies exported from the real Chrome profile
// (~/.tiktok-linkedin/tiktok-cookies.json, via tiktok-pipeline/export_tiktok_cookies.py).
// Electron's TLS/JA4 fingerprint is NOT spoofable via userAgent — TikTok's
// QR flow flags every Electron session, so we bypass login entirely by
// transplanting a real Chrome login (sessionid/sid_tt...) into the partition.
async function importTikTokCookies(win) {
  if (tikTokCookiesImported) return 0
  tikTokCookiesImported = true
  const p = path.join(os.homedir(), '.tiktok-linkedin', 'tiktok-cookies.json')
  if (!fs.existsSync(p)) return 0
  const ses = win.webContents.session
  try {
    const existing = await ses.cookies.get({ name: 'sessionid', domain: '.tiktok.com' })
    if (existing.some((c) => c.value && c.value.length > 5)) {
      console.log('[CookieImport] session already present, skip')
      return 0
    }
  } catch {}
  let cookies = []
  try {
    cookies = JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (e) {
    console.warn('[CookieImport] parse failed:', e.message)
    return 0
  }
  let n = 0
  for (const c of cookies) {
    if (!c.domain || !c.domain.includes('tiktok.com')) continue
    try {
      const host = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain
      const setOpts = {
        url: `https://${host}${c.path || '/'}`,
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        secure: !!c.secure,
        httpOnly: !!c.httpOnly,
        sameSite: c.sameSite || 'no_restriction'
      }
      if (c.expirationDate) setOpts.expirationDate = c.expirationDate
      await ses.cookies.set(setOpts)
      n++
    } catch (e) {
      console.warn('[CookieImport] skip', c.name, e.message)
    }
  }
  console.log(`[CookieImport] imported ${n}/${cookies.length} tiktok cookies`)
  return n
}

export async function navigateTo(url) {
  // Sudah ada window? (re-navigasi, mis. setelah user selesai unblock/login)
  // First-open tidak boleh di-hide setelah show — semi-visible mode harus terlihat.
  const wasExisting = browserWindow && !browserWindow.isDestroyed()
  if (!browserWindow || browserWindow.isDestroyed()) {
    browserWindow = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      title: 'Mark Browser',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition: 'persist:mark-browser'
      }
    })

    // === SEMI-VISIBLE MODE ===
    // Browser automation berjalan di mini-window (pojok kanan bawah, selalu di atas)
    // sehingga user bisa melihat apa yang Mark lakukan. Klik window → expand penuh.
    const { workArea } = screen.getPrimaryDisplay()
    browserWindow.setBounds({
      x: workArea.x + workArea.width - 440,
      y: workArea.y + workArea.height - 320,
      width: 420,
      height: 300
    })
    browserWindow.setAlwaysOnTop(true)
    browserWindow.setSkipTaskbar(false)
    browserWindow.once('focus', () => {
      // Klik user → tampilkan penuh (1280x800), lepas always-on-top
      if (!browserWindow.isDestroyed()) {
        browserWindow.setBounds({ x: 0, y: 0, width: 1280, height: 800 })
        browserWindow.setAlwaysOnTop(false)
      }
    })
    browserWindow.show()
    // JANGAN focus() di sini — focus event dipakai sebagai trigger "klik user → expand".
    // AI automation berjalan via executeJavaScript, tidak butuh focus window.
    // --- normal setup lanjut di bawah ---

    browserWindow.webContents.setMaxListeners(50)

    // === CHROME UA SPOOFING (dynamic: match real Chromium engine version) ===
    // 2026-08-04 fix: hardcoded Chrome/130 (Oct 2024) vs Electron 39 (Chromium ~142)
    // = UA/UA-CH mismatch detected by TikTok/Google as automation. Build from process.versions.chrome.
    const originalUA = browserWindow.webContents.userAgent
    const chromeVersion = process.versions.chrome // e.g. "142.0.8982.0"
    const chromeMajor = chromeVersion.split('.')[0]
    const chromeUA = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`
    browserWindow.webContents.userAgent = chromeUA

    // UA Client Hints must match the UA string. webContents.userAgent override does NOT
    // rewrite Sec-CH-UA* — do it here so the header and navigator.userAgentData agree.
    browserWindow.webContents.session.webRequest.onBeforeSendHeaders((details, cb) => {
      // Trusted login: keep real Electron UA + native CH for Google (unchanged behavior)
      if (details.url.startsWith('https://accounts.google.com')) {
        details.requestHeaders['User-Agent'] = originalUA
        cb({ requestHeaders: details.requestHeaders })
        return
      }
      details.requestHeaders['sec-ch-ua'] = `"Not/A)Brand";v="24", "Chromium";v="${chromeMajor}", "Google Chrome";v="${chromeMajor}"`
      details.requestHeaders['sec-ch-ua-mobile'] = '?0'
      details.requestHeaders['sec-ch-ua-platform'] = '"Linux"'
      details.requestHeaders['sec-ch-ua-full-version-list'] = `"Not/A)Brand";v="24.0.0.0", "Chromium";v="${chromeVersion}", "Google Chrome";v="${chromeVersion}"`
      cb({ requestHeaders: details.requestHeaders })
    })

    // Remove CSP
    browserWindow.webContents.session.webRequest.onHeadersReceived((details, cb) => {
      if (details.responseHeaders) {
        delete details.responseHeaders['content-security-policy']
        delete details.responseHeaders['Content-Security-Policy']
        delete details.responseHeaders['content-security-policy-report-only']
      }
      cb({ responseHeaders: details.responseHeaders })
    })

    // Handle OAuth popups
    browserWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (browserWindow && !browserWindow.isDestroyed()) {
        browserWindow.loadURL(url) // Paksa buka di window yang sama
      }
      return { action: 'deny' } // Tolak pembuatan window baru
    })

    // Inject anti-fingerprint on EVERY new document BEFORE page scripts run.
    // CDP Page.addScriptToEvaluateOnNewDocument is the only early main-world hook:
    // a preload script runs in an isolated world under contextIsolation, so window
    // patches there are invisible to page JS. Late executeJavaScript (did-start-
    // navigation/dom-ready) lets site detection JS sample the real values first.
    const antiFingerprintScript = `
      try {
        Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
        if (navigator.__proto__) delete navigator.__proto__.webdriver;
        if (!window.chrome) window.chrome = {};
        window.chrome.runtime = window.chrome.runtime || { connect: function(){}, sendMessage: function(){} };
        window.chrome.loadTimes = function(){};
        window.chrome.csi = function(){};
        Object.defineProperty(navigator, 'platform', { get: () => 'Linux x86_64', configurable: true });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8, configurable: true });
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8, configurable: true });
        // Keep JS-side UA-CH consistent with the rewritten Sec-CH-UA header
        if (navigator.userAgentData) {
          Object.defineProperty(navigator, 'userAgentData', {
            get: () => ({
              brands: [
                { brand: 'Not/A)Brand', version: '24' },
                { brand: 'Chromium', version: '${chromeMajor}' },
                { brand: 'Google Chrome', version: '${chromeMajor}' }
              ],
              mobile: false,
              platform: 'Linux',
              getHighEntropyValues: () => Promise.resolve({
                architecture: 'x86',
                bitness: '64',
                brandVersionList: [
                  { brand: 'Not/A)Brand', version: '24.0.0.0' },
                  { brand: 'Chromium', version: '${chromeVersion}' },
                  { brand: 'Google Chrome', version: '${chromeVersion}' }
                ],
                fullVersionList: [
                  { brand: 'Not/A)Brand', version: '24.0.0.0' },
                  { brand: 'Chromium', version: '${chromeVersion}' },
                  { brand: 'Google Chrome', version: '${chromeVersion}' }
                ],
                mobile: false,
                model: '',
                platform: 'Linux',
                platformVersion: '',
                uaFullVersion: '${chromeVersion}'
              }),
              toJSON: () => ({
                brands: [
                  { brand: 'Not/A)Brand', version: '24' },
                  { brand: 'Chromium', version: '${chromeMajor}' },
                  { brand: 'Google Chrome', version: '${chromeMajor}' }
                ],
                mobile: false,
                platform: 'Linux'
              })
            }),
            configurable: true
          })
        }
      } catch(e) {}
    `

    // CDP early injection (primary). Fallback: late executeJavaScript if CDP is unavailable.
    // NOTE: Page.* CDP commands HANG until the renderer commits its first navigation
    // (no target exists pre-commit). We prime with about:blank so the awaits below
    // resolve fast — otherwise this block would deadlock before loadURL(url) below.
    let cdpInjected = false
    try {
      await browserWindow.loadURL('about:blank')
      const dbg = browserWindow.webContents.debugger
      if (!dbg.isAttached()) dbg.attach('1.3')
      await dbg.sendCommand('Page.enable')
      await dbg.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: antiFingerprintScript })
      cdpInjected = true
    } catch (e) {
      console.warn('[Browser] CDP fingerprint injection failed, fallback to late injection:', e.message)
    }
    if (!cdpInjected) {
      browserWindow.webContents.on('did-start-navigation', () => {
        browserWindow.webContents.executeJavaScript(antiFingerprintScript).catch(() => {})
      })
      browserWindow.webContents.on('dom-ready', () => {
        browserWindow.webContents.executeJavaScript(antiFingerprintScript).catch(() => {})
      })
    }

    browserWindow.on('close', (event) => {
      if (!isForceClosing && !appIsQuiting) {
        event.preventDefault()

        if (globalAskUserResolve) {
          globalAskUserResolve('User aborted the action by hiding the browser.')
          globalAskUserResolve = null
          activeAskUser = false
          activeAskUserMessage = ''
        }

        // Ambil screenshot super cepat sebelum hide agar hologram bisa muncul
        browserWindow.webContents
          .capturePage()
          .then((image) => {
            const thumbnail = image.resize({ width: 800 }).toDataURL()
            const url = browserWindow.webContents.getURL()
            const title = browserWindow.getTitle()

            browserWindow.hide() // Hide setelah screenshot dapet

            BrowserWindow.getAllWindows().forEach((win) => {
              if (win !== browserWindow && !win.isDestroyed()) {
                win.webContents.send('browser:preview', { url, title, thumbnail })
              }
            })
          })
          .catch((e) => {
            console.error('Gagal capturePage saat close:', e)
            browserWindow.hide()
          })
      }
    })

    browserWindow.on('closed', () => {
      browserWindow = null
      // Clear BrowserPreviewWidget di renderer — thumbnail stale jika gak di-clear
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('browser:preview', null)
        }
      })
    })

    browserWindow.webContents.on('did-finish-load', () => {
      // JANGAN show() di sini — browser hanya visible saat unblock (browser-ask-user)
      if (activeAskUser && !browserWindow.isDestroyed()) {
        executeAction({ action: 'unblock', value: activeAskUserMessage, isReinject: true }).catch(
          () => null
        )
      }
    })

    // === TRACK POLLING — catches title changes that page-title-updated misses ===
    let lastKnownTitle = ''
    let trackPollingInterval = null

    browserWindow.webContents.once('did-finish-load', () => {
      trackPollingInterval = setInterval(async () => {
        try {
          if (browserWindow.isDestroyed()) {
            clearInterval(trackPollingInterval)
            return
          }
          const title = await browserWindow.webContents.executeJavaScript('document.title')
          if (title && title !== lastKnownTitle && title.includes(' - YouTube')) {
            lastKnownTitle = title
            const raw = title.replace(/ - YouTube( Music)?$/, '')
            const parts = raw.split(' - ')
            const trackInfo = parts.length >= 2
              ? { title: parts[0], artist: parts.slice(1).join(' - '), fullTitle: title }
              : { title: raw, artist: 'Unknown', fullTitle: title }
            BrowserWindow.getAllWindows().forEach(win => {
              if (!win.isDestroyed() && win.webContents) {
                win.webContents.send('yt:track-updated', trackInfo)
              }
            })
          }
        } catch (e) { /* ignore polling errors */ }
      }, 2000)
    })

    browserWindow.on('closed', () => {
      if (trackPollingInterval) clearInterval(trackPollingInterval)
    })

    browserWindow.on('page-title-updated', async (event, title) => {
      // === YouTube track info detection ===
      // When YouTube plays, title = "Song Name - Artist - YouTube"
      // Send to all BrowserWindows so renderer can update track card
      if (title && title.includes(' - YouTube')) {
        const raw = title.replace(/ - YouTube( Music)?$/, '')
        const parts = raw.split(' - ')
        const trackInfo = parts.length >= 2
          ? { title: parts[0], artist: parts.slice(1).join(' - '), fullTitle: title }
          : { title: raw, artist: 'Unknown', fullTitle: title }
        BrowserWindow.getAllWindows().forEach(win => {
          if (!win.isDestroyed() && win.webContents) {
            win.webContents.send('yt:track-updated', trackInfo)
          }
        })
      }

      // === MARK_UNBLOCK_DONE handler ===
      if (title.startsWith('MARK_UNBLOCK_DONE:') && globalAskUserResolve) {
        event.preventDefault() // prevent actual title change if possible
        const comment = title.substring(18) // remove 'MARK_UNBLOCK_DONE:'
        globalAskUserResolve(comment)
        globalAskUserResolve = null
        activeAskUser = false
        activeAskUserMessage = ''

        // Biarkan browser visible setelah user Resume — user perlu lihat hasil login
        // Sembunyikan blocker overlay supaya user bisa lihat halaman
        if (!browserWindow.isDestroyed()) {
          browserWindow.webContents
            .executeJavaScript(
              `
              const b = document.getElementById('mark-user-blocker');
              if (b) b.remove();
            `
            )
            .catch(() => {})
        }
      }
    })

    browserWindow.webContents.on('did-navigate', () => {
      // Don't show automatically on navigate anymore
    })
  }

  // Sembunyikan browser kalau visible (user baru selesai login via unblock)
  // Biarkan user lihat hasilnya sebentar sebelum agent navigasi lagi.
  // HANYA re-navigasi: first-open harus tetap visible (semi-visible mode).
  if (wasExisting && browserWindow.isVisible()) {
    browserWindow.hide()
  }

  if (browserWindow.webContents.isLoading()) {
    browserWindow.webContents.stop()
  }

  let loadResolved = false
  let loadSucceeded = false
  let loadTimerId

  const loadPromise = new Promise((resolve) => {
    const done = () => {
      loadResolved = true
      clearTimeout(loadTimerId)
      resolve()
    }
    browserWindow.webContents.once('did-finish-load', () => {
      loadSucceeded = true
      done()
    })
    browserWindow.webContents.once('did-fail-load', (_event, code, desc) => {
      console.warn(`[Browser] did-fail-load: ${code} ${desc}`)
      done()
    })
  })

  const timeoutPromise = new Promise((resolve) => {
    loadTimerId = setTimeout(() => {
      if (!loadResolved) {
        console.warn('[Browser] loadURL timed out, stopping...')
        if (!browserWindow.isDestroyed()) {
          browserWindow.webContents.stop()
        }
        resolve()
      }
    }, 60000)
  })

  // Transplant real-Chrome TikTok session before navigating (bypass QR/bot detection)
  await importTikTokCookies(browserWindow)

  await browserWindow.loadURL(url)
  await Promise.race([loadPromise, timeoutPromise])

  // Adaptive SPA wait — check DOM readiness every 500ms (max 3s)
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 500))
    try {
      const ready = await browserWindow.webContents.executeJavaScript(
        'document.readyState === "complete"'
      ).catch(() => false)
      if (ready) break
    } catch { break }
  }

  // Auto-scan DOM setelah navigate
  return await readDOM()
}

export async function closeBrowser() {
  if (browserWindow && !browserWindow.isDestroyed()) {
    isForceClosing = true
    browserWindow.close()
    browserWindow = null
    isForceClosing = false
    activeAskUser = false
    activeAskUserMessage = ''
    if (globalAskUserResolve) {
      globalAskUserResolve('User aborted the action by closing the browser.')
      globalAskUserResolve = null
    }

    // Kirim null ke frontend biar hologramnya ikutan hilang
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('browser:preview', null)
      }
    })

    return 'Browser berhasil ditutup.'
  }
  return 'Browser memang sudah dalam keadaan tertutup.'
}

export async function readDOM() {
  if (!browserWindow || browserWindow.isDestroyed()) {
    return '[ERROR] Browser belum dibuka. Gunakan browser-navigate dulu.'
  }

  // Halaman bisa pindah/refresh di tengah scan (SPA) → konteks hancur → jangan reject
  const result = await browserWindow.webContents
    .executeJavaScript(DOM_PARSER_SCRIPT)
    .catch(() => '[ERROR] DOM scan gagal — halaman berpindah/context destroyed. Coba browser-navigate ulang.')

  // Capture page & send to renderer for HoloCard Preview
  try {
    const image = await browserWindow.webContents.capturePage()
    const thumbnail = image.resize({ width: 800 }).toDataURL() // Resize biar enteng
    const url = browserWindow.webContents.getURL()
    const title = browserWindow.getTitle()
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win !== browserWindow && !win.isDestroyed()) {
        win.webContents.send('browser:preview', { url, title, thumbnail })
      }
    })
  } catch (e) {
    console.error('Failed to capture browser preview:', e)
  }

  return result
}

export function showBrowser() {
  if (browserWindow && !browserWindow.isDestroyed()) {
    if (browserWindow.isMinimized()) browserWindow.restore()
    browserWindow.show()
    browserWindow.focus()
    browserWindow.setAlwaysOnTop(true)
    browserWindow.setAlwaysOnTop(false)
  } else {
    // Window gak ada — clear stale preview di renderer
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('browser:preview', null)
      }
    })
  }
}
export async function executeAction(data) {
  if (!browserWindow || browserWindow.isDestroyed()) {
    return '[ERROR] Browser belum dibuka.'
  }

  const { action, id, value, direction } = data

  if (action === 'click') {
    try {
      await browserWindow.webContents.executeJavaScript(
        `(() => {
          const el = document.querySelector('[data-mark-id="${id}"]');
          if (!el) return 'Elemen dengan ID ${id} tidak ditemukan.';
          
          // Scroll secara instan agar getBoundingClientRect langsung akurat!
          el.scrollIntoView({ behavior: 'instant', block: 'center' });

          // === ANIMASI CURSOR MARK ===
          // 1. Inject CSS (sekali saja)
          if (!document.getElementById('mark-cursor-style')) {
            const style = document.createElement('style');
            style.id = 'mark-cursor-style';
            style.textContent = \`
              #mark-cursor {
                position: fixed;
                width: 24px;
                height: 24px;
                pointer-events: none;
                z-index: 2147483647;
                transition: left 0.5s cubic-bezier(0.22, 1, 0.36, 1), 
                            top 0.5s cubic-bezier(0.22, 1, 0.36, 1);
                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
              }
              #mark-cursor svg {
                width: 100%;
                height: 100%;
              }
              .mark-click-ripple {
                position: fixed;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: rgba(56, 189, 248, 0.4);
                border: 2px solid rgba(56, 189, 248, 0.8);
                pointer-events: none;
                z-index: 999998;
                animation: mark-ripple 0.6s ease-out forwards;
              }
              @keyframes mark-ripple {
                0% { transform: scale(0.5); opacity: 1; }
                100% { transform: scale(3); opacity: 0; }
              }
            \`;
            document.head.appendChild(style);
          }

          // 2. Buat/pindahkan cursor ke posisi elemen
          let cursor = document.getElementById('mark-cursor');
          if (!cursor) {
            cursor = document.createElement('div');
            cursor.id = 'mark-cursor';
            // SVG cursor pointer (warna biru Mark)
            cursor.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M5 3l14 8-6 2-4 6-4-16z" fill="#19362d" stroke="#1fb854" stroke-width="1.5" stroke-linejoin="round"/></svg>';
            cursor.style.left = '50%';
            cursor.style.top = '50%';
            document.body.appendChild(cursor);
          }
          cursor.style.display = 'block';

          const rect = el.getBoundingClientRect();
          const targetX = rect.left + rect.width / 2;
          const targetY = rect.top + rect.height / 2;

          // Pindahkan cursor ke target (animasi smooth via CSS transition)
          cursor.style.left = targetX + 'px';
          cursor.style.top = targetY + 'px';

          // 3. Setelah cursor sampai (500ms), klik + ripple
          return new Promise(resolve => {
            setTimeout(() => {
              // Spawn ripple
              const ripple = document.createElement('div');
              ripple.className = 'mark-click-ripple';
              ripple.style.left = (targetX - 10) + 'px';
              ripple.style.top = (targetY - 10) + 'px';
              document.body.appendChild(ripple);
              setTimeout(() => ripple.remove(), 600);

              // Klik!
              el.click();

              // Sembunyikan cursor setelah 1 detik
              setTimeout(() => { cursor.style.display = 'none'; }, 1000);

              resolve('Berhasil klik elemen ${id}.');
            }, 550); // Tunggu animasi cursor selesai
          });
        })()`
      )
    } catch (e) {
      // Jika error "Execution context was destroyed", berarti halamannya pindah/refresh karena klik.
      // Kita ignore errornya dan biarkan script lanjut untuk readDOM()
      if (!e.message.includes('destroyed')) throw e
    }
    // Tunggu efek klik (navigasi halaman / SPA update) + durasi animasi
    await new Promise((resolve) => setTimeout(resolve, 2500))
    // Auto-scan ulang DOM setelah klik
    return await readDOM()
  }

  if (action === 'type') {
    try {
      await browserWindow.webContents.executeJavaScript(
        `(() => {
          const el = document.querySelector('[data-mark-id="${id}"]');
          if (!el) return 'Elemen dengan ID ${id} tidak ditemukan.';
          el.scrollIntoView({ behavior: 'instant', block: 'center' });
          el.focus();

          const text = '${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}';
          
          // Strategy 1: Native prototype setter (React controlled components)
          const proto = el.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
          const nativeValueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (nativeValueSetter) {
            nativeValueSetter.call(el, text);
          } else {
            el.value = text;
          }

          // Fire full event chain agar framework modern (React 18+, Next.js) mendeteksi
          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
          el.dispatchEvent(new Event('change', { bubbles: true }));

          // Strategy 2: Fallback execCommand untuk textarea yang sangat strict
          if (!el.value || el.value !== text) {
            el.value = '';
            el.focus();
            document.execCommand('insertText', false, text);
          }

          return 'Berhasil ketik di elemen ${id}.';
        })()`
      )
    } catch (e) {
      if (!e.message.includes('destroyed')) throw e
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
    return await readDOM()
  }

  if (action === 'scroll') {
    const scrollAmount = direction === 'up' ? -600 : 600
    await browserWindow.webContents
      .executeJavaScript(`window.scrollBy({ top: ${scrollAmount}, behavior: 'smooth' })`)
      .catch(() => {}) // scroll gagal (context destroyed) → lanjut, readDOM akan kasih laporan
    await new Promise((resolve) => setTimeout(resolve, 1000))
    return await readDOM()
  }

  if (action === 'unblock') {
    if (!browserWindow.isDestroyed()) {
      browserWindow.show()
      browserWindow.focus()
    }
    try {
      const isReinject = data.isReinject
      if (!isReinject) {
        activeAskUser = true
        activeAskUserMessage = value
          ? value.replace(/'/g, "\\'").replace(/\n/g, '<br>')
          : 'Please complete the required manual action...'
      }
      const aiMessage = JSON.stringify(activeAskUserMessage)

      await browserWindow.webContents.executeJavaScript(
        `(() => {
          let blocker = document.getElementById('mark-user-blocker');
          if (!blocker) {
            blocker = document.createElement('div');
            blocker.id = 'mark-user-blocker';
            document.body.appendChild(blocker);
          }
          blocker.style.position = 'fixed';
          blocker.style.zIndex = '2147483647';
          blocker.style.width = 'auto';
          blocker.style.height = 'auto';
          blocker.style.bottom = '24px';
          blocker.style.right = '24px';
          blocker.style.top = 'auto';
          blocker.style.left = 'auto';
          blocker.style.background = 'transparent';
          blocker.style.pointerEvents = 'none';

          blocker.innerHTML = \`
            <div style="background: rgba(25, 54, 45, 0.95); backdrop-filter: blur(12px); padding: 20px; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); display: flex; flex-direction: column; gap: 16px; pointer-events: auto; font-family: system-ui, sans-serif; width: 340px; border: 1px solid rgba(31, 184, 84, 0.3);">
              <div style="display: flex; align-items: center; gap: 12px;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1fb854" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                  <path d="M2 17l10 5 10-5"></path>
                  <path d="M2 12l10 5 10-5"></path>
                </svg>
                <div style="font-weight: 600; color: #f8fafc; font-size: 15px; letter-spacing: 0.5px;">Mark paused for input</div>
              </div>
<div id="mark-ai-message" style="font-size: 13px; color: #94a3b8; line-height: 1.5; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px; border-left: 3px solid rgba(31, 184, 84, 0.35);">
                ${aiMessage}
              </div>
              <input type="text" id="mark-user-input" placeholder="Add a comment for Mark (optional)..." style="background: rgba(15, 23, 42, 0.6); color: #f8fafc; padding: 12px 14px; border: 1px solid rgba(31, 184, 84, 0.4); border-radius: 8px; font-size: 13px; outline: none; transition: all 0.2s;" onfocus="this.style.borderColor='#1fb854'; this.style.boxShadow='0 0 0 2px rgba(31, 184, 84, 0.2)';" onblur="this.style.borderColor='rgba(31, 184, 84, 0.4)'; this.style.boxShadow='none';"/>
              <button id="mark-btn-selesai" style="background: #1fb854; color: #0f172a; padding: 12px; border: none; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='#22c55e'; this.style.transform='translateY(-1px)';" onmouseout="this.style.background='#1fb854'; this.style.transform='translateY(0)';">
                Resume Automation
              </button>
            </div>
          \`;
          document.getElementById('mark-ai-message').textContent = ${aiMessage};

          document.getElementById('mark-btn-selesai').onclick = () => {
            const comment = document.getElementById('mark-user-input').value;
            const originalTitle = document.title;
            document.title = 'MARK_UNBLOCK_DONE:' + (comment.trim() || 'User telah menyelesaikan aksi manual (tidak ada komentar).');
            setTimeout(() => { document.title = originalTitle; }, 100);
          };

          document.getElementById('mark-user-input').addEventListener('keypress', function (e) {
              if (e.key === 'Enter') document.getElementById('mark-btn-selesai').click();
          });

        })()`
      )

      if (isReinject) return 'reinjected'

      return new Promise((resolve) => {
        globalAskUserResolve = async (comment) => {
          // Auto-scan ulang DOM setelah unblock supaya AI tau state halaman setelah user interaksi
          const newDOM = await readDOM()
          resolve(`[LAPORAN USER]: ${comment}\n\n[DOM TERBARU SETELAH USER INTERAKSI]:\n${newDOM}`)
        }
      })
    } catch (e) {
      return `[ERROR] Gagal menunggu respon user: ${e.message}`
    }
  }

  if (action === 'finish') {
    await browserWindow.webContents
      .executeJavaScript(
        `(() => {
        const blocker = document.getElementById('mark-user-blocker');
        if (blocker) blocker.remove();
        const style = document.getElementById('mark-blocker-style');
        if (style) style.remove();
      })()`
      )
      .catch(() => {})
    return 'Browser unlocked.'
  }

  return '[ERROR] Action tidak dikenal.'
}
