/** @jsxImportSource @opentui/solid */
// cli/tui/components/Spinner.tsx — indikator working.
// Port opencode component/spinner.tsx: frame braille 10-frame interval 80ms,
// fallback `⋯` bila animasi mati. Tanpa dep eksternal (opentui-spinner tak
// dideklarasikan di package.json kita): interval lokal + createSignal.
import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { ABELINK_THEME } from '../theme.ts'

export const SPINNER_FRAMES = Object.freeze(['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'])

export interface SpinnerProps {
  color?: string
  children?: unknown
  animated?: boolean
}

export function Spinner(props: SpinnerProps) {
  const [frame, setFrame] = createSignal(0)
  let timer: ReturnType<typeof setInterval> | null = null
  onMount(() => {
    if (props.animated === false) return
    timer = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80)
  })
  onCleanup(() => { if (timer) clearInterval(timer) })
  const color = () => props.color ?? ABELINK_THEME.textMuted
  return (
    <Show
      when={props.animated !== false}
      fallback={<text fg={color()}>⋯ {props.children as never}</text>}
    >
      <box style={{ flexDirection: 'row', gap: 1 }}>
        <text fg={color()}>{SPINNER_FRAMES[frame()]}</text>
        <Show when={props.children}>
          <text fg={color()}>{props.children as never}</text>
        </Show>
      </box>
    </Show>
  )
}
