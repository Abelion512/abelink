/** @jsxImportSource @opentui/solid */
// cli/tui/components/HomeView.tsx — layar awal tengah (slice 4).
// Pola opencode packages/tui/src/routes/home.tsx: kolom tengah — logo,
// max-width 75, placeholder rotasi, shortcut /sessions + /models,
// footer versi/workspace. PromptRow + status line + sidebar tetap di App;
// komponen ini HANYA isi scrollbox saat messages kosong (prompt pertama
// langsung jalan via App.submit).
import { ABELINK_THEME, homePromptMaxWidth } from '../theme.ts'
import type { HomeViewProps } from '../types.ts'

export function HomeView(props: HomeViewProps) {
  const maxWidth = () => homePromptMaxWidth(props.width ?? 80)
  return (
    <box style={{ flexDirection: 'column', alignItems: 'center', width: '100%', paddingTop: 3 }}>
      <box style={{ flexDirection: 'column', width: '100%', maxWidth: maxWidth(), gap: 1 }}>
        <box style={{ flexDirection: 'column', alignItems: 'center' }}>
          <text fg={ABELINK_THEME.text}><b>Abelink</b></text>
          <text fg={ABELINK_THEME.textMuted}>{props.title ?? 'Abelink'} v{props.version ?? ''}</text>
        </box>
        <box style={{ flexDirection: 'column', alignItems: 'center', paddingTop: 1 }}>
          <text fg={ABELINK_THEME.textMuted}>Ketik prompt = sesi baru. Mau lanjut sesi lama? /sessions atau ctrl+p.</text>
          <text fg={ABELINK_THEME.textMuted}>/models ganti model · /help daftar perintah · Shift+Enter baris baru</text>
        </box>
        <box style={{ flexDirection: 'column', alignItems: 'center', paddingTop: 1 }}>
          <text fg={ABELINK_THEME.textMuted}>{props.workspace ?? ''}</text>
        </box>
      </box>
    </box>
  )
}
