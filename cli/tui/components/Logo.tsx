/** @jsxImportSource @opentui/solid */
// cli/tui/components/Logo.tsx — logo ASCII block.
// Port opencode component/logo.tsx + logo.ts: dua kolom (kiri muted,
// kanan bold), mark `_`/`^`/`~`/`,` jadi spasi/blok/shadow.
import { For } from 'solid-js'
import { ABELINK_THEME } from '../theme.ts'

const LOGO_LEFT = Object.freeze([
  '                   ',
  '█▀▀█ █▀▀█ █▀▀█ █▀▀▄',
  '█__█ █__█ █^^^ █__█',
  '▀▀▀▀ █▀▀▀ ▀▀▀▀ ▀~~▀',
])
const LOGO_RIGHT = Object.freeze([
  '             ▄     ',
  '█▀▀▀ █▀▀█ █▀▀█ █▀▀█',
  '█___ █__█ █__█ █^^^',
  '▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀',
])

function renderChar(ch: string, fg: string, shadow: string, bold: boolean) {
  if (ch === '_') return <text fg={fg}>{' '}</text>
  if (ch === '^') return <text fg={fg}>▀</text>
  if (ch === '~') return <text fg={shadow}>▀</text>
  if (ch === ',') return <text fg={shadow}>▄</text>
  return <text fg={fg}>{ch}</text>
}

export function Logo() {
  const fg = ABELINK_THEME.textMuted
  const fgBold = ABELINK_THEME.text
  const shadow = ABELINK_THEME.borderSubtle
  return (
    <box style={{ flexDirection: 'column' }}>
      <For each={[...LOGO_LEFT.keys()]}>
        {(i) => (
          <box style={{ flexDirection: 'row', gap: 1 }}>
            <box style={{ flexDirection: 'row' }}>
              <For each={Array.from(LOGO_LEFT[i])}>
                {(ch) => renderChar(ch, fg, shadow, false)}
              </For>
            </box>
            <box style={{ flexDirection: 'row' }}>
              <For each={Array.from(LOGO_RIGHT[i])}>
                {(ch) => (ch === '_' || ch === '^' || ch === '~' || ch === ','
                  ? renderChar(ch, fgBold, shadow, true)
                  : <text fg={fgBold}><b>{ch}</b></text>)}
              </For>
            </box>
          </box>
        )}
      </For>
    </box>
  )
}
