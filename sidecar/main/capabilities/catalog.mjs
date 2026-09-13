// Connector catalog (Fase Kapabilitas — referensi arsitektur OpenConnector).
//
// Katalog = daftar connector BUILT-IN. Setiap connector adalah modul plugin
// dengan:
//   - id, name, description
//   - scopes: daftar scope/izin yang bisa diberikan pada koneksi
//   - actions: peta actionId -> { summary, inputSchema, scopes, guide, run }
//     (Action Guide ala OpenConnector: input schema + scopes + contoh)
//   - run(args, ctx) : eksekusi aksi; ctx = { connection, audit }
//
// Prinsip: katalog kecil, hanya metadata + eksekusi. UI membaca daftar
// connector dari sini (tidak ada hardcode service di renderer).
//
// Privacy-first: kredensial koneksi disimpan di berkas XDG mode 0600
// (lihat connections.mjs); tidak ada telemetri.

import { runWeather } from './weather.mjs'
import { runTime } from './time.mjs'
import { runFs } from './fs.mjs'
import { runShellTool } from './shell-tool.mjs'
import { runBrowserExtension } from './browser-extension.mjs'

// ------------------------------------------------------------- weather

const weatherConnector = {
  id: 'weather',
  name: 'Weather (Open-Meteo)',
  description:
    'Cuaca dan prakiraan per lokasi via Open-Meteo (tanpa API key, tanpa koneksi khusus).',
  scopes: [],
  actions: {
    current: {
      summary: 'Cuaca saat ini untuk satu lokasi.',
      inputSchema: {
        type: 'object',
        properties: {
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          city: { type: 'string', description: 'Alternatif: nama kota (geocoding otomatis).' }
        },
        anyOf: [{ required: ['latitude', 'longitude'] }, { required: ['city'] }]
      },
      scopes: [],
      guide: {
        steps: [
          'Berikan latitude+longitude, atau city untuk geocoding otomatis.',
          'Suhu dikembalikan dalam Celsius.'
        ],
        examples: [{ args: { city: 'Jakarta' } }]
      },
      run: runWeather
    }
  }
}

// ------------------------------------------------------------- time

const timeConnector = {
  id: 'time',
  name: 'Time & Calendar Math',
  description: 'Waktu sistem lokal dan utilitas tanggal (offline murni).',
  scopes: [],
  actions: {
    now: {
      summary: 'Waktu sistem saat ini (ISO + locale id-ID).',
      inputSchema: { type: 'object', properties: {} },
      scopes: [],
      guide: { steps: ['Tanpa argumen.'], examples: [{ args: {} }] },
      run: runTime
    },
    diff: {
      summary: 'Selisih dua waktu (jam:menit atau ISO).',
      inputSchema: {
        type: 'object',
        properties: { from: { type: 'string' }, to: { type: 'string' } },
        required: ['from', 'to']
      },
      scopes: [],
      guide: {
        steps: ['Format bebas yang bisa diparse Date.'],
        examples: [{ args: { from: '09:00', to: '17:30' } }]
      },
      run: runTime
    }
  }
}

// ------------------------------------------------------------- fs (workspace)

const fsConnector = {
  id: 'fs',
  name: 'Workspace Files',
  description:
    'Baca/tulis/hapus berkas DI DALAM workspace XDG abelink via fsGuard (path containment ketat).',
  scopes: ['fs.read', 'fs.write', 'fs.delete'],
  actions: {
    list: {
      summary: 'Daftar isi folder workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relatif ke workspace root; kosong = root.' }
        }
      },
      scopes: ['fs.read'],
      guide: { steps: ['Path relatif; kosong = root workspace.'], examples: [{ args: {} }] },
      run: runFs
    },
    read: {
      summary: 'Baca berkas teks (maks 2MB, tampil 400 baris awal).',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path']
      },
      scopes: ['fs.read'],
      guide: { steps: ['Path relatif workspace.'], examples: [{ args: { path: 'notes.txt' } }] },
      run: runFs
    },
    write: {
      summary: 'Tulis/overwrite berkas teks di workspace.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content']
      },
      scopes: ['fs.write'],
      guide: {
        steps: ['Overwrite penuh; folder dibuat otomatis.'],
        examples: [{ args: { path: 'catatan.txt', content: 'halo' } }]
      },
      run: runFs
    },
    delete: {
      summary: 'Hapus berkas di workspace.',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      scopes: ['fs.delete'],
      guide: { steps: ['Permanen; tidak ada undo.'], examples: [{ args: { path: 'tmp.txt' } }] },
      run: runFs
    }
  }
}

// ------------------------------------------------------------- shell (gate)

const shellToolConnector = {
  id: 'shell-tool',
  name: 'Shell (run-shell gate)',
  description:
    'Eksekusi perintah shell via tool `run-shell` yang sudah ada (gate approval dinamis tetap berlaku).',
  scopes: ['shell.exec'],
  // TANPA requiresApproval blanket di level connector: jalur Tauri sudah
  // menggate `capabilities:execute` lewat APPROVAL_ACTIONS (dialog rfd native
  // + preview payload), dan connector melakukan dynamic per-command check
  // (dangerous keyword dari node-tools.js) saat runtime — persis pola
  // `native-tool:execute`. Perintah berbahaya fail-fast dengan pesan tool asli.
  actions: {
    exec: {
      summary: 'Jalankan satu perintah shell (dangerous keyword = approval).',
      inputSchema: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command']
      },
      scopes: ['shell.exec'],
      guide: {
        steps: ['Gate approval `run-shell` tetap berlaku (dangerous keyword check).'],
        examples: [{ args: { command: 'uname -a' } }]
      },
      run: runShellTool
    }
  }
}

// ------------------------------------------------- browser-extension

const browserExtensionConnector = {
  id: 'browser-extension',
  name: 'Browser Extension (Abelink Bridge)',
  description:
    'Lifecycle resmi extension browser Abelink: status koneksi, panduan pasang, tutup sesi. Aksi tab (navigate/klik) tetap lewat channel browser:* dan tool advanced_browser.',
  scopes: [],
  actions: {
    status: {
      summary: 'Sesi bridge + status koneksi extension + flag auto-close.',
      inputSchema: { type: 'object', properties: {} },
      scopes: [],
      guide: {
        steps: ['Tanpa argumen. connected=true berarti extension polling dan siap menerima perintah.'],
        examples: [{ args: {} }]
      },
      run: runBrowserExtension
    },
    'guide-install': {
      summary: 'Langkah pasang extension untuk pengguna binary (tanpa folder repo).',
      inputSchema: { type: 'object', properties: {} },
      scopes: [],
      guide: {
        steps: ['Lihat output aksi ini.'],
        examples: [{ args: {} }]
      },
      run: runBrowserExtension
    },
    'close-session': {
      summary: 'Tutup sesi bridge (drop antrean). Tidak menyentuh tab user.',
      inputSchema: {
        type: 'object',
        properties: { sessionId: { type: 'string' } }
      },
      scopes: [],
      guide: {
        steps: ['Isi sessionId (default: "default").'],
        examples: [{ args: { sessionId: 'default' } }]
      },
      run: runBrowserExtension
    }
  }
}

// ------------------------------------------------------------------- registry

export const CONNECTORS = new Map()
for (const c of [weatherConnector, timeConnector, fsConnector, shellToolConnector, browserExtensionConnector]) {
  CONNECTORS.set(c.id, c)
}

export const listConnectors = () =>
  [...CONNECTORS.values()].map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    scopes: c.scopes,
    actions: Object.entries(c.actions).map(([id, a]) => ({
      id,
      summary: a.summary,
      scopes: a.scopes || []
    }))
  }))

export const getConnector = (id) => CONNECTORS.get(String(id || '')) || null

// ------------------------------------------------- runtime registration (seam)
// TITIK KONTRIBUSI seam kapabilitas (pola deepseek-harness: definisi +
// provider + konsumen terpisah): connector eksternal (mis. MCP custom dari UI)
// didaftarkan saat runtime tanpa patch katalog. Transport 'mcp' berarti
// eksekusi di-route ke MCP client (Fase F3); sebelum itu execute fail-fast
// jujur (Lihat executeCapability), tidak pernah sukses palsu.
export function registerConnector(def = {}) {
  const id = String(def.id || '').trim()
  if (!id || /[^a-z0-9_-]/i.test(id)) {
    throw new Error(`ID connector tidak valid: '${def.id}' (huruf/angka/dash/underscore).`)
  }
  const url = String(def.url || '').trim()
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`URL connector '${id}' harus http(s).`)
  }
  // Header auth opsional (mis. API key): objek string->string, disimpan di
  // connections.json 0600 + memori — tidak pernah ke renderer/log.
  let headers = {}
  if (def.headers && typeof def.headers === 'object') {
    for (const [k, v] of Object.entries(def.headers)) {
      if (typeof k === 'string' && typeof v === 'string' && k && v) headers[k] = v
    }
  }
  const connector = {
    id,
    name: String(def.name || id),
    description: String(def.description || 'Custom MCP Server'),
    url,
    headers,
    transport: 'mcp',
    scopes: [],
    actions: {}
  }
  CONNECTORS.set(id, connector)
  return { id, name: connector.name, transport: 'mcp' }
}

// Action guide ala OpenConnector: schema + scopes + connection identity + contoh.
export const getActionGuide = (connectorId, actionId) => {
  const c = getConnector(connectorId)
  if (!c) return null
  const a = c.actions[String(actionId || '')]
  if (!a) return null
  return {
    connector: { id: c.id, name: c.name, scopes: c.scopes },
    action: {
      id: String(actionId),
      summary: a.summary,
      inputSchema: a.inputSchema,
      scopes: a.scopes || []
    },
    guide: a.guide || { steps: [], examples: [] }
  }
}
