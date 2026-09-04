/* global chrome */
const $ = (id) => document.getElementById(id)

async function refresh() {
  const res = await chrome.runtime.sendMessage({ type: 'status' })
  const el = $('status')
  if (res?.running) {
    el.className = 'ok'
    el.textContent = `Terhubung (session: ${res.session}). Menunggu perintah...`
  } else if (res?.lastError) {
    el.className = 'err'
    el.textContent = `Error: ${res.lastError}`
  } else {
    el.className = ''
    el.textContent = 'Tidak terhubung. Tempel token lalu klik Sambungkan.'
  }
}

$('start').addEventListener('click', async () => {
  const token = $('token').value.trim()
  if (!token) {
    $('status').className = 'err'
    $('status').textContent = 'Token wajib diisi.'
    return
  }
  await chrome.runtime.sendMessage({
    type: 'start',
    token,
    session: $('session').value.trim() || 'default'
  })
  $('token').value = ''
  refresh()
})

$('stop').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'stop' })
  refresh()
})

refresh()
