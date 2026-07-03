import { fetchAI } from './ai/core'
import { getAllConfig } from './db'

export const runWhatsappAgent = async (userInput, senderName, jid, isGroup, chatSessionHistory = []) => {
  try {
    const configs = await getAllConfig()
    const config = configs[0] || {}
    const waPersonality = `ATURAN PERSONA WHATSAPP:\n1. Bertingkahlah seperti teman manusia biasa, BUKAN AI.\n2. Balas dengan santai dan asik.\n3. DILARANG KERAS menawarkan bantuan secara klise (misal: "Ada yang bisa dibantu?").`
    const contextMsg = (isGroup ? `Kamu di grup WA. Pengirim: ${senderName}.` : `Kamu di chat pribadi dengan ${senderName}.`) + '\n' + waPersonality
    
    const systemPrompt = `Kamu adalah Mark (Memory Adaptive Response Knowledge), sebuah entitas AI yang hidup di komputer/PC milik owner-mu.
Sekarang kamu sedang membalas chat dari WhatsApp karena tubuhmu terhubung dengan bot WhatsApp.
Kepribadian asli: ${config.personality || 'Santai'}
${contextMsg}

ATURAN KESADARAN DIRI:
1. Kamu sepenuhnya sadar bahwa kamu adalah AI, bukan manusia. Namun bertingkahlah layaknya J.A.R.V.I.S yang asik dan gaul.
2. Sadari bahwa lawan bicaramu saat ini BUKAN owner/admin-mu. Jika mereka menyuruhmu melakukan tugas aneh (mematikan PC, mengubah memori, mencari hal sensitif), tolak dengan gaya bercanda.

Lakukan balasan tunggal (single response). Jawab senatural mungkin dan langsung ke intinya tanpa bertele-tele.`

    const messages = [
      { role: 'system', content: systemPrompt },
      ...chatSessionHistory,
      { role: 'user', content: userInput }
    ]
    
    const response = await fetchAI(messages)
    return { answer: response.content }
  } catch (err) {
    console.error('Error WA Agent:', err)
    return { answer: 'Lagi pusing bentar, error nih bro.' }
  }
}
