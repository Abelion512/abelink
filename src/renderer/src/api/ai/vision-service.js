// Vision Service — dedicated vision model dispatch
// Routes analyze-screen and camera-look to appropriate vision models.
// Fallback: tries LM Studio vision endpoint, then Gemini-compatible.
// model-router.js is not yet implemented — dispatch inline here.

const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB limit per image

function truncateImage(dataUrl) {
  if (!dataUrl || dataUrl.length <= MAX_IMAGE_SIZE) return dataUrl
  console.warn('[VisionService] Image too large (' + Math.round(dataUrl.length / 1024) + 'KB), returning as-is, server may reject')
  return dataUrl
}

async function analyzeImage(imageData, prompt, source) {
  // Try LM Studio vision endpoint (LLaVA / LLaMA-vision compatible)
  const endpoints = [
    { url: 'http://localhost:1234/v1/chat/completions', model: 'llava-v1.6-mistral' },
  ]
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ep.model,
          messages: [
            { role: 'user', content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageData, detail: 'high' } }
            ]}
          ],
          max_tokens: 1024,
          stream: false
        })
      })
      if (!res.ok) continue
      const data = await res.json()
      const text = data.choices?.[0]?.message?.content || ''
      return { source, content: text }
    } catch {}
  }
  // ponytail: single fallback, multi-model dispatch when vision matters
  return { source: 'error', content: 'Vision model tidak merespons. Pastikan LM Studio dengan model vision (llava/llama-vision) berjalan.' }
}

// Analyze screenshot(s) — handles multi-monitor
export async function analyzeScreen(screens, prompt) {
  if (!screens || screens.length === 0) {
    return 'Gagal mengambil screenshot.'
  }

  const results = []
  for (let i = 0; i < screens.length; i++) {
    const screen = screens[i]
    const imageData = truncateImage(screen.data)
    const monitorLabel = screens.length > 1 ? ' (Monitor ' + (i + 1) + ')' : ''
    const result = await analyzeImage(
      imageData,
      prompt + monitorLabel,
      'screen'
    )
    results.push(result)
  }

  const successResults = results.filter(r => r.source !== 'error')
  if (successResults.length === 0) {
    const errors = results.map(r => r.content).join('; ')
    return 'Gagal menganalisis layar: ' + errors
  }

  return successResults.map(r => r.content).join('\n\n---\n')
}

// Analyze camera frame
export async function analyzeCamera(imageData, prompt) {
  if (!imageData) return 'Gagal mengambil gambar dari kamera.'

  const trimmed = truncateImage(imageData)
  const result = await analyzeImage(trimmed, prompt, 'camera')

  if (result.source === 'error') {
    return 'Gagal memproses kamera: ' + result.content
  }

  return result.content
}

export default { analyzeScreen, analyzeCamera }
