import { getAllConfig } from '../db'

export const getCurrentTimeInfo = () => {
  const now = new Date()
  const options = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  }
  return now.toLocaleDateString('id-ID', options)
}




export const playVoice = async (text) => {
  try {
    const config = await getAllConfig()
    const rate = config[0]?.ttsRate ?? 0
    const pitch = config[0]?.ttsPitch ?? 0

    // 1. Minta data audio (base64) ke backend
    const audioBase64 = await window.api.textToSpeech(text, rate, pitch)

    if (audioBase64) {
      // 2. Bikin object Audio baru dari string base64 tadi
      const audio = new Audio(audioBase64)

      // 3. Mainkan!
      audio.play()
    }
  } catch (error) {
    console.error('Gagal memutar suara:', error)
  }
}

// ==========================================
// PLANNING (AGENTIC) FUNCTIONS
// ==========================================

