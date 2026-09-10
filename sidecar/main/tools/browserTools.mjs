// Tool browser/web (dipindah murni dari main/node-tools.js).
import { normalizeMarkId } from '../browser/bridge-core.mjs'
import { navigateTo, readDOM, executeAction, closeBrowser, executeScript, extractData, takeScreenshot, downloadFile } from '../browser-agent.js'

let browserSessionId = 0
const browserSessions = new Map()

// Extension-first untuk tool browser: coba browser fisik bila ADA sesi yang
// terhubung (preferensi 'default'), kembalikan null agar caller fallback ke
// perilaku lama. Tidak pernah throw.
const tryExtensionAct = async (payload, sessionId = 'default') => {
  try {
    const { listSessions, dispatchCommand } = await import('../browser/bridge-core.mjs')
    const sessions = listSessions()
    const targetSession = payload?.sessionId || sessionId || 'default'
    const pick =
      sessions.find((s) => s.id === targetSession && s.connected) ||
      sessions.find((s) => s.id === 'default' && s.connected) ||
      sessions.find((s) => s.connected)
    if (!pick) return null
    const enriched = { ...payload, sessionId: targetSession }
    const res = await dispatchCommand(pick.id, 'act', enriched)
    return res && res.ok ? res : null
  } catch {
    return null
  }
}

// Baca DOM dari tab aktif ekstensi browser fisik.
const tryExtensionReadDom = async (sessionId = 'default') => {
  try {
    const { listSessions, dispatchCommand } = await import('../browser/bridge-core.mjs')
    const sessions = listSessions()
    const targetSession = sessionId || 'default'
    const pick =
      sessions.find((s) => s.id === targetSession && s.connected) ||
      sessions.find((s) => s.id === 'default' && s.connected) ||
      sessions.find((s) => s.connected)
    if (!pick) return null
    const res = await dispatchCommand(pick.id, 'read-dom', { sessionId: targetSession })
    return res && res.ok ? res : null
  } catch {
    return null
  }
}

// Fetch + parse HTML polos (fallback bila extension tidak tersambung).
// Dipakai browser-read dan browser-extract (dulu via this['browser-read']
// yang selalu crash di modul ESM karena this === undefined).
const browserReadFetch = async (query) => {
  const { extractUrl } = await import('../browser/bridge-core.mjs')
  const url = extractUrl(query) || query
  const axios = (await import('axios')).default
  const htmlRes = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 30000
  })
  const content = htmlRes.data || ''
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
    handler: async (query) => {
      try {
        const searchQuery = query ? query.trim() : ''
        if (!searchQuery) return { success: false, message: 'Query pencarian kosong.' }

        const cacheKey = searchQuery.toLowerCase()
        const cached = searchCooldown.get(cacheKey)
        if (cached && Date.now() - cached.at < SEARCH_CACHE_MS) return cached.data
        const remember = (data) => {
          searchCooldown.set(cacheKey, { at: Date.now(), data })
          if (searchCooldown.size > 200) {
            const oldest = searchCooldown.keys().next().value
            searchCooldown.delete(oldest)
          }
          return data
        }

        let results = []
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
            const axios = (await import('axios')).default
            const htmlRes = await axios.get(
              `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`,
              {
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 10000
              }
            )
            const html = htmlRes.data || ''
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

        if (results.length === 0) {
          return remember({
            success: true,
            data: `Tidak ditemukan hasil pencarian web langsung untuk "${searchQuery}".`
          })
        }

        const formatted = results
          .map(
            (r, idx) =>
              `${idx + 1}. [${r.title}](${r.url})\n   Snippet: ${r.snippet.replace(/\n+/g, ' ')}`
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
        const { extractUrl, listSessions, dispatchCommand } = await import('../browser/bridge-core.mjs')
        const url = extractUrl(query)
        if (!url) return { success: false, error: `URL tidak valid: '${String(query).slice(0, 120)}'. Sertakan alamat http(s).` }
        const targetSession = config?.sessionId || 'default'
        // Extension dulu bila terhubung (hasil DOM + tab ber-grup); fallback
        // fetch polos bila extension tidak ada. Tanpa extension tidak menunggu.
        try {
          const sessions = listSessions()
          const pick =
            sessions.find((s) => s.id === targetSession && s.connected) ||
            sessions.find((s) => s.id === 'default' && s.connected) ||
            sessions.find((s) => s.connected)
          if (pick) {
            const res = await dispatchCommand(pick.id, 'navigate', { url, sessionId: targetSession })
            if (res && res.ok) return { success: true, data: res.data, via: 'extension' }
          }
        } catch {
          /* jatuh ke fetch polos */
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
          return { success: true, data: ext.data, via: 'extension' }
        }

        // Jika bukan URL dan ada teks query, coba fetch
        if (q && (q.startsWith('http://') || q.startsWith('https://'))) {
          return await browserReadFetch(q)
        }

        return {
          success: false,
          error:
            'browser-read: Ekstensi browser tidak tersambung dan tidak ada URL untuk dibaca. Pastikan ekstensi Mark Bridge terpasang dan tab aktif terbuka, atau masukkan URL lengkap.'
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'browser-ask': {
    needsApproval: false,
    handler: async (query) => {
      const reason = String(query || 'Membutuhkan interaksi langsung pengguna di browser').trim()
      return {
        success: true,
        waiting_for_user: true,
        needs_user: true,
        data: `[BROWSER HUMAN-IN-THE-LOOP] Menunggu bantuan pengguna di tab browser: "${reason}". Silakan selesaikan interaksi (login akun / captcha / 2FA) di browser Chrome yang sedang aktif, lalu beri tahu Mark bila sudah selesai agar tugas bisa dilanjutkan.`
      }
    }
  },
  'browser-click': {
    needsApproval: false,
    handler: async (query, config) => {
      const targetSession = config?.sessionId || 'default'
      const ext = await tryExtensionAct({ markId: normalizeMarkId(query), action: 'click' }, targetSession)
      if (ext) return { success: true, data: ext.data, via: 'extension' }
      return {
        success: false,
        error: 'browser-click: extension tidak tersambung. Sambungkan extension Mark Bridge lalu read-dom dulu untuk ID elemen (mk1, mk2, ...).'
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
      const ext = await tryExtensionAct({ markId: normalizeMarkId(id), action: 'type', value }, targetSession)
      if (ext) return { success: true, data: ext.data, via: 'extension' }
      return {
        success: false,
        error: 'browser-type: extension tidak tersambung. Format query: ID||teks.'
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
        error: 'browser-scroll: extension tidak tersambung.'
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
        error: 'browser-back: extension tidak tersambung. Sambungkan extension Mark Bridge.'
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
        error: 'browser-forward: extension tidak tersambung. Sambungkan extension Mark Bridge.'
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
        error: 'browser-reload: extension tidak tersambung. Sambungkan extension Mark Bridge.'
      }
    }
  },
  'ask_user': {
    needsApproval: false,
    handler: async (query) => {
      const { chatId, question, options, timeoutMs } = query || {}
      if (!chatId) return { success: false, error: 'chatId wajib diisi' }
      if (!question) return { success: false, error: 'Pertanyaan wajib diisi' }
      if (!options || options.length < 2) return { success: false, error: 'Minimal 2 opsi pilihan' }

      const tgMod = { getConnectionStatus, sendInlineKeyboard, waitForAskUserAnswer }
      if (tgMod.getConnectionStatus().status !== 'connected') {
        return { success: false, error: 'Bot Telegram belum terhubung' }
      }

      const sent = await tgMod.sendInlineKeyboard(String(chatId), String(question), options)
      if (!sent || sent.success === false) {
        return { success: false, error: sent?.error || 'Gagal mengirim keyboard ke Telegram' }
      }

      // Tunggu jawaban callback bmk_* (dikorelasikan via waitForAskUserAnswer).
      const answer = await tgMod.waitForAskUserAnswer(String(chatId), Number(timeoutMs) || 120000)
      if (answer == null) {
        return { success: false, error: 'ask_user timeout: tidak ada jawaban dari user' }
      }
      return { success: true, data: { status: 'answered', chatId, answer } }
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
      `Mark ingin mengeksekusi script JavaScript di browser Anda (berpotensi mengakses data halaman/sesi login):\n\n${query}`,
    handler: async (query, config) => {
      const targetSession = config?.sessionId || 'default'
      const ext = await tryExtensionAct({ action: 'script', value: String(query ?? '') }, targetSession)
      if (ext) return { success: true, data: ext.data, via: 'extension' }
      return {
        success: false,
        error: 'browser-script: extension tidak tersambung.'
      }
    }
  },
  'browser-extract': {
    needsApproval: false,
    handler: async (query, config) => {
      const targetSession = config?.sessionId || 'default'
      const ext = await tryExtensionAct({ action: 'extract', value: String(query ?? '') }, targetSession)
      if (ext) return { success: true, data: ext.data, via: 'extension' }
      try {
        return await browserReadFetch(query)
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'browser-close': {
    needsApproval: false,
    handler: async (_query, config) => {
      const targetSession = config?.sessionId || 'default'
      const ext = await tryExtensionAct({ action: 'close' }, targetSession)
      if (ext) return { success: true, data: ext.data, via: 'extension' }
      return { success: true, message: 'Browser session closed or already idle' }
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
        error: 'browser-screenshot: extension tidak tersambung (butuh akses visual browser).'
      }
    }
  },
  'browser-download': {
    needsApproval: true,
    approvalMessage: (query) => `Mark ingin mendownload file dari browser:\n\n${query}`,
    handler: async (query, config) => {
      const targetSession = config?.sessionId || 'default'
      const [urlPart, ...rest] = String(query ?? '').split('||')
      const { extractUrl } = await import('../browser/bridge-core.mjs')
      const url = extractUrl(query) || (urlPart || '').trim()
      const fileName = rest.join('||').trim() || undefined
      const ext = await tryExtensionAct({ action: 'download', value: { url, fileName } }, targetSession)
      if (ext) return { success: true, data: ext.data, via: 'extension' }
      try {
        const axios = (await import('axios')).default
        const response = await axios.get(url, { responseType: 'blob', timeout: 60000 })
        // Return info about download - actual file needs IPC bridge
        return {
          success: true,
          data: {
            url,
            size: response.headers['content-length'],
            type: response.headers['content-type']
          }
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  }
};
