# Speed Eksekusi + Chat History Arrows — Rencana Implementasi

> **Untuk Hermes:** Pakai subagent-driven-development untuk eksekusi task-by-task.

**Tujuan:** Bikin eksekusi native tool lebih cepat + ArrowUp/Down history di chat input.

**Pendekatan:** **ATM** (Amati Tiru Modifikasi) — comot pattern proven dari library/API existing, bukan nulis dari nol.

---

### Task 1: ArrowUp/Down history — comot dari `node:readline`

**ATM dari:** Node.js `readline` module — `_history[]` array + `_historyIndex` pointer. Pola cyclic array ref. Proven sejak Node v0.x.

**File:**
- Ubah: `src/renderer/src/components/core/InputBar.jsx`

**Perubahan:**

```jsx
// Tambah 3 ref — pattern langsung dari internal readline
const historyStackRef = useRef([])   // array pesan
const historyIndexRef = useRef(-1)   // -1 = posisi input baru
const savedInputRef = useRef('')     // simpan input user sebelum navigasi

// Di useEffect:
useEffect(() => {
  if (historyIndexRef.current === -1) savedInputRef.current = value
}, [value])

// Di handleKeyDown:
if (e.key === 'ArrowUp' && historyStackRef.current.length > 0) {
  e.preventDefault()
  if (historyIndexRef.current === -1) savedInputRef.current = value
  historyIndexRef.current = Math.min(historyIndexRef.current + 1, historyStackRef.current.length - 1)
  const idx = historyStackRef.current.length - 1 - historyIndexRef.current
  onChange({ target: { value: historyStackRef.current[idx] } })
  return
}
if (e.key === 'ArrowDown') {
  e.preventDefault()
  if (historyIndexRef.current <= 0) {
    historyIndexRef.current = -1
    onChange({ target: { value: savedInputRef.current || '' } })
  } else {
    historyIndexRef.current--
    const idx = historyStackRef.current.length - 1 - historyIndexRef.current
    onChange({ target: { value: historyStackRef.current[idx] } })
  }
  return
}

// Di onSubmit (form handler):
if (localValue.trim()) {
  // Max 50 entries — batas memory safety
  if (historyStackRef.current.length >= 50) historyStackRef.current.shift()
  historyStackRef.current.push(localValue.trim())
  historyIndexRef.current = -1
}
```

> **Kenapa gak pake library:** Komponennya cuma 15 baris. Nambah dependency kayak `@copilotkit/react-textarea` (400KB+) overkill buat 1 fitur kecil.

---

### Task 2: Config cache — comot dari cache-aside pattern

**ATM dari:** Setiap ORM/library caching (Redis, Memcached, Node.js `require.cache`). Pola: cache + stale-on-write.

**File:**
- Ubah: `src/renderer/src/api/ai/planning.js`

**Perubahan:**

```js
// Module-level cache — pattern dari cache-aside
let _configCache = null
let _configCachePromise = null

const getConfigCached = async () => {
  if (_configCache) return _configCache
  if (_configCachePromise) return _configCachePromise
  _configCachePromise = getAllConfig().then(cfg => {
    _configCache = cfg
    _configCachePromise = null
    return cfg
  })
  return _configCachePromise
}

// Invalidate — event ini sudah ada dari useMarkState.js line 32
if (typeof window !== 'undefined') {
  window.addEventListener('config-updated', () => { _configCache = null })
}

// Di getNextAction — ganti:
// const currentConfig = await getAllConfig()
const currentConfig = await getConfigCached()
```

> **Kenapa bukan library:** Cache-aside pattern ini 15 baris. Lodash `memoize` gak support async.

---

### Task 3: Batched thinking updates — comot dari `requestAnimationFrame`

**ATM dari:** `requestAnimationFrame` (Web API standar W3C). Digunakan game/animasi sejak 2012 untuk throttle rendering tanpa blocking.

**File:**
- Ubah: `src/renderer/src/hooks/agent/useMarkPlan.js`

**Perubahan:**

```js
// Satu RAF batcher — ganti semua setChatData isThinking
const thinkingRafRef = useRef(null)
const lastThinkingTextRef = useRef('')

const scheduleThinkingUpdate = (text) => {
  lastThinkingTextRef.current = text
  if (thinkingRafRef.current) return // udah ada batched
  thinkingRafRef.current = requestAnimationFrame(() => {
    thinkingRafRef.current = null
    setChatData((prev) => {
      const filtered = prev.filter((item) => !item.isThinking)
      return [...filtered, { role: 'ai', content: lastThinkingTextRef.current, isThinking: true }]
    })
  })
}

// Versi "force" buat intervensi user — langsung flush RAF queue
const flushThinkingUpdate = (text) => {
  if (thinkingRafRef.current) cancelAnimationFrame(thinkingRafRef.current)
  thinkingRafRef.current = null
  lastThinkingTextRef.current = text
  setChatData((prev) => {
    const filtered = prev.filter((item) => !item.isThinking)
    return [...filtered, { role: 'ai', content: text, isThinking: true }]
  })
}
```

Ganti semua `setChatData(... isThinking ...)` jadi `scheduleThinkingUpdate(...)`.
Panggil `flushThinkingUpdate(...)` pas intervensi user (line ~212-236).

---

### Task 4: grep-search — comot dari production grep usage

**ATM dari:** Flags `--exclude-dir=node_modules --exclude-dir=.git -m 30` — standard di tiap proyek dev. Dipake sama ripgrep, fd-find, VS Code search, dll.

**File:**
- Ubah: `src/main/native-tools.js`

**Perubahan:**

```js
// Di handler 'grep-search'
// SEBELUM:
const { stdout } = await execPromise(`grep -rni "${keyword}" "${dirPath}"`)

// SESUDAH:
const { stdout } = await execPromise(
  `grep -rni --exclude-dir=node_modules --exclude-dir=.git -m 50 "${keyword}" "${dirPath}"`
)
const result = stdout.split('\n').slice(0, 200).join('\n')
```

---

### Task 5: run-shell — comot dari Node.js docs

**ATM dari:** `child_process.exec` langsung pake `shell` option — ini contoh di dokumentasi resmi Node.js: https://nodejs.org/api/child_process.html#child_processexeccommand-options-callback

**File:**
- Ubah: `src/main/native-tools.js`

**Perubahan:**

```js
// SEBELUM — double wrapper:
const shellCmd = `bash -c "${query}"`
const { stdout, stderr } = await execPromise(shellCmd, { env: safeEnv() })

// SESUDAH — langsung pake opsi shell:
const { stdout, stderr } = await execPromise(query, {
  shell: '/bin/bash',
  env: safeEnv()
})
```

---

### Task 6: Parallel fetch — comot dari Promise.all

**ATM dari:** `Promise.all` — ES6 native, MDN pertama dirilis 2015. Pattern concurrent fetch di tiap codebase.

**File:**
- Ubah: `src/renderer/src/api/ai/planning.js`

**Perubahan:**

```js
// Di dalam getNextAction — beberapa panggilan sequential jadi paralel
const [pluginActions, agentSkills] = await Promise.all([
  getPluginActions(),
  getAgentSkills()
])
```

---

## Ringkasan

| Task | ATM dari | Baris kode |
|---|---|---|
| History arrows | Node.js readline `_history[]` | ~20 |
| Config cache | Cache-aside pattern | ~15 |
| Batched thinking | `requestAnimationFrame` | ~20 |
| grep-search | Standard grep flags | ~2 |
| run-shell | Node.js docs `shell` option | ~2 |
| Parallel fetch | `Promise.all` | ~1 |

**Total:** ~60 baris, 0 dependency baru. Semua pattern proven dari library/API standar yang udah ada di ekosistem.
