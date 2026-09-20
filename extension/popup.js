/* global chrome */
// Popup = indikator status loop bridge, bukan probe.
// Pill hijau HANYA bila running===true (kontrak: popup-status.mjs).
import { popupStatus } from './popup-status.mjs'
const $ = (id) => document.getElementById(id)

function setPill(kind, text) {
  const pill = $('pill')
  pill.className = `pill ${kind}`
  pill.textContent = text
}

function readPort() {
  const raw = ($('port')?.value || '').trim()
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

async function refresh() {
  const res = await chrome.runtime.sendMessage({ type: 'status' })
  const el = $('status')
  const reconnectBtn = $('reconnect')
  // Tampilkan port tersimpan agar tak terisi ulang diam-diam.
  if ($('port') && !$('port').value && res?.port) $('port').value = res.port
  // Kontrak popup-status.mjs: pill hijau HANYA bila running===true.
  // pairing flavor:port + lastError selalu ditampilkan bila ada.
  const st = popupStatus({ running: res?.running, lastError: res?.lastError, pairing: res?.pairing })
  const target = `127.0.0.1:${res?.port || '?'}`
  const pin = res?.pairing ? ` [${res.pairing.flavor} :${res.pairing.port} terpin]` : ' [belum pilih flavor]'
  setPill(st.kind, st.pill)
  if (st.pill === 'tersambung') {
    el.className = 'ok'
    el.textContent = `Session: ${res.session} @ ${target}${pin}. Menunggu perintah...`
    if (reconnectBtn) reconnectBtn.hidden = true
  } else if (st.pill === 'terputus') {
    el.className = 'err'
    el.textContent = `Target: ${target}${pin}\nStatus: ${res.lastError}`
    if (reconnectBtn) reconnectBtn.hidden = false
  } else {
    el.className = ''
    el.textContent = `Target: ${target}${pin}\nMenunggu sidecar Abelink...`
    if (reconnectBtn) reconnectBtn.hidden = false
  }
  await refreshTask()
}

async function refreshTask() {
  const taskEl = $('task')
  const btn = $('closeTabs')
  try {
    const res = await chrome.runtime.sendMessage({ type: 'get-active-task' })
    if (res?.hasTask) {
      taskEl.textContent = `Task aktif: ${res.task || 'browser'}`
      btn.hidden = false
      return
    }
  } catch {
    /* background tidak menjawab */
  }
  taskEl.textContent = ''
  btn.hidden = true
}

async function autoConnect() {
  // Dengan pairing: resume flavor terpin. Tanpa pairing: tampilkan pilihan,
  // JANGAN auto-start diam-diam (matikan silent auto-pilih-port-hidup).
  try {
    const probe = await chrome.runtime.sendMessage({ type: 'probe' }).catch(() => null)
    if (probe) {
      renderPorts(probe.ports || [], probe.activePort, probe.pairing)
      if (probe.pairing) {
        const res = await chrome.runtime.sendMessage({ type: 'start', token: '', session: 'default', port: probe.pairing.port }).catch(() => null)
        if (res?.ok === true) {
          await refresh()
          return
        }
      } else {
        setPill('warn', 'pilih flavor sekali')
        await refresh()
        return
      }
    }
  } catch {
    /* jatuh ke start langsung */
  }
  // Token kosong = background mencoba helper lokal dulu (port = pairing/pin tersimpan).
  const msg = { type: 'start', token: '', session: 'default' }
  const port = readPort()
  if (port) msg.port = port
  const res = await chrome.runtime.sendMessage(msg)
  if (res?.ok !== true) setPill('warn', 'belum tersambung')
  await refresh()
}

function renderPorts(ports, activePort, pairing) {
  const box = $('ports')
  if (!box) return
  box.innerHTML = ''
  if (!pairing && ports.length > 0) {
    const hint = document.createElement('div')
    hint.style.cssText = 'font-size:11px;opacity:0.7;margin:2px 0 4px;'
    hint.textContent = 'Pilih Prod atau Dev sekali — pilihan tersimpan otomatis.'
    box.appendChild(hint)
  }
  for (const p of ports) {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:11px;margin:2px 0;'
    const dot = document.createElement('span')
    const color = !p.reachable ? '#ff6b6b' : p.port === activePort ? '#4ade80' : '#fbbf24'
    dot.style.cssText = `width:8px;height:8px;border-radius:999px;background:${color};flex-shrink:0;`
    const label = document.createElement('span')
    label.style.opacity = '0.85'
    const pinned = pairing && p.port === pairing.port ? 'terpin · ' : ''
    label.textContent = `${p.label || ''} :${p.port} — ${pinned}${!p.reachable ? 'mati' : p.port === activePort ? 'aktif' : 'siap'}`
    row.appendChild(dot)
    row.appendChild(label)
    // Tombol eksplisit per baris non-pin: klik = start + pin pairing baru.
    // Tanpa pairing semua baris dapat tombol (pilih sekali); dengan pairing
    // hanya flavor lain (switch eksplisit, tanpa auto-switch).
    if (!pinned) {
      const btn = document.createElement('button')
      btn.textContent = 'Pakai'
      btn.style.cssText = 'margin:0 0 0 auto;width:auto;padding:2px 10px;font-size:11px;'
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        setPill('warn', 'menghubungkan…')
        await chrome.runtime.sendMessage({ type: 'start', token: '', session: 'default', port: p.port })
        await autoConnect()
      })
      row.appendChild(btn)
    }
    box.appendChild(row)
  }
}

$('reconnect')?.addEventListener('click', async () => {
  setPill('warn', 'menghubungkan…')
  $('status').className = ''
  $('status').textContent = 'Menghubungkan otomatis ke sidecar Abelink…'
  await autoConnect()
})

$('start').addEventListener('click', async () => {
  const token = $('token').value.trim()
  if (!token) {
    $('status').className = 'err'
    $('status').textContent = 'Tempel token dulu, atau biarkan otomatis.'
    return
  }
  const port = readPort()
  const res = await chrome.runtime.sendMessage({
    type: 'start',
    token,
    session: $('session').value.trim() || 'default',
    ...(port ? { port } : {})
  })
  if (res?.ok !== true) {
    $('status').className = 'err'
    $('status').textContent = 'Gagal tersambung. Periksa token.'
  }
  $('token').value = ''
  refresh()
})

$('closeTabs').addEventListener('click', async () => {
  const res = await chrome.runtime.sendMessage({ type: 'close-task-tabs', session: 'default' })
  const el = $('status')
  if (res?.ok) {
    el.className = 'ok'
    el.textContent = res.closed > 0 
      ? `Tab task ditutup: ${res.closed}.` 
      : 'Task aktif dibersihkan.'
  } else {
    el.className = 'err'
    el.textContent = 'Gagal menutup tab task.'
  }
  await refreshTask()
})

autoConnect()
