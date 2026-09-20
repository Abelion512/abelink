// Tool browser/web (dipindah murni dari main/node-tools.js).
import fs from 'node:fs'
import path from 'node:path'
import { normalizeAbelinkId } from '../browser/bridge-core.mjs'
import { getWorkspaceDir } from './_shared.mjs'
import { assertContained } from '../utils/fsGuard.js'
import { formatBrowserObservation } from '../../../extension/browser-observation.mjs'

// Extension-first untuk tool browser: coba browser fisik bila ADA sesi yang
// terhubung (preferensi 'default'), kembalikan null agar caller fallback ke
// perilaku lama. Tidak pernah throw.
const pickConnected = (sessions = [], targetSession = 'default') =>
  sessions.find((s) => s.id === targetSession && s.connected) ||
  sessions.find((s) => s.id === 'default' && s.connected) ||
  sessions.find((s) => s.connected) ||
  null

// Auto-launch satu pintu: bila tidak ada sesi connected dan config
// browserAutoLaunch aktif, bukakan browser user yang terpasang extension,
// tunggu handshake bounded, lalu kembalikan sesinya. Gagal -> null (kontrak
// lama: caller lain cukup cek `!up`), dengan alasan disalin ke
// `ensureExtensionUp.lastReason` agar browser-navigate bisa blocked jujur.
// Tidak pernah throw.
const ensureExtensionUp = async ({ url = null, sessionId = 'default', onStatus = null } = {}) => {
  try {
    const core = await import('../browser/bridge-core.mjs')
    const launcher = await import('../browser/launcher.mjs')
    if (!core.getBrowserConfig()?.autoLaunch) {
      ensureExtensionUp.lastReason = 'auto-launch-off'
      return null
    }
    // Transparansi 20s: status handshake diteruskan sebagai event
    // browser:status agar UI/renderer menampilkannya (pola ai:status).
    // onStatus dari pemanggil menang; fallback emit langsung.
    const emitBrowserStatus = typeof onStatus === 'function'
      ? onStatus
      : async (msg) => {
          try {
            const { emit } = await import('../../engine/registry.mjs')
            emit('browser:status', msg)
          } catch {}
        }
    const r = await launcher.ensureBrowserUp({
      url,
      sessionId,
      autoLaunch: true,
      listSessions: core.listSessions,
      onStatus: (m) => { emitBrowserStatus(m) }
    })
    if (r.ok) {
      ensureExtensionUp.lastReason = null
      return r.session
    }
    ensureExtensionUp.lastReason = r.reason || 'no-handshake'
    return null
  } catch {
    ensureExtensionUp.lastReason = 'no-handshake'
    return null
  }
}

const tryExtensionAct = async (payload, sessionId = 'default', opts = {}) => {
  try {
    const { listSessions, dispatchCommand } = await import('../browser/bridge-core.mjs')
    const sessions = listSessions()
    const targetSession = payload?.sessionId || sessionId || 'default'
    let pick = pickConnected(sessions, targetSession)
    if (!pick) {
      const up = await ensureExtensionUp({
        sessionId: targetSession,
        onStatus: async (m) => {
          try {
            const { emit } = await import('../../engine/registry.mjs')
            emit('browser:status', m)
          } catch {}
        }
      })
      if (!up) return null
      pick = up
    }
    const enriched = { ...payload, sessionId: targetSession }
    const res = await dispatchCommand(pick.id, 'act', enriched)
    // raw:true mengembalikan hasil apa adanya (ok maupun !ok) agar caller
    // bisa meneruskan error spesifik extension (mis. mismatch verifikasi
    // teks klik). Default tetap kontrak lama: hanya ok, selain itu null.
    if (opts.raw) return res ?? null
    return res && res.ok ? res : null
  } catch {
    return null
  }
}

// E3: alasan launch spesifik -> instruksi agen yang tepat (berhenti + lapor,
// bukan mengulang xdg-open). launch-budget-exhausted = rem tab-storm aktif.
const LAUNCH_REASON_HINT = {
  'launch-budget-exhausted':
    'Rem tab-storm aktif (terlalu banyak buka browser). BERHENTI: jangan panggil browser-navigate lagi. Laporkan ke user: klik Connect di popup extension, lalu minta lanjutkan.',
  'auto-launch-off':
    'Auto-launch dimatikan di Capabilities. Jangan buka browser paksa. Tawarkan user membuka manual, atau lanjutkan via fetch.',
  'launch-failed':
    'Browser OS gagal dibuka (xdg-open). Cek browser default user, lalu laporkan.',
  'no-handshake':
    'Extension tidak menjawab handshake. Minta user klik Connect di popup ABELINK BRIDGE, lalu coba sekali lagi (maks 1x).'
}

// Hint disconnect yang machine-actionable: menyatakan apa yang sudah dicoba
// otomatis + langkah model berikutnya. Jangan kembalikan instruksi manual
// ke user (model memparafrasenya menjadi "silakan buka tab...").
export const NO_EXTENSION_HINT =
  'Extension tidak tersambung setelah auto-launch bounded (atau auto-launch nonaktif di Capabilities). ' +
  'Langkah berikutnya: panggil browser-navigate <url-lengkap> untuk membuka tab baru; ' +
  'bila itu pun gagal, laporkan blocked dengan bukti. Jangan meminta user membuka tab manual.'

// E3: gabung reason + hint spesifik. Dipakai browser-navigate saat blocked.
export const launchBlockMessage = (reason) =>
  `${reason || 'no-handshake'}. ${LAUNCH_REASON_HINT[reason] || LAUNCH_REASON_HINT['no-handshake']}`

// Baca DOM dari tab aktif ekstensi browser fisik.
const tryExtensionReadDom = async (sessionId = 'default', deps = {}) => {
  try {
    const core = deps.core ?? (await import('../browser/bridge-core.mjs'))
    const ensureUp = deps.ensureExtensionUp ?? ensureExtensionUp
    const sessions = core.listSessions()
    const targetSession = sessionId || 'default'
    let pick =
      sessions.find((s) => s.id === targetSession && s.connected) ||
      sessions.find((s) => s.id === 'default' && s.connected) ||
      sessions.find((s) => s.connected)
    // Sama seperti tryExtensionAct: tidak ada sesi -> bukakan browser OS
    // (bounded) lalu coba lagi, bukan langsung menyerah ke user.
    if (!pick) {
      const up = await ensureUp({ sessionId: targetSession })
      if (!up) return null
      pick = up
    }
    const dispatch = deps.dispatchCommand ?? core.dispatchCommand
    const attemptRead = async () => {
      try {
        const res = await dispatch(pick.id, 'read-dom', { sessionId: targetSession })
        return res && res.ok ? res : null
      } catch {
        return null
      }
    }
    let ext = await attemptRead()
    if (!ext) {
      // Tab ditutup user tapi sesi hidup: buka ulang URL terakhir sekali,
      // lalu baca lagi. Gagal lagi -> null (caller memakai error jujur).
      const lastUrl = deps.getLastUrl ? deps.getLastUrl(targetSession) : core.getLastUrl?.(targetSession)
      if (lastUrl) {
        try {
          const nav = await dispatch(pick.id, 'navigate', { url: lastUrl, sessionId: targetSession })
          if (nav && nav.ok) ext = await attemptRead()
        } catch {
          /* jatuh ke null */
        }
      }
    }
    return ext
  } catch {
    return null
  }
}

// Hook uji untuk recovery read (lihat tests/browserReadRecovery.test.mjs).
export const tryExtensionReadDomForTest = tryExtensionReadDom

// Parse target klik: `akN` atau `akN||teks-yang-diharapkan` (verifikasi
// anti-stale-ID). `||` pertama pemisah; `||` berikutnya bagian expected.
export function parseClickTarget(query) {
  const raw = String(query ?? '')
  const sep = raw.indexOf('||')
  if (sep < 0) return { id: raw, expected: '' }
  return { id: raw.slice(0, sep), expected: raw.slice(sep + 2).trim() }
}

// Pure matcher untuk verifikasi teks klik (unit-testable; DOM Element
// diganti objek duck-type { innerText, getAttribute, value }).
// expected kosong -> true (jalur lama tanpa biaya tambahan).
export function elementTextMatches(el, expected) {
  const want = String(expected ?? '').trim().toLowerCase()
  if (!want) return true
  if (!el) return false
  const hay = [
    typeof el.innerText === 'string' ? el.innerText.slice(0, 120) : '',
    typeof el.getAttribute === 'function' ? (el.getAttribute('aria-label') || '') : '',
    typeof el.value === 'string' ? el.value : ''
  ]
    .join(' ')
    .toLowerCase()
  return hay.includes(want)
}

// Fetch + parse HTML polos (fallback bila extension tidak tersambung).
// Dipakai browser-read dan browser-extract (dulu via this['browser-read']
// yang selalu crash di modul ESM karena this === undefined).
const browserReadFetch = async (query) => {
  const { extractUrl } = await import('../browser/bridge-core.mjs')
  const url = extractUrl(query) || query
  const htmlRes = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(30000)
  })
  const content = await htmlRes.text()
  const { Parser } = await import('htmlparser2')
  const cleanedText = await new Promise((resolve, reject) => {
    let text = ''
    const parser = new Parser({
      ontext: (textChunk) => { text += textChunk },
      onend: () => { resolve(text.trim()) }
    }, { decodeEntities: true })
    parser.write(content)
    parser.end()
  })
  return {
    success: true,
    data: {
      url,
      text: cleanedText.slice(0, 50000),
      raw: content.slice(0, 100000)
    }
  }
}
// Simple web fetch tool as fallback for browser research
const webFetch = async (query) => {
  try {
    const res = await browserReadFetch(query)
    return { success: true, data: res.data?.raw || res.data?.text || '' }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// Ekstrak link hasil dari DOM halaman google.com/search (pure, unit-testable).
// Bentuk DOM extension bervariasi -> terima beberapa bentuk umum: array
// elements {text,href|url}, links [{title,url}], atau html string.
export function extractGoogleResults(dom) {
  if (!dom) return []
  if (Array.isArray(dom.links)) {
    return dom.links
      .filter((l) => l && (l.url || l.href))
      .slice(0, 5)
      .map((l) => ({ title: l.title || l.text || 'Web Result', url: l.url || l.href, snippet: l.snippet || '' }))
  }
  const els = Array.isArray(dom.elements) ? dom.elements : Array.isArray(dom) ? dom : null
  if (els) {
    const links = els
      .filter((e) => e && (e.href || e.url) && !/google\.com\/(search|url)/.test(e.href || e.url || ''))
      .slice(0, 5)
      .map((e) => ({ title: e.text || e.title || 'Web Result', url: e.href || e.url, snippet: e.snippet || '' }))
    if (links.length > 0) return links
  }
  const html = typeof dom === 'string' ? dom : dom.html || dom.markdown || ''
  if (typeof html !== 'string' || !html) return []
  const hrefs = [...html.matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([^<]{3,120})<\/a>/g)]
    .map((m) => ({ title: m[2].trim(), url: m[1] }))
    .filter((l) => !/google\.com/.test(l.url) && !/support\.google|accounts\.google/.test(l.url))
  return hrefs.slice(0, 5).map((l) => ({ ...l, snippet: '' }))
}

// Cooldown pencarian web: DDG melempar rate-limit bila dihantam retry loop.
// Cache hasil (sukses maupun gagal) 60 detik per query agar loop planner
// tidak menembak DDG berkali-kali dalam sedetik.
const searchCooldown = new Map()
const SEARCH_CACHE_MS = 60000
let ddgRateLimitedUntil = 0
let lastDdgWarnAt = 0

export const browserTools = {
  'browser-search': {
    needsApproval: false,
    handler: async (query, config) => {
      try {
        const searchQuery = query ? query.trim() : ''
        if (!searchQuery) return { success: false, message: 'Query pencarian kosong.' }

        const cacheKey = searchQuery.toLowerCase()
        const cached = searchCooldown.get(cacheKey)
        if (cached && Date.now() - cached.at < SEARCH_CACHE_MS) return cached.data
        // Cache success-only: hanya hasil berisi yang diingat, agar kegagalan
        // tiap layer tidak membekukan query selama 60 detik.
        const remember = (data) => {
          searchCooldown.set(cacheKey, { at: Date.now(), data })
          if (searchCooldown.size > 200) {
            const oldest = searchCooldown.keys().next().value
            searchCooldown.delete(oldest)
          }
          return data
        }

        let results = []
        let routerErr = null
        let extErr = null

        // Layer (a): 9Router dulu. Key dari handler `config` (pola ai-bridge:
        // config?.customApiKey) dengan fallback env; tanpa key -> skip.
        if (results.length === 0) {
          try {
            const { searchViaRouter, DEFAULT_ROUTER_ENDPOINT } = await import('./routerSearch.mjs')
            const endpoint = process.env.ROUTER_ENDPOINT || DEFAULT_ROUTER_ENDPOINT
            const apiKey = config?.customApiKey || process.env.ROUTER_API_KEY
            results = await searchViaRouter(searchQuery, { endpoint, apiKey })
          } catch (rErr) {
            routerErr = rErr?.message || String(rErr)
            if (Date.now() - lastDdgWarnAt > 30000) {
              lastDdgWarnAt = Date.now()
              console.warn('[browser-search] router search failed, trying next layer:', routerErr)
            }
          }
        }

        // Layer (b): browser fisik google.com via extension — hanya bila ada
        // sesi connected. Gagal -> layer berikut, error jujur, tanpa fake.
        if (results.length === 0) {
          try {
            const { listSessions, dispatchCommand } = await import('../browser/bridge-core.mjs')
            const targetSession = config?.sessionId || 'default'
            const pick = pickConnected(listSessions(), targetSession)
            if (!pick) throw new Error('extension tidak tersambung')
            const gUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`
            const nav = await dispatchCommand(pick.id, 'navigate', { url: gUrl, sessionId: targetSession })
            if (!nav || !nav.ok) throw new Error(nav?.error || 'navigate google gagal')
            const ext = await tryExtensionReadDom(targetSession)
            results = extractGoogleResults(ext?.data)
            if (results.length === 0) throw new Error('tidak ada link hasil di DOM google')
          } catch (e) {
            extErr = e?.message || String(e)
          }
        }

        // Layer (c): legacy duck-duck-scrape + DDG-HTML sebagai last resort.
        if (results.length === 0) {
          const now = Date.now()
          const isRateLimited = now < ddgRateLimitedUntil

          if (!isRateLimited) {
            try {
              const { search: ddgSearch, SafeSearchType } = await import('duck-duck-scrape')
              const searchRes = await ddgSearch(searchQuery, {
                safeSearch: SafeSearchType.OFF
              })
              if (searchRes && searchRes.results && searchRes.results.length > 0) {
                results = searchRes.results.slice(0, 5).map((r) => ({
                  title: r.title,
                  url: r.url,
                  snippet: r.description || r.snippet || ''
                }))
              }
            } catch (ddgErr) {
              const isAnomaly = /anomaly|too quickly|rate limit|429/i.test(ddgErr?.message || '')
              if (isAnomaly) {
                ddgRateLimitedUntil = Date.now() + 60000
              }
              if (Date.now() - lastDdgWarnAt > 30000) {
                lastDdgWarnAt = Date.now()
                console.warn('[browser-search] duck-duck-scrape failed, trying HTTP fallback:', ddgErr?.message || ddgErr)
              }
            }
          }

          if (results.length === 0) {
            try {
              const htmlRes = await fetch(
                `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`,
                {
                  headers: {
                    'User-Agent':
                      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                  },
                  signal: AbortSignal.timeout(10000)
                }
              )
              const html = await htmlRes.text()
              const matches = [...html.matchAll(/<a class="result__url" href="([^"]+)">/g)]
              const snippetMatches = [...html.matchAll(/<a class="result__snippet[^>]*>([^<]+)<\/a>/g)]
              const titleMatches = [...html.matchAll(/<a class="result__a"[^>]*>([^<]+)<\/a>/g)]

              for (let i = 0; i < Math.min(5, titleMatches.length); i++) {
                results.push({
                  title: titleMatches[i]?.[1] || 'Web Result',
                  url: matches[i]?.[1] || '',
                  snippet: snippetMatches[i]?.[1] || ''
                })
              }
            } catch (fetchErr) {
              if (Date.now() - lastDdgWarnAt > 30000) {
                lastDdgWarnAt = Date.now()
                console.error('[browser-search] HTTP fallback error:', fetchErr?.message || fetchErr)
              }
            }
          }
        }

        if (results.length === 0) {
          // Marker machine-readable utk verifier (Agent V3): kegagalan router
          // vs hasil kosong dibedakan eksplisit. Tanpa cache (success-only).
          const bits = []
          if (routerErr) bits.push(`[SEARCH-ERROR] router: ${routerErr}`)
          if (extErr) bits.push(`[SEARCH-ERROR] extension: ${extErr}`)
          bits.push(`[NO-RESULTS] Tidak ditemukan hasil pencarian web langsung untuk "${searchQuery}".`)
          return { success: true, data: bits.join('\n') }
        }

        const formatted = results
          .map(
            (r, idx) =>
              `${idx + 1}. [${r.title}](${r.url})\n   Snippet: ${String(r.snippet || '').replace(/\n+/g, ' ')}`
          )
          .join('\n\n')

        return remember({
          success: true,
          data: `[HASIL PENCARIAN WEB UNTUK: "${searchQuery}"]\n\n${formatted}`
        })
      } catch (err) {
        return { success: false, message: `Gagal melakukan web search: ${err.message}` }
      }
    }
  },
  'browser-navigate': {
    needsApproval: false,
    handler: async (query, config) => {
      try {
        const { listSessions, dispatchCommand, getBrowserConfig } = await import('../browser/bridge-core.mjs')
        const { parseNavigateQuery } = await import('../browser/nav-query.mjs')
        const { url, adoptUserTab } = parseNavigateQuery(query)
        if (!url) return { success: false, error: `URL tidak valid: '${String(query).slice(0, 120)}'. Sertakan alamat http(s).` }
        const targetSession = config?.sessionId || 'default'
        // Extension dulu bila terhubung (hasil DOM + tab ber-grup); bila tidak
        // dan auto-launch aktif, minta OS membukakan browser lalu coba lagi
        // bounded. Extension gagal -> blocked jujur (sukses palsu via fetch
        // me-reset circuit-breaker agen sehingga subagen loop navigate dan
        // tiap upaya memicu xdg-open baru). Fetch polos hanya bila user
        // mematikan auto-launch di Capabilities.
        let extensionAttempted = false
        let failReason = null
        try {
          const sessions = listSessions()
          let pick = pickConnected(sessions, targetSession)
          if (!pick) {
            extensionAttempted = true
            const up = await ensureExtensionUp({ url, sessionId: targetSession })
            if (up) pick = up
            else failReason = ensureExtensionUp.lastReason || 'no-handshake'
          }
          if (pick) {
            extensionAttempted = true
            let res = null
            try {
              // Tanpa flag adoptUserTab: jangan pernah curi tab user — teruskan
              // flag ke extension; extension hanya boleh pakai tab primer sesi,
              // tab yatim milik sendiri, atau tab baru. Extension menolak pakai
              // tab user -> error jujur di bawah (bukan fallback diam-diam).
              res = await dispatchCommand(pick.id, 'navigate', { url, sessionId: targetSession, adoptUserTab })
            } catch {
              res = null
            }
            if (res && res.ok) return { success: true, data: res.data, via: 'extension' }
            if (res && !res.ok && /milik user|adoptUserTab/i.test(res.error || '')) {
              return { success: false, error: `browser-navigate: ${res.error}` }
            }
            failReason = failReason || 'no-handshake'
          }
        } catch {
          failReason = failReason || 'no-handshake'
        }
        // Fetch polos hanya bila user mematikan auto-launch di Capabilities
        // (perilaku lama bagi yang tak ingin browser OS dibuka); bila ON dan
        // extension gagal -> blocked jujur, bukan sukses palsu.
        const autoLaunchOff = !getBrowserConfig()?.autoLaunch
        if (!autoLaunchOff && (extensionAttempted || failReason)) {
          return { success: false, error: launchBlockMessage(failReason) }
        }
        return await webFetch(url)
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'browser-read': {
    needsApproval: false,
    handler: async (query, config) => {
      try {
        const q = String(query ?? '').trim()
        const { extractUrl } = await import('../browser/bridge-core.mjs')
        const url = extractUrl(q)

        // Jika URL spesifik diberikan, utamakan fetch
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          return await browserReadFetch(url)
        }

        const targetSession = config?.sessionId || 'default'
        // Jika query kosong atau tidak ada URL, coba baca DOM tab aktif browser fisik via ekstensi
        const ext = await tryExtensionReadDom(targetSession)
        if (ext) {
          return { success: true, data: formatBrowserObservation(ext.data), via: 'extension' }
        }

        // Jika bukan URL dan ada teks query, coba fetch
        if (q && (q.startsWith('http://') || q.startsWith('https://'))) {
          return await browserReadFetch(q)
        }

        return {
          success: false,
          error:
            'browser-read: tidak ada sesi extension dan tidak ada URL untuk dibaca (auto-launch sudah dicoba bila aktif). Panggil browser-navigate <url-lengkap>, lalu browser-read lagi. Bila navigate gagal juga, laporkan blocked dengan bukti.'
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'browser-ask': {
    needsApproval: false,
    handler: async (query, config) => {
      const reason = String(query || 'Membutuhkan interaksi langsung pengguna di browser').trim()
      return {
        success: true,
        paused: true,
        waiting_for_user: true,
        needs_user: true,
        awaitUser: { reason, sessionId: config?.sessionId || 'default' },
        data: `[BROWSER HUMAN-IN-THE-LOOP] Menunggu bantuan pengguna di tab browser: "${reason}". Silakan selesaikan interaksi (login akun / captcha / 2FA) di browser Chrome yang sedang aktif, lalu beri tahu Abelink bila sudah selesai agar tugas bisa dilanjutkan.`
      }
    }
  },
  'browser-click': {
    needsApproval: false,
    handler: async (query, config) => {
      const targetSession = config?.sessionId || 'default'
      const { id, expected } = parseClickTarget(query)
      const payload = { abelinkId: normalizeAbelinkId(id), action: 'click' }
      // Backward compatible: field expectedText hanya dikirim bila ada.
      if (expected) payload.expectedText = expected
      const ext = await tryExtensionAct(payload, targetSession, expected ? { raw: true } : undefined)
      if (ext?.ok) return { success: true, data: ext.data, via: 'extension' }
      // Dengan expected: error spesifik extension (mismatch teks / elemen
      // tak ditemukan) diteruskan apa adanya. Tanpa expected: jalur lama —
      // tryExtensionAct menelan !ok menjadi null -> hint generik di bawah.
      if (expected && ext && ext.error) return { success: false, error: 'browser-click: ' + ext.error }
      return {
        success: false,
        error: 'browser-click: ' + NO_EXTENSION_HINT + ' Butuh ID elemen (ak1, ak2, ...) dari browser-read yang sukses.'
      }
    }
  },
  'browser-type': {
    needsApproval: false,
    handler: async (query, config) => {
      const targetSession = config?.sessionId || 'default'
      const raw = String(query ?? '')
      let id = ''
      let value = ''
      if (raw.includes('||')) {
        const [first, ...rest] = raw.split('||')
        id = first
        value = rest.join('||')
      } else if (raw.includes('|')) {
        const pipeIdx = raw.indexOf('|')
        id = raw.slice(0, pipeIdx)
        value = raw.slice(pipeIdx + 1)
      } else {
        id = raw
        value = ''
      }
      const ext = await tryExtensionAct({ abelinkId: normalizeAbelinkId(id), action: 'type', value }, targetSession)
      if (ext) return { success: true, data: ext.data, via: 'extension' }
      return {
        success: false,
        error: 'browser-type: ' + NO_EXTENSION_HINT + ' Format query: ID||teks.'
      }
    }
  },
  'browser-scroll': {
    needsApproval: false,
    handler: async (query, config) => {
      const targetSession = config?.sessionId || 'default'
      const dir = String(query ?? '').trim().toLowerCase().startsWith('up') ? 'up' : 'down'
      const ext = await tryExtensionAct({ action: 'scroll', value: { direction: dir, amount: 600 } }, targetSession)
      if (ext) return { success: true, data: ext.data, via: 'extension' }
      return {
        success: false,
        error: 'browser-scroll: ' + NO_EXTENSION_HINT
      }
    }
  },
  'browser-back': {
    needsApproval: false,
    handler: async (_query, config) => {
      const targetSession = config?.sessionId || 'default'
      const ext = await tryExtensionAct({ action: 'back' }, targetSession)
      if (ext) return { success: true, data: ext.data, via: 'extension' }
      return {
        success: false,
        error: 'browser-back: ' + NO_EXTENSION_HINT
      }
    }
  },
  'browser-forward': {
    needsApproval: false,
    handler: async (_query, config) => {
      const targetSession = config?.sessionId || 'default'
      const ext = await tryExtensionAct({ action: 'forward' }, targetSession)
      if (ext) return { success: true, data: ext.data, via: 'extension' }
      return {
        success: false,
        error: 'browser-forward: ' + NO_EXTENSION_HINT
      }
    }
  },
  'browser-reload': {
    needsApproval: false,
    handler: async (_query, config) => {
      const targetSession = config?.sessionId || 'default'
      const ext = await tryExtensionAct({ action: 'reload' }, targetSession)
      if (ext) return { success: true, data: ext.data, via: 'extension' }
      return {
        success: false,
        error: 'browser-reload: ' + NO_EXTENSION_HINT
      }
    }
  },
  'browser-ask-user': {
    needsApproval: false,
    handler: async (query) => {
      return {
        success: false,
        error: 'browser-ask-user: Blocked - requires UI interaction.'
      }
    }
  },
  'browser-script': {
    needsApproval: true,
    approvalMessage: (query) =>
      `Abelink ingin mengeksekusi script JavaScript di browser Anda (berpotensi mengakses data halaman/sesi login):\n\n${query}`,
    handler: async (query, config) => {
      const targetSession = config?.sessionId || 'default'
      const ext = await tryExtensionAct({ action: 'script', value: String(query ?? '') }, targetSession)
      if (ext) return { success: true, data: ext.data, via: 'extension' }
      return {
        success: false,
        error: 'browser-script: ' + NO_EXTENSION_HINT
      }
    }
  },
  'browser-extract': {
    needsApproval: false,
    handler: async (query, config) => {
      const targetSession = config?.sessionId || 'default'
      const ext = await tryExtensionAct({ action: 'extract', value: String(query ?? '') }, targetSession)
      if (ext) return { success: true, data: ext.data, via: 'extension' }
      // Tanpa sesi extension: kontrak jujur — URL eksplisit/lastUrl atau
      // error eksplisit. Jangan fetch buta (query kosong -> 403 + halu).
      const { resolveExtractQuery } = await import('./extract-query.mjs')
      const { getLastUrl } = await import('../browser/bridge-core.mjs')
      const resolved = resolveExtractQuery(query, { hasSession: false, lastUrl: getLastUrl(targetSession) })
      if (!resolved.ok) return { success: false, error: resolved.error }
      try {
        return await browserReadFetch(resolved.url)
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  // B1: snapshot konten halaman (ala take_snapshot CDP) — teks utama +
  // sumber TeX MathJax + daftar gambar. Untuk konten yang tak terjangkau
  // tagger 80-elemen (teks soal, artikel).
  'browser-snapshot': {
    needsApproval: false,
    handler: async (query, config) => {
      const targetSession = config?.sessionId || 'default'
      const ext = await tryExtensionAct({ action: 'snapshot' }, targetSession)
      if (ext) return { success: true, data: ext.data, via: 'extension' }
      return { success: false, error: 'browser-snapshot: ' + NO_EXTENSION_HINT }
    }
  },
  // B1: tunggu teks muncul (ala wait_for CDP), maks ~15 detik di extension.
  // Query: teks yang ditunggu (mis. "Soal No" atau "Mulai Tanding").
  'browser-wait-for': {
    needsApproval: false,
    handler: async (query, config) => {
      const targetSession = config?.sessionId || 'default'
      const text = String(query ?? '').trim()
      if (!text) return { success: false, error: 'browser-wait-for butuh teks pada query.' }
      const ext = await tryExtensionAct({ action: 'wait-for', value: text }, targetSession)
      if (ext) return { success: true, data: ext.data, via: 'extension' }
      return { success: false, error: 'browser-wait-for: ' + NO_EXTENSION_HINT }
    }
  },
  'browser-close': {
    needsApproval: false,
    handler: async (_query, config) => {
      const targetSession = config?.sessionId || 'default'
      const ext = await tryExtensionAct({ action: 'close' }, targetSession)
      if (ext) return { success: true, data: ext.data, via: 'extension' }
      return { success: false, error: 'browser-close: ' + NO_EXTENSION_HINT }
    }
  },
  'browser-screenshot': {
    needsApproval: false,
    handler: async (query, config) => {
      const targetSession = config?.sessionId || 'default'
      const ext = await tryExtensionAct({ action: 'screenshot', value: String(query ?? '') }, targetSession)
      if (ext) {
        try {
          const m = /^data:image\/png;base64,(.+)$/.exec(String(ext.data || ''))
          if (!m) return { success: false, error: 'browser-screenshot: data gambar extension tidak valid.' }
          const activeRoot = config?.workspaceRoot || getWorkspaceDir()
          const guarded = assertContained(activeRoot, String(query ?? 'screenshot.png').trim() || 'screenshot.png')
          if (!guarded.ok) return { success: false, message: 'Akses ditolak: path di luar workspace.' }
          fs.mkdirSync(path.dirname(guarded.path), { recursive: true })
          fs.writeFileSync(guarded.path, Buffer.from(m[1], 'base64'))
          return { success: true, data: guarded.path, via: 'extension' }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }
      return {
        success: false,
        error: 'browser-screenshot: ' + NO_EXTENSION_HINT + ' (butuh akses visual browser).'
      }
    }
  },
  'browser-download': {
    needsApproval: true,
    approvalMessage: (query) => `Abelink ingin mendownload file dari browser:\n\n${query}`,
    handler: async (query, config) => {
      const targetSession = config?.sessionId || 'default'
      const [urlPart, ...rest] = String(query ?? '').split('||')
      const { extractUrl } = await import('../browser/bridge-core.mjs')
      const url = extractUrl(query) || (urlPart || '').trim()
      const fileName = rest.join('||').trim() || undefined
      const ext = await tryExtensionAct({ action: 'download', value: { url, fileName } }, targetSession)
      if (ext) return { success: true, data: ext.data, via: 'extension' }
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(60000) })
        const buf = Buffer.from(await response.arrayBuffer())
        // Return info about download - actual file needs IPC bridge
        return {
          success: true,
          data: {
            url,
            size: response.headers.get('content-length') ?? String(buf.length),
            type: response.headers.get('content-type')
          }
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  }
}

// Aliases untuk model LLM (Claude, OpenAI, Hermes) yang memanggil web_search / advanced_search
browserTools['web_search'] = browserTools['browser-search']
browserTools['web-search'] = browserTools['browser-search']
browserTools['advanced_search'] = browserTools['browser-search']
