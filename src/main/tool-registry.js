/**
 * Tool Registry — Progressive Disclosure + Vector Discovery for MARK
 *
 * Hermes pattern: L0 (name + 1 line) always loaded, L1 (full details) on demand.
 * When tools grow to 100+, use vector-based discovery: match user query against
 * tool descriptions, return only top-N relevant tools.
 *
 * Scans: built-in tools, skills (~/.agents/skills/), plugins (~/Documents/Mark Plugins/),
 *        connectors (future: MCP, DBus, AT-SPI).
 *
 * Usage:
 *   getToolCatalog()           → L0: all tools, 1-line description each
 *   getToolCatalogForQuery(q)  → L0: top-N relevant tools for a query (vector match)
 *   getToolDetail(name)        → L1: full tool details (description, params, examples)
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'
import { loadPlugins } from './plugins/plugin-loader.js'
import { loadSkills } from './agent-skills-loader.js'

// ========== BUILT-IN TOOLS (L0) ==========
const BUILTIN_TOOLS = {
  // Memory
  'memory-search': {
    category: 'memory',
    description: 'Cari informasi dari memory (profile, preference, notes, learn)',
    l1: `# memory-search
Query: kata kunci informasi yang dicari.
Contoh: "nomor adek", "password wifi", "solusi error bluetooth"
Cara: Vector similarity search. JANGAN pakai kata "kemarin" atau "tadi".
ATURAN: WAJIB cari di memory SEBELUM bertanya ke user.`
  },

  // Browser
  'browser-navigate': {
    category: 'browser',
    description: 'Buka URL di browser fisik',
    l1: `# browser-navigate
Query: URL lengkap (contoh: https://google.com)
Mengembalikan: daftar elemen interaktif bernomor (ID).
Gunakan browser-read untuk scan ulang setelah loading.`
  },
  'browser-read': {
    category: 'browser',
    description: 'Scan ulang elemen halaman',
    l1: `# browser-read
Query: KOSONGKAN SAJA.
Gunakan setelah browser-navigate atau setelah menunggu loading.`
  },
  'browser-click': {
    category: 'browser',
    description: 'Klik elemen di browser',
    l1: `# browser-click
Query: ID angka elemen (dari browser-navigate/read).
Mengembalikan: DOM terbaru setelah klik.`
  },
  'browser-type': {
    category: 'browser',
    description: 'Ketik teks di kolom input browser',
    l1: `# browser-type
Query: ID||teks (contoh: 3||hello world)
Mengembalikan: DOM terbaru setelah ketik.`
  },
  'browser-scroll': {
    category: 'browser',
    description: 'Scroll halaman browser',
    l1: `# browser-scroll
Query: "up" atau "down".`
  },
  'browser-ask-user': {
    category: 'browser',
    description: 'Minta user input manual (login, CAPTCHA, form)',
    l1: `# browser-ask-user
Query: Instruksi untuk user (contoh: "Tolong isi email dan password")
Pesan muncul di popup. Setelah user selesai, kamu dapat DOM terbaru.`
  },
  'browser-close': {
    category: 'browser',
    description: 'Tutup browser fisik',
    l1: `# browser-close
Query: KOSONGKAN SAJA.
PENTING: Tutup SEGERA setelah dapat info. Biarkan terbuka HANYA untuk tracking/pantau.`
  },

  // YouTube
  'yt-search': {
    category: 'media',
    description: 'Cari video YouTube',
    l1: `# yt-search
Query: kata kunci pencarian.
Mengembalikan: daftar video (title, url, duration).`
  },
  'yt-summary': {
    category: 'media',
    description: 'Ringkas isi video YouTube dari transcript',
    l1: `# yt-summary
Query: URL video YouTube.
Mengembalikan: ringkasan transcript.`
  },

  // Music
  'music-play': {
    category: 'music',
    description: 'Putar lagu di YouTube Music',
    l1: `# music-play
Query: judul lagu atau URL. AI ranker pilih hasil terbaik.`
  },
  'music-toggle': {
    category: 'music',
    description: 'Pause/lanjut putar lagu',
    l1: `# music-toggle
Query: KOSONGKAN SAJA.`
  },
  'music-search': {
    category: 'music',
    description: 'Cari lagu spesifik',
    l1: `# music-search
Query: judul lagu atau artis.`
  },
  'music-next': {
    category: 'music',
    description: 'Lagu berikutnya',
    l1: `# music-next
Query: KOSONGKAN SAJA.`
  },
  'music-prev': {
    category: 'music',
    description: 'Lagu sebelumnya',
    l1: `# music-prev
Query: KOSONGKAN SAJA.`
  },

  // System
  'analyze-screen': {
    category: 'system',
    description: 'Screenshot layar untuk analisis vision AI',
    l1: `# analyze-screen
Query: prompt instruksi visual (contoh: "Bacakan teks error di layar")
Mengambil screenshot lalu dikirim ke vision model.`
  },
  'camera-look': {
    category: 'system',
    description: 'Aktifkan webcam untuk melihat dunia nyata',
    l1: `# camera-look
Query: prompt instruksi visual (contoh: "Apa objek yang dipegang user?")
Mengambil foto lalu dikirim ke vision model.`
  },
  'screenshot-to-wa': {
    category: 'system',
    description: 'Screenshot layar → kirim ke WhatsApp user',
    l1: `# screenshot-to-wa
Query: KOSONGKAN SAJA.
Hanya berfungsi jika user chat dari WhatsApp.`
  },
  'wa-send': {
    category: 'system',
    description: 'Kirim pesan WhatsApp',
    l1: `# wa-send
Query: "JID|Isi Pesan"
JID: kode negara + nomor (contoh: 6282332392616@s.whatsapp.net)`
  },
  'speak': {
    category: 'system',
    description: 'Bicarakan teks via TTS speaker',
    l1: `# speak
Query: teks yang ingin diucapkan.
Gunakan untuk memanggil user atau berbicara langsung.`
  },
  'native-notify': {
    category: 'system',
    description: 'Kirim notifikasi sistem Linux',
    l1: `# native-notify
Query: "Judul||Isi Pesan"
Muncul di notification center GNOME/KDE.`
  },

  // Files
  'read-file': {
    category: 'files',
    description: 'Baca isi file',
    l1: `# read-file
Query: path_absolut. Spesifik baris: path||startLine||endLine.`
  },
  'write-file': {
    category: 'files',
    description: 'Tulis/buat file baru',
    l1: `# write-file
Query: path||isi_file
Perlu persetujuan user.`
  },
  'replace-lines': {
    category: 'files',
    description: 'Edit baris tertentu di file',
    l1: `# replace-lines
Query: path||startLine||endLine||kode_baru
Perlu persetujuan user.`
  },
  'delete-file': {
    category: 'files',
    description: 'Hapus file',
    l1: `# delete-file
Query: path_absolut
Perlu persetujuan user. QUARANTINE jika path bukan reinstallable.`
  },
  'list-dir': {
    category: 'files',
    description: 'Lihat isi folder',
    l1: `# list-dir
Query: path_folder.`
  },
  'grep-search': {
    category: 'files',
    description: 'Cari teks dalam folder',
    l1: `# grep-search
Query: path_folder||keyword.`
  },
  'run-shell': {
    category: 'files',
    description: 'Eksekusi perintah shell (bash)',
    l1: `# run-shell
Query: perintah shell
Perlu persetujuan user untuk command berbahaya.`
  },
  'run-cli': {
    category: 'files',
    description: 'Eksekusi CLI (Claude Code, Hermes, git, npm)',
    l1: `# run-cli
Query: "command||cwd||timeout"
Tanpa approval. Gunakan untuk: Claude Code, git, npm, build, test, deploy.`
  }
}

// ========== SCANNER: Skills + Plugins ==========
function scanAgentSkills() {
  const skills = []
  const dirs = [
    join(homedir(), '.agents', 'skills'),
    join(homedir(), '.zcode', 'skills'),
  ]
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    try {
      const entries = readdirSync(dir).filter(f => statSync(join(dir, f)).isDirectory())
      for (const name of entries) {
        const skillPath = join(dir, name, 'SKILL.md')
        if (existsSync(skillPath)) {
          const content = readFileSync(skillPath, 'utf8')
          const descMatch = content.match(/description:\s*["']?(.+?)["']?\s*$/m)
          skills.push({
            name: `skill:${name}`,
            category: 'skills',
            description: descMatch?.[1]?.slice(0, 120) || `Skill: ${name}`,
            l1: content.slice(0, 2000) // First 2000 chars as L1
          })
        }
      }
    } catch {}
  }
  return skills
}

function scanPlugins() {
  const plugins = []
  const pluginDir = join(homedir(), 'Documents', 'Mark Plugins')
  if (!existsSync(pluginDir)) return plugins
  try {
    const entries = readdirSync(pluginDir).filter(f => statSync(join(pluginDir, f)).isDirectory())
    for (const name of entries) {
      const manifestPath = join(pluginDir, name, 'plugin.json')
      if (existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
          for (const action of manifest.actions || []) {
            plugins.push({
              name: `plugin:${name}:${action.name}`,
              category: 'plugins',
              description: action.description || `Plugin action: ${action.name}`,
              l1: `# ${action.name}\nPlugin: ${name}\nDescription: ${action.description}\nTrigger: ${action.triggerHint || 'N/A'}`
            })
          }
        } catch {}
      }
    }
  } catch {}
  return plugins
}

// ========== REGISTRY ==========
let _toolCache = null
let _toolCacheTime = 0
const TOOL_CACHE_TTL = 30000 // 30s

function getAllTools() {
  const now = Date.now()
  if (_toolCache && now - _toolCacheTime < TOOL_CACHE_TTL) return _toolCache

  const tools = []

  // L0: Built-in tools
  for (const [name, tool] of Object.entries(BUILTIN_TOOLS)) {
    tools.push({ name, category: tool.category, description: tool.description, l1: tool.l1 })
  }

  // L0: Agent skills (scanned from disk)
  tools.push(...scanAgentSkills())

  // L0: Plugins (scanned from disk)
  tools.push(...scanPlugins())

  // L0: Connectors (future: MCP, DBus, AT-SPI)
  // TODO: Add connector scanning here

  _toolCache = tools
  _toolCacheTime = now
  return tools
}

// ========== VECTOR CACHE (for query-based discovery) ==========
let _toolVectorCache = new Map()
let _toolVectorsReady = false

/**
 * Ensure tool vectors are cached. Called once on first query.
 * Uses main-process generateVector if available, else falls back to name+description matching.
 */
async function ensureToolVectors() {
  if (_toolVectorsReady) return
  const tools = getAllTools()
  // Vector generation happens in renderer via IPC — cache is populated there
  // For main process, we use a simple text matching fallback
  _toolVectorsReady = true
}

/**
 * L0: Get top-N tools relevant to a query (vector-based discovery).
 * For 100+ tools: don't list all, just the most relevant.
 *
 * @param {string} query - User's intent
 * @param {number} maxResults - Max tools to return (default 15)
 * @returns {string} Compact tool list for system prompt
 */
export function getToolCatalogForQuery(query, maxResults = 15) {
  const tools = getAllTools()
  if (tools.length <= 20) {
    // Small toolset: just list all (no vector needed)
    return getToolCatalogString()
  }

  // Large toolset: simple text matching (fast, no vector dependency)
  const queryLower = query.toLowerCase()
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2)

  const scored = tools.map(t => {
    const text = `${t.name} ${t.description} ${t.category}`.toLowerCase()
    let score = 0
    for (const word of queryWords) {
      if (text.includes(word)) score += 1
    }
    // Boost built-in tools slightly
    if (!t.name.startsWith('skill:') && !t.name.startsWith('plugin:')) score += 0.5
    return { ...t, score }
  })

  scored.sort((a, b) => b.score - a.score)
  const relevant = scored.filter(t => t.score > 0).slice(0, maxResults)

  if (relevant.length === 0) {
    // No match: return top general tools
    return getToolCatalogString()
  }

  const lines = [`# TOOLS (top ${relevant.length} dari ${tools.length} tools — gunakan "tool-info" untuk detail)\n`]
  for (const t of relevant) {
    lines.push(`- ${t.name}: ${t.description}`)
  }
  lines.push(`\n- tool-info: Minta detail lengkap suatu tool. Query: nama tool.`)
  return lines.join('\n')
}

// ========== PUBLIC API ==========

/**
 * L0: Get compact tool catalog for system prompt.
 * Returns: [{ name, category, description }] — 1 line each.
 */
export function getToolCatalog() {
  const tools = getAllTools()
  return tools.map(t => ({
    name: t.name,
    category: t.category,
    description: t.description
  }))
}

/**
 * L1: Get full tool details (loaded on demand).
 * Returns: { name, category, description, l1 } or null.
 */
export function getToolDetail(toolName) {
  const tools = getAllTools()
  return tools.find(t => t.name === toolName) || null
}

/**
 * L0: Get compact tool list grouped by category.
 * Returns: string for system prompt injection.
 */
export function getToolCatalogString() {
  const tools = getAllTools()
  const grouped = {}
  for (const t of tools) {
    if (!grouped[t.category]) grouped[t.category] = []
    grouped[t.category].push(t)
  }

  const lines = ['# TOOLS (L0 — type "tool-info <name>" untuk detail lengkap)\n']
  for (const [cat, catTools] of Object.entries(grouped)) {
    lines.push(`## ${cat.toUpperCase()}`)
    for (const t of catTools) {
      lines.push(`- ${t.name}: ${t.description}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

/**
 * Refresh tool cache (call after plugin/skill changes).
 */
export function refreshToolCache() {
  _toolCache = null
  _toolCacheTime = 0
}
