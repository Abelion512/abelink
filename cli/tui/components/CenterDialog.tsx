/** @jsxImportSource @opentui/solid */
// cli/tui/components/CenterDialog.tsx — wadah dialog tengah.
// Port opencode ui/dialog.tsx + ui/dialog-select.tsx: backdrop dim fullscreen
// (RGBA 0,0,0,150), panel tengah TANPA border, judul + "esc" kanan,
// kategori grouping visual (header seksi accent bold ala dialog-select:618),
// penanda current ● (Option:756), details baris kedua muted, footer hint.
// Dipakai untuk /models, /effort, /sessions, /commands (ctrl+p).
import { For, Show } from 'solid-js'
import { useTerminalDimensions } from '@opentui/solid'
import { RGBA } from '@opentui/core'
import {
  ABELINK_THEME,
  DIALOG_PANEL_WIDTH,
  DIALOG_Z_INDEX,
  annotateSections,
  dialogFooterText,
  dialogVisibleRows,
  selectedForeground,
  visibleWindow,
} from '../theme.ts'
import type { CenterDialogProps } from '../types.ts'

/** Potong tengah ala opencode Locale.truncate (default 61). */
function truncateMiddle(s: string, max: number = 61): string {
  const t = String(s ?? '')
  if (t.length <= max || max < 5) return t
  const keep = Math.floor((max - 3) / 2)
  return t.slice(0, keep) + '...' + t.slice(t.length - (max - 3 - keep))
}

export function CenterDialog(props: CenterDialogProps) {
  const dims = useTerminalDimensions()
  const height = () => dims()?.height ?? 24
  const rows = () => (Array.isArray(props.rows) ? props.rows : [])
  const index = () => props.index ?? 0
  // Port opencode dialog.tsx: medium 60 / large 88 / xlarge 116.
  const panelWidth = () => props.size === 'xlarge' ? 116 : props.size === 'large' ? 88 : DIALOG_PANEL_WIDTH
  const visible = () => {
    const all = rows()
    if (!all.length) return []
    const count = dialogVisibleRows(all.length, height())
    const { start, end } = visibleWindow(index(), all.length, count)
    // Port dialog-select grouping: header hanya untuk seksi bersama (>1).
    return annotateSections(all.slice(start, end)).map((r, i) => ({ ...r, index: start + i }))
  }
  // Footer dua sisi ala dialog-select footerHints/actions: kiri = hint utama
  // (rowCount/stale/error), kanan = footerHints opsional (mis. switch sesi).
  const hintsRight = () => (Array.isArray(props.footerHints) ? props.footerHints.filter(Boolean) : [])

  return (
    <Show when={props.open}>
      <box
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          alignItems: 'center',
          zIndex: DIALOG_Z_INDEX,
          paddingTop: Math.floor(height() / 4),
          backgroundColor: RGBA.fromInts(0, 0, 0, 150),
        }}
      >
        <box
          style={{
            flexDirection: 'column',
            flexShrink: 0,
            width: panelWidth(),
            maxWidth: Math.max(10, (dims()?.width ?? 80) - 2),
            backgroundColor: ABELINK_THEME.backgroundPanel,
            paddingTop: 1,
            paddingLeft: 4,
            paddingRight: 4,
          }}
        >
          <box style={{ flexDirection: 'row', justifyContent: 'space-between', flexShrink: 0 }}>
            <text fg={ABELINK_THEME.text}>
              <b>{props.title ?? 'pilih'}</b>
              {props.query ? ` — filter: ${props.query}` : ''}
            </text>
            <text fg={ABELINK_THEME.textMuted}>esc</text>
          </box>
          <For each={visible()}>
            {(row) => (
              <box style={{ flexDirection: 'column', flexShrink: 0 }}>
                <Show when={(row as { header?: string | null }).header}>
                  <box style={{ flexShrink: 0, paddingLeft: 3 }}>
                    <text fg={ABELINK_THEME.accent}>
                      <b>{String((row as { header?: string | null }).header ?? '')}</b>
                    </text>
                  </box>
                </Show>
                <box
                  style={{
                    flexDirection: 'row',
                    flexShrink: 0,
                    backgroundColor:
                      row.index === index() ? ABELINK_THEME.primary : undefined,
                  }}
                >
                  <Show when={(row as { current?: boolean }).current}>
                    <text fg={row.index === index() ? selectedForeground() : ABELINK_THEME.primary} flexShrink={0}>
                      {'● '}
                    </text>
                  </Show>
                  <text fg={row.index === index() ? selectedForeground() : ABELINK_THEME.text} flexShrink={0}>
                    {truncateMiddle(String(row.label ?? row.id ?? ''))}
                  </text>
                  <Show when={!(row as { header?: string | null }).header && row.section}>
                    <text fg={row.index === index() ? selectedForeground() : ABELINK_THEME.textMuted} wrapMode="none">
                      {' ' + String(row.section ?? '').trimStart()}
                    </text>
                  </Show>
                </box>
                <Show when={(row as { detail?: string | null }).detail}>
                  <box style={{ flexShrink: 0, paddingLeft: 3, paddingRight: 3 }}>
                    <text fg={ABELINK_THEME.textMuted} wrapMode="none">
                      {truncateMiddle(String((row as { detail?: string | null }).detail ?? ''), 76)}
                    </text>
                  </box>
                </Show>
              </box>
            )}
          </For>
          <box style={{ flexDirection: 'row', justifyContent: 'space-between', flexShrink: 0 }}>
            <text fg={ABELINK_THEME.muted}>
              {dialogFooterText({
                loading: props.loading,
                rowCount: rows().length,
                hint: props.hint ?? undefined,
                total: props.total ?? undefined,
                stale: props.stale,
                error: props.error ?? undefined,
              })}
            </text>
            <Show when={hintsRight().length > 0}>
              <text fg={ABELINK_THEME.muted}>
                {hintsRight().join(' · ')}
              </text>
            </Show>
          </box>
        </box>
      </box>
    </Show>
  )
}
