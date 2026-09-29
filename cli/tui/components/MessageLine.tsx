/** @jsxImportSource @opentui/solid */
// cli/tui/components/MessageLine.tsx — satu baris pesan.
// Port opencode session-ui/message: teks polos TANPA prefix dekoratif
// (`>`/`◆` dihapus — opencode tak pakai penanda role). Warna via messageColor.
// Batch C: markdown ringan TANPA dep (renderMarkdownLines dari theme.ts —
// link/hr/list-enumerasi/nested-quote + fence multi-baris dijaga). Baris code
// dibedakan via warna secondary; prosa ikut warna role.
import { For } from 'solid-js'
import { ABELINK_THEME, messageColor, renderMarkdownLines } from '../theme.ts'

export interface MessageLineProps {
  role?: string
  text?: string
  showThinking?: boolean
  showDetails?: boolean
}

export function MessageLine(props: MessageLineProps) {
  const role = String(props.role ?? '')
  // Paritas opencode: thought/tool hanya render bila toggle nyala.
  if (role === 'thought' && props.showThinking === false) return (<></>)
  if (role === 'tool' && props.showDetails === false) return (<></>)
  // Thought disamarkan (muted) — isi tetap ada, tak berisik.
  const base = () => (role === 'thought' ? ABELINK_THEME.textMuted : messageColor(role))
  const lines = () => renderMarkdownLines(String(props.text ?? ''))
  return (
    <box style={{ flexDirection: 'column' }}>
      <For each={lines()}>
        {(l) => (
          <text fg={l.code ? ABELINK_THEME.secondary : base()}>{l.text || ' '}</text>
        )}
      </For>
    </box>
  )
}
