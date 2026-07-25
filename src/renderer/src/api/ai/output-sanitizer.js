// Tool output sanitizer — normalizes raw tool outputs into concise, predictable text
// for heterogeneous LLMs (including small models without JSON mode).

const MAX_SANITIZED_LENGTH = 8000
const BROWSER_TOOLS = ['browser-navigate', 'browser-read', 'browser-click', 'browser-type', 'browser-scroll']
const CLI_TOOLS = ['run-shell', 'run-cli']

function stripAnsi(str) {
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
}

function stripHtmlTags(str) {
  return str
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncate(str, limit) {
  if (!str || str.length <= limit) return str || ''
  return str.substring(0, limit) + '\n...[truncated by system]'
}

export function sanitizeToolOutput(tool, raw) {
  let text = ''
  if (typeof raw === 'string') text = raw
  else if (raw && typeof raw === 'object') text = JSON.stringify(raw, null, 2)
  else text = String(raw || '')

  if (!text.trim()) return '[Empty result]'

  if (BROWSER_TOOLS.includes(tool)) {
    // Preserve interactive elements list (numbered IDs), drop raw HTML noise
    const interactivePattern = /(\[[0-9]+\]\s+\S+:\s*"[^"]*")/g
    const interactiveMatches = text.match(interactivePattern)
    const interactiveBlock = interactiveMatches
      ? '\n\n== ELEMEN INTERAKTIF ==\n' + interactiveMatches.join('\n')
      : ''

    let visibleText = stripHtmlTags(text).substring(0, 4000)

    const titleMatch = text.match(/\[Title\]:\s*(.+)/) || text.match(/<title>([^<]+)<\/title>/i)
    const title = titleMatch ? `Title: ${titleMatch[1].trim()}` : ''

    return truncate([title, visibleText, interactiveBlock].filter(Boolean).join('\n'), MAX_SANITIZED_LENGTH)
  }

  if (CLI_TOOLS.includes(tool)) {
    text = stripAnsi(text)
    const exitMatch = text.match(/exit code:?\s*(\d+)/i)
    const exitSuffix = exitMatch ? ` [exit code: ${exitMatch[1]}]` : ''
    text = text.replace(/exit code:?\s*\d+/gi, '').trim()
    return truncate(text, 4000) + exitSuffix
  }

  if (tool === 'read-file') {
    return truncate(text, 6000)
  }

  return truncate(text, MAX_SANITIZED_LENGTH)
}
