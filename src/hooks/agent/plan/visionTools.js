// Eksekutor tool domain VISION (dipindah murni dari useMarkPlan.executeSingleTool).
// Vision dikunci ke 9router (private) — gemini-web RPC tidak mendukung image.
import { fetchAI } from '../../../api/ai/core'

const VISION_9ROUTER_ENDPOINT = 'http://127.0.0.1:20128/v1'
const VISION_MODEL_CHAIN = [
  'gc/gemini-3.1-flash-lite-preview',
  'nara/mimo-v2.5-free',
  'oc/mimo-v2.5-free'
]

export const fetchVisionAI = async (contentArray, signal) => {
  let lastErr = null
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
      console.warn(`[Vision AI] Model ${model} gagal, coba fallback...`, e?.message || e)
    }
  }
  const err = new Error(
    `Vision 9router tidak tersedia (3 model dicoba). Pastikan gateway ${VISION_9ROUTER_ENDPOINT} hidup. Terakhir: ${lastErr?.message || lastErr}`
  )
  err.cause = lastErr
  throw err
}

const asText = (visionResponse) =>
  typeof visionResponse === 'object' && visionResponse.content
    ? visionResponse.content
    : String(visionResponse)

// Shared vision capture: thinking bubble -> image -> fetchVisionAI -> text.
const runVisionCapture = async ({ thinkingLabel, imageUrl, prompt, logTag, currentSignal, targetSetChatData }) => {
  targetSetChatData((prev) => [
    ...prev.filter((item) => !item.isThinking),
    { role: 'ai', content: thinkingLabel, isThinking: true }
  ])
  const contentArray = [
    { type: 'text', text: prompt },
    { type: 'image_url', image_url: { url: imageUrl } }
  ]
  const visionResponse = await fetchVisionAI(contentArray, currentSignal)
  const textContent = asText(visionResponse)
  console.log(`[Vision AI - ${logTag}] Hasil analisis:`, textContent)
  return textContent
}

/**
 * @returns {string|undefined} resultString bila tool milik domain ini.
 */
export const runVisionTool = async (tool, query, ctx) => {
  const { targetSetChatData, currentSignal, config, requestCameraCapture, isAutonomous } = ctx
  if (tool === 'analyze-screen') {
    try {
      const screens = await window.api.takeScreenshot()
      if (screens && screens.length > 0) {
        const imageUrl = Array.isArray(screens)
          ? screens[0]
          : typeof screens === 'string'
            ? screens
            : screens?.base64
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
        return `Hasil Analisis Layar:\n${textContent}`
      }
      return 'Gagal mengambil screenshot layar untuk analisis.'
    } catch (e) {
      return `Gagal memproses analisis layar: ${e.message}`
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
        ...prev.filter((item) => !item.isThinking),
        { role: 'ai', content: 'Mengakses kamera...', isThinking: true }
      ])

      const cameraFrame = await requestCameraCapture({
        isAutonomous,
        deviceId: config[0]?.cameraDeviceId !== 'default' ? config[0]?.cameraDeviceId : null
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
      return `Gagal memproses kamera: ${e.message}`
    }
  }
  return undefined
}
