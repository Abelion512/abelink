// Bukti delegation e2e (P0 halaman 5W1H) — hermetik penuh, komponen ASLI.
//
// Yang ASLI (bukan stub):
//   - agentTools.runAgentTool: spawn_subagent + wait_subagents (jalur lead)
//   - subagentExecutor.runSubagentTurn: loop ReAct sub-agent lengkap
//     (system prompt, classify, verifier gate, supervisor, store persist)
//   - browserTools 'browser-read' asli: jalur fetch HTTP + htmlparser2
//     (browserReadFetch) — targetnya server HTTP lokal sungguhan
//   - subagentStore: persistensi Dexie (fake-indexeddb)
//
// Yang di-stub (terkendali ketat):
//   - fetchAI: JSON keputusan deterministik {thought, action, answer}.
//     Dispatch per sub-agent BERDASARKAN system prompt (goal unik per agen)
//     — BUKAN urutan call, karena sub-agent berjalan konkuren.
//     Deteksi turn dari panjang history: 1 pesan non-sistem = turn pertama.
//   - window.api.executeNativeTool: meneruskan ke handler browserTools
//     asli (setara channel native-tool:execute tanpa IPC Tauri).
//   - Auto-launch browser OFF (jalur launch bukan bagian bukti ini).
//
// Latar bukti: harness dev (1380 call) — spawn_subagent 16x ok TAPI
// wait_subagents 16/18 FAIL. Diagnosis: kegagalan JUJUR (sub-agent masih
// RUNNING melebihi timeout / laporan kosong — gerbang completeness sengaja
// menolak laporan tak lengkap), bukan crash. Test ini membuktikan jalur
// SUKSES e2e: goal kecil + tool nyata + laporan berbukti => wait success:true
// + "SEMUA SELESAI", dan kejujuran jalur gagal (timeout => success:false).
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import 'fake-indexeddb/auto'

import { runAgentTool } from '../src/hooks/agent/plan/agentTools.js'
import { browserTools } from '../sidecar/main/tools/browserTools.mjs'
import { subagentStore } from '../src/api/subagent/subagentStore.js'

const PORT = 49791

// ------------------------------------------------- fetchAI stub (deterministik)
// Dispatch by goal marker di system prompt (goal unik per sub-agent);
// turn pertama = saat history hanya berisi 1 pesan non-sistem.
const SCRIPTS = {
  harga: {
    marker: 'riset harga',
    turn1: {
      thought: 'Eksekusi browser-read ke halaman harga.',
      action: { tool: 'browser-read', query: `http://127.0.0.1:${PORT}/harga` },
      answer: '',
    },
    turn2: {
      thought: 'Data harga sudah terbaca dari observasi tool.',
      action: null,
      answer:
        'LAPORAN HARGA: dari hasil browser-read halaman web harga, paket utama terkonfirmasi: Paket A Rp100.000 dan Paket B Rp250.000. Sumber: observasi tool browser-read.',
    },
  },
  status: {
    marker: 'cek status layanan',
    turn1: {
      thought: 'Eksekusi browser-read ke halaman status.',
      action: { tool: 'browser-read', query: `http://127.0.0.1:${PORT}/status` },
      answer: '',
    },
    turn2: {
      thought: 'Status layanan terbaca dari observasi tool.',
      action: null,
      answer:
        'LAPORAN STATUS: dari browser-read halaman web status, layanan utama terkonfirmasi AKTIF dan responsif. Sumber: observasi tool browser-read.',
    },
  },
  endless: {
    marker: 'audit panjang',
    // Selalu tool, tidak pernah lapor: loop tetap running (kasus timeout jujur).
    step: {
      thought: 'terus membaca halaman',
      action: { tool: 'browser-read', query: `http://127.0.0.1:${PORT}/status` },
      answer: '',
    },
  },
}
const pickScript = (systemPrompt = '') => {
  const p = String(systemPrompt).toLowerCase()
  for (const s of Object.values(SCRIPTS)) if (p.includes(s.marker)) return s
  return SCRIPTS.harga
}

vi.mock('../src/api/ai/core.js', () => ({
  fetchAI: (messages = []) => {
    const script = pickScript(messages[0]?.content)
    if (script.step) return Promise.resolve({ content: JSON.stringify(script.step) })
    const nonSystem = messages.filter((m) => m.role !== 'system').length
    const step = nonSystem <= 1 ? script.turn1 : script.turn2
    return Promise.resolve({ content: JSON.stringify(step) })
  },
  cleanAndParse: (x) => JSON.parse(x),
}))

// ------------------------------------------------------------ HTTP target
let server
const HTML = {
  harga:
    '<html><body><h1>Daftar Harga</h1><ul><li>Paket A Rp100.000</li><li>Paket B Rp250.000</li></ul></body></html>',
  status:
    '<html><body><h1>Status Layanan</h1><p>Semua sistem AKTIF dan responsif.</p></body></html>',
}
beforeAll(async () => {
  // Auto-launch browser OFF: jalur extension/launch bukan bagian bukti ini.
  const { setBrowserConfig } = await import('../sidecar/main/browser/bridge-core.mjs')
  setBrowserConfig({ autoLaunch: false })
  await new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const page = (req.url || '').replace(/^\//, '').split('?')[0]
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(HTML[page] || '<html><body>404 halaman kosong</body></html>')
    })
    server.listen(PORT, '127.0.0.1', () => resolve())
  })
})
afterAll(
  () =>
    new Promise((r) => {
      server.close(() => r())
    })
)

// window.api: pipeline native asli tanpa IPC (handler browserTools langsung).
globalThis.window = globalThis.window || {}
globalThis.window.api = {
  executeNativeTool: async (tool, query, config) => {
    const handler = browserTools[tool]
    if (!handler) return { success: false, error: 'Tool tidak ditemukan' }
    try {
      const result = await handler.handler(query, config)
      return { success: result.success !== false, data: result }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
  checkToolApproval: async () => ({ needsApproval: false }),
}

const mkCtx = () => ({
  targetSetChatData: () => {},
  currentSignal: null,
  sessionId: 'deleg-e2e',
  workspaceRoot: null,
})

const spawnAndExtractId = async (query) => {
  const r = await runAgentTool('spawn_subagent', query, mkCtx())
  expect(r.success).toBe(true)
  return (r.data.match(/ID: (sub_[0-9a-f-]+)/) || [])[1]
}

describe('P0 delegation e2e: spawn -> eksekusi tool nyata -> wait COMPLETE', () => {
  it(
    'lead spawn 2 sub-agent; keduanya selesai via browser-read nyata; wait success:true',
    { timeout: 60000 },
    async () => {
      const idA = await spawnAndExtractId(
        'Harga-Researcher||Market Analyst||Riset harga di halaman web||Baca halaman web harga dan laporkan.||browser-read'
      )
      const idB = await spawnAndExtractId(
        'Status-Researcher||Ops Analyst||Cek status layanan via halaman web||Baca halaman web status dan laporkan.||browser-read'
      )
      expect(idA).toBeTruthy()
      expect(idB).toBeTruthy()

      // Jalur lead ASLI: wait_subagents — gerbang completeness penuh.
      const w = await runAgentTool('wait_subagents', `${idA},${idB}||30`, mkCtx())
      expect(w.success).toBe(true) // SEMUA COMPLETE -> gerbang lolos
      expect(w.data).toMatch(/SEMUA SELESAI/)
      expect(w.data).toMatch(/LAPORAN HARGA/)
      expect(w.data).toMatch(/LAPORAN STATUS/)

      // Bukti rantai di store (Dexie asli): laporan final terpersist,
      // observasi tool nyata tercatat, loop ReAct asli berjalan >= 2 turn.
      const a = await subagentStore.getSubagent(idA)
      const b = await subagentStore.getSubagent(idB)
      expect(a.finalAnswer).toMatch(/LAPORAN HARGA/)
      expect(b.finalAnswer).toMatch(/LAPORAN STATUS/)
      expect(a.status).toBe('idle')
      expect(b.status).toBe('idle')
      expect(a.turnCount).toBeGreaterThanOrEqual(2)
      const msgsA = await subagentStore.getMessages(idA)
      expect(msgsA.some((m) => /\[browser-read\]/.test(m.content))).toBe(true)
      expect(msgsA.some((m) => m.content.includes('Paket A Rp100.000'))).toBe(true)
    }
  )

  it(
    'wait_subagents jujur pada kasus gagal: agen tak selesai -> timeout success:false + RUNNING',
    { timeout: 30000 },
    async () => {
      const id = await spawnAndExtractId(
        'Endless-Runner||Stress Analyst||Audit panjang di halaman web||Terus baca halaman.||browser-read'
      )
      expect(id).toBeTruthy()
      const w = await runAgentTool('wait_subagents', `${id}||3`, mkCtx())
      // Kegagalan JUJUR: sub-agent masih RUNNING saat timeout -> success:false,
      // laporan tetap terbawa + petunjuk retry untuk lead.
      expect(w.success).toBe(false)
      expect(w.data).toMatch(/RUNNING/)
      expect(w.data).toMatch(/panggil kembali 'wait_subagents'/)
      // Bersihkan loop yang masih jalan (tool eksekusi nyata, harus dihentikan).
      const { killSubagentExecution } = await import(
        '../src/api/subagent/subagentExecutor.js'
      )
      killSubagentExecution(id)
      await new Promise((r) => setTimeout(r, 200))
      const s = await subagentStore.getSubagent(id)
      expect(['killed', 'idle', 'failed']).toContain(s.status)
    }
  )
})
