// cli/tui/modelEffort.mjs — V2-2/V2-3: /model + /effort pola claude-code.
// - Alias keluarga (fable/sonnet/opus/haiku) -> MODEL_ALIASES (headlessCli).
// - /model simpan permanen: tulis langsung ~/.config/abelink/cli.json (0600)
//   via writeCliSetup yang ada. Tanpa mode sesi-saja (keputusan terkunci #2).
// - Effort low..max ke provider (keputusan #4): ultra -> xhigh + flag lokal,
//   auto -> resolve dulu (tak pernah ke wire). Warning cache bila history
//   non-kosong. max_tokens besar di high+ (keputusan #4).
// - Murni + testable: fs/home di-inject (default node). Tanpa network.

import { MODEL_ALIASES } from '../../src/api/ai/headlessCli.js'

export const EFFORT_LEVELS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'auto'])

// S1: FAMILY_ALIASES DIHAPUS (diganti katalog dinamis modelCatalog.mjs —
// ID keluarga claude-code tidak ada di 9Router; resolve via katalog live).
// resolveFamilyAlias dipertahankan sebagai shim alias-statis agar test lama
// tidak pecah mendadak — jangan pakai di kode baru.

export function resolveFamilyAlias(input = '') {
  const raw = String(input ?? '').trim().toLowerCase()
  if (!raw) return null
  if (MODEL_ALIASES[raw]) return { id: MODEL_ALIASES[raw], via: 'alias', name: raw }
  return null
}

// Resolve input /model: alias > keluarga > ID langsung (passthrough).
// Return { ok, id, label } — label = sumber untuk ditampilkan.
export function resolveModelInput(input = '') {
  const raw = String(input ?? '').trim()
  if (!raw) return { ok: false, error: 'Pakai: /model [alias|keluarga|id].' }
  const hit = resolveFamilyAlias(raw)
  if (hit) {
    return {
      ok: true,
      id: hit.id,
      label: hit.via === 'family' ? `${hit.name} (keluarga) -> ${hit.id}` : `${hit.name} -> ${hit.id}`,
    }
  }
  return { ok: true, id: raw, label: `${raw} (ID langsung)` }
}

// Wire mapping (keputusan #4): hanya low..max ke provider.
// ultra = flag orkestrasi lokal (wire: xhigh + ultraLocal:true).
// auto = resolve dulu via resolveAutoEffort (tak pernah ke wire).
export const WIRE_EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max'])

export function effortForWire(effort = 'medium') {
  const e = String(effort || '').toLowerCase()
  if (e === 'ultra') return { wire: 'xhigh', ultraLocal: true }
  if (WIRE_EFFORTS.includes(e)) return { wire: e, ultraLocal: false }
  if (e === 'auto') return { wire: null, ultraLocal: false, needsResolve: true }
  return { wire: 'medium', ultraLocal: false }
}

// auto resolve: heuristik kata-berat (cermin fallback ai-bridge; renderer
// core.js estimator menang bila tersedia — ini fallback deterministik TUI).
const HEAVY_RE = /spawn_subagent|migrasi|refactor|audit|implementasi|riset|research|benchmark|analisis/i
export function resolveAutoEffort(text = '') {
  return HEAVY_RE.test(String(text ?? '').slice(-4000)) ? 'high' : 'medium'
}

// max_tokens per effort (keputusan #4: besar di high+).
export const EFFORT_MAX_TOKENS = Object.freeze({
  low: 4096, medium: 8192, high: 16384, xhigh: 32768, max: 65536, ultra: 65536,
})

export function maxTokensFor(effort = 'medium') {
  const e = String(effort || '').toLowerCase()
  if (e === 'auto') return EFFORT_MAX_TOKENS.medium
  return EFFORT_MAX_TOKENS[e] ?? EFFORT_MAX_TOKENS.medium
}

// Warning cache: ganti model/effort dengan history non-kosong = prompt cache
// provider invalid. Return string warning atau null.
export function cacheSwitchWarning(history = []) {
  if (Array.isArray(history) && history.length > 0) {
    return `Histori ${history.length} pesan: ganti ini menginvalidasi prompt cache provider (biaya naik sesi ini).`
  }
  return null
}

// Persist permanen: merge {model} / {effort} ke cli.json via writeCliSetup.
// fsMod/homeDir di-inject untuk test. Return { ok, path, error }.
export async function persistCliField(field, value, { writeCliSetup = null, homeDir = null } = {}) {
  if (!['model', 'effort'].includes(field)) return { ok: false, error: `Field ${field} tak dikenal.` }
  try {
    const headless = await import('../../src/api/ai/headlessCli.js')
    const setup = writeCliSetup || headless.writeCliSetup
    if (typeof setup !== 'function') return { ok: false, error: 'writeCliSetup tak tersedia.' }
    const os = await import('node:os')
    const home = homeDir || os.homedir?.() || process.env.HOME || ''
    const flag = field === 'model' ? '--model' : '--effort'
    // writeCliSetup hanya kenal --provider/--model/-m/--api-key: tulis effort
    // via merge file langsung (bentuk sama: 0600, merge, bukan overwrite).
    const path = await import('node:path')
    const file = path.join(home, '.config', 'abelink', 'cli.json')
    if (field === 'model') {
      const res = await setup({ argv: [flag, String(value)], homeDir: home })
      if (!res?.ok) return { ok: false, error: res?.message || 'Gagal tulis cli.json.' }
      return { ok: true, path: file }
    }
    const fs = await import('node:fs')
    let current = {}
    try {
      current = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (!current || typeof current !== 'object') current = {}
    } catch {}
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    fs.writeFileSync(file, JSON.stringify({ ...current, effort: String(value) }, null, 2) + '\n', { mode: 0o600 })
    try { fs.chmodSync(file, 0o600) } catch {}
    return { ok: true, path: file }
  } catch (err) {
    return { ok: false, error: String(err?.message || err) }
  }
}

// Klasifikasi error AI per-lapis (pesan jujur + aksi). Murni + testable.
// Lapis: network (endpoint mati) | unknown-model (ID tak dikenal) |
// credentials (provider tanpa kredensial) | auth (key salah/hilang) | other.
export function classifyAiError(message = '') {
  const msg = String(message ?? '')
  if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|fetch failed|network|tidak merespons|LM_STUDIO_OFFLINE/i.test(msg)) {
    return {
      layer: 'network',
      message: `9Router/LM Studio tak menjawab (${msg.slice(0, 120)}). Aksi: pastikan 9Router hidup di 127.0.0.1:20128.`,
    }
  }
  if (/no active credentials for provider/i.test(msg)) {
    const provider = (/provider:\s*([A-Za-z0-9_.-]+)/.exec(msg)?.[1]) || '?'
    return {
      layer: 'credentials',
      provider,
      message: `9Router tak punya kredensial untuk provider "${provider}". Aksi: /models untuk ID valid yang gratis.`,
    }
  }
  if (/invalid_api_key|invalid api key|unauthorized|401|missing api key|authentication/i.test(msg)) {
    return {
      layer: 'auth',
      message: `API key ditolak/hilang (${msg.slice(0, 120)}). Aksi: abelink setup --api-key <key> atau cek 9Router DB.`,
    }
  }
  if (/model.*not.*found|unknown model|invalid.*model|does not exist/i.test(msg)) {
    return {
      layer: 'unknown-model',
      message: `Model tak dikenal provider (${msg.slice(0, 120)}). Aksi: /models untuk ID valid.`,
    }
  }
  return { layer: 'other', message: msg.slice(0, 300) || 'AI fetch gagal tanpa rincian.' }
}
// Label sumber model untuk status line: alias/katalog/ID + provider.
export function modelSourceLabel(input = '', provider = 'custom') {
  const raw = String(input ?? '').trim()
  const hit = resolveFamilyAlias(raw)
  const via = hit ? hit.via : 'langsung'
  return `${raw} [${via}/${provider}]`
}
