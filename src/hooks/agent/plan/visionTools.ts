// Eksekutor tool domain VISION (dipindah murni dari useAbelinkPlan.executeSingleTool).
// Vision dikunci ke 9router (private) — gemini-web RPC tidak mendukung image.
import { fetchAI } from '../../../api/ai/core'

const VISION_9ROUTER_ENDPOINT = 'http://127.0.0.1:20128/v1'
const VISION_MODEL_CHAIN = [
  'gemini/gemini-3.8-flash',
  'bor/mimo-v2.5:free',
  'bor/deepseek-v4.1-flash:free',
  'gc/gemini-3.1-flash-lite-preview'
]

export const fetchVisionAI = async (
  contentArray: unknown[],
  signal: AbortSignal | null
) => {
  let lastErr: unknown = null
  for (const model of VISION_MODEL_CHAIN) {
    try {
      return await fetchAI([{ role: 'user', content: contentArray }], signal, false, null, {
        aiProvider: 'custom',
        customEndpoint: VISION_9ROUTER_ENDPOINT,
        customApiProtocol: 'openai',
        customModel: model
      })
    } catch (e) {
      lastErr = e
      console.warn(`[Vision AI] Model ${model} gagal, coba fallback...`, (e as Error)?.message || e)
    }
  }
  const err = new Error(
    `Vision 9router tidak tersedia (3 model dicoba). Pastikan gateway ${VISION_9ROUTER_ENDPOINT} hidup. Terakhir: ${(lastErr as Error)?.message || lastErr}`
  ) as Error & { cause?: unknown }
  err.cause = lastErr
  throw err
}

const asText = (visionResponse: unknown) =>
  typeof visionResponse === 'object' && visionResponse !== null && 'content' in visionResponse
    ? String((visionResponse as { content?: unknown }).content ?? '')
    : String(visionResponse)

interface VisionChatMsg {
  isThinking?: boolean
  [key: string]: unknown
}

// Shared vision capture: thinking bubble -> image -> fetchVisionAI -> text.
const runVisionCapture = async ({
  thinkingLabel,
  imageUrl,
  prompt,
  logTag,
  currentSignal,
  targetSetChatData
}: {
  thinkingLabel: string
  imageUrl: string | null
  prompt: string
  logTag: string
  currentSignal: AbortSignal | null | undefined
  targetSetChatData: (updater: (prev: VisionChatMsg[]) => VisionChatMsg[]) => void
}) => {
  targetSetChatData((prev) => [
    ...prev.filter((item: VisionChatMsg) => !item.isThinking),
    { role: 'ai', content: thinkingLabel, isThinking: true }
  ])
  const contentArray = [
    { type: 'text', text: prompt },
    { type: 'image_url', image_url: { url: imageUrl } }
  ]
  const visionResponse = await fetchVisionAI(contentArray, currentSignal ?? null)
  const textContent = asText(visionResponse)
  // Dump analisis penuh (KBs per tool call) hanya di dev.
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    console.log(`[Vision AI - ${logTag}] Hasil analisis:`, textContent)
  }
  return textContent
}

/**
 * @returns {string|undefined} resultString bila tool milik domain ini.
 */
export const runVisionTool = async (
  tool: string,
  query: string,
  ctx: {
    targetSetChatData: (updater: (prev: VisionChatMsg[]) => VisionChatMsg[]) => void
    currentSignal?: AbortSignal | null
    config: Array<{ cameraEnabled?: boolean; cameraDeviceId?: string }>
    requestCameraCapture?: ((opts: { isAutonomous?: boolean; deviceId?: string | null }) => Promise<string | null>) | null
    isAutonomous?: boolean
  }
): Promise<string | { text: string; images: string[] } | undefined> => {
  const { targetSetChatData, currentSignal, config, requestCameraCapture, isAutonomous } = ctx
  if (tool === 'analyze-screen') {
    try {
      const screens = (await window.api.takeScreenshot()) as
        | string[]
        | string
        | { base64?: string }
        | null
        | undefined
      const screensArr = typeof screens === 'string' ? [screens] : Array.isArray(screens) ? screens : null
      if (screensArr && screensArr.length > 0) {
        const imageUrl = screensArr
          ? screensArr[0]
          : typeof screens === 'object' && screens !== null && 'base64' in screens && screens.base64
            ? `data:image/png;base64,${screens.base64}`
            : null

        const textContent = await runVisionCapture({
          thinkingLabel: 'Memproses Vision AI...',
          imageUrl,
          prompt: query || 'Jelaskan apa yang kamu lihat di layar ini secara ringkas.',
          logTag: 'analyze-screen',
          currentSignal,
          targetSetChatData
        })
        // Lampirkan screenshot ke pesan agar user melihat bukti visual langsung.
        // Render: MessageBubble attachedImages grid (sudah ada). Batas ikut
        // capToolImages dispatcher (4 × 2MB).
        return { text: `Hasil Analisis Layar:\n${textContent}`, images: imageUrl ? [imageUrl] : [] }
      }
      return 'Gagal mengambil screenshot layar untuk analisis.'
    } catch (e) {
      return `Gagal memproses analisis layar: ${(e as Error).message}`
    }
  }
  if (tool === 'camera-look') {
    try {
      if (config[0]?.cameraEnabled === false) {
        return 'Fitur kamera dimatikan di pengaturan. Beri tahu user untuk mengaktifkannya.'
      }
      if (!requestCameraCapture) {
        return 'Internal Error: Callback requestCameraCapture tidak tersedia.'
      }
      targetSetChatData((prev) => [
        ...prev.filter((item: VisionChatMsg) => !item.isThinking),
        { role: 'ai', content: 'Mengakses kamera...', isThinking: true }
      ])

      const cameraFrame = await requestCameraCapture?.({
        isAutonomous,
        deviceId: config[0]?.cameraDeviceId !== 'default' ? config[0]?.cameraDeviceId ?? null : null
      })

      if (cameraFrame) {
        const textContent = await runVisionCapture({
          thinkingLabel: 'Menganalisis hasil kamera...',
          imageUrl: cameraFrame,
          prompt: query || 'Jelaskan dengan detail apa yang terlihat dari kamera ini.',
          logTag: 'camera-look',
          currentSignal,
          targetSetChatData
        })
        return `Hasil Analisis Kamera:\n${textContent}`
      }
      return 'Gagal mengambil gambar dari kamera.'
    } catch (e) {
      return `Gagal memproses kamera: ${(e as Error).message}`
    }
  }
  return undefined
}
