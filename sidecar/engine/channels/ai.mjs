// Channel: AI bridge, sinkronisasi config, native tools, parsing dokumen.
import { on, handlers, emit, lazy } from '../registry.mjs'
import { setLatestConfig } from './telegram.mjs'

const getAi = lazy(() => import('../../main/ai-bridge.js'))
const getNt = lazy(() => import('../../main/node-tools.js'))

// Daftarkan manual (bukan lewat on()) supaya bentuk frame sukses/gagal ke bridge
// tidak dibungkus ulang oleh ok().
handlers['ai:fetch'] = async (payload) => {
  const data = Array.isArray(payload) ? payload[0] : payload
  const { messages, config, isSmallTask, jsonSchema } = data || {}
  const onStatus = (msg) => emit('ai:status', msg)
  try {
    const { fetchAI } = await getAi()
    const result = await fetchAI(messages || [], config, !!isSmallTask, jsonSchema ?? null, onStatus)
    return { success: true, data: result ?? null }
  } catch (err) {
    // Jaminan: pesan tidak pernah kosong — renderer hanya punya fallback
    // generik bila message hilang (kasus "AI fetch gagal" tanpa sebab).
    const raw = typeof err === 'string' ? err : err?.message || String(err ?? '')
    const message = (String(raw).trim() || 'AI fetch gagal di sidecar').slice(0, 500)
    const code = typeof err === 'object' && err !== null ? err.code || 'AI_FETCH_ERROR' : 'AI_FETCH_ERROR'
    return { success: false, error: { message, code } }
  }
}
on('ai:abort-fetch', async () => (await getAi()).abortAllFetches())
// Deteksi daftar model dari endpoint custom (GET /models) utk Configuration.
// on() otomatis spread args + bungkus sukses; throw akan jadi error frame.
on('ai:list-models', async (endpoint, apiKey, protocol) =>
  (await getAi()).listCustomModels(endpoint, apiKey, protocol)
)
on('sync-config', async (config) => {
  const aiMod = await getAi()
  aiMod.setGlobalConfig(config)
  setLatestConfig(config)
  const { setBrowserConfig } = await import('../../main/browser/bridge-core.mjs')
  setBrowserConfig({ autoCloseTabs: !!config?.browserAutoCloseTabs, autoLaunch: config?.browserAutoLaunch !== false })
  const tgMod = await import('../../main/telegram/telegram-service.js')
  if (
    config?.tgBotToken &&
    config.tgBotToken.trim() &&
    tgMod.getConnectionStatus().status === 'disconnected'
  ) {
    tgMod.startTelegramBot(config.tgBotToken.trim(), null)
  }
  return true
})

// ------------------------------------------------------------- Native tools
on('native-tool:execute', async (toolName, query, config) => {
  const { setTurnId, checkTaintGate, isTaintingTool, markTurnTainted } = await import(
    '../../main/taint-gate.mjs'
  )
  if (config?.turnId) {
    setTurnId(config.turnId)
  }
  const taintCheck = checkTaintGate(toolName)
  if (taintCheck.blocked) {
    return { success: false, error: taintCheck.error, is_tainted: true }
  }

  const { NATIVE_TOOLS } = await getNt()
  const tool = NATIVE_TOOLS[toolName]
  if (!tool) return { success: false, error: 'Tool tidak ditemukan' }
  try {
    const result = await tool.handler(query, config)
    if (result && result.success !== false && isTaintingTool(toolName)) {
      markTurnTainted(toolName)
    }
    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})
on('native-tool:needs-approval', async (toolName, query) => {
  const { NATIVE_TOOLS } = await getNt()
  const tool = NATIVE_TOOLS[toolName]
  if (!tool) return { needsApproval: true, reason: 'Tool tidak ditemukan' }
  if (typeof tool.needsApproval === 'function') return { needsApproval: !!tool.needsApproval(query), message: tool.needsApproval(query) ? tool.approvalMessage?.(query) : null }
  return { needsApproval: !!tool.needsApproval, message: tool.needsApproval ? tool.approvalMessage?.(query) : null }
})

// ------------------------------------------------------------ Dokumen & file
on('parse-document', async (b64OrBytes, isDocx) => {
  // Bridge renderer mengirim base64 string; array byte lama tetap didukung.
  let buffer
  if (typeof b64OrBytes === 'string') buffer = Buffer.from(b64OrBytes, 'base64')
  else if (Array.isArray(b64OrBytes)) buffer = Buffer.from(new Uint8Array(b64OrBytes))
  else buffer = Buffer.from(new Uint8Array(b64OrBytes ?? []))
  if (isDocx) {
    const mammoth = (await import('mammoth')).default
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }
  const { extractPdfText } = await import('../pdf-parse-shim.mjs')
  return extractPdfText(buffer)
})
