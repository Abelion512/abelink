import { fetchAI } from './ai/core'
import { getAllConfig } from './db'

export const runWhatsappAgent = async (userInput, senderName, jid, isGroup, chatSessionHistory = []) => {
  try {
    const configs = await getAllConfig()
    const config = configs[0] || {}
    const waPersonality = `ATURAN PERSONA WHATSAPP:\n1. Bertingkahlah seperti teman manusia biasa, BUKAN AI.\n2. Balas dengan santai dan asik.\n3. DILARANG KERAS menawarkan bantuan secara klise (misal: "Ada yang bisa dibantu?").`
    const contextMsg = (isGroup ? `Kamu di grup WA. Pengirim: ${senderName}.` : `Kamu di chat pribadi dengan ${senderName}.`) + '\n' + waPersonality
    
    const systemPrompt = `Kamu adalah Mark, asisten lokal yang cerdas.
Kepribadian: ${config.personality || 'Santai'}
${contextMsg}

Lakukan balasan tunggal (single response). Jawab senatural mungkin dan langsung ke intinya.`

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
