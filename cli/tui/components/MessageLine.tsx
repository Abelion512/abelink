/** @jsxImportSource @opentui/solid */
// cli/tui/components/MessageLine.tsx — satu baris pesan.
// Port opencode session-ui/message: teks polos TANPA prefix dekoratif
// (`>`/`◆` dihapus — opencode tak pakai penanda role). Warna via messageColor.
import { messageColor } from '../theme.ts'

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
  return (
    <text fg={messageColor(role)}>
      {String(props.text ?? '')}
    </text>
  )
}
