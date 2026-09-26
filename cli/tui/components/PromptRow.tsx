/** @jsxImportSource @opentui/solid */
// cli/tui/components/PromptRow.tsx — prompt box ikut opencode.
// Mode-stack autocomplete (keybind.ts prompt.autocomplete.*): saat popup
// terbuka, Up/Down navigasi, Tab/Enter pilih, Esc tutup; textarea hanya
// terima input biasa. Trigger: `/` (slash) + `@` (file).
// Referensi: opencode/ clone (packages/tui/src/component/prompt/
// autocomplete.tsx, config/keybind.ts:214-218, prompt/display.ts).
import { For, Show, createSignal, createMemo, createEffect } from 'solid-js'
import {
  ABELINK_THEME,
  filterCompletions,
  autocompleteTrigger,
  applyCompletion,
  moveCompletionIndex,
  PROMPT_KEY_BINDINGS,
} from '../theme.mjs'

export { PROMPT_KEY_BINDINGS }
export { filterCompletions }

export const PROMPT_BORDER_CHARS = Object.freeze({
  topLeft: '',
  topRight: '',
  bottomLeft: '╹',
  bottomRight: '',
  horizontal: ' ',
  vertical: '┃',
  topT: '',
  bottomT: '',
  leftT: '',
  rightT: '',
  cross: '',
})

export function PromptRow(props) {
  // modelLabel boleh string atau accessor. Accessor diperlukan agar label
  // ikut refresh saat model/effort berubah: Solid tak tracking mutasi objek
  // state, jadi nilai harus dibaca di dalam effect yang memang reaktif.
  const meta = () => (typeof props.modelLabel === 'function' ? props.modelLabel() : (props.modelLabel ?? ''))
  const [selected, setSelected] = createSignal(0)
  let ta = null
  const readText = () => {
    try {
      if (ta && !ta.isDestroyed && typeof ta.plainText === 'string') return ta.plainText
    } catch {}
    return props.value?.() ?? ''
  }
  const readTextSignal = () => props.value?.() ?? ''
  // Popup dihitung dari teks BUFFER (plainText), bukan signal — signal
  // tertinggal satu tick dari keypress (terukur PTY: SUBMIT fire sebelum IN).
  const completionsFor = (text) => {
    const t = autocompleteTrigger(text)
    if (!t) return []
    if (t.mode === 'slash') return filterCompletions('/' + t.query)
    const files = props.fileCompletions?.() ?? []
    const q = t.query.toLowerCase()
    return files.filter((f) => f.toLowerCase().includes(q)).map((f) => ({ name: '@' + f, desc: 'file' }))
  }
  const completions = createMemo(() => completionsFor(readTextSignal()))
  const popupOpen = createMemo(() => completions().length > 0)

  const setTextareaText = (text) => {
    try {
      if (ta && !ta.isDestroyed && typeof ta.setText === 'function') {
        ta.setText(text)
        return
      }
    } catch {}
    props.onInput?.(text)
  }

  const acceptSelected = (text = null) => {
    const current = text ?? readText()
    const list = completionsFor(current)
    if (!list.length) return false
    const item = list[selected() % list.length]
    const next = applyCompletion(current, autocompleteTrigger(current), item.name)
    setSelected(0)
    setTextareaText(next)
    props.onInput?.(next)
    return true
  }

  // Submit = kirim + kosongkan buffer textarea. Textarea uncontrolled
  // (props.value hanya cermin), jadi tanpa clear ini teks lama tetap tampil
  // dan popup tetap buka setelah perintah dijalankan.
  const clearTextarea = () => {
    try {
      if (ta && !ta.isDestroyed && typeof ta.setText === 'function') ta.setText('')
    } catch {}
  }

  const submitNow = (text) => {
    const t = String(text ?? '')
    setSelected(0)
    clearTextarea()
    props.onInput?.('')
    props.onSubmit?.(t)
  }

  // Enter polos: kalau teks SUDAH persis sama dengan baris yang di-highlight,
  // "pilih" itu no-op (teks tak berubah) dan popup tetap buka -> Enter mati
  // selamanya. Terukur PTY 2026-09-26: `/model` + Enter tak pernah jalan.
  // Jadi exact-match = jalankan; selain itu = pilih completions.
  const resolveEnter = (buf) => {
    const list = completionsFor(buf)
    if (!list.length) {
      submitNow(buf)
      return
    }
    const item = list[selected() % list.length]
    const exact = item && String(item.name) === String(buf ?? '').trim()
    if (exact || acceptSelected(buf) === false) submitNow(buf)
  }

  const pickerOpen = () => Boolean(props.picker?.())

  // Tutup picker (pilih ATAU batal) -> buang teks filter dari textarea,
  // supaya sisa ketikan tidak ikut terkirim sebagai prompt berikutnya.
  let wasPickerOpen = false
  createEffect(() => {
    const open = pickerOpen()
    if (wasPickerOpen && !open) {
      clearTextarea()
      props.onInput?.('')
      setSelected(0)
    }
    wasPickerOpen = open
  })

  const onKeyDown = (e) => {
    // Mode-stack: picker model menang atas autocomplete (opencode
    // dialog-model): Up/Down/Enter/Esc diarahkan ke picker.
    if (pickerOpen()) {
      if (e.name === 'up') { e.preventDefault?.(); props.onPickerMove?.(-1); return }
      if (e.name === 'down') { e.preventDefault?.(); props.onPickerMove?.(1); return }
      if (e.name === 'escape') { e.preventDefault?.(); props.onPickerCancel?.(); return }
      if ((e.name === 'return' || e.name === 'linefeed') && !e.shift && !e.ctrl && !e.meta) {
        e.preventDefault?.()
        props.onPickerSelect?.()
        return
      }
      return
    }
    const buf = readText()
    const popup = completionsFor(buf).length > 0
    if (e.name === 'return' || e.name === 'linefeed') {
      // Enter polos: popup buka -> pilih/jalankan; tutup -> submit. Modifier
      // (shift/ctrl/meta) -> newline via binding, jangan sentuh.
      if (!e.shift && !e.ctrl && !e.meta) {
        e.preventDefault?.()
        resolveEnter(buf)
        return
      }
    }
    if (!popup) {
      if (e.name === 'escape') props.onEscape?.()
      return
    }
    if (e.name === 'up' || (e.name === 'p' && e.ctrl)) {
      e.preventDefault?.()
      const n = completionsFor(buf).length
      setSelected((s) => moveCompletionIndex(s, -1, n))
    } else if (e.name === 'down' || (e.name === 'n' && e.ctrl)) {
      e.preventDefault?.()
      const n = completionsFor(buf).length
      setSelected((s) => moveCompletionIndex(s, 1, n))
    } else if (e.name === 'tab') {
      e.preventDefault?.()
      acceptSelected(buf)
    } else if (e.name === 'escape') {
      e.preventDefault?.()
      setSelected(0)
      props.onEscape?.()
    }
  }

  return (
    <box style={{ flexDirection: 'column', width: '100%' }}>
      <Show when={popupOpen()}>
        <box
          style={{
            // flexShrink 0 WAJIB: default 1 memeras box teks-saja sampai
            // tinggi < jumlah baris -> baris menumpuk (terukur PTY 2026-09-26).
            flexShrink: 0,
            flexDirection: 'column',
            width: '100%',
            backgroundColor: ABELINK_THEME.backgroundMenu,
            paddingLeft: 2,
            paddingRight: 2,
          }}
        >
          <For each={completions()}>
            {(c, i) => (
              <text fg={i() === selected() % completions().length ? ABELINK_THEME.primary : undefined}>
                {(i() === selected() % completions().length ? '> ' : '  ') + c.name + ' — ' + (c.desc ?? '')}
              </text>
            )}
          </For>
        </box>
      </Show>
      <box
        style={{
          width: '100%',
          border: ['left'],
          borderColor: props.accent ?? ABELINK_THEME.borderActive,
          customBorderChars: PROMPT_BORDER_CHARS,
        }}
      >
        <box
          style={{
            paddingLeft: 2,
            paddingRight: 2,
            paddingTop: 1,
            flexShrink: 0,
            flexGrow: 1,
            width: '100%',
            backgroundColor: ABELINK_THEME.backgroundElement,
          }}
        >
          <textarea
            width="100%"
            focused={props.inputFocused?.() ?? true}
            placeholder={props.placeholder ?? 'Ketik prompt atau / untuk perintah... (Enter kirim, Shift+Enter baris baru)'}
            placeholderColor={ABELINK_THEME.textMuted}
            textColor={ABELINK_THEME.text}
            minHeight={1}
            maxHeight={props.maxHeight ?? 10}
            focusedBackgroundColor={ABELINK_THEME.backgroundElement}
            cursorColor={ABELINK_THEME.text}
            keyBindings={props.picker?.() ? [] : (props.keyBindings ?? PROMPT_KEY_BINDINGS)}
            ref={(r) => { ta = r }}
            onContentChange={() => {
              setSelected(0)
              const t = readText()
              props.onInput?.(t)
              // Picker buka: ketikan jadi filter (pola fuzzy opencode).
              if (props.picker?.()) props.onPickerFilter?.(t)
            }}
            onKeyDown={onKeyDown}
            onSubmit={() => resolveEnter(readText())}
          />
          {/* Meta row ala opencode prompt/index.tsx: agen (accent) · mode
              permission (muted) · model (text) — pemisah `·` muted. */}
          <box style={{ flexDirection: 'row', flexShrink: 0, paddingTop: 1, gap: 1, justifyContent: 'space-between' }}>
            <box style={{ flexDirection: 'row', gap: 1 }}>
              <text fg={ABELINK_THEME.accent}>{props.agentName ?? 'Abelink'}</text>
              <text fg={ABELINK_THEME.textMuted}>·</text>
              <text fg={ABELINK_THEME.textMuted}>{props.permissionMode ?? 'auto'}</text>
              <text fg={ABELINK_THEME.textMuted}>·</text>
              <text fg={ABELINK_THEME.text}>{meta()}</text>
            </box>
            {props.right && (
              <box style={{ flexDirection: 'row', gap: 1 }}>
                <text fg={ABELINK_THEME.textMuted}>{props.right}</text>
              </box>
            )}
          </box>
        </box>
      </box>
    </box>
  )
}
