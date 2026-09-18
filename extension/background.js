// Abelink Browser Bridge - service worker (MV3).
/* global chrome */
//
// Loop:
//   1. handshake -> simpan {session, token, port} di chrome.storage.session
//   2. long-poll /poll -> dapat perintah -> jalankan lewat chrome.tabs
//   3. POST /result -> kembali ke 2
//
// Token dibaca user dari file token sidecar (~/.local/share/abelink/
// browser-bridge-token) dan ditempel lewat popup ekstensi. Disimpan di
// chrome.storage.session (hilang saat browser mati - tepat untuk token
// proses-lokal). Tanpa telemetri; trafik hanya ke 127.0.0.1.

const DEFAULT_PORT = 49712
// Dua instansi yang didukung: prod 49712 + dev 49713. SATU loop aktif
// (port tersimpan); probe hanya membaca, tak mengubah state.
const KNOWN_PORTS = [49712, 49713]
const PORT_LABELS = { 49712: 'Prod', 49713: 'Dev' }
// Peta kanonik flavor <-> port <-> native-host (satu-satunya definisi;
// test tests/browser-flavor.test.mjs membaca literal di bawah langsung).
const FLAVOR_PORTS = { prod: 49712, dev: 49713 }
const NATIVE_HOSTS = { prod: 'id.abelink.bridge', dev: 'id.abelink.bridge.dev' }
function flavorForPort(port) {
  return Number(port) === FLAVOR_PORTS.dev ? 'dev' : 'prod'
}
function hostNameForPort(port) {
  return NATIVE_HOSTS[flavorForPort(port)]
}
// Pairing terpin: { flavor, port, hostName }. Dibuat saat klik Pakai/Connect
// pertama; resume hanya menyentuh flavor ini (tanpa auto-switch).
async function getPairing() {
  try {
    const kept = await chrome.storage.local.get('abelink.pairing')
    const p = kept?.['abelink.pairing']
    if (p && KNOWN_PORTS.includes(Number(p.port))) {
      const port = Number(p.port)
      return { flavor: flavorForPort(port), port, hostName: hostNameForPort(port) }
    }
  } catch {
    /* abaikan */
  }
  return null
}
async function setPairing(port) {
  const p = Number(port)
  if (!KNOWN_PORTS.includes(p)) return null
  const pairing = { flavor: flavorForPort(p), port: p, hostName: hostNameForPort(p) }
  try {
    await chrome.storage.local.set({ 'abelink.pairing': pairing })
  } catch {
    /* abaikan */
  }
  return pairing
}
const POLL_BACKOFF_MS = 1500
const NAV_TIMEOUT_MS = 60000
const SETTLE_MS = 2000

let running = false
let pollAbort = null

// Log kunci agar console service worker jadi dasbor mini (bukan kuburan):
// versi saat bangun, handshake, perintah masuk + hasil, error poll.
console.log('[Abelink] bridge service worker aktif (jalur E2E grup-tab + token persisten).')

// ------------------------------------------------------------- helpers
async function getCfg() {
  const { session, token, port } = await chrome.storage.session.get(['session', 'token', 'port'])
  return { session: session || 'default', token: token || '', port: port || DEFAULT_PORT }
}

function base(cfg) {
  return `http://127.0.0.1:${cfg.port}/abelink-bridge`
}

// Token per-port (dev & prod = sidecar berbeda = token berbeda). Legacy
// `bridgeToken` tunggal dipakai sebagai fallback terakhir.
async function getPortToken(port) {
  try {
    const kept = await chrome.storage.local.get('bridgeTokens')
    if (kept?.bridgeTokens?.[port]) return kept.bridgeTokens[port]
    const legacy = await chrome.storage.local.get('bridgeToken')
    if (legacy?.bridgeToken) return legacy.bridgeToken
  } catch {
    /* storage tak ada */
  }
  return ''
}

async function setPortToken(port, token) {
  try {
    const kept = await chrome.storage.local.get('bridgeTokens')
    const map = (kept && typeof kept.bridgeTokens === 'object' ? kept.bridgeTokens : {}) || {}
    map[port] = token
    await chrome.storage.local.set({ bridgeTokens: map, bridgeToken: token })
  } catch {
    /* abaikan */
  }
}

// Probe cepat kedua port tanpa mengubah state (untuk pemilih Prod/Dev).
async function probePorts() {
  const out = []
  for (const port of KNOWN_PORTS) {
    const token = await getPortToken(port)
    let reachable = false
    let authed = false
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 3000)
      const res = await fetch(
        `http://127.0.0.1:${port}/abelink-bridge/handshake?session=default&token=${encodeURIComponent(token)}`,
        { signal: ctrl.signal }
      ).catch(() => null)
      clearTimeout(timer)
      if (res) {
        reachable = true
        authed = res.status !== 401
        if (res.status === 200) {
          try {
            const body = await res.json().catch(() => ({}))
            if (body?.newToken) await setPortToken(port, body.newToken)
          } catch {
            /* abaikan */
          }
        }
      }
    } catch {
      /* unreachable */
    }
    out.push({ port, label: PORT_LABELS[port] || String(port), reachable, authed })
  }
  return out
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
        // Token berubah (restart sidecar). Coba refresh senyap via helper lokal
        // dengan namespace port aktif (tanpa ini token prod dipakai ke dev).
        let fresh = await getTokenViaNativeHost(cfg.port)
        if (fresh.token) {
          cfg.token = fresh.token
          await chrome.storage.session.set({ token: fresh.token, lastError: null })
          await setPortToken(cfg.port, fresh.token)
          continue
        }
        await sleep(2000)
        fresh = await getTokenViaNativeHost(cfg.port)
        if (fresh.token) {
          cfg.token = fresh.token
          await chrome.storage.session.set({ token: fresh.token, lastError: null })
          await setPortToken(cfg.port, fresh.token)
          continue
        }
        running = false
        await chrome.storage.session.set({
          lastError: `Token ditolak (401). Helper: ${fresh.detail || 'tidak ada'}. Mencoba auto-reconnect berkala...`
        })
        scheduleAutoResume(5000)
        break
      }
      const { command } = await res.json()
      if (command) {
        console.log(`[Abelink] perintah masuk: ${command.type} (${command.id || 'tanpa-id'})`)
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
// Minta token langsung ke helper lokal (tanpa copas). `port` memilih
// namespace token (dev 49713 vs prod): tanpa ini token prod dipakai ke dev
// dan sebaliknya -> 401 silih-berganti.
async function getTokenViaNativeHost(port) {
  // STRICT: satu host per flavor. Tidak ada fallback lintas flavor.
  // Dev port (49713) = id.abelink.bridge.dev ONLY.
  // Prod port (49712) = id.abelink.bridge ONLY.
  // Fallback ke host flavor lain berarti token prod masuk ke dev (401 senyap) - dilarang.
  const hostName = hostNameForPort(port)
  const msg = { type: 'get-token' }
  try {
    const res = await chrome.runtime.sendNativeMessage(hostName, msg)
    if (res?.ok && res.token) return { token: res.token, detail: '' }
    return { token: '', detail: res?.error || `helper menolak permintaan (${hostName})` }
  } catch (e) {
    const m = String(e?.message || e)
    let detail = m
    if (/not found|No such host/i.test(m)) detail = `helper belum terpasang (${hostName}; pakai Abelink terbaru / picu channel browser:* sekali)`
    else if (/exited|exit/i.test(m)) detail = 'helper crash saat start (cek executable + runtime path)'
    else if (/permission|allowed|origin|ID/i.test(m)) detail = 'ID extension tak cocok (verifikasi ID di chrome://extensions)'
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
    delete overlayStopped[cfg.session || 'default'] // task baru = resume eksplisit
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

  const targetSession = payload?.sessionId || cfg.session || 'default'

  // Stop user via overlay: semua perintah tab sesi ini gagal jujur sampai
  // task selesai/ditutup atau overlay-show eksplisit (resume).
  if (
    overlayStopped[targetSession] &&
    ['navigate', 'read-dom', 'act', 'show'].includes(type) &&
    !(type === 'act' && payload?.action === 'overlay-show')
  ) {
    return { ok: false, error: OVERLAY_STOP_MSG(targetSession) }
  }

  switch (type) {
    case 'navigate':
      return navigate(payload, targetSession)
    case 'read-dom':
      return readDom(targetSession)
    case 'act':
      return act(payload, targetSession)
    case 'show':
      return showTab(targetSession)
    default:
      return { ok: false, error: `Perintah tidak dikenal: ${type}` }
  }
}

async function runCommand(cfg, command) {
  let result
  const sessionKey = command.payload?.sessionId || cfg.session || 'default'
  inflight[sessionKey] = { id: command.id, cfg }
  try {
    result = await execute(cfg, command)
  } catch (e) {
    result = { ok: false, error: String(e?.message || e) }
  }
  delete inflight[sessionKey]
  // Navigasi menghapus DOM injeksi: veil dipasang ulang otomatis (best-effort,
  // tidak boleh menggagalkan tool). Perintah overlay sendiri dikecualikan.
  if (result?.ok && ['navigate', 'act', 'read-dom', 'show'].includes(command.type)) {
    if (!(command.type === 'act' && String(command.payload?.action || '').startsWith('overlay-'))) {
      await ensureOverlay(sessionKey)
    }
  }
  console.log(`[Abelink] hasil ${command.type}: ${result.ok ? 'ok' : `gagal (${result.error || 'tanpa pesan'})`}`)
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
    console.warn('[Abelink] gagal kirim hasil:', e)
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

// ------------------------------------------------- overlay lock (Fase A)
// Full-veil lock: saat agent bekerja di tab sesi, veil transparan menelan
// input user + pill tengah-bawah berisi status + tombol Stop (scope sesi-tab).
// Stop user = observasi jujur, bukan retry buta (aturan di planning.js).
const OVERLAY_STOP_MSG = (s) =>
  `[STOP OVERLAY] User menekan Stop di tab browser (sesi "${s}"). Berhenti total untuk sesi-tab ini: JANGAN panggil tool browser* lagi. Akhiri dengan answer + is_done:true + task_status yang jujur (blocked bila tugas belum selesai).`
// Flag stop per sesi + perintah inflight per sesi (di-resolve saat Stop diklik).
const overlayStopped = {}
const inflight = {}

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

  // Cari tab yang berada di dalam grup Abelink untuk sesi ini (isolasi privasi)
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
  // tidak mengantre - spawn grup baru tidak diblokir teardown grup lama).
  const prev = activeGroups[sessionId]
  if (prev && prev.taskId !== task) {
    await abelinkGroupDone(prev.groupId, prev.taskId)
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
  // g.windowId === chrome.windows.WINDOW_ID_CURRENT - konstanta itu (-2) bukan
  // ID window nyata, sehingga grup lama TIDAK PERNAH ditemukan dan setiap
  // perintah group-session membuat grup baru (menumpuk tanpa batas).
  // Grup dibuat DARI TAB TASK (anchor), bukan tab aktif - grouping tab aktif
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

async function abelinkGroupDone(groupId, taskId) {
  if (groupId == null) return
  await chrome.tabGroups.update(groupId, { title: groupTitle('done', taskId) })
}

async function abelinkGroupError(groupId, taskId) {
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
  await hideOverlayDom(sessionId) // tab sukses disisakan terbuka: veil wajib lepas
  delete overlayStopped[sessionId]
  const label = task || sessionTask[sessionId] || 'browser'
  const group = activeGroups[sessionId]
  const groupId = group?.groupId ?? null
  if (status === 'error' || status === 'failed') {
    await abelinkGroupError(groupId, label)
    return { groupId, status: 'error', closed: 0 }
  }
  await abelinkGroupDone(groupId, label)
  const closed = autoClose ? await closeGroupTabs(groupId).catch(() => 0) : 0
  if (closed > 0 || autoClose) {
    delete activeGroups[sessionId]
    delete sessionTask[sessionId]
    delete primaryTabs[sessionId]
    await saveSessionState()
  }
  return { groupId, status: 'done', closed }
}

// Tutup tab grup aktif sesi (tombol manual). Mengembalikan jumlah ditutup.
async function closeActiveGroupTabs(sessionId) {
  await hideOverlayDom(sessionId)
  delete overlayStopped[sessionId]
  const group = activeGroups[sessionId]
  let closed = 0
  if (group?.groupId != null) {
    closed = await closeGroupTabs(group.groupId).catch(() => 0)
  }
  delete activeGroups[sessionId]
  delete sessionTask[sessionId]
  delete primaryTabs[sessionId]
  await saveSessionState()
  return closed
}

// Masukkan tab ke grup sesi (format judul ikut status). Dipakai navigate
// agar setiap tab yang dibuka Abelink langsung ber-grup. Error DILEMPAR ke
// caller (dilaporkan di hasil, bukan ditelan) - pelajaran 7 tab yatim.
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

// Budget tab per sesi: penuh -> pakai-ulang, jangan create (anti OOM).
const MAX_TABS_PER_SESSION = 6

// Adopsi tab yatim MILIK KITA SAJA: tak-bergrup DAN (about:blank ATAU url
// persis sama dengan target). Tidak pernah menyentuh tab user lain (privasi).
async function adoptOrphanTab(sessionId, url) {
  try {
    const tabs = await chrome.tabs.query({})
    const ungrouped = tabs.filter((t) => t.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE)
    const exact = ungrouped.find((t) => t.url === url)
    if (exact) return exact
    const blank = ungrouped.find((t) => t.url === 'about:blank' || t.url === 'chrome://newtab/')
    return blank || null
  } catch {
    return null
  }
}

// Buat tab dengan budget: grup sesi penuh -> pakai-ulang tab grup terlama.
async function createBoundedTab(sessionId, url) {
  try {
    const group = activeGroups[sessionId]
    if (group?.groupId != null) {
      const groupTabs = await chrome.tabs.query({ groupId: group.groupId })
      if (groupTabs.length >= MAX_TABS_PER_SESSION) {
        const oldest = groupTabs.slice().sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0))[0]
        if (oldest) return { tab: oldest, reused: true }
      }
    }
  } catch {
    /* jatuh ke create */
  }
  const tab = await chrome.tabs.create({ url, active: false })
  return { tab, reused: false }
}

async function navigate({ url, reuse = true }, sessionId = 'default') {  // Tab PRIMER per task dipakai ulang (anti ledakan tab). Tab baru hanya bila
  // belum ada / sudah ditutup / reuse=false eksplisit. Tidak merebut fokus.
  let tab = null
  let reused = false
  let adopted = false
  if (reuse !== false) tab = await getPrimaryTab(sessionId)
  if (!tab && reuse !== false) {
    tab = await adoptOrphanTab(sessionId, url)
    if (tab) adopted = true
  }
  if (!tab) {
    const created = await createBoundedTab(sessionId, url)
    tab = created.tab
    if (created.reused) reused = true
    primaryTabs[sessionId] = tab.id
    await saveSessionState()
  } else {
    reused = true
    await chrome.tabs.update(tab.id, { url })
    if (adopted) {
      primaryTabs[sessionId] = tab.id
      await saveSessionState()
    }
  }
  await waitForLoad(tab.id, NAV_TIMEOUT_MS)
  await sleep(SETTLE_MS)
  // Setiap tab yang dibuka Abelink langsung masuk grup sesi (judul ikut task
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

// ------------------------------------------------- overlay lock (Fase A)
// DI-SERIALISASI ke konteks halaman - self-contained (lihat taggerFn/actionFn).
// Isolated world: bisa chrome.runtime.sendMessage, tidak bentrok CSS situs
// (Shadow DOM). Listener basi jadi no-op via guard HOST_ID.
function overlayFn({ mode, text, session }) {
  const HOST_ID = 'abelink-agent-lock'
  if (mode === 'hide') {
    const gone = document.getElementById(HOST_ID)
    if (gone) gone.remove()
    return { ok: true, shown: false }
  }
  const stale = document.getElementById(HOST_ID)
  if (stale) stale.remove()
  const host = document.createElement('div')
  host.id = HOST_ID
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = [
    '#abelink-veil{position:fixed;inset:0;z-index:2147483640;background:rgba(0,0,0,0.18);cursor:not-allowed;}',
    '#abelink-frame{position:fixed;inset:0;z-index:2147483642;pointer-events:none;border:3px solid #1fb854;box-shadow:0 0 24px rgba(31,184,84,0.55),inset 0 0 24px rgba(31,184,84,0.25);animation:abelink-frame-pulse 1.6s ease-in-out infinite;}',
    '@keyframes abelink-frame-pulse{0%,100%{opacity:1;}50%{opacity:0.35;}}',
    '#abelink-pill{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483641;',
    'display:flex;align-items:center;gap:12px;background:#0b1510;color:#e8f5ec;border:1px solid #1fb854;',
    'border-radius:999px;padding:10px 12px 10px 16px;font:500 13px/1.4 system-ui,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,0.5);}',
    '#abelink-pill small{opacity:0.65;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '#abelink-stop{background:#b3261e;color:#fff;border:0;border-radius:999px;padding:8px 16px;font:700 13px system-ui,sans-serif;cursor:pointer;}'
  ].join('')
  const veil = document.createElement('div')
  veil.id = 'abelink-veil'
  // Bingkai sinyal kerja agent: murni visual (pointer-events none via CSS),
  // tidak memblokir — yang mengunci input adalah veil di bawahnya.
  const frame = document.createElement('div')
  frame.id = 'abelink-frame'
  const pill = document.createElement('div')
  pill.id = 'abelink-pill'
  const label = document.createElement('span')
  label.textContent = 'Abelink bekerja di tab ini'
  const stop = document.createElement('button')
  stop.id = 'abelink-stop'
  stop.textContent = 'Stop'
  stop.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      chrome.runtime.sendMessage({ type: 'overlay-stop', session })
    } catch (err) {}
  })
  pill.appendChild(label)
  if (text) {
    const sub = document.createElement('small')
    sub.textContent = String(text).slice(0, 60)
    pill.appendChild(sub)
  }
  pill.appendChild(stop)
  shadow.appendChild(style)
  shadow.appendChild(veil)
  shadow.appendChild(frame)
  shadow.appendChild(pill)
  ;(document.documentElement || document.body).appendChild(host)
  // Blokir keyboard di luar pill (klik sudah ditelan veil). Guard HOST_ID
  // membuat listener basi dari show sebelumnya jadi no-op.
  const guard = (e) => {
    if (!document.getElementById(HOST_ID)) return
    const path = typeof e.composedPath === 'function' ? e.composedPath() : []
    if (path.includes(stop)) return
    e.preventDefault()
    e.stopPropagation()
  }
  window.addEventListener('keydown', guard, true)
  window.addEventListener('keyup', guard, true)
  return { ok: true, shown: true }
}

async function setOverlay(tabId, mode, text = '', session = 'default') {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [{ mode, text, session }],
    func: overlayFn
  })
  return injection?.result || { ok: false, error: 'Injection overlay gagal.' }
}

// Pasang veil (best-effort). Dipanggil ulang tiap perintah tab berhasil
// karena navigasi menghapus DOM injeksi (lihat runCommand).
async function ensureOverlay(sessionId) {
  try {
    if (overlayStopped[sessionId]) return
    const tab = await targetTabForSession(sessionId)
    if (!tab) return
    await setOverlay(tab.id, 'show', sessionTask[sessionId] || 'browser', sessionId)
  } catch {
    /* overlay tidak boleh menggagalkan tool */
  }
}

// Hapus veil dari DOM. Flag stop TIDAK ikut dihapus (lihat stop handler).
async function hideOverlayDom(sessionId) {
  try {
    const tab = await targetTabForSession(sessionId)
    if (tab) await setOverlay(tab.id, 'hide', '', sessionId)
  } catch {
    /* abaikan */
  }
}

// --------------------------------------------------------------- tagging
// Sama dengan pola browser-agent.js era Electron: maks 80 elemen interaktif,
// data-abelink-id, teks dipendekkan.
// PENTING: fungsi ini DI-SERIALISASI lalu dijalankan di konteks halaman -
// WAJIB self-contained, tidak boleh menutup variabel dari service worker.
function taggerFn() {
  document.querySelectorAll('[data-abelink-id]').forEach((el) => el.removeAttribute('data-abelink-id'))
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

    const id = 'ak' + n++
    el.setAttribute('data-abelink-id', id)
    const text = (el.innerText || el.value || el.getAttribute('aria-label') || el.placeholder || '')
      .trim()
      .slice(0, MAX_TEXT)
    const inViewport = rect.top >= 0 && rect.left >= 0 && rect.top <= vh && rect.left <= vw

    out.push({
      abelinkId: id,
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
// PENTING: fungsi aksi DOM di-serialisasi ke konteks halaman - self-contained,
// state dikirim lewat `args`. Aksi yang butuh API ekstensi (chrome.scripting,
// chrome.tabs, chrome.downloads) TIDAK BOLEH ditaruh di sini - tangani di
// fungsi act() pada konteks service worker (lihat bawah).
async function actionFn({ abelinkId, action, value, expectedText }) {
  const el = abelinkId ? document.querySelector(`[data-abelink-id="${abelinkId}"]`) : null
  if (abelinkId && !el)
    return {
      ok: false,
      error: `Elemen ${abelinkId} tidak ditemukan (DOM berubah? Panggil read-dom lagi).`
    }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  // Visual helper kursor & ripple ala browser-use
  const ensureStyles = () => {
    if (document.getElementById('abelink-agent-visual-styles')) return
    const s = document.createElement('style')
    s.id = 'abelink-agent-visual-styles'
    s.textContent = `
      #abelink-cursor-pointer {
        position: absolute;
        width: 22px;
        height: 22px;
        pointer-events: none;
        z-index: 2147483647;
        transition: left 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), top 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.3s ease;
        filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.45));
        transform: translate(-2px, -2px);
      }
      .abelink-click-ripple {
        position: absolute;
        border: 2px solid #1fb854;
        background: rgba(31, 184, 84, 0.25);
        border-radius: 50%;
        pointer-events: none;
        z-index: 2147483646;
        animation: abelink-ripple-anim 0.45s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
      }
      @keyframes abelink-ripple-anim {
        0% { transform: translate(-50%, -50%) scale(0.2); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
      }
    `
    document.documentElement.appendChild(s)
  }

  const showCursorAt = async (x, y) => {
    ensureStyles()
    let cur = document.getElementById('abelink-cursor-pointer')
    if (!cur) {
      cur = document.createElement('div')
      cur.id = 'abelink-cursor-pointer'
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
    rip.className = 'abelink-click-ripple'
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
      const cur = document.getElementById('abelink-cursor-pointer')
      if (cur) cur.style.opacity = '0'
    }, delayMs)
  }

  try {
    switch (action) {
      case 'click': {
        // Verifikasi anti-stale-ID: akN = urutan dokumen, DOM bisa bergeser
        // antara browser-read dan browser-click. Bila caller menyertakan
        // expectedText, pastikan elemen yang ditunjuk masih teks yang sama
        // SEBELUM klik. Absen -> jalur lama byte-identik (tanpa biaya).
        const want = String(expectedText ?? '').trim()
        if (want) {
          const hay = [
            typeof el.innerText === 'string' ? el.innerText.slice(0, 120) : '',
            typeof el.getAttribute === 'function' ? (el.getAttribute('aria-label') || '') : '',
            typeof el.value === 'string' ? el.value : ''
          ].join(' ')
          if (!hay.toLowerCase().includes(want.toLowerCase())) {
            return {
              ok: false,
              error: `Elemen ${abelinkId} berubah (diharapkan "${want}") — lakukan browser-read ulang.`
            }
          }
        }
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

async function act({ abelinkId, action, value, expectedText }, sessionId = 'default') {
  if (action === 'close') {
    const closed = await closeActiveGroupTabs(sessionId)
    return { ok: true, data: JSON.stringify({ closed }) }
  }

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
      // Kembalikan sebagai hasil perintah - loop bridge POST /result membawanya
      // ke sidecar (jalur balik yang memang ada; bukan sendMessage tanpa listener).
      return { ok: true, data: dataUrl }
    } catch (e) {
      return { ok: false, error: `browser-screenshot gagal: ${String(e?.message || e)}` }
    }
  }
  if (action === 'download') {
    return {
      ok: false,
      error: 'browser-download via ekstensi dinonaktifkan demi minimasi permission (keamanan user). Gunakan native download dari Abelink sidecar.'
    }
  }
  if (action === 'ask') {
    return { ok: false, error: 'browser-ask-user belum didukung versi ekstensi ini.' }
  }
  // --- Overlay lock (Fase A): show = resume eksplisit (bersihkan flag stop).
  if (action === 'overlay-show') {
    delete overlayStopped[sessionId]
    try {
      const label = value && typeof value === 'object' ? value.text : value
      const r = await setOverlay(tab.id, 'show', String(label || ''), sessionId)
      return { ok: true, data: JSON.stringify(r) }
    } catch (e) {
      return { ok: false, error: `overlay-show gagal: ${String(e?.message || e)}` }
    }
  }
  if (action === 'overlay-hide') {
    try {
      const r = await setOverlay(tab.id, 'hide', '', sessionId)
      return { ok: true, data: JSON.stringify(r) }
    } catch (e) {
      return { ok: false, error: `overlay-hide gagal: ${String(e?.message || e)}` }
    }
  }

  // --- Aksi DOM via injeksi halaman (click/type/select/press/scroll/extract) ---
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [{ abelinkId: abelinkId || null, action, value: value ?? null, expectedText: expectedText ?? null }],
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
      // Urutan token: tempelan manual > helper lokal (host flavor terpin) > simpanan per-port.
      const keptCfg = await getCfg()
      const pairing = await getPairing()
      // Flavor terpin menang atas port sesi lama; klik eksplisit (msg.port)
      // membuat/mengganti pairing. Tanpa keduanya -> fallback default.
      const targetPort = msg.port || pairing?.port || keptCfg.port || DEFAULT_PORT
      let token = (msg.token || '').trim()
      if (token.startsWith('{')) {
        try {
          const rec = JSON.parse(token)
          if (rec && typeof rec.token === 'string') token = rec.token
        } catch {}
      }
      let nativeDetail = ''
      if (!token) {
        const via = await getTokenViaNativeHost(targetPort)
        token = via.token
        nativeDetail = via.detail
      }
      if (!token) {
        token = await getPortToken(targetPort)
      }
      if (!token) {
        await chrome.storage.session.set({
          lastError: `Token kosong dan helper lokal tidak ada${nativeDetail ? ` (${nativeDetail})` : ''}. Tempel token manual sekali.`
        })
        sendResponse({ ok: false, error: 'token' })
        return
      }
      const cfg = {
        session: msg.session || keptCfg.session || 'default',
        token,
        port: targetPort
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
        // Tukar diam-diam + simpan persisten - tanpa tempel ulang selamanya.
        if (hs.body?.newToken) {
          cfg.token = hs.body.newToken
          await setPortToken(cfg.port, cfg.token)
        }
        if (hs.status === 403 || hs.status === 0) {
          await chrome.storage.session.set({
            lastError: 'Sidecar tidak terjangkau di 127.0.0.1. Pastikan Abelink berjalan.'
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
      await setPortToken(cfg.port, cfg.token)
      // Klik eksplisit = keputusan pairing: pin flavor ini untuk resume.
      await setPairing(cfg.port)
      if (!running) {
        running = true
        console.log(`[Abelink] loop poll jalan (session: ${cfg.session}, port: ${cfg.port}).`)
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
    } else if (msg?.type === 'overlay-stop') {
      // Stop dari pill di tab (scope sesi-tab): resolve inflight sebagai error
      // jujur agar loop pause; flag menahan perintah tab berikut.
      const session = msg.session || (await getCfg()).session
      const cur = inflight[session]
      overlayStopped[session] = true
      await hideOverlayDom(session)
      if (cur?.id) {
        try {
          await apiPost(
            cur.cfg,
            `result?session=${encodeURIComponent(session)}&token=${encodeURIComponent(cur.cfg.token)}`,
            { commandId: cur.id, ok: false, error: OVERLAY_STOP_MSG(session) }
          )
        } catch {
          /* sidecar akan timeout jujur */
        }
        delete inflight[session]
      }
      sendResponse({ ok: true, stopped: !!cur?.id })
    } else if (msg?.type === 'get-active-task') {
      const cfg = await getCfg()
      const session = msg.session || cfg.session
      let group = activeGroups[session]
      let hasTask = false
      let taskId = null
      if (group?.groupId != null) {
        try {
          const tabs = await chrome.tabs.query({ groupId: group.groupId })
          if (tabs && tabs.length > 0) {
            hasTask = true
            taskId = group.taskId
          } else {
            delete activeGroups[session]
            delete sessionTask[session]
            delete primaryTabs[session]
            delete overlayStopped[session]
            await saveSessionState()
          }
        } catch {
          delete activeGroups[session]
          delete sessionTask[session]
          delete primaryTabs[session]
          delete overlayStopped[session]
          await saveSessionState()
        }
      }
      sendResponse({ ok: true, hasTask, task: taskId })
    } else if (msg?.type === 'probe') {
      // Baca-saja: status Prod+Dev tanpa mengubah loop/sesi aktif.
      const ports = await probePorts()
      const cfg = await getCfg()
      sendResponse({ ok: true, ports, activePort: cfg.port, pairing: await getPairing() })
    } else if (msg?.type === 'status') {
      const cfg = await getCfg()
      sendResponse({
        ok: true,
        running,
        hasToken: !!cfg.token,
        session: cfg.session,
        port: cfg.port,
        pairing: await getPairing(),
        lastError: (await chrome.storage.session.get('lastError')).lastError
      })
    }
  })()
  return true // async response
})

let resumeTimeout = null

function scheduleAutoResume(delayMs = 5000) {
  if (running) return
  if (resumeTimeout) clearTimeout(resumeTimeout)
  resumeTimeout = setTimeout(() => {
    tryAutoResume()
  }, delayMs)
}

async function tryAutoResume() {
  if (running) return
  await loadSessionState()
  // Resume TANPA pairing = dilarang: user belum memilih flavor sekali pun.
  // Ini mematikan auto-switch lama (resume port sesi basi diam-diam).
  const pairing = await getPairing()
  if (!pairing) return
  let cfg = await getCfg()
  // Paksa port sesi ke flavor terpin (alasan sesi basi berbeda flavor).
  cfg = { ...cfg, port: pairing.port }
  try {
    await chrome.storage.session.set({ port: pairing.port })
  } catch {
    /* abaikan */
  }

  // Jika token di session storage kosong, ambil otomatis via native host (host
  // flavor terpin) atau local storage.
  if (!cfg.token) {
    const via = await getTokenViaNativeHost(cfg.port)
    if (via?.token) {
      cfg.token = via.token
      await chrome.storage.session.set({ token: via.token })
    } else {
      const stored = await getPortToken(cfg.port)
      if (stored) {
        cfg.token = stored
        await chrome.storage.session.set({ token: stored })
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
  }

  if (cfg.token) {
    try {
      const hs = await apiGet(cfg, 'handshake')
      if (hs.status === 200) {
        if (hs.body?.newToken) {
          cfg.token = hs.body.newToken
          await chrome.storage.session.set({ token: cfg.token })
          await setPortToken(cfg.port, cfg.token)
        }
        running = true
        await chrome.storage.session.set({ lastError: null })
        console.log(`[Abelink] auto-resume service worker aktif (session: ${cfg.session}, port: ${cfg.port}).`)
        loop()
        return
      }
    } catch {
      /* sidecar belum aktif / unreachable */
    }
  }

  // Jika belum tersambung, jadwalkan percobaan ulang berkala selama browser aktif
  scheduleAutoResume(5000)
}

if (typeof chrome !== 'undefined' && chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'abelink-bridge-keepalive') {
      tryAutoResume()
    }
  })
  chrome.alarms.create('abelink-bridge-keepalive', { periodInMinutes: 1 })
}

chrome.runtime.onStartup.addListener(() => {
  tryAutoResume()
})

// Listener tab & group agar state activeGroups sinkron secara reaktif
if (typeof chrome !== 'undefined') {
  if (chrome.tabGroups?.onRemoved) {
    chrome.tabGroups.onRemoved.addListener((group) => {
      for (const [s, g] of Object.entries(activeGroups)) {
        if (g?.groupId === group.id) {
          delete activeGroups[s]
          delete sessionTask[s]
          delete primaryTabs[s]
          delete overlayStopped[s]
          saveSessionState()
        }
      }
    })
  }

  if (chrome.tabs?.onRemoved) {
    chrome.tabs.onRemoved.addListener(async (tabId) => {
      for (const [s, pId] of Object.entries(primaryTabs)) {
        if (pId === tabId) {
          delete primaryTabs[s]
          delete overlayStopped[s]
        }
      }
      for (const [s, g] of Object.entries(activeGroups)) {
        if (g?.groupId != null) {
          try {
            const tabs = await chrome.tabs.query({ groupId: g.groupId })
            if (!tabs || tabs.length === 0) {
              delete activeGroups[s]
              delete sessionTask[s]
              delete primaryTabs[s]
              delete overlayStopped[s]
            }
          } catch {
            delete activeGroups[s]
            delete sessionTask[s]
            delete primaryTabs[s]
            delete overlayStopped[s]
          }
        }
      }
      saveSessionState()
    })
  }
}

tryAutoResume()


