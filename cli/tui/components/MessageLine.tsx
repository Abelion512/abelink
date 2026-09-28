/** @jsxImportSource @opentui/solid */
// cli/tui/components/MessageLine.tsx — render satu baris pesan ala opencode
// session-ui: user/assistant/info/error/mode teks polos tanpa prefix
// dekoratif; role thought/tool DISEMBUNYIKAN dari scrollbox (tetap di state).
// Markdown ringan: **bold**, `code`, # heading (3 level), - list, > quote,
// ``` fence. Tanpa dependensi baru (regex + <b>/<span fg>).
import { For, Show } from 'solid-js'
import { ABELINK_THEME } from '../theme.ts'

export interface MessageLineProps {
  role?: string
  text?: string
  /** false = role thought disembunyikan (toggle /thinking). Default tampil. */
  showThinking?: boolean
  /** false = role tool disembunyikan (toggle /details). Default tampil. */
  showDetails?: boolean
}

interface Span {
  bold?: boolean
  code?: boolean
  fg?: string
  text: string
}

// Inline: `code`, **bold**. Code didahulukan (isi code tak di-bold).
function parseInline(s: string): Span[] {
  const out: Span[] = []
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) })
    const tok = m[0]
    if (tok.startsWith('`')) out.push({ code: true, text: tok.slice(1, -1) })
    else out.push({ bold: true, text: tok.slice(2, -2) })
    last = m.index + tok.length
  }
  if (last < s.length) out.push({ text: s.slice(last) })
  return out.length ? out : [{ text: s }]
}

// Block: fence ```, heading #, quote >, list -/digit. Return { spans, fg?, bold? }.
function parseBlock(line: string): { spans: Span[]; fg?: string; bold?: boolean } {
  const fence = /^```/.exec(line)
  if (fence) return { spans: [{ text: '```' }], fg: ABELINK_THEME.textMuted }
  const h = /^(#{1,3})\s+(.*)$/.exec(line)
  if (h) return { spans: parseInline(h[2]), bold: true }
  const q = /^>\s?(.*)$/.exec(line)
  if (q) return { spans: parseInline(q[1]), fg: ABELINK_THEME.textMuted }
  const li = /^(\s*(?:[-*]|\d+[.)])\s+)(.*)$/.exec(line)
  if (li) return { spans: [{ text: li[1], fg: ABELINK_THEME.textMuted }, ...parseInline(li[2])] }
  return { spans: parseInline(line) }
}

/** Warna teks per role (user polos, error merah, info cyan, shell/meta muted). */
export function messageRoleColor(role: string = ''): string {
  switch (String(role)) {
    case 'error': return ABELINK_THEME.error
    case 'shell':
    case 'meta': return ABELINK_THEME.textMuted
    case 'info': return ABELINK_THEME.info
    default: return ABELINK_THEME.text
  }
}

/** True bila role disembunyikan dari scrollbox (toggle /thinking, /details). */
export function isHiddenRole(role: string = '', opts: { showThinking?: boolean; showDetails?: boolean } = {}): boolean {
  const r = String(role ?? '')
  if (r === 'thought') return opts.showThinking === false
  if (r === 'tool') return opts.showDetails === false
  return false
}

export function MessageLine(props: MessageLineProps) {
  const role = () => String(props.role ?? '')
  const hidden = () => isHiddenRole(role(), { showThinking: props.showThinking, showDetails: props.showDetails })
  const fg = () => messageRoleColor(role())
  const lines = () => String(props.text ?? '').split('\n')
  return (
    <Show when={!hidden()} fallback={<></>}>
      <box style={{ flexDirection: 'column', flexShrink: 0 }}>
        <For each={lines()}>
          {(line) => {
            const b = parseBlock(line)
            return (
              <text fg={b.fg ?? fg()}>
                <Show when={b.bold} fallback={<RenderSpans spans={b.spans} />}>
                  <b><RenderSpans spans={b.spans} /></b>
                </Show>
              </text>
            )
          }}
        </For>
      </box>
    </Show>
  )
}

function RenderSpans(props: { spans: Span[] }) {
  return (
    <>
      <For each={props.spans}>
        {(s) => (
          <Show when={s.code} fallback={
            <Show when={s.bold} fallback={
              <CSpan fg={s.fg}>{s.text}</CSpan>
            }>
              <b><CSpan fg={s.fg}>{s.text}</CSpan></b>
            </Show>
          }>
            <CSpan fg={ABELINK_THEME.info}>{s.text}</CSpan>
          </Show>
        )}
      </For>
    </>
  )
}

// OpenTUI SpanProps tak deklarasikan fg walau runtime dukung (pola
// ColoredSpan di App.tsx): pusatkan ts-expect-error di sini.
function CSpan(props: { fg?: string; children?: unknown }) {
  return (
    // @ts-expect-error fg didukung TextNodeRenderable saat runtime.
    <span fg={props.fg}>{props.children as never}</span>
  )
}
