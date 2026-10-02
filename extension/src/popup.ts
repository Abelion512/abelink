/* global chrome */
// Popup = indikator status loop bridge, bukan probe.
// Pill hijau HANYA bila running===true (kontrak: lib/popup-status.ts).
//
// EKSTENSI `.js` WAJIB di specifier: service worker dimuat sebagai modul ES oleh
// Chrome, dan resolver modul browser TIDAK menebak ekstensi seperti bundler.
// Berkas yang diimpor adalah hasil transpile `lib/popup-status.ts`.
import { popupStatus } from './lib/popup-status.js'

// W8: `document.getElementById` mengembalikan `HTMLElement | null`, dan `value`
// hanya ada pada elemen input. Helper di bawah mempersempit tipe TANPA mengubah
// perilaku runtime: `null` tetap diteruskan apa adanya ke jalur yang sudah
// menangani null (pengguna yang tidak bisa diklik diam-diam), bukan dilembutkan
// jadi object kosong palsu.
const $ = (id: string): HTMLElement | null => document.getElementById(id)
const $input = (id: string): HTMLInputElement | null =>
  document.getElementById(id) as HTMLInputElement | null

function setPill(kind: string, text: string) {
  const pill = $('pill')
  if (!pill) return
  pill.className = `pill ${kind}`
  pill.textContent = text
}

function readPort(): number | undefined {
  const raw = ($input('port')?.value || '').trim()
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

// Bentuk balasan service worker ke popup. Dideklarasikan longgar di sisi
// (`unknown`) lalu dibaca lewat optional chaining persis seperti kode lama.
type StatusReply = {
  running?: boolean
  lastError?: unknown
  notice?: unknown
  port?: number
  session?: string
  pairing?: { flavor: string; port: number } | null
} | null

async function refresh() {
  const res = (await chrome.runtime.sendMessage({ type: 'status' })) as StatusReply
  const el = $('status')
  const reconnectBtn = $('reconnect')
  if (!el) return
  // Tampilkan port tersimpan agar tak terisi ulang diam-diam.
  const portEl = $input('port')
  if (portEl && !portEl.value && res?.port) portEl.value = String(res.port)
  // Kontrak lib/popup-status.ts: pill hijau HANYA bila running===true.
  // pairing flavor:port + lastError selalu ditampilkan bila ada.
  // notice (transien, mis. "Menyambung ulang otomatis...") dirender kuning,
  // bukan merah — merah hanya untuk lastError nyata.
  const st = popupStatus({
    running: res?.running,
    lastError: res?.lastError,
    notice: res?.notice,
    pairing: res?.pairing ?? null
  })
  const target = `127.0.0.1:${res?.port || '?'}`
  const pin = res?.pairing ? ` [${res.pairing.flavor} :${res.pairing.port} terpin]` : ' [belum pilih flavor]'
  setPill(st.kind, st.pill)
  if (st.pill === 'tersambung') {
    el.className = 'ok'
    el.textContent = `Session: ${res?.session} @ ${target}${pin}. Menunggu perintah...`
    if (reconnectBtn) reconnectBtn.hidden = true
  } else if (st.kind === 'warn' && res?.notice && !res?.lastError) {
    el.className = ''
    el.textContent = `Target: ${target}${pin}\n${res.notice}`
    if (reconnectBtn) reconnectBtn.hidden = true
  } else if (st.pill === 'terputus') {
    el.className = 'err'
    el.textContent = `Target: ${target}${pin}\nStatus: ${res?.lastError}`
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
  if (!taskEl || !btn) return
  try {
    const res = (await chrome.runtime.sendMessage({ type: 'get-active-task' })) as {
      hasTask?: boolean
      task?: string
    } | null
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

interface ProbePort {
  port: number
  label?: string
  reachable?: boolean
}

type ProbeReply = {
  ports?: ProbePort[]
  activePort?: number
  pairing?: { flavor: string; port: number } | null
} | null

async function autoConnect() {
  // Dengan pairing: resume flavor terpin. Tanpa pairing: tampilkan pilihan,
  // JANGAN auto-start diam-diam (matikan silent auto-pilih-port-hidup).
  try {
    const probe = (await chrome.runtime.sendMessage({ type: 'probe' }).catch(() => null)) as ProbeReply
    if (probe) {
      renderPorts(probe.ports || [], probe.activePort, probe.pairing)
      if (probe.pairing) {
        const res = (await chrome.runtime
          .sendMessage({ type: 'start', token: '', session: 'default', port: probe.pairing.port })
          .catch(() => null)) as { ok?: boolean } | null
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
  const msg: { type: string; token: string; session: string; port?: number } = {
    type: 'start',
    token: '',
    session: 'default'
  }
  const port = readPort()
  if (port) msg.port = port
  const res = (await chrome.runtime.sendMessage(msg)) as { ok?: boolean } | null
  if (res?.ok !== true) setPill('warn', 'belum tersambung')
  await refresh()
}

function renderPorts(
  ports: ProbePort[],
  activePort: number | undefined,
  pairing: { flavor: string; port: number } | null | undefined
) {
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
  const status = $('status')
  if (status) {
    status.className = ''
    status.textContent = 'Menghubungkan otomatis ke sidecar Abelink…'
  }
  await autoConnect()
})

$('start')?.addEventListener('click', async () => {
  const token = tokenInput()?.trim()
  if (!token) {
    setStatus('err', 'Tempel token dulu, atau biarkan otomatis.')
    return
  }
  const port = readPort()
  const res = (await chrome.runtime.sendMessage({
    type: 'start',
    token,
    session: $input('session')?.value.trim() || 'default',
    ...(port ? { port } : {})
  })) as { ok?: boolean } | null
  if (res?.ok !== true) {
    setStatus('err', 'Gagal tersambung. Periksa token.')
  }
  const tokenEl = $input('token')
  if (tokenEl) tokenEl.value = ''
  refresh()
})

$('closeTabs')?.addEventListener('click', async () => {
  const res = (await chrome.runtime.sendMessage({ type: 'close-task-tabs', session: 'default' })) as {
    ok?: boolean
    closed?: number
  } | null
  if (res?.ok) {
    setStatus(
      'ok',
      res.closed! > 0
        ? `Tab task ditutup: ${res.closed}.`
        : 'Task aktif dibersihkan.'
    )
  } else {
    setStatus('err', 'Gagal menutup tab task.')
  }
  await refreshTask()
})

function tokenInput(): string | undefined {
  return $input('token')?.value.trim()
}

function setStatus(kind: string, text: string) {
  const status = $('status')
  if (!status) return
  status.className = kind
  status.textContent = text
}

// Auto-connect saat popup dibuka user. Dilewati bila dibuka instrumentation
// (query ?noprobe=1) agar alat ukur membaca status tanpa memicu side effect
// attempt start (kontaminasi lastError/running pada pengukuran MV3).
if (!location.search.includes('noprobe')) autoConnect()
