/** @jsxImportSource @opentui/solid */
// cli/tui/components/CenterDialog.tsx — wadah dialog tengah (slice 3).
// Pola opencode packages/tui/src/ui/dialog.tsx: backdrop dim fullscreen
// (RGBA 0,0,0,150), panel tengah lebar 60, zIndex 3000, paddingTop height/4.
// Tinggi daftar ikut dialog-select.tsx: min(rows, floor(height/2)-6).
// Dipakai untuk /models, /effort, /sessions, /commands (ctrl+p).
// Picker bawah lama (App.tsx) DIPERTAHANKAN untuk filter inline prompt;
// dialog ini hanya presentasi daftar pilih (filter/navigasi via props).
import { For, Show } from 'solid-js'
import { useTerminalDimensions } from '@opentui/solid'
import { RGBA } from '@opentui/core'
import {
  ABELINK_THEME,
  DIALOG_PANEL_WIDTH,
  DIALOG_Z_INDEX,
  dialogFooterText,
  dialogVisibleRows,
  visibleWindow,
} from '../theme.ts'
import type { CenterDialogProps } from '../types.ts'

export function CenterDialog(props: CenterDialogProps) {
  const dims = useTerminalDimensions()
  const height = () => dims()?.height ?? 24
  const rows = () => (Array.isArray(props.rows) ? props.rows : [])
  const index = () => props.index ?? 0
  const visible = () => {
    const all = rows()
    if (!all.length) return []
    const count = dialogVisibleRows(all.length, height())
    const { start, end } = visibleWindow(index(), all.length, count)
    return all.slice(start, end).map((r, i) => ({ ...r, index: start + i }))
  }

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
            width: DIALOG_PANEL_WIDTH,
            maxWidth: Math.max(10, (dims()?.width ?? 80) - 2),
            backgroundColor: ABELINK_THEME.backgroundPanel,
            paddingTop: 1,
            paddingLeft: 2,
            paddingRight: 2,
            paddingBottom: 1,
            border: true,
            borderColor: ABELINK_THEME.border,
          }}
        >
          <text fg={ABELINK_THEME.text}>
            <b>{props.title ?? 'pilih'}</b>
            {props.query ? ` — filter: ${props.query}` : ''}
          </text>
          <For each={visible()}>
            {(row) => (
              <box
                style={{
                  flexDirection: 'row',
                  flexShrink: 0,
                  backgroundColor:
                    row.index === index() ? ABELINK_THEME.accent : undefined,
                }}
              >
                <text fg={row.index === index() ? ABELINK_THEME.text : ABELINK_THEME.textMuted}>
                  {(row.index === index() ? '> ' : '  ') + (row.label ?? row.id ?? '') + (row.section ? ' — ' + row.section : '')}
                </text>
              </box>
            )}
          </For>
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
        </box>
      </box>
    </Show>
  )
}
