// Tool: analyze-screen (deep role), camera-look (realtime role)
import { analyzeScreen, analyzeCamera } from '../../../api/ai/vision-service'

export async function executeVisionTool(ctx) {
  const { tool, query, config, requestCameraCapture, isAutonomous, scheduleThinkingUpdate, flushThinkingUpdate } = ctx
  if (tool === 'analyze-screen') {
    try {
      const screens = await window.api.takeScreenshot()
      if (screens && screens.length > 0) {
        scheduleThinkingUpdate('Memproses Vision AI...')
        const result = await analyzeScreen(screens, query || 'Jelaskan dengan detail apa yang terlihat di layar ini.')
        console.log(`[Vision AI - analyze-screen] Hasil analisis:`, result)
        return result
      }
      return 'Gagal mengambil screenshot dari sistem operasi.'
    } catch (e) {
      return `Gagal memproses visual: ${e.message}`
    }
  }
  // camera-look
  try {
    if (config[0]?.cameraEnabled === false) {
      return 'Fitur kamera dimatikan di pengaturan. Beri tahu user untuk mengaktifkannya.'
    }
    if (!requestCameraCapture) {
      return 'Internal Error: Callback requestCameraCapture tidak tersedia.'
    }
    flushThinkingUpdate('Mengakses kamera...', true)
    const cameraFrame = await requestCameraCapture({
      isAutonomous,
      deviceId: config[0]?.cameraDeviceId !== 'default' ? config[0]?.cameraDeviceId : null
    })
    if (cameraFrame) {
      flushThinkingUpdate('Menganalisis hasil kamera...', true)
      const result = await analyzeCamera(cameraFrame, query || 'Jelaskan apa yang terlihat dari kamera ini.')
      console.log(`[Vision AI - camera-look] Hasil analisis:`, result)
      return result
    }
    return 'Gagal mengambil gambar dari kamera.'
  } catch (e) {
    return `Gagal memproses kamera: ${e.message}`
  }
}
