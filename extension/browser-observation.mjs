// Browser observation formatter: keep semantic page content ahead of UI controls.
// The agent needs enough interaction metadata to act, but a raw control dump can
// crowd out the text that explains what the page is actually about.

const DEFAULT_MAX_TEXT = 5000
const DEFAULT_MAX_ELEMENTS = 80

const compact = (value = '', limit = 1000) =>
  String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)

export function parseBrowserObservation(raw) {
  if (raw && typeof raw === 'object') return raw
  if (typeof raw !== 'string') return null
  try { return JSON.parse(raw) } catch { return null }
}

export function formatBrowserObservation(raw, { maxText = DEFAULT_MAX_TEXT, maxElements = DEFAULT_MAX_ELEMENTS } = {}) {
  const data = parseBrowserObservation(raw)
  if (!data) return String(raw ?? '').slice(0, maxText)

  const title = compact(data.title || '', 300)
  const url = compact(data.url || '', 500)
  const pageText = String(data.text || data.pageText || '').replace(/\n{3,}/g, '\n\n').trim().slice(0, maxText)
  const elements = Array.isArray(data.elements) ? data.elements.slice(0, Math.max(0, maxElements)) : []
  const hidden = Array.isArray(data.elements) ? Math.max(0, data.elements.length - elements.length) : 0

  const out = [
    '[BROWSER PAGE]',
    title ? `Title: ${title}` : 'Title: (unknown)',
    url ? `URL: ${url}` : 'URL: (unknown)',
    '',
    '[MAIN SEMANTIC TEXT]',
    pageText || '(no semantic page text returned)',
    '',
    '[INTERACTIVE ELEMENTS FOR NEXT ACTION]'
  ]

  if (elements.length === 0) out.push('(none returned)')
  for (const el of elements) {
    const id = compact(el?.abelinkId || '', 40)
    if (!id) continue
    const label = compact(el?.text || el?.ariaLabel || el?.placeholder || '', 160)
    const meta = [compact(el?.tag || '', 30), compact(el?.type || '', 40), el?.inViewport ? 'viewport' : 'offscreen'].filter(Boolean).join(' ')
    const href = compact(el?.href || '', 180)
    out.push(`- ${id}: ${label || '(unlabeled)'} [${meta}]${href ? ` href=${href}` : ''}`)
  }

  if (hidden > 0) out.push(`... ${hidden} additional interactive elements omitted to preserve reasoning context.`)
  return out.join('\n')
}

export default { parseBrowserObservation, formatBrowserObservation }
