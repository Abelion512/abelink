// Channel: AI bridge, sinkronisasi config, native tools, parsing dokumen.
//
// W1-3 (js-to-ts-spec.md): rename + tipe. Bentuk frame ai:fetch sukses/gagal
// dianotasi eksak (error = objek {message, code}, BUKAN string — kontrak
// renderer; registry.FrameResponse.error bertipe unknown untuk ini).
// Modul main/* ber-JSDoc sempit dianotasi ulang via interface lokal (cast
// type-only, runtime persis asli).
import { on, handlers, emit, lazy, type HandlerResult } from '../registry.ts'
import { setLatestConfig } from './telegram.ts'
import { writeSharedConfig } from '../../main/shared-config.ts'
import { normalizeLegacyProviderConfig } from '../../main/legacy-provider-shim.ts'

type AiBridgeModule = {
  fetchAI: (
    messages: unknown,
    config: unknown,
    isSmallTask: boolean,
    jsonSchema: unknown,
    onStatus: ((msg: unknown) => void) | null,
    onToken: ((chunk: unknown) => void) | null
  ) => Promise<unknown>
  abortAllFetches: () => Promise<unknown>
  listCustomModels: (endpoint: unknown, apiKey: unknown, protocol: unknown) => Promise<unknown>
  setGlobalConfig: (config: unknown) => void
}
type NodeToolLike = {
  handler: (query: unknown, config: unknown) => Promise<unknown>
  needsApproval?: boolean | ((query: unknown) => boolean)
  approvalMessage?: (query: unknown) => string | null
}
type NodeToolsModule = { NATIVE_TOOLS: Record<string, NodeToolLike> }
type TgModule = {
  getConnectionStatus: () => { status: string }
  startTelegramBot: (token: string, headlessRunner: unknown) => Promise<unknown>
}

const getAi = lazy(async () =>
  (await import('../../main/ai-bridge.ts')) as unknown as AiBridgeModule
)
const getNt = lazy(async () =>
  (await import('../../main/node-tools.ts')) as unknown as NodeToolsModule
)

// Daftarkan manual (bukan lewat on()) supaya bentuk frame sukses/gagal ke bridge
// tidak dibungkus ulang oleh ok().
handlers['ai:fetch'] = async (payload: unknown): Promise<HandlerResult> => {
  const data = (Array.isArray(payload) ? payload[0] : payload) as
    | { messages?: unknown; config?: unknown; isSmallTask?: unknown; jsonSchema?: unknown; stream?: unknown }
    | null
  const { messages, config, isSmallTask, jsonSchema, stream } = data || {}
  const onStatus = (msg: unknown) => emit('ai:status', msg)
  // Opt-in: tanpa stream=true tidak ada event ai:token (jalur blocking lama).
  // Rust meneruskan SEMUA frame {event} generik (cmd_node_bridge.rs) jadi
  // tidak perlu perubahan native; registry.emit pun generik.
  const onToken = stream ? (chunk: unknown) => emit('ai:token', chunk) : null
  try {
    const { fetchAI } = await getAi()
    const result = await fetchAI(messages || [], config, !!isSmallTask, jsonSchema ?? null, onStatus, onToken)
    return { success: true, data: result ?? null }
  } catch (err) {
    // Jaminan: pesan tidak pernah kosong — renderer hanya punya fallback
    // generik bila message hilang (kasus "AI fetch gagal" tanpa sebab).
    const e = err as { message?: string; code?: string }
    const raw = typeof err === 'string' ? err : e?.message || String(err ?? '')
    const message = (String(raw).trim() || 'AI fetch gagal di sidecar').slice(0, 500)
    const code = typeof err === 'object' && err !== null ? e.code || 'AI_FETCH_ERROR' : 'AI_FETCH_ERROR'
    return { success: false, error: { message, code } }
  }
}
on('ai:abort-fetch', async () => (await getAi()).abortAllFetches())
// Deteksi daftar model dari endpoint custom (GET /models) utk Configuration.
// on() otomatis spread args + bungkus sukses; throw akan jadi error frame.
on('ai:list-models', async (endpoint: unknown, apiKey: unknown, protocol: unknown) =>
  (await getAi()).listCustomModels(endpoint, apiKey, protocol)
)
on('sync-config', async (rawConfig: unknown) => {
  const aiMod = await getAi()
  // Legacy provider (groq/cerebras pra-registry) dinormalisasi sebelum masuk
  // global config + shared.json — runtime di bawah vendor-agnostic.
  const config = normalizeLegacyProviderConfig(rawConfig as Record<string, unknown>)
  aiMod.setGlobalConfig(config)
  setLatestConfig(config)
  // Jembatan GUI -> CLI/TUI (satu produk): snapshot config AI ke
  // ~/.config/abelink/shared.json yang dibaca headlessCli.loadCliFileConfig.
  // Best-effort: kegagalan tulis TIDAK boleh menggagalkan sync GUI.
  try { writeSharedConfig(config) } catch { /* never break GUI sync */ }
  const { setBrowserConfig } = await import('../../main/browser/bridge-core.ts')
  setBrowserConfig({ autoCloseTabs: !!config?.browserAutoCloseTabs, autoLaunch: config?.browserAutoLaunch !== false })
  const tgMod = (await import('../../main/telegram/telegram-service.ts')) as unknown as TgModule
  if (
    config?.tgBotToken &&
    (config.tgBotToken as string).trim() &&
    tgMod.getConnectionStatus().status === 'disconnected'
  ) {
    tgMod.startTelegramBot((config.tgBotToken as string).trim(), null)
  }
  return true
})

// ------------------------------------------------------------- Native tools
on('native-tool:execute', async (toolName: unknown, query: unknown, config: unknown) => {
  const { setTurnId, checkTaintGate, isTaintingTool, markTurnTainted } = await import(
    '../../main/taint-gate.ts'
  )
  const cfg = config as { turnId?: string } | null | undefined
  if (cfg?.turnId) {
    setTurnId(cfg.turnId)
  }
  const taintCheck = checkTaintGate(toolName)
  if (taintCheck.blocked) {
    return { success: false, error: taintCheck.error, is_tainted: true }
  }

  const { NATIVE_TOOLS } = await getNt()
  const tool = NATIVE_TOOLS[toolName as string]
  if (!tool) return { success: false, error: 'Tool tidak ditemukan' }
  try {
    const result = (await tool.handler(query, config)) as { success?: unknown }
    if (result && result.success !== false && isTaintingTool(toolName as string)) {
      markTurnTainted(toolName as string)
    }
    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})
on('native-tool:needs-approval', async (toolName: unknown, query: unknown) => {
  const { NATIVE_TOOLS } = await getNt()
  const tool = NATIVE_TOOLS[toolName as string]
  if (!tool) return { needsApproval: true, reason: 'Tool tidak ditemukan' }
  if (typeof tool.needsApproval === 'function') return { needsApproval: !!tool.needsApproval(query), message: tool.needsApproval(query) ? tool.approvalMessage?.(query) : null }
  return { needsApproval: !!tool.needsApproval, message: tool.needsApproval ? tool.approvalMessage?.(query) : null }
})

// ------------------------------------------------------------ Dokumen & file
on('parse-document', async (b64OrBytes: unknown, isDocx: unknown) => {
  // Bridge renderer mengirim base64 string; array byte lama tetap didukung.
  let buffer: Buffer
  if (typeof b64OrBytes === 'string') buffer = Buffer.from(b64OrBytes, 'base64')
  else if (Array.isArray(b64OrBytes)) buffer = Buffer.from(new Uint8Array(b64OrBytes))
  else buffer = Buffer.from(new Uint8Array((b64OrBytes as ArrayLike<number>) ?? []))
  if (isDocx) {
    const mammoth = (await import('mammoth')).default
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }
  const { extractPdfText } = await import('../pdf-parse-shim.ts')
  return extractPdfText(buffer)
})
