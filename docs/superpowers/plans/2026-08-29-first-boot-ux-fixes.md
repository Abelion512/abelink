# UX Fixes + Repo Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Perbaiki UX first-boot flow, hapus tour guide yang sudah usang, perbaiki external link handling, dan bersihkan repo hygiene sebelum publikasi GitHub.

**Architecture:**
- First boot: skip config wizard → langsung ke MarkHome dengan default config (Gemini Web, no legacy import jika tidak ada data lama).
- Tour guide: hapus seluruh logika Driver.js dari Configuration.jsx.
- External links: route via `window.api.openExternal()` bukan `<a target="_blank">`.
- Repo hygiene: tambah path sensitif ke .gitignore, pertahankan src-tauri/icons/ karena dipakai tauri.conf.json.

**Tech Stack:** React 19, Tauri v2.11, Dioxus (Rust), daisyUI, Driver.js v1

**Spec:** Implementasi langsung dari audit user + review GitHub branch linux. Tidak ada design doc terpisah — ini regression fix.

## Global Constraints

- Autosave config sudah aktif (700ms debounce) — jangan tambah tombol simpan manual apapun.
- `windowOpacity` MUSTAHIL di Tauri v2 — jangan coba implementasi baru.
- `src-tauri/icons/` HARUS di-keep — tauri.conf.json bundle.resources icontains referensi ke folder ini.
- `resources/icon.png` adalah icon Mark asli (256x256 RGBA) — gunakan untuk branding.
- Commit di branch `linux`, jangan merge ke master (histories unrelated).

---
````

### Task 1: First Boot Flow Redesign

**Goal:** Skip config wizard entirely on fresh install. Go directly to MarkHome with default config (Gemini Web, bahasa ID). Only show legacy data chooser if old Mark profiles detected.

**Files:**
- Modify: `src/App.jsx:227-461`
- Modify: `src/pages/Configuration.jsx:151-200` (props interface)

**Interfaces:**
- Consumes: `window.api.legacyDetectProfiles()`, `getAllConfig()`, `saveConfiguration()`
- Produces: Default config auto-saved on first render, no wizard UI

**Current behavior (buggy):**
1. `hasConfig=false` → always shows Configuration page with `isFirstSetup=true`
2. Tour auto-runs after 500ms (lines 285-294)
3. User must manually click "Simpan & Mulai"
4. Tombol ini masih ada meskipun autosave aktif

**Desired behavior:**
1. `hasConfig=false` + no legacy profiles → auto-create minimal config → redirect to `/`
2. `hasConfig=false` + legacy profiles found → show chooser dialog (Fresh/Restore)
3. `hasConfig=true` → normal flow (MarkHome)
4. No tour, no wizard steps

````

- [ ] **Step 1: Remove tour setup logic from Configuration.jsx**

Remove lines 285-294 (the `useEffect` that auto-runs tour on first setup).

Edit: `src/pages/Configuration.jsx:285-294`
````

```jsx
// REMOVE THIS BLOCK:
useEffect(() => {
  if (!isFirstSetup || loadingMemory || tourStartedRef.current) return
  let timer
  timer = setTimeout(() => {
    if (tourStartedRef.current) return
    tourStartedRef.current = true
    startDriverTour(buildSetupTourSteps(), TOUR_OPTIONS)
  }, 500)
  return () => clearTimeout(timer)
}, [isFirstSetup, loadingMemory])
```

- [ ] **Step 2: Update App.jsx first-boot logic**

Replace the entire `!hasConfig` branch (lines 424-461) with:

```jsx
if (!hasConfig) {
  const choiceMade = localStorage.getItem('mark:first-boot-choice')
  const showLegacyChooser =
    Array.isArray(legacyProfiles) && legacyProfiles.length > 0 && !choiceMade

  const settleChoice = (value) => {
    localStorage.setItem('mark:first-boot-choice', value)
  }

  // Auto-create minimal config if no choice made yet
  useEffect(() => {
    if (choiceMade || legacyProfiles === null) return
    const createDefaultConfig = async () => {
      const defaultCfg = {
        aiProvider: 'gemini-web',
        geminiWebModel: 'gemini-3.6-flash',
        language: 'id',
        personality: 'Santai layaknya seorang teman dan suka bercanda.',
        temperature: 0,
        context: 10,
        awarenessEnabled: true,
        localWhisperModel: 'whisper-small',
        shortcutKey: 'CommandOrControl+Alt+M'
      }
      await saveConfiguration(defaultCfg)
      setHasConfig(true)
      if (window.api?.syncConfig) window.api.syncConfig(defaultCfg)
    }
    createDefaultConfig()
  }, [choiceMade, legacyProfiles])

  return (
    <HashRouter>
      <WindowControls />
      {showLegacyChooser ? (
        <FirstBootChoiceScreen
          profiles={legacyProfiles}
          onFresh={() => {
            settleChoice('fresh')
            setLegacyProfiles([])
          }}
          onRestore={() => {
            settleChoice('restore')
            setWizardAutoImport(true)
          }}
        />
      ) : choiceMade === 'restore' && wizardAutoImport ? (
        <Configuration
          isFirstSetup={true}
          initialLegacyImport={true}
          onSetupComplete={() => {
            window.location.reload()
          }}
        />
      ) : null}
    </HashRouter>
  )
}
```

- [ ] **Step 3: Remove isFirstSetup prop usage where not needed**

Configuration.jsx masih pakai `isFirstSetup` untuk:
- Line 189: `activeSection` default → ubah ke `'cfg-general'` untuk mode normal
- Line 267: media device enumeration → gate by `activeSection === 'cfg-audio-voice'` saja
- Line 286: tour trigger → HAPUS (Step 1 sudah handle)
- Line 338: autosave gate → hilangkan `isFirstSetup` check (autosave harus jalan semua kondisi)
- Line 452-458: `onSetupComplete` prop → opsional, untuk legacy import flow saja
- Line 573-584: save button → HAPUS (sudah dihapus di edit sebelumnya, tapi verify)

Edit: `src/pages/Configuration.jsx:338`

```jsx
// BEFORE:
if (!hydratedRef.current || isFirstSetup) return

// AFTER:
if (!hydratedRef.current) return
```

- [ ] **Step 4: Test first-boot flow**

1. Clear localStorage: `localStorage.removeItem('mark:first-boot-choice')`
2. Remove config from IndexedDB: hapus semua record di tabel config
3. Run `bun run dev`
4. Expected: langsung ke MarkHome (tidak ada Configuration page)
5. Verify: config ter-create dengan `aiProvider: 'gemini-web'`

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/pages/Configuration.jsx
git commit -m "feat(ux): skip config wizard on fresh install, auto-default to Gemini Web"
```

**Status:** DONE — handled in previous edit.

---
### Task 2: Fix External Links in Configuration

**Goal:** All external links (Groq console, documentation) must use `window.api.openExternal()` instead of `<a target="_blank">`. Tauri webview tidak handle `target="_blank"` reliably.

**Files:**
- Modify: `src/pages/Configuration.jsx:1265-1272`

**Interfaces:**
- Consumes: `window.api.openExternal(url)` (already implemented in `cmd_misc.rs`)
- Produces: Button yang trigger external URL via native dialog

**Current bug:**
```jsx
<a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="btn btn-xs btn-outline btn-primary">
  Ambil API Key
</a>
```

**Fix:**
````

- [ ] **Step 1: Replace `<a>` with `<button>`**

Edit: `src/pages/Configuration.jsx:1265-1272`
````

```jsx
<button
  type="button"
  className="btn btn-xs btn-outline btn-primary"
  onClick={() => window.api?.openExternal('https://console.groq.com/keys')}
>
  Ambil API Key
</button>
```

- [ ] **Step 2: Verify no other `<a target="_blank">` in Configuration.jsx**

```bash
grep -n 'target="_blank"' src/pages/Configuration.jsx
```

Expected: 0 results (jika ada yang lain, fix juga).

- [ ] **Step 3: Test in dev mode**

1. Run `bun run dev`
2. Navigate to Configuration → Capabilities → Audio & Voice
3. Select Groq Cloud STT
4. Click "Ambil API Key"
5. Expected: native dialog "Open external link?" dengan URL groq.com

- [ ] **Step 4: Commit**

```bash
git add src/pages/Configuration.jsx
git commit -m "fix: route external links via openExternal instead of target=_blank"
```

**Status:** PENDING

---
### Task 3: Git Ignore Cleanup

**Goal:** Ensure sensitive/internal artifacts tidak masuk GitHub publik. Audit dari review branch linux + tambah entries yang belum ada.

**Files:**
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Current .gitignore state (already audited)
- Produces: Cleaned .gitignore covering all non-public artifacts

**Current gaps:**

| Path | Status | Action |
|------|--------|--------|
| `docs/superpowers/` | NOT ignored | ADD — AI artifacts (plans, specs, investigations) |
| `docs/DRIFT_MANIFEST.md` | Already ignored | KEEP |
| `tests/harness/` | Tracked (2 files) | KEEP — needed for CI |
| `tests/stability/` | Tracked (1 file) | KEEP — needed for CI |
| `src-tauri/icons/` | Tracked (15 files) | KEEP — required by tauri.conf.json |
| `scripts/build-manifest.mjs` | Tracked | KEEP — release automation |
| `scripts/bump-version.mjs` | Tracked | KEEP — release automation |
| `scripts/sync-version.mjs` | Tracked | KEEP — release automation |
| `scripts/mark-audit.js` | Tracked | KEEP — mark-specific audit tool |
| `scripts/verify.sh` | Tracked | KEEP — verification script |
| `scripts/setup-linux-pc-agent.sh` | Tracked | KEEP — mark-specific setup |
| `scripts/rsi-*.mjs` | Already ignored | KEEP |
| `scripts/auto-detect-upstream.mjs` | Already ignored | KEEP |
| `scripts/import-tiktok-cookies.mjs` | Already ignored | KEEP |
| `scripts/ask-ais.mjs` | Already ignored | KEEP |
| `scripts/mark-update.mjs` | Tracked | KEEP — mark-specific |

**Action:** Tambah `docs/superpowers/` ke .gitignore. Sisanya sudah OK.
````

- [ ] **Step 1: Add docs/superpowers/ to .gitignore**

Edit: `.gitignore:82` (setelah `/docs/archive//`)

```gitignore
# AI artifacts (plans, specs, investigations) — internal use only
/docs/superpowers/
```

- [ ] **Step 2: Verify existing tracked files**

```bash
git ls-files docs/superpowers/ src-tauri/icons/ tests/harness/ tests/stability/
```

Expected output:
- `docs/superpowers/` → FILES (harusnya tidak ada yang tracked, jika ada → unstage)
- `src-tauri/icons/` → 15 files (keep)
- `tests/harness/` → 2 files (keep)
- `tests/stability/` → 1 file (keep)

- [ ] **Step 3: Unstage docs/superpowers/ jika ada yang tracked**

```bash
git rm -r --cached docs/superpowers/ 2>/dev/null || true
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: add docs/superpowers/ to .gitignore, cleanup repo hygiene"
```

**Status:** PENDING

---
### Task 4: Replace Default Tauri Icons with Mark Branding

**Goal:** `src-tauri/icons/` isi default Tauri placeholder icons. Replace dengan icon Mark asli dari `resources/icon.png` untuk meningkatkan kredibilitas developer saat publikasi.

**Files:**
- Modify: `src-tauri/icons/` (15 files)
- Source: `resources/icon.png` (Mark branding, 256x256 RGBA)

**Interfaces:**
- Consumes: `resources/icon.png` (already exist, 14.2KB, 256x256 RGBA)
- Produces: Proper branded icons untuk Tauri bundle

**Background:**
- `tauri.conf.json:37` reference `../resources/icon.png` sebagai primary icon
- Tapi `tauri.conf.json:36` juga list fallback sizes dari `icons/` folder
- Saat build, Tauri akan bundle semua icon sizes dari `src-tauri/icons/`
- Icon default Tauri adalah generic grid icon = kurang profesional

**Action:** Generate proper icon sizes dari `resources/icon.png` menggunakan ImageMagick atau tools online, lalu replace isi `src-tauri/icons/`.
````

- [ ] **Step 1: Generate icon sizes**

```bash
cd src-tauri/icons

# Generate semua sizes dari icon.png
convert ../../resources/icon.png -resize 32x32 32x32.png
convert ../../resources/icon.png -resize 128x128 128x128.png
convert ../../resources/icon.png -resize 128x128 -density 256 128x128@2x.png
convert ../../resources/icon.png -resize 256x256 icon.ico
```

Catatan: Jika ImageMagick tidak terinstall, gunakan tools online seperti https://appicon.co/ atau https://favicon.io/.

- [ ] **Step 2: Verify icon quality**

```bash
file src-tauri/icons/*.png src-tauri/icons/*.ico
```

Expected: PNG files harus RGBA, ico harus valid Windows icon.

- [ ] **Step 3: Test build dengan icon baru**

```bash
cd src-tauri && cargo check
```

Expected: Build sukses, tidak ada warning tentang icon.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/icons/
git commit -m "feat(branding): replace default Tauri icons with Mark branding"
```

**Status:** PENDING — requires ImageMagick or manual icon generation.

---
### Task 5: Background Feature Install Notification (RAM 8GB+)

**Goal:** Untuk device RAM 8GB+, install fitur berat (Whisper STT, RAG indexing) di background setelah first boot, dengan floating notification center-top yang bisa di-click untuk lihat progres detail.

**Files:**
- Create: `src/components/FeatureInstallNotification.jsx` (new component)
- Modify: `src/App.jsx` (add notification state)
- Modify: `src/api/vectorMemory.js` (add install callback)
- Modify: `src-tauri/src/cmd_misc.rs` (optional: native install trigger)

**Interfaces:**
- Consumes: `getExtractor()` dari vectorMemory, hardware profile detection
- Produces: Floating notification component + install state management

**Design:**

1. **Trigger:** Setelah first boot, check RAM via `detectHardwareProfile()`. Jika `STANDARD` atau `HIGH`, prompt user untuk install fitur berat.

2. **Notification UI:**
   - Fixed position: `top-4 left-1/2 -translate-x-1/2 z-[9999]`
   - Glass morphism: `bg-base-200/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl`
   - Progress bar + status text
   - Click to expand: show list of features being installed

3. **Install flow:**
   - Whisper STT model (download ~100MB)
   - RAG index initialization (scan chat history)
   - Embedding model (download ~50MB)

4. **State management:**
   - `installState`: 'idle' | 'installing' | 'paused' | 'done' | 'error'
   - `installProgress`: 0-100%
   - `installFeatures`: array of { name, status, progress }

**Pseudo-code:**
````

- [ ] **Step 1: Create FeatureInstallNotification component**

Create: `src/components/FeatureInstallNotification.jsx`

```jsx
import { useState, useEffect } from 'react'

export default function FeatureInstallNotification({ isVisible, onClose }) {
  const [expanded, setExpanded] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('installing')
  const [features, setFeatures] = useState([
    { name: 'Whisper STT Model', status: 'pending', progress: 0 },
    { name: 'RAG Knowledge Index', status: 'pending', progress: 0 },
    { name: 'Embedding Model', status: 'pending', progress: 0 }
  ])

  if (!isVisible) return null

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-md animate-fade-in">
      <div className="bg-base-200/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="loading loading-spinner loading-sm text-primary"></span>
            <p className="text-sm font-semibold">Installing Features...</p>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="btn btn-ghost btn-xs btn-circle"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>

        <progress className="progress progress-primary w-full" value={progress} max="100" />

        {expanded && (
          <div className="space-y-2 mt-3">
            {features.map((feature, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <span className="opacity-70">{feature.name}</span>
                <span className={`badge badge-xs ${
                  feature.status === 'done' ? 'badge-success' :
                  feature.status === 'installing' ? 'badge-primary' :
                  feature.status === 'error' ? 'badge-error' : 'badge-ghost'
                }`}>
                  {feature.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Integrate with App.jsx**

Add state di App.jsx:

```jsx
const [showInstallNotification, setShowInstallNotification] = useState(false)
const [installProgress, setInstallProgress] = useState(0)
```

Trigger setelah first boot + config loaded:

```jsx
useEffect(() => {
  if (!hasConfig || isChecking) return
  const profile = detectHardwareProfile()
  if (profile === 'minimal') return // skip untuk low-end device

  const checkInstallStatus = async () => {
    const data = await getAllConfig()
    const installed = data[0]?.heavyFeaturesInstalled
    if (!installed) {
      setShowInstallNotification(true)
      // Start background install
      installHeavyFeatures()
    }
  }
  checkInstallStatus()
}, [hasConfig, isChecking])
```

- [ ] **Step 3: Implement installHeavyFeatures()**

```jsx
const installHeavyFeatures = async () => {
  try {
    // 1. Whisper STT
    setFeatures(prev => prev.map(f => f.name === 'Whisper STT Model' ? {...f, status: 'installing'} : f))
    await getExtractor((info) => {
      if (info.status === 'progress') {
        setInstallProgress(Math.round((info.loaded / info.total) * 50))
      }
    })

    // 2. RAG Index
    setFeatures(prev => prev.map(f => f.name === 'RAG Knowledge Index' ? {...f, status: 'installing'} : f))
    await initOramaIndices()
    setInstallProgress(75)

    // 3. Embedding Model
    setFeatures(prev => prev.map(f => f.name === 'Embedding Model' ? {...f, status: 'installing'} : f))
    await hydrateFromDexie((current, total) => {
      const pct = 75 + Math.round((current / total) * 25)
      setInstallProgress(pct)
    })

    // Mark as done
    setFeatures(prev => prev.map(f => ({...f, status: 'done'}))
    setInstallProgress(100)
    setStatus('done')

    // Save to config
    const data = await getAllConfig()
    await saveConfiguration({...data[0], heavyFeaturesInstalled: true})

    setTimeout(() => setShowInstallNotification(false), 2000)
  } catch (e) {
    console.error('Background install failed:', e)
    setStatus('error')
  }
}
```

- [ ] **Step 4: Add notification to App.jsx render**

```jsx
{showInstallNotification && (
  <FeatureInstallNotification
    isVisible={showInstallNotification}
    progress={installProgress}
    features={features}
    onClose={() => setShowInstallNotification(false)}
  />
)}
```

- [ ] **Step 5: Test**

1. Set RAM profile ke `STANDARD` atau `HIGH`
2. Fresh install (hapus config)
3. Expected: Langsung ke MarkHome, notification muncul di top-center
4. Click notification → expand detail fitur yang di-install
5. Verify: instalasi berjalan di background, chat tetap bisa dipakai

- [ ] **Step 6: Commit**

```bash
git add src/components/FeatureInstallNotification.jsx src/App.jsx src/api/vectorMemory.js
git commit -m "feat(ux): add background feature install notification for 8GB+ RAM devices"
```

**Status:** PENDING — requires Task 1 selesai dulu.

---
### Task 6: Remove Driver.js and Tour Logic Completely

**Goal:** Tour guide sudah usang (minimal setup dihapus di Task 1). Bersihkan seluruh kode Driver.js yang tidak terpakai.

**Files:**
- Remove: `src/utils/driverTour.js` (jika tidak ada caller lain)
- Remove: `tests/driver-tour.test.js` (jika tidak ada caller lain)
- Modify: `src/pages/Configuration.jsx` (hapus import + logic)
- Modify: `src/App.jsx` (hapus import jika ada)

**Interfaces:**
- Consumes: Tidak ada
- Produces: Cleanup dead code
````

- [ ] **Step 1: Grep untuk pastikan tidak ada caller**

```bash
grep -rln "driverTour\|startDriverTour\|buildSetupTourSteps" src/
```

Expected: Hanya `Configuration.jsx` + `src/utils/driverTour.js` + `tests/driver-tour.test.js`.

- [ ] **Step 2: Remove Driver.js import**

Edit: `src/pages/Configuration.jsx:29-30`

```jsx
// REMOVE:
import 'driver.js/dist/driver.css'
import { startDriverTour } from '../utils/driverTour'
```

- [ ] **Step 3: Remove tour-related state + functions**

Remove dari Configuration.jsx:
- Line 190: `const [touring, setTouring] = useState(false)`
- Line 191: `const tourStartedRef = useRef(false)`
- Line 323-334: `startGuidedTour()` function
- Line 102-140: `TOUR_OPTIONS` + `buildSetupTourSteps()` (jika tidak dipakai untuk first setup)
- Line 98-108: TOUR_OPTIONS constant (jika tidak dipakai)

- [ ] **Step 4: Delete driverTour.js dan test**

```bash
rm src/utils/driverTour.js tests/driver-tour.test.js
```

- [ ] **Step 5: Remove driver.js dependency**

```bash
bun remove driver.js
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove Driver.js tour logic (dead code after first-boot redesign)"
```

**Status:** PENDING — depends on Task 1.

---
## Progress Tracker

- [ ] Task 1: First Boot Flow Redesign
- [ ] Task 2: Fix External Links
- [ ] Task 3: Git Ignore Cleanup
- [ ] Task 4: Replace Tauri Icons
- [ ] Task 5: Background Feature Install Notification
- [ ] Task 6: Remove Driver.js Dead Code

## Verification Checklist

Sebelum commit setiap task:
- [ ] `bun run lint` → 0 error
- [ ] `bun run build` → sukses
- [ ] Manual test flow yang diubah
- [ ] Session log updated di `docs/PLANNED/sessions/`

## Callback

Siap lanjut eksekusi Task 1-6, atau ada prioritas yang diubah?
````
