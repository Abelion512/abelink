/** @jsxImportSource @opentui/solid */
// cli/tui/App.tsx — layout ikut opencode routes/session/index.tsx:1177-1358:
// row [kolom konten (padding 2, gap 1) | sidebar 42 bila wide>120],
// kolom: scrollbox pesan + Prompt + status line. Panel kanan ikut
// sidebar.tsx: bg panel, padding 2, Context/MCP/LSP.
// Referensi: /tmp/opencode-ref (sst/opencode, sparse packages/tui).
// V2-1: echo lokal; engine wiring = slice berikut.
import { createSignal, For, Show } from 'solid-js'
import { useKeyboard, useTerminalDimensions } from '@opentui/solid'
import { ABELINK_THEME, shortModel, SIDEBAR_WIDTH, isWide, messageColor, messagePrefix, visibleWindow } from './theme.mjs'
import { PromptRow } from './components/PromptRow.tsx'

export { shortModel, SIDEBAR_WIDTH, isWide }

// Bottom cap prompt (pola opencode prompt/index.tsx): garis tipis `▀`
// di bawah kotak input. Didefinisikan lokal agar App tetap presentational.
const PROMPT_CAP_BORDER = Object.freeze({
  topLeft: '', topRight: '', bottomLeft: '', bottomRight: '',
  horizontal: '▀', vertical: ' ', topT: '', bottomT: '', leftT: '', rightT: '', cross: '',
})

export function App(props = {}) {
  // Presentational: engine (cli/tui/engine.mjs) memiliku messages.
  // `tick` = signal versi dari entry; dibaca agar For re-render saat
  // engine push (Solid tak tracking mutasi array luar).
  const [value, setValue] = createSignal('')
  const dims = useTerminalDimensions()
  const model = () => (typeof props.model === 'function' ? props.model() : props.model) ?? 'oc/muse-spark-1.3-contributor-free'
  const provider = () => (typeof props.providerLabel === 'function' ? props.providerLabel() : props.providerLabel) ?? '9router'
  const connected = () => props.connected ?? []
  const busy = () => props.busy?.() ?? false
  const wide = () => isWide(dims()?.width ?? 80)
  const title = () => props.title ?? 'Abelink'
  const sessionId = () => (typeof props.sessionId === 'function' ? props.sessionId() : props.sessionId) ?? ''
  // Picker model (opencode dialog-model): daftar + jendela baris agar
  // katalog 1200+ ID tetap muat dan pilihan selalu terlihat.
  const picker = () => props.picker?.() ?? null
  const pickerWindow = () => {
    const p = picker()
    if (!p || !Array.isArray(p.rows) || !p.rows.length) return { rows: [] }
    const { start, end } = visibleWindow(p.index ?? 0, p.rows.length, 12)
    return { rows: p.rows.slice(start, end).map((r, i) => ({ ...r, index: start + i })) }
  }
  const messages = () => {
    props.tick?.()
    const m = props.messages?.()
    return Array.isArray(m) ? m : []
  }

  useKeyboard((key) => {
    if (key.ctrl && key.name === 'c') props.onExit?.()
    // ctrl+p = command palette (pola opencode). Entry wajib mengoper onCommands.
    if (key.ctrl && key.name === 'p') { key.preventDefault?.(); props.onCommands?.() }
  })

  const submit = (text) => {
    const t = String(text ?? '')
    if (!t.trim() || busy()) return
    setValue('')
    props.onSubmitLine?.(t)
  }

  return (
    <box
      style={{
        flexDirection: 'row',
        flexGrow: 1,
        width: '100%',
        height: '100%',
        backgroundColor: ABELINK_THEME.background,
      }}
    >
      <box
        style={{
          flexDirection: 'column',
          flexGrow: 1,
          paddingBottom: 1,
          paddingLeft: 2,
          paddingRight: wide() ? SIDEBAR_WIDTH + 2 : 2,
          gap: 1,
        }}
      >
        <scrollbox style={{ flexGrow: 1, minHeight: 0 }}>
          {/* Layar awal (pola opencode home): sebelum ada pesan, tampilkan hero
              + petunjuk, BUKAN langsung sesi kosong. User bisa lanjut sesi lama. */}
          <Show when={messages().length === 0}>
            <box style={{ flexDirection: 'column', paddingTop: 2, gap: 1 }}>
              <text fg={ABELINK_THEME.text}>
                <span fg={ABELINK_THEME.success}>• </span><b>Abelink</b> <span fg={ABELINK_THEME.textMuted}>v{props.version ?? ''}</span>
              </text>
              <text fg={ABELINK_THEME.textMuted}>{title()} · {props.workspace ?? ''}</text>
              <box style={{ flexDirection: 'column', paddingTop: 1, gap: 1 }}>
                <text fg={ABELINK_THEME.info}>Tips</text>
                <text fg={ABELINK_THEME.textMuted}>Ketik prompt = sesi baru. Mau lanjut sesi lama? /sessions atau ctrl+p.</text>
                <text fg={ABELINK_THEME.textMuted}>/help daftar perintah · Shift+Enter baris baru · Ctrl-C batalkan turn.</text>
              </box>
            </box>
          </Show>
          <For each={messages()}>
            {(l) => (
              <text>
                <span fg={messageColor(l.role)}>{messagePrefix(l.role)}</span>
                {l.text}
              </text>
            )}
          </For>
        </scrollbox>
        {picker() && (
          <box
            style={{
              // Overlay (pola dialog opencode): keluar dari flex flow supaya
              // menambah baris TIDAK memeras PromptRow/status line di bawahnya.
              // flexShrink 0 WAJIB: default 1 memeras box teks-saja sampai
              // tinggi < jumlah baris -> baris menumpuk (terukur PTY 2026-09-26).
              position: 'absolute',
              left: 2,
              right: 2,
              bottom: 7,
              flexShrink: 0,
              flexDirection: 'column',
              backgroundColor: ABELINK_THEME.backgroundMenu,
              paddingLeft: 2,
              paddingRight: 2,
            }}
          >
            <text fg={ABELINK_THEME.text}>
              {picker()?.title ?? 'pilih model'}{picker()?.query ? ` — filter: ${picker().query}` : ''}
            </text>
            <For each={pickerWindow().rows}>
              {(row) => (
                <text fg={row.index === picker().index ? ABELINK_THEME.primary : undefined}>
                  {(row.index === picker().index ? '> ' : '  ') + row.label + ' — ' + row.section}
                </text>
              )}
            </For>
            <text fg={ABELINK_THEME.muted}>
              {picker()?.loading
                ? 'memuat katalog…'
                : (picker()?.rows?.length
                  ? `${picker()?.kindHint ?? '↑↓ pilih · Enter pakai · Esc batal · ketik untuk filter'} (${picker().rows.length} baris${picker()?.total ? ` dari ${picker().total} model` : ''}${picker()?.stale ? ', katalog stale' : ''})${picker()?.hint ? ` · ${picker().hint}` : ''}`
                  : `Tidak ada model cocok. Esc untuk batal.${picker()?.error ? ` (${picker().error})` : ''}`)}
            </text>
          </box>
        )}
        <PromptRow
          value={value}
          onInput={setValue}
          onSubmit={submit}
          modelLabel={() => {
            // Baca `tick` supaya label ini ikut re-render saat engine ubah
            // model (Solid hanya tracking signal, bukan mutasi objek state).
            props.tick?.()
            return `${shortModel(model())} ${provider()}`
          }}
          right={busy() ? 'working…' : (props.statusRight ?? null)}
          picker={picker}
          onPickerMove={props.onPickerMove}
          onPickerSelect={props.onPickerSelect}
          onPickerCancel={props.onPickerCancel}
          onPickerFilter={props.onPickerFilter}
        />
        {/* Bottom cap prompt (opencode prompt/index.tsx). */}
        <box
          style={{
            height: 1,
            flexShrink: 0,
            border: ['bottom'],
            borderColor: ABELINK_THEME.backgroundElement,
            customBorderChars: PROMPT_CAP_BORDER,
          }}
        />
        <box style={{ flexDirection: 'row', justifyContent: 'space-between', flexShrink: 0 }}>
          <text fg={ABELINK_THEME.textMuted}>{props.workspace ?? ''}</text>
          <box style={{ flexDirection: 'row', gap: 2 }}>
            <text fg={ABELINK_THEME.textMuted}>{props.tokens ?? '0 tokens'}</text>
            <text fg={ABELINK_THEME.textMuted}>/help · ctrl+p commands</text>
          </box>
        </box>
      </box>
      {wide() && (
        <box
          style={{
            position: 'absolute',
            width: SIDEBAR_WIDTH,
            height: '100%',
            right: 0,
            top: 0,
            flexDirection: 'column',
            backgroundColor: ABELINK_THEME.backgroundPanel,
            paddingTop: 1,
            paddingBottom: 1,
            paddingLeft: 2,
            paddingRight: 2,
          }}
        >
          {/* Header ala opencode sidebar.tsx: judul bold + meta muted. */}
          <box style={{ flexDirection: 'column', flexShrink: 0 }}>
            <text fg={ABELINK_THEME.text}><b>{title()}</b></text>
            <text fg={ABELINK_THEME.textMuted}>{sessionId()}</text>
          </box>
          <box style={{ flexDirection: 'column', paddingTop: 2, gap: 1, flexGrow: 1 }}>
            <text fg={ABELINK_THEME.text}>Context</text>
            <text fg={ABELINK_THEME.textMuted}>{props.tokens ?? '0 tokens'}</text>
            <text fg={ABELINK_THEME.textMuted}>{props.usagePct ?? '0% used'}</text>
            <text fg={ABELINK_THEME.textMuted}>{props.spent ?? '$0.00 spent'}</text>
            <text fg={ABELINK_THEME.text}>MCP</text>
            <Show when={connected().length > 0} fallback={<text fg={ABELINK_THEME.textMuted}>none connected</text>}>
              <For each={connected()}>
                {(c) => (
                  <text fg={ABELINK_THEME.text}>
                    <span fg={ABELINK_THEME.success}>• </span>
                    {c}
                  </text>
                )}
              </For>
            </Show>
            <text fg={ABELINK_THEME.text}>LSP</text>
            <text fg={ABELINK_THEME.textMuted}>disabled</text>
          </box>
          {/* Branding footer ala opencode: dot success + nama + versi. */}
          <box style={{ flexShrink: 0, paddingTop: 1 }}>
            <text fg={ABELINK_THEME.textMuted}>
              <span fg={ABELINK_THEME.success}>• </span>
              <b>Abelink</b> v{props.version ?? ''}
            </text>
          </box>
        </box>
      )}
    </box>
  )
}
