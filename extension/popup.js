/* global chrome */
// Popup = indikator status, bukan ritual sambung/putus.
// Dibuka -> auto-connect via helper lokal (fallback: token manual di details).
// Tombol tutup tab hanya muncul bila ada task grup aktif.
const $ = (id) => document.getElementById(id)

function setPill(kind, text) {
  const pill = $('pill')
  pill.className = `pill ${kind}`
  pill.textContent = text
}

async function refresh() {
  const res = await chrome.runtime.sendMessage({ type: 'status' })
  const el = $('status')
  const reconnectBtn = $('reconnect')
  if (res?.running) {
    setPill('ok', 'tersambung')
    el.className = 'ok'
    el.textContent = `Session: ${res.session}. Menunggu perintah...`
    if (reconnectBtn) reconnectBtn.hidden = true
  } else if (res?.lastError) {
    setPill('err', 'terputus')
    el.className = 'err'
    el.textContent = `Status: ${res.lastError}`
    if (reconnectBtn) reconnectBtn.hidden = false
  } else {
    setPill('warn', 'belum tersambung')
    el.className = ''
    el.textContent = 'Menunggu sidecar Mark...'
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
  // Token kosong = background mencoba helper lokal dulu.
  const res = await chrome.runtime.sendMessage({ type: 'start', token: '', session: 'default' })
  if (res?.ok !== true) setPill('warn', 'belum tersambung')
  await refresh()
}

$('reconnect')?.addEventListener('click', async () => {
  setPill('warn', 'menghubungkan…')
  $('status').className = ''
  $('status').textContent = 'Menghubungkan otomatis ke sidecar Mark…'
  await autoConnect()
})

$('start').addEventListener('click', async () => {
  const token = $('token').value.trim()
  if (!token) {
    $('status').className = 'err'
    $('status').textContent = 'Tempel token dulu, atau biarkan otomatis.'
    return
  }
  const res = await chrome.runtime.sendMessage({
    type: 'start',
    token,
    session: $('session').value.trim() || 'default'
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
    el.textContent = `Tab task ditutup: ${res.closed ?? 0}.`
  } else {
    el.className = 'err'
    el.textContent = 'Gagal menutup tab task.'
  }
  refreshTask()
})

autoConnect()
