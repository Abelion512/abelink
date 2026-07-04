import { fetchAI } from './core'
import { getCurrentTimeInfo } from './utils'

export const getAwarenessResponse = async (buffer, memoryRef, config, recentChat, signal) => {
  const conf = config[0] || {}
  
  const prompt = `Kamu adalah Mark, asisten AI otonom yang berjalan di latar belakang (Awareness Engine).
Personality and Communication Style: ${conf.personality || 'Santai layaknya seorang teman dan suka bercanda.'}

# AKTIVITAS USER (30 menit terakhir):
${JSON.stringify(buffer, null, 2)}

# RIWAYAT CHAT TERBARU:
${recentChat && recentChat.length > 0 ? JSON.stringify(recentChat, null, 2) : 'Belum ada obrolan terbaru.'}

# MEMORY USER YANG RELEVAN DENGAN AKTIVITAS:
${memoryRef ? JSON.stringify(memoryRef, null, 2) : 'Tidak ada memory spesifik.'}

# WAKTU SEKARANG:
${getCurrentTimeInfo()}

# INSTRUKSI & WEWENANG:
Berdasarkan aktivitas di atas, kamu HANYA BUKAN pengamat. KAMU MEMILIKI WEWENANG PENUH untuk mengeksekusi sistem (Autonomous Agent).
Kamu bisa memutar musik (music-play), menelusuri web (search), mengeksekusi plugin, dsb.

Pertimbangkan:
- Jika user bekerja terlalu lama, kamu BISA memutuskan untuk memutar lagu lofi/relaxing secara otomatis.
- Jika ada pola aktivitas yang butuh riset, kamu BISA melakukan web search otomatis.
- Jika tidak ada hal penting, tetap DIAM (should_act: false). JANGAN SPAM.

# OUTPUT FORMAT (Wajib JSON):
1. "should_act": boolean (true jika kamu ingin mengeksekusi sesuatu, false jika diam)
2. "message": string (Kalimat pembuka yang kamu ucapkan ke user. Misal: "Wah bos lembur nih, gue puterin lagu chill ya!") atau null.
3. "autonomous_prompt": string (Instruksi teks PERINTAH yang akan kamu kirimkan ke otak eksekutor-mu sendiri. Misal: "Putar lagu lofi hip hop relax" atau "Cari berita teknologi terbaru"). Isi null jika tidak ada tindakan.
4. "mood": string ("curious", "caring", "playful", atau "helpful")

Jadilah asisten cerdas yang inisiatif, bukan robot pasif.`

  const awarenessSchema = {
    type: 'object',
    properties: {
      should_act: { type: 'boolean' },
      message: { type: ['string', 'null'] },
      autonomous_prompt: { type: ['string', 'null'] },
      mood: {
        type: 'string',
        enum: ['curious', 'caring', 'playful', 'helpful', 'normal']
      }
    },
    required: ['should_act', 'message', 'autonomous_prompt', 'mood'],
    additionalProperties: false
  }

  try {
    const messages = [{ role: 'user', content: prompt }]
    const aiResponse = await fetchAI(messages, signal, false, awarenessSchema)
    if (aiResponse && aiResponse.content) {
      try {
        const parsed = JSON.parse(aiResponse.content)
        return {
          should_act: parsed.should_act,
          message: parsed.message,
          autonomous_prompt: parsed.autonomous_prompt,
          mood: parsed.mood || 'normal'
        }
      } catch (err) {
        console.error('[Awareness AI] Gagal parse JSON AI:', err)
        return { should_act: false, message: null, autonomous_prompt: null, mood: 'normal' }
      }
    }
  } catch (error) {
    if (error.name !== 'AbortError' && !error.message?.includes('AbortError')) {
      console.error('[Awareness AI] Error fetchAI:', error)
    }
  }
  
  return { should_act: false, message: null, autonomous_prompt: null, mood: 'normal' }
}
