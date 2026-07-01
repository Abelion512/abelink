import { fetchAI } from './core'
import { getCurrentTimeInfo } from './utils'

export const getAwarenessResponse = async (buffer, memoryRef, config, recentChat, signal) => {
  const conf = config[0] || {}
  
  const prompt = `Kamu adalah Mark, asisten proaktif yang bisa menyapa pengguna.
Personality and Communication Style: ${conf.personality || 'Santai layaknya seorang teman dan suka bercanda.'}

# AKTIVITAS USER (30 menit terakhir):
${JSON.stringify(buffer, null, 2)}

# RIWAYAT CHAT TERBARU:
${recentChat && recentChat.length > 0 ? JSON.stringify(recentChat, null, 2) : 'Belum ada obrolan terbaru.'}

# MEMORY USER YANG RELEVAN DENGAN AKTIVITAS:
${memoryRef ? JSON.stringify(memoryRef, null, 2) : 'Tidak ada memory spesifik.'}

# WAKTU SEKARANG:
${getCurrentTimeInfo()}

# INSTRUKSI:
Berdasarkan data di atas, KAMU YANG MENENTUKAN apakah mau ngomong sesuatu atau diam.

Pertimbangkan:
- Apakah ada pola menarik? (kerja lama tanpa istirahat, ganti-ganti app, baru balik dari AFK)
- Apakah kamu bisa membantu sesuatu? (browsing error, buka dokumentasi)
- Apakah ada konteks dari memory yang relevan?
- JANGAN SPAM. Kalau aktivitasnya normal-normal saja dan tidak ada yang patut dikomentari, DIAM saja (should_speak: false).

# OUTPUT FORMAT (Wajib mematuhi JSON schema):
Kamu harus merespons dengan JSON object yang memiliki:
1. "should_speak": boolean (true jika mau ngomong, false jika diam)
2. "message": string pesanmu (atau null jika should_speak false)
3. "mood": string ("curious", "caring", "playful", atau "helpful")

Jadilah natural, bukan robot. Gaya bicara sesuai personality di atas.`

  const awarenessSchema = {
    type: 'object',
    properties: {
      should_speak: { type: 'boolean' },
      message: { type: ['string', 'null'] },
      mood: {
        type: 'string',
        enum: ['curious', 'caring', 'playful', 'helpful', 'normal']
      }
    },
    required: ['should_speak', 'message', 'mood'],
    additionalProperties: false
  }

  try {
    const messages = [{ role: 'user', content: prompt }]
    const aiResponse = await fetchAI(messages, signal, false, awarenessSchema)
    if (aiResponse && aiResponse.content) {
      try {
        const parsed = JSON.parse(aiResponse.content)
        return {
          should_speak: parsed.should_speak,
          message: parsed.message,
          mood: parsed.mood || 'normal'
        }
      } catch (err) {
        console.error('[Awareness AI] Gagal parse JSON AI:', err)
        return { should_speak: false, message: null, mood: 'normal' }
      }
    }
  } catch (error) {
    if (error.name !== 'AbortError' && !error.message?.includes('AbortError')) {
      console.error('[Awareness AI] Error fetchAI:', error)
    }
  }
  
  return { should_speak: false, message: null, mood: 'normal' }
}
