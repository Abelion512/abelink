/** @jsxImportSource @opentui/solid */
// cli/tui/components/Logo.tsx — wordmark "abelink" block font 3 baris,
// 7 huruf × 5 kolom (4 glyph + 1 spasi). Tanpa panel bayangan ganda
// (pola dua-kolom opencode dihapus: dobel render justru tak terbaca).
import { For } from 'solid-js'
import { ABELINK_THEME } from '../theme.ts'

const A = [' ██ ', '█  █', '████', '█  █', '█  █']
const B = ['███ ', '█  █', '███ ', '█  █', '███ ']
const E = ['████', '█   ', '███ ', '█   ', '████']
const L = ['█   ', '█   ', '█   ', '█   ', '███ ']
const I = ['███ ', ' █  ', ' █  ', ' █  ', '███ ']
const N = ['█  █', '██ █', '█ ██', '█  █', '█  █']
const K = ['█  █', '█ █ ', '██  ', '█ █ ', '█  █']

const LOGO: readonly string[] = Object.freeze(
  [0, 1, 2, 3, 4].map((r) => [A[r], B[r], E[r], L[r], I[r], N[r], K[r]].join(' ')),
)

export function Logo() {
  return (
    <box style={{ flexDirection: 'column' }}>
      <For each={LOGO}>
        {(line) => (
          <text fg={ABELINK_THEME.text}><b>{line}</b></text>
        )}
      </For>
    </box>
  )
}
