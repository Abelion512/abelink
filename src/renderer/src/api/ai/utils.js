import { getAllConfig } from '../db'
import { marked } from 'marked'

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
      await audio.play()
    }
  } catch (error) {
    console.error('Gagal memutar suara:', error)
  }
}

// ==========================================
// WHATSAPP UTILS
// ==========================================
const waRenderer = {
  heading({ tokens, depth }) {
    const text = this.parser.parseInline(tokens)
    return `*${text}*\n\n`
  },
  strong({ tokens }) {
    return `*${this.parser.parseInline(tokens)}*`
  },
  em({ tokens }) {
    return `_${this.parser.parseInline(tokens)}_`
  },
  del({ tokens }) {
    return `~${this.parser.parseInline(tokens)}~`
  },
  codespan({ text }) {
    return `\`\`\`${text}\`\`\``
  },
  code({ text }) {
    return `\`\`\`\n${text}\n\`\`\`\n\n`
  },
  link({ href, tokens }) {
    return `${this.parser.parseInline(tokens)} (${href})`
  },
  list({ items, ordered, start }) {
    let body = ''
    items.forEach((item, i) => {
      const prefix = ordered ? `${start + i}. ` : '- '
      body += prefix + this.listitem(item)
    })
    return body + '\n'
  },
  listitem({ tokens }) {
    return `${this.parser.parseInline(tokens)}\n`
  },
  paragraph({ tokens }) {
    return `${this.parser.parseInline(tokens)}\n\n`
  },
  br() {
    return '\n'
  },
  table(token) {
    let out = ''
    
    // Header
    const headers = token.header.map(cell => this.parser.parseInline(cell.tokens))
    out += headers.join(' | ') + '\n'
    out += headers.map(() => '---').join(' | ') + '\n'

    // Rows
    token.rows.forEach(row => {
      const rowText = row.map(cell => this.parser.parseInline(cell.tokens))
      out += rowText.join(' | ') + '\n'
    })
    
    return out + '\n'
  },
  text({ tokens, text }) {
    return tokens ? this.parser.parseInline(tokens) : text
  }
}

marked.use({ renderer: waRenderer })

export const formatForWhatsApp = (text) => {
  if (!text) return ''
  
  // Parse markdown ke format WhatsApp (renderer kita akan ngasilin teks biasa pake WA formatting, bukan HTML)
  let formatted = marked.parse(text, { breaks: true, gfm: true })
  
  // Hapus entity HTML bawaan marked kalo ada (meski renderer custom harusnya aman)
  formatted = formatted
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')

  return formatted.trim()
}

// ==========================================
// PLANNING (AGENTIC) FUNCTIONS
// ==========================================
