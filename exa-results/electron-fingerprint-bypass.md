# Electron Browser Fingerprint Detection & Bypass Research

> Techniques for Google/YouTube anti-automation detection and bypass, specifically for Electron/webview-based browsers.

## 1. navigator.webdriver Detection

### How Google Detects It

Chrome exposes `navigator.webdriver` as a property on the `navigator` prototype. In normal Chrome:
- **Chrome 88+**: `navigator.webdriver` is `false`
- **Chrome 89+**: Property is still present but set to `false`
- **Headless/automated**: Set to `true` (or the `--enable-automation` flag is present)

Google checks this via JavaScript like:

```js
if (navigator.webdriver) { /* block */ }
// Or more subtly:
if (Object.getOwnPropertyDescriptor(Navigator.prototype, 'webdriver')) { /* check value */ }
```

### Bypass — puppeteer-extra-stealth navigator.webdriver evasion

```js
// Post Chrome 89.0.4339.0 — property already false, nothing needed
// Pre Chrome 88.0.4291.0 — delete from prototype
delete Object.getPrototypeOf(navigator).webdriver
```

**Critical**: The `--disable-blink-features=AutomationControlled` flag must also be passed:

```js
// In puppeteer-extra-stealth beforeLaunch:
options.args.push('--disable-blink-features=AutomationControlled');
```

Without this flag, Chrome still exposes automation-controlled behavior even if `navigator.webdriver` is patched client-side.

### For Electron

Electron by default does NOT set `navigator.webdriver` (it's `undefined`). This is actually closer to normal Chrome behavior than Puppeteer's default. However, Electron may still be detectable through other means (see below).

```js
// In Electron main process, you can explicitly set:
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
```

---

## 2. Chrome Headless Detection — All Vectors

Test page: https://bot.sannysoft.com/ (standard benchmark)

| Detection Vector | Normal Chrome | Headless Chrome | Bypass Method |
|---|---|---|---|
| `navigator.userAgent` | `Mozilla/5.0 ... Chrome/XXX` | Contains `HeadlessChrome` | Override UA string, strip "Headless" |
| `navigator.webdriver` | `false` or `undefined` | `true` | Delete from prototype + `--disable-blink-features=AutomationControlled` |
| `window.chrome.runtime` | Full object | `undefined` | Mock `chrome.runtime` with static data + proxy for `sendMessage`/`connect` |
| `window.chrome.app` | `{isInstalled: false, ...}` | `undefined` | Mock `chrome.app` with static data |
| `window.chrome.csi` | Function returning timing | `undefined` | Mock using `performance.timing` |
| `window.chrome.loadTimes` | Function returning timing | `undefined` | Mock using `performance` + `PerformancePaintTiming` |
| `navigator.plugins` | Array with entries | Empty array `[]` | Generate full PluginArray + MimeTypeArray with cross-references |
| `navigator.mimeTypes` | Array with entries | Empty array `[]` | Same mock as plugins |
| `navigator.languages` | `['en-US', 'en']` | `['en-US']` | Override getter with `Object.freeze([...languages])` |
| `navigator.hardwareConcurrency` | Usually 4-16 | 2 (default) | Override getter with realistic value (default: 4) |
| `navigator.permissions` | `Notification.permission = 'default'` on HTTPS | `'denied'` | Replace getter with `'default'` on secure origins |
| WebGL `getParameter(37445)` | `'Intel Inc.'` | `'Google Inc.'` | Proxy `WebGLRenderingContext.prototype.getParameter` |
| WebGL `getParameter(37446)` | `'Intel Iris OpenGL Engine'` | `'Google SwiftShader'` | Same proxy, return realistic values |
| `window.outerWidth`/`outerHeight` | Window dimensions | `undefined` | Set via `evaluateOnNewDocument` |
| `HTMLMediaElement.canPlayType` | `'probably'` for `avc1.42E01E` | `''` (empty) | Proxy `canPlayType`, return `'probably'` for known codecs |
| `sourceURL` in evaluated scripts | Not present | `//# sourceURL=__puppeteer_evaluation_script__` | Strip via CDP interception |
| `iframe.contentWindow.chrome` | Accessible | `undefined` (Chromium bug) | Proxy `contentWindow`, intercept `srcdoc` creation |
| `--enable-automation` flag | Not present | Present in `navigator` and browser args | Strip via `defaultArgs` evasion |

---

## 3. puppeteer-extra-plugin-stealth Techniques

Source: https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth

### Full Evasion List (17 evasions)

| Evasion | What It Patches | Detection Vector Addressed |
|---|---|---|
| `chrome.app` | `window.chrome.app` object | Missing `chrome.app` in headless |
| `chrome.csi` | `window.chrome.csi` function | Missing Chrome-specific timing API |
| `chrome.loadTimes` | `window.chrome.loadTimes` function | Missing Chrome-specific load timing |
| `chrome.runtime` | `window.chrome.runtime` + `sendMessage`/`connect` mocks | `chrome.runtime` only exists on secure origins in headless |
| `defaultArgs` | Strips `--disable-extensions`, `--disable-default-apps`, `--disable-component-extensions-with-background-pages` | Tell-tale launch flags |
| `iframe.contentWindow` | Proxies `iframe.contentWindow`, intercepts `srcdoc` creation | `HEADCHR_IFRAME` detection via `iframe.contentWindow.chrome` |
| `media.codecs` | Proxies `HTMLMediaElement.prototype.canPlayType` | Missing proprietary codec support in Chromium |
| `navigator.hardwareConcurrency` | Overrides `navigator.hardwareConcurrency` getter | Default 2 in headless vs typical 4+ |
| `navigator.languages` | Overrides `navigator.languages` getter | Default array differs |
| `navigator.permissions` | Overrides `Notification.permission`, `Permissions.prototype.query` | Wrong permission states in headless |
| `navigator.plugins` | Generates full `PluginArray` + `MimeTypeArray` | Empty plugins/mimeTypes in headless |
| `navigator.webdriver` | Deletes `navigator.webdriver` from prototype + `--disable-blink-features=AutomationControlled` | `webdriver=true` in headless |
| `sourceurl` | Strips `//# sourceURL=__puppeteer_evaluation_script__` from CDP evaluations | Identifies puppeteer via stack traces |
| `user-agent-override` | Sets full UA string (strip "Headless"), `Accept-Language`, platform, `Sec-CH-UA` hints | Missing `Accept-Language` header, "HeadlessChrome" UA |
| `webgl.vendor` | Proxies `WebGLRenderingContext.prototype.getParameter` | WebGL vendor/renderer set to Google in headless |
| `window.outerdimensions` | Sets `window.outerWidth`/`outerHeight` | Undefined in headless |

### Key Code Pattern — `navigator.webdriver` Evasion

```js
// Stage 1: Client-side prototype deletion
await page.evaluateOnNewDocument(() => {
  if (navigator.webdriver === false) {
    // Post Chrome 89.0.4339.0 — already good
  } else if (navigator.webdriver === undefined) {
    // Pre Chrome 89.0.4339.0 — already good
  } else {
    delete Object.getPrototypeOf(navigator).webdriver;
  }
});

// Stage 2: blink feature flag (required for Chrome 88+)
// Passed as launch argument:
// --disable-blink-features=AutomationControlled
```

### Key Code Pattern — `chrome.runtime` Evasion

```js
// Creates the full chrome.runtime object with property descriptors matching headful Chrome
// Mocks sendMessage and connect with correct error signatures
// Validates extension ID format (32 chars, a-p alphabet)
// Returns proper runtime.connect response objects with all methods
```

### Key Code Pattern — `navigator.plugins` Evasion

```js
// Generates cross-referenced PluginArray and MimeTypeArray
// Each plugin has .item(), .namedItem(), array index access
// Each mime type has .enabledPlugin pointing back to plugin
// Uses JS Proxies to avoid detection via Object.getOwnPropertyNames
```

### Key Code Pattern — `user-agent-override` Evasion

```js
// 1. Strip "HeadlessChrome/" → "Chrome/"
// 2. Mask Linux → Windows NT 10.0; Win64; x64 (optional, default true)
// 3. Generate greased Sec-CH-UA brands (properly randomized order)
// 4. Set platform, platformVersion, architecture, model
// 5. Set Accept-Language header via CDP (headless) or user preferences (headful)
```

---

## 4. undetected-chromedriver Approach

Source: https://github.com/ultrafunkamsterdam/undetected-chromedriver

### What It Does Differently

| Aspect | puppeteer-extra-stealth | undetected-chromedriver |
|---|---|---|
| Level | JavaScript/CDP patches | Chromedriver binary patching + CDP |
| Approach | Injects evasions via `evaluateOnNewDocument` | Patches chromedriver to prevent automation flags from being set |
| `navigator.webdriver` | Deletes from prototype | Prevents `--enable-automation` from being added to Chrome launch |
| Binary | No binary patching | Patches the chromedriver executable |
| IP reputation | Not addressed | Explicitly warns IP reputation matters |
| CAPTCHA | Improved reCAPTCHA scores | Passes Cloudflare "Under Attack" mode |

### Core Technique

```python
# undetected-chromedriver patches the chromedriver binary:
# 1. Removes the `--enable-automation` flag injection at the C++ level
# 2. Prevents `navigator.webdriver` from being set to `true`
# 3. Patches the CDP command that enables automation
# 4. Uses CDP Runtime.evaluate to inject stealth scripts at the right moment
# 5. Automatically downloads and patches matching chromedriver version
```

### Important Caveat from Author

> "THIS PACKAGE DOES NOT hide your IP address. When running from a datacenter, chances are you will not pass. If your IP reputation at home is low, you won't pass."

### Headless Support

> "Headless is unsupported officially, but undetected-chromedriver v3.4.5+ patches headless mode as well."

---

## 5. Electron-Specific Fingerprinting

Electron has unique fingerprints that differ from both normal Chrome and headless Chrome.

### Detection Vectors Specific to Electron

| Vector | Normal Chrome | Headless Chrome | Electron |
|---|---|---|---|
| `navigator.userAgent` | Standard Chrome UA | Contains "HeadlessChrome" | Contains "Electron" + app name |
| `navigator.webdriver` | `false` | `true` | Usually `undefined` (not set) |
| `navigator.plugins` | PluginArray with entries | Empty | Non-standard (fewer or no entries) |
| `navigator.mimeTypes` | MimeTypeArray with entries | Empty | Non-standard |
| `navigator.languages` | `['en-US', 'en']` | `['en-US']` | Often just `['en-US']` |
| `navigator.platform` | `'Win32'` / `'MacIntel'` | Same as host | Same as host (can be `'Linux x86_64'`) |
| `navigator.hardwareConcurrency` | Real CPU core count | 2 (default) | Real CPU core count (closer to real) |
| `window.chrome.runtime` | Full object | `undefined` | `undefined` (not present in Electron) |
| `window.chrome.*` APIs | All present | Missing | Most missing |
| WebGL Vendor | `'Intel Inc.'` | `'Google Inc.'` | Depends on GPU, not "Google" |
| WebGL Renderer | GPU-specific | `'Google SwiftShader'` | GPU-specific |
| `navigator.deviceMemory` | Varies | Undefined | Undefined |
| `navigator.connection` | NetworkInfo object | NetworkInfo object | Undefined |
| `document.location.origin` | Standard | Standard | Can be `file://` or custom protocol |
| `process.type` (node) | Not accessible | Not accessible | `'browser'` or `'renderer'` (massive giveaway) |
| `require` function | Not available in renderer | Not available | Available in preload, can leak |
| Screen dimensions | Real monitor | Small default | Real monitor |
| `navigator.mediaDevices.enumerateDevices()` | Multiple devices | Empty/limited | Depends on OS |
| `navigator.keyboard` / `navigator.hid` | Available | Available | May differ |
| `navigator.bluetooth` | Available | Available | May be undefined |
| `navigator.serial` | Available | Available | May be undefined |

### OAuth / "Embedded Browser" Detection

Google OAuth specifically blocks "embedded browsers" with the message "This browser or app may not be secure":

- User-Agent containing "Electron" or custom app name triggers this
- Missing `chrome.runtime` on secure origins
- Non-standard OAuth redirect behavior
- Missing or non-standard `navigator.credentials` API
- The OAuth flow checks for WebAuthn support and platform authenticity

### Electron Bypass Strategies

```js
// In Electron preload script or injected via session.webRequest:
const { session } = require('electron');

// 1. Override User-Agent (remove Electron identifiers)
session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
  details.requestHeaders['User-Agent'] = details.requestHeaders['User-Agent']
    .replace(/Electron\/[\d.]+/g, '')
    .replace(/electron_app/g, '');
  callback({ requestHeaders: details.requestHeaders });
});

// 2. Strip or spoof navigator.webdriver (already undefined in most Electron)
// In preload:
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

// 3. Mock chrome.runtime (critical for Google OAuth on HTTPS)
// Using puppeteer-extra-stealth chrome.runtime evasion code

// 4. Mask Linux platform to Windows (if applicable)
session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
  let ua = details.requestHeaders['User-Agent'];
  if (ua.includes('Linux') && !ua.includes('Android')) {
    ua = ua.replace(/\(([^)]+)\)/, '(Windows NT 10.0; Win64; x64)');
  }
  callback({ requestHeaders: { ...details.requestHeaders, 'User-Agent': ua } });
});
```

---

## 6. Compiled Bypass Code for Electron

For an Electron app that needs to bypass Google/YouTube anti-automation:

### Minimum Required Patches

1. **User-Agent**: Strip `Electron/X.Y.Z` and app name from UA
2. **navigator.webdriver**: Ensure it's `undefined` (delete from prototype)
3. **chrome.runtime**: Mock the full object (critical for Google OAuth)
4. **chrome.app, chrome.csi, chrome.loadTimes**: Mock all three
5. **navigator.plugins + navigator.mimeTypes**: Populate with realistic data
6. **WebGL vendor/renderer**: Ensure not "Google Inc./SwiftShader"
7. **navigator.languages**: Set to `['en-US', 'en']`
8. **navigator.hardwareConcurrency**: Set realistic value (4+)
9. **navigator.platform**: Mask if Linux
10. **window.outerWidth/outerHeight**: Ensure defined

### Advanced Patches

11. **--disable-blink-features=AutomationControlled**: Pass via `app.commandLine.appendSwitch`
12. **Media codecs**: Proxy `canPlayType` for `avc1.42E01E`
13. **Notification.permission**: Set to `'default'` on HTTPS
14. **permissions.query**: Return correct state for notifications
15. **SourceURL stripping**: Strip eval sourceURLs if using CDP
16. **iframe.contentWindow**: Patch if using srcdoc iframes

### Implementation Example

```js
// Electron main process
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
app.commandLine.appendSwitch('no-sandbox');

// In preload script (before page load):
const stealthPatches = `
  // Delete navigator.webdriver
  if (Navigator.prototype.webdriver !== undefined) {
    delete Navigator.prototype.webdriver;
  }

  // Mock chrome.runtime (use full chrome.runtime evasion from puppeteer-extra-stealth)
  if (!window.chrome) {
    Object.defineProperty(window, 'chrome', {
      writable: true, enumerable: true, configurable: false, value: {}
    });
  }

  // Chrome runtime mock with all properties
  window.chrome.runtime = {
    // ... full static data from puppeteer-extra-stealth chrome.runtime
    // See: https://github.com/berstend/puppeteer-extra/blob/master/packages/puppeteer-extra-plugin-stealth/evasions/chrome.runtime/staticData.json
  };

  // Chrome app mock
  window.chrome.app = {
    isInstalled: false,
    InstallState: { DISABLED: "disabled", INSTALLED: "installed", NOT_INSTALLED: "not_installed" },
    RunningState: { CANNOT_RUN: "cannot_run", READY_TO_RUN: "ready_to_run", RUNNING: "running" },
    get isInstalled() { return false; },
    getDetails: function() { return null; },
    getIsInstalled: function() { return false; },
    runningState: function() { return 'cannot_run'; }
  };

  // WebGL vendor - ensure not "Google"
  const getParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(param) {
    if (param === 37445) return 'Intel Inc.'; // UNMASKED_VENDOR_WEBGL
    if (param === 37446) return 'Intel Iris OpenGL Engine'; // UNMASKED_RENDERER_WEBGL
    return getParameter.call(this, param);
  };

  // Languages
  Object.defineProperty(Object.getPrototypeOf(navigator), 'languages', {
    get: () => Object.freeze(['en-US', 'en'])
  });

  // Hardware concurrency
  Object.defineProperty(Object.getPrototypeOf(navigator), 'hardwareConcurrency', {
    get: () => 8
  });

  // Window outer dimensions
  if (!window.outerWidth) window.outerWidth = window.innerWidth;
  if (!window.outerHeight) window.outerHeight = window.innerHeight + 85;
`;

// Execute in renderer context:
const contentSession = session.fromPartition('some-partition');
contentSession.webFrame.executeJavaScript(stealthPatches);

// Or embed in preload and use contextBridge
```

---

## 7. Testing Your Fingerprint

| Tool | URL | Purpose |
|---|---|---|
| Sannysoft Bot Test | https://bot.sannysoft.com/ | Standard browser fingerprint benchmark |
| FPScanner | https://antoinevastel.com/bots/ | Advanced headless detection tests |
| Are You Headless | https://arh.antoinevastel.com/bots/areyouheadless | Headless detection |
| reCAPTCHA v3 Score | https://recaptcha-demo.appspot.com/recaptcha-v3-request-scores.php | CAPTCHA score test |
| Cloudflare Challenge | https://nowsecure.nl | Anti-bot protection test |
| Pixelscan | https://pixelscan.net/ | Browser fingerprint analysis |
| Browser Leaks | https://browserleaks.com/ | Comprehensive fingerprint disclosure |

---

## 8. Key Caveats

- **IP reputation matters** more than any single evasion technique — residential IPs pass far better than datacenter IPs
- **Google's detection is layered** — patching one vector is insufficient; all must be addressed simultaneously
- **Electron has unique tells** — `process.type`, `require`, missing `chrome.runtime`, and UA string are all strong signals
- **OAuth 2.0 flows** are particularly sensitive — Google checks for WebAuthn, FIDO, platform authenticity, and embedded browser heuristics
- **CAPTCHA scores** are a sliding scale — even with perfect fingerprints, Google may return lower scores to known datacenter IPs
- **Cat and mouse** — detection techniques evolve; the puppeteer-extra-stealth project has gone through multiple rounds of evasion improvements
- **Electron's `session.webRequest`** can be used to strip UA and headers, but WebRequest is deprecated in favor of `session.webRequest` in newer Electron versions

---

## Key Sources

- https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth — Full evasion source code
- https://github.com/ultrafunkamsterdam/undetected-chromedriver — Binary patching approach
- https://bot.sannysoft.com/ — Browser fingerprint test benchmark
- https://intoli.com/blog/not-possible-to-block-chrome-headless/ — Evan Sangaline's original headless Chrome research
- https://github.com/paulirish/headless-cat-n-mouse — Paul Irish's headless detection testbed
- https://antoinevastel.com/bots/ — Antoine Vastel's bot detection research

sources_reviewed: 30
