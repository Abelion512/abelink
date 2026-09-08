// Mark Browser Bridge — service worker (MV3).
/* global chrome */
//
// Loop:
//   1. handshake -> simpan {session, token, port} di chrome.storage.session
//   2. long-poll /poll -> dapat perintah -> jalankan lewat chrome.tabs
//   3. POST /result -> kembali ke 2
//
// Token dibaca user dari file token sidecar (~/.local/share/mark/
// browser-bridge-token) dan ditempel lewat popup ekstensi. Disimpan di
// chrome.storage.session (hilang saat browser mati — tepat untuk token
// proses-lokal). Tanpa telemetri; trafik hanya ke 127.0.0.1.

const DEFAULT_PORT = 49712
const POLL_BACKOFF_MS = 1500
const NAV_TIMEOUT_MS = 60000
const SETTLE_MS = 2000

let running = false
let pollAbort = null

// Log kunci agar console service worker jadi dasbor mini (bukan kuburan):
// versi saat bangun, handshake, perintah masuk + hasil, error poll.
console.log('[Mark] bridge service worker aktif (jalur E2E grup-tab + token persisten).')

// ------------------------------------------------------------- helpers
async function getCfg() {
  const { session, token, port } = await chrome.storage.session.get(['session', 'token', 'port'])
  return { session: session || 'default', token: token || '', port: port || DEFAULT_PORT }
}

function base(cfg) {
  return `http://127.0.0.1:${cfg.port}/mark-bridge`
}

// GET dengan token via query (kontrak bridge: token ada di ?token=).
async function apiGet(cfg, path, extraQuery = '') {
  const res = await fetch(
    `${base(cfg)}/${path}?session=${encodeURIComponent(cfg.session)}&token=${encodeURIComponent(cfg.token)}${extraQuery}`,
    { method: 'GET' }
  )
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

async function apiPost(cfg, path, body) {
  const res = await fetch(`${base(cfg)}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`)
  return res.json().catch(() => ({}))
}

// ------------------------------------------------------------------ loop
async function loop() {
  while (running) {
    let cfg
    try {
      cfg = await getCfg()
      if (!cfg.token) {
        await sleep(5000)
        continue
      }
      pollAbort = new AbortController()
      const res = await fetch(
        `${base(cfg)}/poll?session=${encodeURIComponent(cfg.session)}&token=${encodeURIComponent(cfg.token)}`,
        {
          signal: pollAbort.signal
        }
      )
      if (res.status === 401) {
        // Token berubah (restart sidecar). Coba refresh senyap via helper
        // lokal dulu; hanya berhenti bila helper juga tidak bisa.
        const fresh = await getTokenViaNativeHost()
        if (fresh.token) {
          cfg.token = fresh.token
          await chrome.storage.session.set({ token: fresh.token, lastError: null })
          continue
        }
        running = false
        await chrome.storage.session.set({
          lastError: `Token ditolak (401). Helper: ${fresh.detail || 'tidak ada'}. Klik Sambungkan di popup (atau tempel token manual).`
        })
        break
      }
      const { command } = await res.json()
      if (command) {
        console.log(`[Mark] perintah masuk: ${command.type} (${command.id || 'tanpa-id'})`)
        await runCommand(cfg, command)
      }
      // Tanpa jeda saat ada perintah (agar cepat); backoff hanya saat idle.
      if (!command) await sleep(POLL_BACKOFF_MS)
    } catch (e) {
      if (e?.name === 'AbortError') continue
      await chrome.storage.session.set({ lastError: String(e?.message || e) })
      await sleep(POLL_BACKOFF_MS)
    } finally {
      pollAbort = null
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// Minta token langsung ke helper lokal (tanpa copas). Gagal -> '' agar
// caller jatuh ke token tempel manual. Helper dipasang otomatis sidecar.
// Mengembalikan { token, detail } agar popup bisa menampilkan sebab
// sebenarnya (host tak ada vs ID tak cocok vs host crash).
async function getTokenViaNativeHost() {
  try {
    const res = await chrome.runtime.sendNativeMessage('id.mark.bridge', { type: 'get-token' })
    if (res?.ok && res.token) return { token: res.token, detail: '' }
    return { token: '', detail: res?.error || 'helper menolak permintaan' }
  } catch (e) {
    const msg = String(e?.message || e)
    // Klasifikasi sebab agar user tidak menebak-nebak.
    let detail = msg
    if (/not found|No such host/i.test(msg)) detail = 'helper belum terpasang (pakai Mark terbaru / picu channel browser:* sekali)'
    else if (/exited|exit/i.test(msg)) detail = 'helper crash saat start (cek executable + runtime path)'
    else if (/permission|allowed|origin|ID/i.test(msg)) detail = 'ID extension tak cocok (verifikasi ID di chrome://extensions)'
    return { token: '', detail }
  }
}

// -------------------------------------------------------------- commands
async function execute(cfg, command) {
  const { type } = command
  const { payload } = command

  // Handle group session commands from browser-use
  if (type === 'group-session') {
    const { task, status, autoClose } = payload || {}
    if (!task) return { ok: false, error: 'task wajib.' }
    if (task) sessionTask[cfg.session || 'default'] = task
    await ensureGroup(cfg.session || 'default', task, status || 'acting', !!autoClose)
    return { ok: true }
  }

  // Task selesai: tandai grup (✅/❌) + tutup tab grup hanya bila autoClose.
  // Error tidak pernah auto-close (disisakan untuk inspeksi).
  if (type === 'task-done') {
    const { task, status, autoClose } = payload || {}
    const done = await finishTaskGroup(cfg.session || 'default', task, status || 'done', !!autoClose)
    return { ok: true, data: JSON.stringify(done) }
  }

  // Tutup tab grup aktif sesi ini (tombol manual popup). Selalu tersedia.
  if (type === 'close-tabs') {
    const closed = await closeActiveGroupTabs(cfg.session || 'default')
    return { ok: true, data: JSON.stringify({ closed }) }
  }

  switch (type) {
    case 'navigate':
      return navigate(payload, cfg.session || 'default')
    case 'read-dom':
      return readDom(cfg.session || 'default')
    case 'act':
      return act(payload, cfg.session || 'default')
    case 'show':
      return showTab(cfg.session || 'default')
    default:
      return { ok: false, error: `Perintah tidak dikenal: ${type}` }
  }
}

async function runCommand(cfg, command) {
  let result
  try {
    result = await execute(cfg, command)
  } catch (e) {
    result = { ok: false, error: String(e?.message || e) }
  }
  console.log(`[Mark] hasil ${command.type}: ${result.ok ? 'ok' : `gagal (${result.error || 'tanpa pesan'})`}`)
  try {
    await apiPost(
      cfg,
      `result?session=${encodeURIComponent(cfg.session)}&token=${encodeURIComponent(cfg.token)}`,
      {
        commandId: command.id,
        ok: result.ok,
        data: result.data ?? null,
        error: result.error ?? null
      }
    )
  } catch (e) {
    console.warn('[Mark] gagal kirim hasil:', e)
  }
}

// ----------------------------------------------------------- group management
// browser-use: grup tab per task. Hanya 1 group aktif; yang lain
// ditandai selesai (checkbox hijau ✅). Auto-close tab jika autoClose=true.
const GROUP_COLORS = ['grey', 'blue', 'yellow', 'green', 'pink', 'purple', 'cyan', 'red']
const STATUS_ICON = { loading: '⏳', reading: '📖', acting: '🖱️', idle: '🟢', done: '✅', error: '❌' }

function colorForIndex(idx) {
  return GROUP_COLORS[idx % GROUP_COLORS.length]
}

// Track active group per session: sessionId -> { taskId, groupId, colorIdx }
const activeGroups = {}

// Nama task terakhir per sesi (untuk grouping tab navigate tanpa label task).
const sessionTask = {}

// Tab primer per sesi: SEMUA navigate dalam satu task memakai ulang tab ini
// (anti ledakan tab). Tab baru hanya untuk task baru / perintah eksplisit.
const primaryTabs = {}

async function saveSessionState() {
  try {
    await chrome.storage.session.set({
      _primaryTabs: primaryTabs,
      _activeGroups: activeGroups,
      _sessionTask: sessionTask
    })
  } catch {}
}

async function loadSessionState() {
  try {
    const data = await chrome.storage.session.get(['_primaryTabs', '_activeGroups', '_sessionTask'])
    if (data._primaryTabs) Object.assign(primaryTabs, data._primaryTabs)
    if (data._activeGroups) Object.assign(activeGroups, data._activeGroups)
    if (data._sessionTask) Object.assign(sessionTask, data._sessionTask)
  } catch {}
}

// Ikon judul grup: ✅ selesai, ❌ gagal, ⏳ selain itu (dikerjakan).
function iconFor(status) {
  if (status === 'done') return STATUS_ICON.done
  if (status === 'error' || status === 'failed') return STATUS_ICON.error
  return STATUS_ICON.loading
}

// Format judul grup: "(icon) <task>", maks 32 char nama task.
function groupTitle(status, task) {
  const safeTask = String(task || 'untitled').slice(0, 32)
  return `${iconFor(status)} ${safeTask}`
}

async function getPrimaryTab(sessionId) {
  await loadSessionState()
  const id = primaryTabs[sessionId]
  if (id == null) return null
  try {
    const tab = await chrome.tabs.get(id)
    if (!tab) {
      delete primaryTabs[sessionId]
      await saveSessionState()
      return null
    }
    return tab
  } catch {
    delete primaryTabs[sessionId]
    await saveSessionState()
    return null
  }
}

async function targetTabForSession(sessionId = 'default') {
  await loadSessionState()
  const primary = await getPrimaryTab(sessionId)
  if (primary && primary.url?.startsWith('http')) return primary

  // Cari tab yang berada di dalam grup Mark untuk sesi ini (isolasi privasi)
  const group = activeGroups[sessionId]
  if (group?.groupId != null) {
    try {
      const groupTabs = await chrome.tabs.query({ groupId: group.groupId })
      const valid = groupTabs.find((t) => t.url?.startsWith('http'))
      if (valid) {
        primaryTabs[sessionId] = valid.id
        await saveSessionState()
        return valid
      }
    } catch {}
  }
  return null
}

async function ensureGroup(sessionId, task, status, autoClose = false, anchorTabId = null) {
  const colorIdx = (activeGroups[sessionId]?.colorIdx || 0) % GROUP_COLORS.length
  const color = colorForIndex(colorIdx)

  // Task berganti: grup lama langsung ditandai selesai (tidak menunggu /
  // tidak mengantre — spawn grup baru tidak diblokir teardown grup lama).
  const prev = activeGroups[sessionId]
  if (prev && prev.taskId !== task) {
    await markGroupDone(prev.groupId, prev.taskId)
    // Auto-close tab grup lama hanya jika diminta (default: dibiarkan).
    if (autoClose && prev.groupId != null) {
      closeGroupTabs(prev.groupId).catch(() => {})
    }
  }

  const name = groupTitle(status, task)
  let groupId = prev?.groupId || null

  // Validasi grup terlacak masih ada (user bisa ungroup manual).
  if (groupId != null) {
    try {
      await chrome.tabGroups.get(groupId)
    } catch {
      groupId = null
    }
  }
  if (groupId != null) {
    await chrome.tabGroups.update(groupId, { color, title: name })
    activeGroups[sessionId] = { taskId: task, groupId, colorIdx: (colorIdx + 1) % GROUP_COLORS.length }
    await saveSessionState()
    return groupId
  }

  // BUGFIX (audit 2026-09): implementasi lama memfilter
  // g.windowId === chrome.windows.WINDOW_ID_CURRENT — konstanta itu (-2) bukan
  // ID window nyata, sehingga grup lama TIDAK PERNAH ditemukan dan setiap
  // perintah group-session membuat grup baru (menumpuk tanpa batas).
  // Grup dibuat DARI TAB TASK (anchor), bukan tab aktif — grouping tab aktif
  // adalah akar 7 tab yatim (tab aktif = halaman chrome:// yang tak bisa di-grup).
  if (anchorTabId != null) {
    groupId = await chrome.tabs.group({ tabIds: [anchorTabId] })
    await chrome.tabGroups.update(groupId, { color, title: name })
    activeGroups[sessionId] = { taskId: task, groupId, colorIdx: (colorIdx + 1) % GROUP_COLORS.length }
    await saveSessionState()
    return groupId
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
  let allGroups = []
  if (activeTab) {
    try {
      allGroups = await chrome.tabGroups.query({ windowId: activeTab.windowId })
    } catch { allGroups = [] }
  }
  const existing = allGroups.find((g) => g.title === name)

  if (!existing) {
    // Buat group baru dari tab aktif
    if (!activeTab) return null
    const created = await chrome.tabs.group({
      tabIds: [activeTab.id],
      windowId: activeTab.windowId
    })
    groupId = created
    await chrome.tabGroups.update(groupId, { color, title: name })
  } else {
    groupId = existing.id
    await chrome.tabGroups.update(groupId, { color, title: name })
  }

  activeGroups[sessionId] = { taskId: task, groupId, colorIdx: (colorIdx + 1) % GROUP_COLORS.length }
  await saveSessionState()
  return groupId
}

async function markGroupDone(groupId, taskId) {
  if (groupId == null) return
  await chrome.tabGroups.update(groupId, { title: groupTitle('done', taskId) })
}

async function markGroupError(groupId, taskId) {
  if (groupId == null) return
  await chrome.tabGroups.update(groupId, { title: groupTitle('error', taskId) })
}

// Tutup semua tab dalam satu grup. Mengembalikan jumlah tab ditutup.
async function closeGroupTabs(groupId) {
  if (groupId == null) return 0
  const tabs = await chrome.tabs.query({ groupId })
  for (const t of tabs) {
    await chrome.tabs.remove(t.id)
  }
  return tabs.length
}

// Selesaikan grup task sesi: tandai ✅/❌ + tutup tab hanya bila autoClose
// dan status bukan error (tab error selalu disisakan untuk inspeksi).
async function finishTaskGroup(sessionId, task, status = 'done', autoClose = false) {
  const label = task || sessionTask[sessionId] || 'browser'
  const group = activeGroups[sessionId]
  const groupId = group?.groupId ?? null
  if (status === 'error' || status === 'failed') {
    await markGroupError(groupId, label)
    return { groupId, status: 'error', closed: 0 }
  }
  await markGroupDone(groupId, label)
  const closed = autoClose ? await closeGroupTabs(groupId).catch(() => 0) : 0
  if (closed > 0) {
    delete primaryTabs[sessionId]
    await saveSessionState()
  }
  return { groupId, status: 'done', closed }
}

// Tutup tab grup aktif sesi (tombol manual). Mengembalikan jumlah ditutup.
async function closeActiveGroupTabs(sessionId) {
  const group = activeGroups[sessionId]
  if (!group?.groupId) return 0
  return closeGroupTabs(group.groupId).catch(() => 0)
}

// Masukkan tab ke grup sesi (format judul ikut status). Dipakai navigate
// agar setiap tab yang dibuka Mark langsung ber-grup. Error DILEMPAR ke
// caller (dilaporkan di hasil, bukan ditelan) — pelajaran 7 tab yatim.
async function groupTabIntoSession(sessionId, tabId, task, status = 'acting') {
  const label = task || sessionTask[sessionId] || 'browser'
  const groupId = await ensureGroup(sessionId, label, status, false, tabId)
  if (groupId == null) throw new Error('grup sesi tidak bisa dibuat (tidak ada tab anchor)')
  await chrome.tabs.group({ tabIds: [tabId], groupId })
  return groupId
}

async function updateGroupStatus(sessionId, task, status) {
  const group = activeGroups[sessionId]
  if (!group) return
  await chrome.tabGroups.update(group.groupId, { title: groupTitle(status, task) })
}

// ------------------------------------------------------------------ tabs
async function activeOrFindTab(urlFilter) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab && tab.url?.startsWith('http')) return tab
  if (urlFilter) {
    const tabs = await chrome.tabs.query({ url: `${urlFilter}*` })
    if (tabs.length) return tabs[0]
  }
  return null
}

async function navigate({ url, reuse = true }, sessionId = 'default') {
  // Tab PRIMER per task dipakai ulang (anti ledakan tab). Tab baru hanya bila
  // belum ada / sudah ditutup / reuse=false eksplisit. Tidak merebut fokus.
  let tab = null
  let reused = false
  if (reuse !== false) tab = await getPrimaryTab(sessionId)
  if (!tab) {
    tab = await chrome.tabs.create({ url, active: false })
    primaryTabs[sessionId] = tab.id
    await saveSessionState()
  } else {
    reused = true
    await chrome.tabs.update(tab.id, { url })
  }
  await waitForLoad(tab.id, NAV_TIMEOUT_MS)
  await sleep(SETTLE_MS)
  // Setiap tab yang dibuka Mark langsung masuk grup sesi (judul ikut task
  // terakhir sesi, atau hostname bila belum ada task).
  let label = sessionTask[sessionId]
  if (!label) {
    try {
      label = new URL(url).hostname
    } catch {
      label = 'browser'
    }
  }
  let group = null
  try {
    const groupId = await groupTabIntoSession(sessionId, tab.id, label, 'acting')
    group = { grouped: true, groupId }
  } catch (e) {
    group = { grouped: false, error: String(e?.message || e) }
  }
  const dom = await readDomInTab(tab.id)
  if (!dom.ok) return { ...dom, group }
  try {
    const parsed = JSON.parse(dom.data)
    parsed._group = { tabId: tab.id, reused, ...group }
    return { ok: true, data: JSON.stringify(parsed) }
  } catch {
    return { ...dom, group }
  }
}

async function waitForLoad(tabId, timeoutMs) {
  try {
    const cur = await chrome.tabs.get(tabId)
    if (cur?.status === 'complete') return
  } catch {}
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    }, timeoutMs)
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer)
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(listener)
  })
}

async function readDom(sessionId = 'default') {
  const tab = await targetTabForSession(sessionId)
  if (!tab)
    return {
      ok: false,
      error: 'Tidak ada tab aktif http(s) untuk sesi ini. Buka halaman dulu atau pakai navigate.'
    }
  return readDomInTab(tab.id)
}

async function showTab(sessionId = 'default') {
  const tab = await targetTabForSession(sessionId)
  if (!tab) return { ok: false, error: 'Tidak ada tab aktif untuk difokuskan.' }
  await chrome.tabs.update(tab.id, { active: true })
  await chrome.windows.update(tab.windowId, { focused: true })
  return { ok: true, data: 'ok' }
}

// --------------------------------------------------------------- tagging
// Sama dengan pola browser-agent.js era Electron: maks 80 elemen interaktif,
// data-mark-id, teks dipendekkan.
// PENTING: fungsi ini DI-SERIALISASI lalu dijalankan di konteks halaman —
// WAJIB self-contained, tidak boleh menutup variabel dari service worker.
function taggerFn() {
  document.querySelectorAll('[data-mark-id]').forEach((el) => el.removeAttribute('data-mark-id'))
  const SELECTORS = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[role="checkbox"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[role="switch"]',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(', ')

  const els = document.querySelectorAll(SELECTORS)
  const out = []
  const MAX = 80
  const MAX_TEXT = 80
  let n = 1
  const vh = window.innerHeight || document.documentElement.clientHeight || 800
  const vw = window.innerWidth || document.documentElement.clientWidth || 1200

  for (const el of els) {
    if (out.length >= MAX) break
    const rect = el.getBoundingClientRect()
    if (rect.width < 3 || rect.height < 3) continue
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') continue

    const id = 'mk' + n++
    el.setAttribute('data-mark-id', id)
    const text = (el.innerText || el.value || el.getAttribute('aria-label') || el.placeholder || '')
      .trim()
      .slice(0, MAX_TEXT)
    const inViewport = rect.top >= 0 && rect.left >= 0 && rect.top <= vh && rect.left <= vw

    out.push({
      markId: id,
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || el.getAttribute('role') || '',
      text,
      placeholder: el.placeholder || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      href: el.href ? el.href.slice(0, 200) : '',
      inViewport,
      x: Math.round(rect.x + window.scrollX),
      y: Math.round(rect.y + window.scrollY)
    })
  }
  return { title: document.title, url: location.href, elements: out }
}

async function readDomInTab(tabId) {
  const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func: taggerFn })
  if (!injection?.result) return { ok: false, error: 'Gagal membaca DOM (hasil injection kosong).' }
  return { ok: true, data: JSON.stringify(injection.result) }
}

// ------------------------------------------------------------------ act
// PENTING: fungsi aksi DOM di-serialisasi ke konteks halaman — self-contained,
// state dikirim lewat `args`. Aksi yang butuh API ekstensi (chrome.scripting,
// chrome.tabs, chrome.downloads) TIDAK BOLEH ditaruh di sini — tangani di
// fungsi act() pada konteks service worker (lihat bawah).
async function actionFn({ markId, action, value }) {
  const el = markId ? document.querySelector(`[data-mark-id="${markId}"]`) : null
  if (markId && !el)
    return {
      ok: false,
      error: `Elemen ${markId} tidak ditemukan (DOM berubah? Panggil read-dom lagi).`
    }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  // Visual helper kursor & ripple ala browser-use
  const ensureStyles = () => {
    if (document.getElementById('mark-agent-visual-styles')) return
    const s = document.createElement('style')
    s.id = 'mark-agent-visual-styles'
    s.textContent = `
      #mark-cursor-pointer {
        position: absolute;
        width: 22px;
        height: 22px;
        pointer-events: none;
        z-index: 2147483647;
        transition: left 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), top 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.3s ease;
        filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.45));
        transform: translate(-2px, -2px);
      }
      .mark-click-ripple {
        position: absolute;
        border: 2px solid #1fb854;
        background: rgba(31, 184, 84, 0.25);
        border-radius: 50%;
        pointer-events: none;
        z-index: 2147483646;
        animation: mark-ripple-anim 0.45s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
      }
      @keyframes mark-ripple-anim {
        0% { transform: translate(-50%, -50%) scale(0.2); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
      }
    `
    document.documentElement.appendChild(s)
  }

  const showCursorAt = async (x, y) => {
    ensureStyles()
    let cur = document.getElementById('mark-cursor-pointer')
    if (!cur) {
      cur = document.createElement('div')
      cur.id = 'mark-cursor-pointer'
      cur.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22">
          <path d="M4 3L11 21L14 13L21 9L4 3Z" fill="#1fb854" stroke="#06130b" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>
      `
      cur.style.opacity = '0'
      document.body.appendChild(cur)
    }
    cur.style.left = `${x}px`
    cur.style.top = `${y}px`
    cur.style.opacity = '1'
    await sleep(200)
  }

  const triggerRippleAt = (x, y) => {
    ensureStyles()
    const rip = document.createElement('div')
    rip.className = 'mark-click-ripple'
    rip.style.width = '36px'
    rip.style.height = '36px'
    rip.style.left = `${x}px`
    rip.style.top = `${y}px`
    document.body.appendChild(rip)
    setTimeout(() => {
      if (rip.parentNode) rip.parentNode.removeChild(rip)
    }, 500)
  }

  const hideCursor = (delayMs = 600) => {
    setTimeout(() => {
      const cur = document.getElementById('mark-cursor-pointer')
      if (cur) cur.style.opacity = '0'
    }, delayMs)
  }

  try {
    switch (action) {
      case 'click': {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
        await sleep(150)
        const rect = el.getBoundingClientRect()
        const clickX = Math.round(rect.left + rect.width / 2 + window.scrollX)
        const clickY = Math.round(rect.top + rect.height / 2 + window.scrollY)

        await showCursorAt(clickX, clickY)
        triggerRippleAt(clickX, clickY)
        await sleep(80)

        const opts = {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: Math.round(rect.left + rect.width / 2),
          clientY: Math.round(rect.top + rect.height / 2)
        }
        el.dispatchEvent(new PointerEvent('pointerdown', opts))
        el.dispatchEvent(new MouseEvent('mousedown', opts))
        el.focus()
        await sleep(50)
        el.dispatchEvent(new PointerEvent('pointerup', opts))
        el.dispatchEvent(new MouseEvent('mouseup', opts))
        el.click()

        hideCursor(700)
        break
      }
      case 'type': {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
        await sleep(150)
        const rect = el.getBoundingClientRect()
        const focusX = Math.round(rect.left + Math.min(20, rect.width / 2) + window.scrollX)
        const focusY = Math.round(rect.top + rect.height / 2 + window.scrollY)

        await showCursorAt(focusX, focusY)
        triggerRippleAt(focusX, focusY)
        el.focus()
        await sleep(100)

        const textToType = String(value ?? '')
        if (el.isContentEditable) {
          document.execCommand('selectAll', false, null)
          if (textToType.length > 0 && textToType.length <= 40) {
            for (const char of textToType) {
              document.execCommand('insertText', false, char)
              await sleep(15 + Math.random() * 25)
            }
          } else {
            document.execCommand('insertText', false, textToType)
          }
        } else {
          const proto =
            el instanceof HTMLTextAreaElement
              ? window.HTMLTextAreaElement.prototype
              : window.HTMLInputElement.prototype
          const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')

          if (textToType.length > 0 && textToType.length <= 40) {
            let currVal = ''
            for (let i = 0; i < textToType.length; i++) {
              const char = textToType[i]
              currVal += char
              if (descriptor && descriptor.set) {
                descriptor.set.call(el, currVal)
              } else {
                el.value = currVal
              }
              el.dispatchEvent(new KeyboardEvent('keydown', { key: char, code: `Key${char.toUpperCase()}`, bubbles: true }))
              el.dispatchEvent(new InputEvent('beforeinput', { data: char, inputType: 'insertText', bubbles: true }))
              el.dispatchEvent(new Event('input', { bubbles: true }))
              el.dispatchEvent(new KeyboardEvent('keyup', { key: char, code: `Key${char.toUpperCase()}`, bubbles: true }))
              await sleep(18 + Math.floor(Math.random() * 22))
            }
          } else {
            if (descriptor && descriptor.set) {
              descriptor.set.call(el, textToType)
            } else {
              el.value = textToType
            }
            el.dispatchEvent(new Event('input', { bubbles: true }))
          }
          el.dispatchEvent(new Event('change', { bubbles: true }))
        }

        hideCursor(500)
        break
      }
      case 'select': {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        await sleep(100)
        el.focus()
        el.value = value
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        break
      }
      case 'press': {
        const keyName = String(value || 'Enter')
        const active = document.activeElement || el || document.body
        active.dispatchEvent(new KeyboardEvent('keydown', { key: keyName, code: keyName, bubbles: true, cancelable: true }))
        await sleep(50)
        active.dispatchEvent(new KeyboardEvent('keyup', { key: keyName, code: keyName, bubbles: true, cancelable: true }))
        if (keyName === 'Enter' && active instanceof HTMLInputElement && active.form) {
          active.form.requestSubmit?.() || active.form.submit()
        }
        break
      }
      case 'scroll': {
        const px =
          value && typeof value === 'object'
            ? (value.direction === 'up' ? -1 : 1) * (Number(value.amount) || 600)
            : Number(value) || 600
        window.scrollBy({ top: px, behavior: 'smooth' })
        await sleep(250)
        break
      }
      case 'extract':
        return { ok: true, data: document.querySelector(String(value || ''))?.textContent || '' }
      default:
        return { ok: false, error: `Aksi tidak dikenal: ${action}` }
    }
    return { ok: true, data: 'ok' }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

async function act({ markId, action, value }, sessionId = 'default') {
  const tab = await targetTabForSession(sessionId)
  if (!tab) return { ok: false, error: 'Tidak ada tab aktif http(s) untuk aksi.' }

  // --- Aksi level SERVICE WORKER (bukan injeksi halaman) ---
  // chrome.scripting/chrome.tabs tidak ada di konteks halaman.
  if (action === 'back' || action === 'go-back') {
    try {
      await chrome.tabs.goBack(tab.id)
      await sleep(500)
      return readDomInTab(tab.id)
    } catch (e) {
      return { ok: false, error: `browser-back gagal: ${String(e?.message || e)}` }
    }
  }
  if (action === 'forward' || action === 'go-forward') {
    try {
      await chrome.tabs.goForward(tab.id)
      await sleep(500)
      return readDomInTab(tab.id)
    } catch (e) {
      return { ok: false, error: `browser-forward gagal: ${String(e?.message || e)}` }
    }
  }
  if (action === 'reload' || action === 'refresh') {
    try {
      await chrome.tabs.reload(tab.id)
      await sleep(1000)
      return readDomInTab(tab.id)
    } catch (e) {
      return { ok: false, error: `browser-reload gagal: ${String(e?.message || e)}` }
    }
  }

  if (action === 'script') {
    const code = String(value || '')
    if (!code) return { ok: false, error: 'browser-script butuh kode pada field value.' }

    // Intercept native navigation calls to bypass page CSP eval restrictions
    const trimmed = code.trim().toLowerCase().replace(/;\s*$/, '')
    if (trimmed === 'window.history.back()' || trimmed === 'history.back()') {
      try {
        await chrome.tabs.goBack(tab.id)
        await sleep(500)
        return readDomInTab(tab.id)
      } catch (e) {
        return { ok: false, error: `history.back gagal: ${String(e?.message || e)}` }
      }
    }
    if (trimmed === 'window.history.forward()' || trimmed === 'history.forward()') {
      try {
        await chrome.tabs.goForward(tab.id)
        await sleep(500)
        return readDomInTab(tab.id)
      } catch (e) {
        return { ok: false, error: `history.forward gagal: ${String(e?.message || e)}` }
      }
    }
    if (trimmed === 'window.location.reload()' || trimmed === 'location.reload()') {
      try {
        await chrome.tabs.reload(tab.id)
        await sleep(1000)
        return readDomInTab(tab.id)
      } catch (e) {
        return { ok: false, error: `location.reload gagal: ${String(e?.message || e)}` }
      }
    }

    try {
      const [scr] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        args: [code],
        func: (c) => {
          try {
            const fn = new Function(`return (() => {\n${c}\n})()`)
            const out = fn()
            return out === undefined ? null : out
          } catch (err) {
            return { __eval_error: String(err?.message || err) }
          }
        }
      })
      const scriptResult = scr?.result ?? null
      if (scriptResult && typeof scriptResult === 'object' && scriptResult.__eval_error) {
        const errStr = scriptResult.__eval_error
        if (errStr.includes('Content Security Policy') || errStr.includes('unsafe-eval')) {
          return {
            ok: false,
            error: `browser-script diblokir oleh CSP halaman (eval tidak diizinkan). Untuk navigasi, gunakan tool 'browser-back', 'browser-forward', atau 'browser-reload'.`
          }
        }
        return { ok: false, error: `browser-script error: ${errStr}` }
      }
      return {
        ok: true,
        data: JSON.stringify(
          typeof scriptResult === 'object' && scriptResult !== null
            ? scriptResult
            : { result: scriptResult }
        )
      }
    } catch (e) {
      const errStr = String(e?.message || e)
      if (errStr.includes('Content Security Policy') || errStr.includes('unsafe-eval')) {
        return {
          ok: false,
          error: `browser-script diblokir oleh CSP halaman. Untuk navigasi, gunakan tool 'browser-back' atau 'browser-forward'.`
        }
      }
      return { ok: false, error: `browser-script gagal: ${errStr}` }
    }
  }
  if (action === 'screenshot') {
    try {
      // host_permissions http/https (manifest 0.1.1) membuat ini jalan tanpa gesture.
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
      if (!dataUrl) return { ok: false, error: 'captureVisibleTab mengembalikan data kosong.' }
      // Kembalikan sebagai hasil perintah — loop bridge POST /result membawanya
      // ke sidecar (jalur balik yang memang ada; bukan sendMessage tanpa listener).
      return { ok: true, data: dataUrl }
    } catch (e) {
      return { ok: false, error: `browser-screenshot gagal: ${String(e?.message || e)}` }
    }
  }
  if (action === 'download') {
    return {
      ok: false,
      error: 'browser-download via ekstensi dinonaktifkan demi minimasi permission (keamanan user). Gunakan native download dari Mark sidecar.'
    }
  }
  if (action === 'ask') {
    return { ok: false, error: 'browser-ask-user belum didukung versi ekstensi ini.' }
  }

  // --- Aksi DOM via injeksi halaman (click/type/select/press/scroll/extract) ---
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [{ markId: markId || null, action, value: value ?? null }],
    func: actionFn
  })
  const step = injection?.result
  if (!step?.ok) return step || { ok: false, error: 'Injection aksi gagal.' }
  // Aksi baca murni mengembalikan datanya langsung; aksi mutasi diikuti
  // read-dom ulang agar caller menerima DOM ter-tag terbaru.
  if (action === 'extract') return step
  await sleep(300)
  return readDomInTab(tab.id)
}

// ------------------------------------------------------------- lifecycle
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  ;(async () => {
    if (msg?.type === 'start') {
      // Urutan token: tempelan manual > helper lokal > simpanan persisten.
      // Simpanan persisten membuat buka popup = hijau tanpa klik ulang.
      let token = (msg.token || '').trim()
      let nativeDetail = ''
      if (!token) {
        const via = await getTokenViaNativeHost()
        token = via.token
        nativeDetail = via.detail
      }
      if (!token) {
        try {
          const kept = await chrome.storage.local.get('bridgeToken')
          if (kept?.bridgeToken) token = kept.bridgeToken
        } catch {
          /* storage tak ada */
        }
      }
      if (!token) {
        await chrome.storage.session.set({
          lastError: `Token kosong dan helper lokal tidak ada${nativeDetail ? ` (${nativeDetail})` : ''}. Tempel token manual sekali.`
        })
        sendResponse({ ok: false, error: 'token' })
        return
      }
      const cfg = {
        session: msg.session || 'default',
        token,
        port: msg.port || DEFAULT_PORT
      }
      // Verifikasi token sebelum masuk loop: error langsung terlihat di popup
      // (token salah vs sidecar mati dibedakan).
      try {
        const hs = await apiGet(cfg, 'handshake')
        if (hs.status === 401) {
          await chrome.storage.session.set({
            lastError: 'Token ditolak sidecar (401). Sambungkan ulang sekali.'
          })
          sendResponse({ ok: false, error: 'token' })
          return
        }
        // Rotasi refresh-on-use: server menitipkan token baru di handshake.
        // Tukar diam-diam + simpan persisten — tanpa tempel ulang selamanya.
        if (hs.body?.newToken) {
          cfg.token = hs.body.newToken
          try {
            await chrome.storage.local.set({ bridgeToken: cfg.token })
          } catch {
            /* abaikan */
          }
        }
        if (hs.status === 403 || hs.status === 0) {
          await chrome.storage.session.set({
            lastError: 'Sidecar tidak terjangkau di 127.0.0.1. Pastikan Mark berjalan.'
          })
          sendResponse({ ok: false, error: 'unreachable' })
          return
        }
      } catch (e) {
        await chrome.storage.session.set({
          lastError: `Sidecar tidak terjangkau: ${e?.message || e}`
        })
        sendResponse({ ok: false, error: 'unreachable' })
        return
      }
      await chrome.storage.session.set({
        session: cfg.session,
        token: cfg.token,
        port: cfg.port,
        lastError: null
      })
      try {
        await chrome.storage.local.set({ bridgeToken: cfg.token })
      } catch {
        /* abaikan */
      }
      if (!running) {
        running = true
        console.log(`[Mark] loop poll jalan (session: ${cfg.session}, port: ${cfg.port}).`)
        loop()
      }
      sendResponse({ ok: true })
    } else if (msg?.type === 'stop') {
      running = false
      pollAbort?.abort()
      await chrome.storage.session.set({ lastError: null })
      sendResponse({ ok: true })
    } else if (msg?.type === 'close-task-tabs') {
      const cfg = await getCfg()
      const session = msg.session || cfg.session
      const closed = await closeActiveGroupTabs(session)
      sendResponse({ ok: true, closed })
    } else if (msg?.type === 'get-active-task') {
      const cfg = await getCfg()
      const session = msg.session || cfg.session
      const group = activeGroups[session]
      sendResponse({ ok: true, hasTask: !!group?.groupId, task: group?.taskId || null })
    } else if (msg?.type === 'status') {
      const cfg = await getCfg()
      sendResponse({
        ok: true,
        running,
        hasToken: !!cfg.token,
        session: cfg.session,
        lastError: (await chrome.storage.session.get('lastError')).lastError
      })
    }
  })()
  return true // async response
})

async function tryAutoResume() {
  if (running) return
  await loadSessionState()
  let cfg = await getCfg()

  // Jika token di session storage kosong, ambil otomatis via native host atau local storage
  if (!cfg.token) {
    const via = await getTokenViaNativeHost()
    if (via?.token) {
      cfg.token = via.token
      await chrome.storage.session.set({ token: via.token })
    } else {
      try {
        const kept = await chrome.storage.local.get('bridgeToken')
        if (kept?.bridgeToken) {
          cfg.token = kept.bridgeToken
          await chrome.storage.session.set({ token: kept.bridgeToken })
        }
      } catch {}
    }
  }

  if (cfg.token) {
    try {
      const hs = await apiGet(cfg, 'handshake')
      if (hs.status === 200) {
        if (hs.body?.newToken) {
          cfg.token = hs.body.newToken
          await chrome.storage.session.set({ token: cfg.token })
          try {
            await chrome.storage.local.set({ bridgeToken: cfg.token })
          } catch {}
        }
        running = true
        console.log(`[Mark] auto-resume service worker aktif (session: ${cfg.session}, port: ${cfg.port}).`)
        loop()
      }
    } catch {
      /* sidecar belum aktif / unreachable */
    }
  }
}

chrome.runtime.onStartup.addListener(() => {
  tryAutoResume()
})

tryAutoResume()

