// Hermes-style context compressor
// Compresses conversation history when it exceeds threshold
// Protects first N (system prompt) and last N (recent context) messages.

const DEFAULTS = {
  enabled: true,
  threshold: 0.75,        // compress when messages >75% of maxTokens
  targetRatio: 0.2,       // compress down to 20% of original
  protectLastN: 20,       // keep last N messages intact
  protectFirstN: 3,       // keep first N messages intact (system + greeting)
  maxTokens: 128000,      // default context window
  minCompressCount: 10    // don't bother if fewer messages than this
}

function estimateTokens(text) {
  // Aligned with fetchAI's estimate: 1 token ~= 2.5 chars (Indo/English mix)
  // Previous /3.5 underestimated, causing compressor to never fire.
  return Math.ceil((text || '').length / 2.5)
}

export function createCompressor(config = {}) {
  const cfg = { ...DEFAULTS, ...config }

  function shouldCompress(messages) {
    if (!cfg.enabled) return false
    if (messages.length < cfg.minCompressCount) return false

    const totalEst = messages.reduce((sum, m) => {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')
      return sum + estimateTokens(content) + 10 // overhead per message
    }, 0)

    const ratio = totalEst / cfg.maxTokens
    if (import.meta.env.DEV) {
      console.debug(`[Compressor] ${messages.length} msgs, ~${totalEst} est tokens, ratio=${ratio.toFixed(2)}, threshold=${cfg.threshold}, maxTokens=${cfg.maxTokens}, fire=${ratio > cfg.threshold}`)
    }
    return ratio > cfg.threshold
  }

  function compress(messages) {
    if (!shouldCompress(messages)) return messages

    const firstN = messages.slice(0, cfg.protectFirstN)
    const lastN = messages.slice(-cfg.protectLastN)
    const compressible = messages.slice(cfg.protectFirstN, -cfg.protectLastN)

    if (compressible.length === 0) return messages

    // Count total tokens in compressible region
    let totalTokens = 0
    for (const m of compressible) {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')
      totalTokens += estimateTokens(content) + 10
    }

    const targetTokens = Math.max(Math.round(totalTokens * cfg.targetRatio), 200)
    const perMsgBudget = Math.floor(targetTokens / compressible.length)

    // Build summary of middle section
    const summaryParts = []
    for (const m of compressible) {
      const role = m.role === 'assistant' ? 'AI' : m.role === 'user' ? 'User' : 'System'
      let content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')

      // Extract key info: tool used, answer presence, length indicator
      const toolMatch = content.match(/action.*?tool["']:\s*["']([^"']+)/i)
      const answerMatch = content.match(/answer["']:\s*["']([^"']{0,100})/i)
      const hasObservation = content.includes('[OBSERVATION]')
      const isToolResult = content.startsWith('[OBSERVATION]') || content.startsWith('[ERROR]')

      let entry
      if (hasObservation && toolMatch) {
        entry = `[${role}] Tool: ${toolMatch[1]} → ${isToolResult ? 'Result' : 'Error'}`
      } else if (answerMatch) {
        const snippet = answerMatch[1].substring(0, 80).replace(/["']/g, '')
        entry = `[${role}] Answer: "${snippet}..."`
      } else {
        // Trim to budget
        content = content.substring(0, perMsgBudget).replace(/\s+/g, ' ').trim()
        entry = `[${role}] ${content.substring(0, Math.min(perMsgBudget, 200))}`
      }
      summaryParts.push(entry)
    }

    // Build compressed block
    const compressedBlock = {
      role: 'system',
      content: `[CONTEXT COMPRESSION - ${compressible.length} previous messages summarized]\n${summaryParts.join('\n')}\n[END COMPRESSION]`
    }

    return [...firstN, compressedBlock, ...lastN]
  }

  return { compress, shouldCompress, getConfig: () => cfg }
}
