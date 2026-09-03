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
        // Token berubah (restart sidecar). Berhenti; popup menyalakan lagi.
        running = false
        await chrome.storage.session.set({
          lastError: 'Token ditolak (401). Tempel token baru lewat popup.'
        })
        break
      }
      const { command } = await res.json()
      if (command) {
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

// -------------------------------------------------------------- commands
async function runCommand(cfg, command) {
  let result
  try {
    result = await execute(cfg, command)
  } catch (e) {
    result = { ok: false, error: String(e?.message || e) }
  }
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

async function execute(cfg, command) {
  switch (command.type) {
    case 'navigate':
      return navigate(command.payload)
    case 'read-dom':
      return readDom()
    case 'act':
      return act(command.payload)
    case 'show':
      return showTab()
    default:
      return { ok: false, error: `Perintah tidak dikenal: ${command.type}` }
  }
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

async function navigate({ url }) {
  let tab = await activeOrFindTab()
  if (!tab) {
    tab = await chrome.tabs.create({ url, active: false })
  } else {
    await chrome.tabs.update(tab.id, { url })
  }
  await waitForLoad(tab.id, NAV_TIMEOUT_MS)
  await sleep(SETTLE_MS)
  return readDomInTab(tab.id)
}

function waitForLoad(tabId, timeoutMs) {
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

async function readDom() {
  const tab = await activeOrFindTab()
  if (!tab)
    return {
      ok: false,
      error: 'Tidak ada tab aktif http(s). Buka halaman dulu atau pakai navigate.'
    }
  return readDomInTab(tab.id)
}

async function showTab() {
  const tab = await activeOrFindTab()
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
  const SELECTORS =
    'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [tabindex]:not([tabindex="-1"])'
  const els = document.querySelectorAll(SELECTORS)
  const out = []
  const MAX = 80
  const MAX_TEXT = 80
  let n = 1
  for (const el of els) {
    if (out.length >= MAX) break
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) continue
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none') continue
    const id = 'mk' + n++
    el.setAttribute('data-mark-id', id)
    const text = (el.innerText || el.value || el.getAttribute('aria-label') || el.placeholder || '')
      .trim()
      .slice(0, MAX_TEXT)
    out.push({
      markId: id,
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || el.getAttribute('role') || '',
      text,
      placeholder: el.placeholder || '',
      href: el.href ? el.href.slice(0, 200) : '',
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
// PENTING: fungsi aksi juga di-serialisasi ke konteks halaman — self-contained,
// state dikirim lewat `args`.
function actionFn({ markId, action, value }) {
  const el = markId ? document.querySelector(`[data-mark-id="${markId}"]`) : null
  if (markId && !el)
    return {
      ok: false,
      error: `Elemen ${markId} tidak ditemukan (DOM berubah? Panggil read-dom lagi).`
    }
  const fire = (elm, type) => elm.dispatchEvent(new Event(type, { bubbles: true }))
  try {
    switch (action) {
      case 'click':
        el.scrollIntoView({ block: 'center' })
        el.click()
        break
      case 'type':
        el.focus()
        el.value = value
        fire(el, 'input')
        fire(el, 'change')
        break
      case 'select':
        el.value = value
        fire(el, 'change')
        break
      case 'press':
        document.activeElement?.dispatchEvent(
          new KeyboardEvent('keydown', { key: value, bubbles: true })
        )
        break
      case 'scroll':
        window.scrollBy(0, Number(value) || 600)
        break
      default:
        return { ok: false, error: `Aksi tidak dikenal: ${action}` }
    }
    return { ok: true, data: 'ok' }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

async function act({ markId, action, value }) {
  const tab = await activeOrFindTab()
  if (!tab) return { ok: false, error: 'Tidak ada tab aktif http(s) untuk aksi.' }
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [{ markId: markId || null, action, value: value ?? null }],
    func: actionFn
  })
  const step = injection?.result
  if (!step?.ok) return step || { ok: false, error: 'Injection aksi gagal.' }
  await sleep(300)
  // Setelah aksi, balikin DOM ter-tag lagi (polanya: read-dom ulang).
  return readDomInTab(tab.id)
}

// ------------------------------------------------------------- lifecycle
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  ;(async () => {
    if (msg?.type === 'start') {
      const cfg = {
        session: msg.session || 'default',
        token: msg.token,
        port: msg.port || DEFAULT_PORT
      }
      // Verifikasi token sebelum masuk loop: error langsung terlihat di popup
      // (token salah vs sidecar mati dibedakan).
      try {
        const hs = await apiGet(cfg, 'handshake')
        if (hs.status === 401) {
          await chrome.storage.session.set({
            lastError: 'Token ditolak sidecar (401). Periksa salinan token.'
          })
          sendResponse({ ok: false, error: 'token' })
          return
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
      if (!running) {
        running = true
        loop()
      }
      sendResponse({ ok: true })
    } else if (msg?.type === 'stop') {
      running = false
      pollAbort?.abort()
      await chrome.storage.session.set({ lastError: null })
      sendResponse({ ok: true })
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
