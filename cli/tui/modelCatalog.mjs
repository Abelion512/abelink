// cli/tui/modelCatalog.mjs — S1: katalog model dinamis 9Router, pola opencode.
// - Discovery: GET /v1/models (via ai:list-models shape) -> capabilities live
//   (reasoning, contextWindow, maxOutput, thinkingFormat, thinkingCanDisable).
// - Cache: ~/.config/abelink/models-cache.json {fetchedAt, models}, TTL 5 mnt
//   (opencode models-dev), stale-while-revalidate: tampilkan cache langsung,
//   refresh background bila stale — tak blokir /models.
// - Kurasi picker: Favorites -> Recent (cap 10) -> providers (opencode
//   dialog-model). Recent/favorite di cli.json (recentModels[10], favModels[]).
// - Aturan jujur: offline = alias statis + cache + label (stale); gemini-web
//   di TUI = tolak eksplisit (GUI-only); ID hilang = warning.
// - Murni + testable: fetch/fs/home/clock di-inject. Tanpa GUI.

export const MODELS_CACHE_TTL_MS = 5 * 60 * 1000
export const RECENT_CAP = 10

export function modelsCachePath(homeDir = '') {
  return `${homeDir}/.config/abelink/models-cache.json`
}

// Normalisasi satu entri /v1/models -> bentuk katalog (hanya field dipakai).
export function normalizeCatalogEntry(m = {}) {
  const cap = m?.capabilities && typeof m.capabilities === 'object' ? m.capabilities : {}
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)
  return {
    id: String(m?.id ?? ''),
    reasoning: cap.reasoning === true,
    ctx: num(cap.contextWindow),
    maxOut: num(cap.maxOutput),
    thinkFmt: cap.thinkingFormat ?? null,
    thinkDisable: cap.thinkingCanDisable !== false,
  }
}

export function normalizeCatalogList(data = []) {
  if (!Array.isArray(data)) return []
  return data.map(normalizeCatalogEntry).filter((m) => m.id)
}

// Baca cache: { ok, models, fetchedAt, stale } — stale bila > TTL.
export function readCatalogCache({ fsMod = null, homeDir = '', now = Date.now() } = {}) {
  const fs = fsMod || defaultFs()
  try {
    const raw = fs.readFileSync(modelsCachePath(homeDir), 'utf8')
    const parsed = JSON.parse(raw)
    const models = normalizeCatalogList(parsed?.models)
    const fetchedAt = Number(parsed?.fetchedAt) || 0
    return { ok: true, models, fetchedAt, stale: now - fetchedAt > MODELS_CACHE_TTL_MS }
  } catch {
    return { ok: false, models: [], fetchedAt: 0, stale: true }
  }
}

// Tulis cache atomik (tmp + rename, pola opencode models-dev).
export function writeCatalogCache(models = [], { fsMod = null, pathMod = null, homeDir = '', now = Date.now() } = {}) {
  const fs = fsMod || defaultFs()
  const path = pathMod || defaultPath()
  const file = modelsCachePath(homeDir)
  const payload = JSON.stringify({ fetchedAt: now, models: normalizeCatalogList(models) }) + '\n'
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp-${now}`
    fs.writeFileSync(tmp, payload, 'utf8')
    fs.renameSync(tmp, file)
    return { ok: true, path: file }
  } catch (err) {
    return { ok: false, error: String(err?.message || err) }
  }
}

// Discovery live: fetch GET <endpoint>/models (tanpa key bila kosong).
// Timeout 45s: /v1/models 9Router 5-27s tergantung beban (1322 model; diukur
// 5-7s 2026-09-25 siang, 19.5s malam, 26.4s 2026-09-26 -> timeout 30s terlalu
// ketat dan memicu abort palsu). Jalur ini kini OPT-IN (/models --all|filter),
// jadi timeout longgar tak memperlambat buka picker default.
// Return { ok, models, error } — models sudah normalisasi.
export async function fetchLiveCatalog({ fetchFn = null, endpoint = 'http://127.0.0.1:20128/v1', timeoutMs = 45000 } = {}) {
  const doFetch = fetchFn || defaultFetch()
  const url = String(endpoint || '').replace(/\/+$/, '') + '/models'
  // Retry 1x khusus abort/timeout: server Next.js kadang menutup keep-alive
  // di tengah body besar (flaky terukur: lolos manual, gagal acak di E2E).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeoutMs)
      let res
      try {
        // Connection: close WAJIB: server Next.js 9Router keep-alive timeout 5s
        // membuat fetch Bun gantung pada body 581KB (curl OK, Bun hang —
        // terukur 2026-09-25). Tanpa header ini discovery selalu abort.
        res = await doFetch(url, { signal: ctrl.signal, headers: { Connection: 'close' } })
      } finally {
        clearTimeout(timer)
      }
      if (!res || res.ok === false) return { ok: false, models: [], error: `GET ${url}: ${res?.status || 'gagal'}` }
      const data = await res.json()
      const list = Array.isArray(data) ? data : data?.data
      return { ok: true, models: normalizeCatalogList(list) }
    } catch (err) {
      const msg = String(err?.message || err)
      const retryable = /abort|timeout|aborted|network|fetch failed/i.test(msg)
      if (retryable && attempt === 0) continue
      return { ok: false, models: [], error: msg }
    }
  }
  return { ok: false, models: [], error: 'Discovery gagal setelah retry.' }
}

// Kurasi picker: Favorites -> Recent -> providers (filter query, cap tiap
// seksi agar 1322 model tak ditumpahkan mentah).
export function curatePicker({ models = [], favorites = [], recent = [], aliases = {}, query = '', perSection = 30 } = {}) {
  const q = String(query || '').toLowerCase()
  const match = (id) => !q || String(id || '').toLowerCase().includes(q)
  const byId = new Map(models.map((m) => [m.id, m]))
  const fav = favorites.filter((id) => byId.has(id) && match(id)).slice(0, perSection)
  const rec = recent.filter((id) => byId.has(id) && !fav.includes(id) && match(id)).slice(0, RECENT_CAP)
  const rest = models.map((m) => m.id).filter((id) => !fav.includes(id) && !rec.includes(id) && match(id)).slice(0, perSection)
  return { favorites: fav, recent: rec, models: rest, total: models.length }
}

// Recent: tambah id ke depan, dedup, cap 10 (opencode recentModels).
export function pushRecent(recent = [], id = '') {
  const clean = String(id || '').trim()
  if (!clean) return Array.isArray(recent) ? [...recent] : []
  return [clean, ...(Array.isArray(recent) ? recent : []).filter((x) => x !== clean)].slice(0, RECENT_CAP)
}

// Resolve input /model terhadap katalog + alias:
// alias statis > katalog live/cache > ID langsung (passthrough + warning
// bila tak ada di katalog). gemini-web di TUI = tolak eksplisit.
// ID terlarang (FORBIDDEN_MODELS: claude-work training-data) = tolak.
export function resolveCatalogModel(input = '', { models = [], aliases = {}, forbidden = ['claude-work'] } = {}) {
  const raw = String(input ?? '').trim()
  if (!raw) return { ok: false, error: 'Pakai: /model [alias|id|pencarian].' }
  if (/gemini-web/i.test(raw)) {
    return { ok: false, error: 'gemini-web hanya jalan di GUI (butuh sesi browser Google). Di TUI pakai combo 9Router (mis. zen, qwen, mimo).' }
  }
  const low = raw.toLowerCase()
  const banned = (forbidden || []).some((f) => low === String(f).toLowerCase())
  if (banned) {
    return { ok: false, error: `"${raw}" dilarang (training-data). Pakai /models untuk ID gratis yang layak.` }
  }
  if (aliases[raw]) return { ok: true, id: aliases[raw], via: 'alias', label: `${raw} -> ${aliases[raw]}` }
  const aliasHit = Object.entries(aliases).find(([k]) => String(k).toLowerCase() === low)
  if (aliasHit) return { ok: true, id: aliasHit[1], via: 'alias', label: `${aliasHit[0]} -> ${aliasHit[1]}` }
  const exact = models.find((m) => m.id === raw || m.id.toLowerCase() === low)
  if (exact) return { ok: true, id: exact.id, via: 'katalog', label: `${exact.id} (katalog live)` }
  return { ok: true, id: raw, via: 'langsung', label: `${raw} (ID langsung — tak ada di katalog, bisa gagal di provider)` }
}

function defaultFs() {
  return { readFileSync: () => { throw new Error('no fs') }, writeFileSync: () => { throw new Error('no fs') }, mkdirSync: () => {}, renameSync: () => {} }
}

function defaultPath() {
  return { dirname: (p) => String(p).split('/').slice(0, -1).join('/') || '.' }
}

function defaultFetch() {
  if (typeof fetch === 'function') return fetch
  throw new Error('fetch tak tersedia')
}
