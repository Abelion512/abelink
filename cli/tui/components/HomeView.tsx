/** @jsxImportSource @opentui/solid */
// cli/tui/components/HomeView.tsx — layar awal tengah (slice 4).
// Pola opencode packages/tui/src/routes/home.tsx: kolom tengah — logo,
// max-width 75, placeholder rotasi, shortcut /sessions + /models,
// footer versi/workspace. PromptRow + status line + sidebar tetap di App;
// komponen ini HANYA isi scrollbox saat messages kosong (prompt pertama
// langsung jalan via App.submit).
// Batch C: tips rotasi dari HOME_TIPS (theme.ts, adopsi tips-view upstream —
// bukan hardcode lokal) + session-destination (lanjut sesi terakhir bila ada,
// pola routes/home/session-destination.tsx).
import { Show } from 'solid-js'
import { ABELINK_THEME, homePromptMaxWidth, homeTip, abbreviateHome } from '../theme.ts'
import { Logo } from './Logo.tsx'
import type { HomeViewProps } from '../types.ts'

export function HomeView(props: HomeViewProps) {
  const maxWidth = () => homePromptMaxWidth(props.width ?? 80)
  return (
    <box style={{ flexDirection: 'column', alignItems: 'center', width: '100%', paddingTop: 3 }}>
      <box style={{ flexDirection: 'column', width: '100%', maxWidth: maxWidth(), gap: 1 }}>
        <box style={{ flexDirection: 'column', alignItems: 'center' }}>
          <Logo />
          <text fg={ABELINK_THEME.textMuted}>{props.title ?? 'Abelink'} v{props.version ?? ''}</text>
        </box>
        {/* Tip rotasi ala opencode Tips ("● Tip ...", highlight = text). */}
        <box style={{ flexDirection: 'row', width: '100%', paddingTop: 1, gap: 1 }}>
          <text fg={ABELINK_THEME.warning}>● Tip </text>
          <text fg={ABELINK_THEME.textMuted}>{homeTip(props.tipIndex ?? 0)}</text>
        </box>
        <box style={{ flexDirection: 'column', alignItems: 'center', paddingTop: 1 }}>
          <Show
            when={props.lastSessionId}
            fallback={<text fg={ABELINK_THEME.textMuted}>Ketik prompt = sesi baru. Mau lanjut sesi lama? /sessions atau ctrl+p.</text>}
          >
            <text fg={ABELINK_THEME.textMuted}>Lanjut sesi terakhir? /continue {props.lastSessionId} · atau ketik prompt = sesi baru.</text>
          </Show>
          <text fg={ABELINK_THEME.textMuted}>/models ganti model · /help daftar perintah · Shift+Enter baris baru</text>
        </box>
        <box style={{ flexDirection: 'column', alignItems: 'center', paddingTop: 1 }}>
          <text fg={ABELINK_THEME.textMuted}>{abbreviateHome(props.workspace ?? '', typeof process !== 'undefined' ? process.env.HOME ?? '' : '')}</text>
        </box>
      </box>
    </box>
  )
}
