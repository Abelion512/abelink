/** @jsxImportSource @opentui/solid */
// cli/tui/components/PromptRow.tsx — prompt box ikut opencode.
// Mode-stack autocomplete (keybind.ts prompt.autocomplete.*): saat popup
// terbuka, Up/Down navigasi, Tab/Enter pilih, Esc tutup; textarea hanya
// terima input biasa. Trigger: `/` (slash) + `@` (file).
// Referensi: opencode/ clone (packages/tui/src/component/prompt/
// autocomplete.tsx, config/keybind.ts:214-218, prompt/display.ts).
import { For, Show, createSignal, createMemo, createEffect } from 'solid-js'
import { useTerminalDimensions } from '@opentui/solid'
import { Spinner } from './Spinner.tsx'
import {
  ABELINK_THEME,
  AUTOCOMPLETE_MAX_ROWS,
  filterCompletions,
  autocompleteTrigger,
  applyCompletion,
  moveCompletionIndex,
  popupHeight,
  selectedForeground,
  rankFileMatches,
  PROMPT_KEY_BINDINGS,
} from '../theme.ts'
import type { PromptCompletion, PromptRowProps, TextareaHandle, TuiKeyEvent } from '../types.ts'
import { movePromptHistory } from '../../core/promptHistory.mjs'

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

// SplitBorder opencode ui/border.ts: border kiri+kanan saja (┃).
export const POPUP_BORDER_CHARS = Object.freeze({
  topLeft: '',
  topRight: '',
  bottomLeft: '',
  bottomRight: '',
  horizontal: ' ',
  vertical: '┃',
  topT: '',
  bottomT: '',
  leftT: '',
  rightT: '',
  cross: '',
})

export function PromptRow(props: PromptRowProps) {
  // modelLabel boleh string atau accessor. Accessor diperlukan agar label
  // ikut refresh saat model/effort berubah: Solid tak tracking mutasi objek
  // state, jadi nilai harus dibaca di dalam effect yang memang reaktif.
  // (Stream D: agentName mengikuti pola yang sama untuk label mode.)
  const meta = () => (typeof props.modelLabel === 'function' ? props.modelLabel() : (props.modelLabel ?? ''))
  const agent = () => (typeof props.agentName === 'function' ? props.agentName() : (props.agentName ?? 'Abelink'))
  const permMode = () => (typeof props.permissionMode === 'function' ? props.permissionMode() : (props.permissionMode ?? 'auto'))
  const [selected, setSelected] = createSignal(0)
  let ta: TextareaHandle | null = null
  const readText = (): string => {
    try {
      if (ta && !ta.isDestroyed && typeof ta.plainText === 'string') return ta.plainText
    } catch {}
    return props.value?.() ?? ''
  }
  const readTextSignal = () => props.value?.() ?? ''
  // Popup dihitung dari teks BUFFER (plainText), bukan signal — signal
  // tertinggal satu tick dari keypress (terukur PTY: SUBMIT fire sebelum IN).
  // Frecency sesi (merge-review Warning #2): pemakaian @file dicatat
  // in-memory (frequency + lastOpen), dibaca rankFileMatches tiap popup.
  // Bukan persistensi lintas sesi — klaim port-A diselaraskan jujur.
  const [fileUsageMap, setFileUsageMap] = createSignal<Record<string, { frequency: number; lastOpen: number }>>({})
  const fileUsage = () => fileUsageMap()
  const touchFileUse = (name: string) => {
    const f = String(name ?? '').replace(/^@/, '')
    if (!f) return
    setFileUsageMap((m) => {
      const prev = m[f] || { frequency: 0, lastOpen: 0 }
      return { ...m, [f]: { frequency: prev.frequency + 1, lastOpen: Date.now() } }
    })
  }
  const completionsFor = (text: string): PromptCompletion[] => {
    const t = autocompleteTrigger(text)
    if (!t) return []
    if (t.mode === 'slash') return filterCompletions('/' + t.query)
    const files = props.fileCompletions?.() ?? []
    const q = t.query
    // Port opencode autocomplete.tsx:502-524: ranking bobot + frecency
    // (rankFileMatches) gantikan filter alfabetis. Usage = pemakaian @file
    // sesi ini (touchFileUse di acceptSelected), bukan klaim persisten.
    return rankFileMatches(files, q, fileUsage()).map((f) => ({ name: '@' + f, desc: 'file' }))
  }
  // Esc tutup popup tanpa ubah teks (ala opencode autocomplete.cancel):
  // flag ini yang menutup, bukan teks — ketikan berikutnya buka lagi.
  const [dismissed, setDismissed] = createSignal(false)
  const pickerOpen = () => Boolean(props.picker?.())
  // Daftar yang TERLIHAT untuk logika tombol: dismissed = dianggap tutup
  // (Enter submit apa adanya, Up/Down/Tab tembus ke textarea).
  // Bug 2: picker/dialog terbuka -> popup inline disuppress PENUH (render +
  // logika): ketikan `/` jadi filter dialog saja (via onPickerFilter), bukan
  // daftar ganda inline + dialog.
  // SATU-SATUNYA sumber daftar popup — dipakai logika tombol (buffer live)
  // maupun render di bawah, sehingga baris tampil tak pernah basi relatif
  // terhadap apa yang Enter tindaklanjuti (exact-match rule aman).
  const visibleFor = (text: string): PromptCompletion[] =>
    (dismissed() || pickerOpen() ? [] : completionsFor(text))
  // Trigger aktif (cermin opencode store.visible): ada trigger slash/file,
  // tak di-dismiss, picker tutup. Render popup ikut ini (bukan panjang
  // daftar) supaya empty-state "No matching items" tampil ala opencode.
  const triggerFor = (text: string): boolean =>
    !dismissed() && !pickerOpen() && autocompleteTrigger(text) !== null
  // Render WAJIB dari sumber yang sama dengan logika tombol (buffer live via
  // readText(), bukan signal props.value yang tertinggal 1 tick — terukur PTY:
  // SUBMIT fire sebelum IN). Memo tetap butuh dependensi reaktif, jadi
  // bufTick (naik tiap onContentChange) + readTextSignal (perubahan via
  // parent/setText) memicu evaluasi ulang; NILAI selalu dibaca dari buffer.
  const [bufTick, setBufTick] = createSignal(0)
  const renderList = createMemo(() => {
    bufTick()
    readTextSignal()
    return visibleFor(readText())
  })
  // Trigger ikut render (punya dependensi reaktif yang sama): popup tampil
  // saat trigger aktif walau daftar kosong (empty-state), tutup saat
  // dismissed/picker (Bug 2) atau trigger hilang.
  const triggerOpen = createMemo(() => {
    bufTick()
    readTextSignal()
    return triggerFor(readText())
  })
  const popupOpen = createMemo(() => triggerOpen())
  // Cap 10 baris ala opencode (height max 10): popup tak tumbuh tanpa batas.
  // (filterCompletions slash sudah cap; slice di sini menyeragamkan file-mode.)
  const popupRows = createMemo(() => renderList().slice(0, AUTOCOMPLETE_MAX_ROWS))
  // Tinggi dinamis cermin opencode (min(10, jumlah, ruang di atas prompt)):
  // tanpa cap ini ruang kecil membuat popup terdorong keluar layar.
  const dims = useTerminalDimensions()
  const popupMaxHeight = createMemo(() => {
    dims()
    const h = dims()?.height ?? 24
    return popupHeight(Math.max(1, popupRows().length || 1), Math.max(1, h - 6))
  })

  const setTextareaText = (text: string) => {
    try {
      if (ta && !ta.isDestroyed && typeof ta.setText === 'function') {
        ta.setText(text)
        // setText programatik tak selalu picu onContentChange: sinkronkan
        // render popup dari buffer baru (lihat renderList).
        setBufTick((t) => t + 1)
        return
      }
    } catch {}
    props.onInput?.(text)
  }

  const acceptSelected = (text: string | null = null) => {
    const current = text ?? readText()
    const list = visibleFor(current)
    if (!list.length) return false
    const item = list[selected() % list.length]
    const next = applyCompletion(current, autocompleteTrigger(current), item.name)
    // Frecency (merge-review Warning #2): catat @file pick in-memory sesi.
    touchFileUse(item.name)
    setSelected(0)
    setDismissed(false)
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

  const submitNow = (text: string) => {
    const t = String(text ?? '')
    recallChain = false
    setSelected(0)
    setDismissed(false)
    clearTextarea()
    props.onInput?.('')
    props.onSubmit?.(t)
  }

  // Enter polos: kalau teks SUDAH persis sama dengan baris yang di-highlight,
  // "pilih" itu no-op (teks tak berubah) dan popup tetap buka -> Enter mati
  // selamanya. Terukur PTY 2026-09-26: `/model` + Enter tak pernah jalan.
  // Jadi exact-match = jalankan; selain itu = pilih completions.
  const resolveEnter = (buf: string) => {
    const list = visibleFor(buf)
    if (!list.length) {
      submitNow(buf)
      return
    }
    const item = list[selected() % list.length]
    const exact = item && String(item.name) === String(buf ?? '').trim()
    if (exact || acceptSelected(buf) === false) submitNow(buf)
  }

  // Tutup picker (pilih ATAU batal) -> buang teks filter dari textarea,
  // supaya sisa ketikan tidak ikut terkirim sebagai prompt berikutnya.
  // Reclaim focus ala opencode (prompt reclaim setelah dialog tutup).
  let wasPickerOpen = false
  createEffect(() => {
    const open = pickerOpen()
    if (wasPickerOpen && !open) {
      clearTextarea()
      props.onInput?.('')
      setSelected(0)
      setDismissed(false)
      try { (ta as unknown as { focus?: () => void } | null)?.focus?.() } catch {}
    }
    wasPickerOpen = open
  })

  // Port opencode prompt.history (index.tsx:871-926): flag rantai recall
  // persisten antar-keypress. TextareaHandle tak expose cursor offset, jadi
  // guard didekatkan jujur: recall hanya dari buffer SATU baris
  // (multi-baris = Up/Down milik kursor), KECUALI rantai recall aktif (baru
  // saja recall -> Up/Down lanjut menelusuri; opencode set cursorOffset di
  // sini). Ketikan manual + submit mereset rantai.
  let recallChain = false
  const recall = (dir: 1 | -1): boolean => {
    const hist = props.promptHistory
    if (!hist || !hist.entries?.length) return false
    const buf = readText()
    if (!recallChain && buf.includes('\n')) return false
    const recalled = movePromptHistory(hist, dir, buf)
    if (recalled === null) { recallChain = false; return false }
    recallChain = true
    setTextareaText(recalled)
    props.onInput?.(recalled)
    return true
  }

  const onKeyDown = (e: TuiKeyEvent) => {
    // ctrl+p = command palette, pemilik tunggal App useKeyboard (merge-review
    // Warning #4). PromptRow TIDAK intercept ctrl+p agar perilaku konsisten
    // apa pun isi histori (dulu: histori terisi = recall, kosong = palette).
    // Mode-stack: picker model menang atas autocomplete (opencode
    // dialog-model): Up/Down/Enter/Esc diarahkan ke picker.
    if (pickerOpen()) {
      if (e.name === 'up') { e.preventDefault?.(); props.onPickerMove?.(-1); return }
      if (e.name === 'down') { e.preventDefault?.(); props.onPickerMove?.(1); return }
      // Port dialog-confirm ←→ + dialog-select Tab: pindah antar opsi.
      if (e.name === 'left') { e.preventDefault?.(); props.onPickerMove?.(-1); return }
      if (e.name === 'right') { e.preventDefault?.(); props.onPickerMove?.(1); return }
      if (e.name === 'tab') { e.preventDefault?.(); props.onPickerMove?.(e.shift ? -1 : 1); return }
      if (e.name === 'escape') { e.preventDefault?.(); props.onPickerCancel?.(); return }
      if ((e.name === 'return' || e.name === 'linefeed') && !e.shift && !e.ctrl && !e.meta) {
        e.preventDefault?.()
        props.onPickerSelect?.()
        return
      }
      return
    }
    const buf = readText()
    const popup = visibleFor(buf).length > 0
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
      // Histori prompt: Up/Down MURNI saja (merge-review Warning #4).
      // ctrl+p = command palette (App useKeyboard, pemilik tunggal);
      // ctrl+n = reserved, jangan recall agar tak tabrakan keybind global.
      if (e.name === 'up' && !e.ctrl && !e.meta) {
        if (recall(-1)) { e.preventDefault?.(); return }
        return
      }
      if (e.name === 'down' && !e.ctrl && !e.meta) {
        if (recall(1)) { e.preventDefault?.(); return }
        return
      }
      return
    }
    if (e.name === 'up' || (e.name === 'p' && e.ctrl)) {
      e.preventDefault?.()
      const n = visibleFor(buf).length
      setSelected((s) => moveCompletionIndex(s, -1, n))
    } else if (e.name === 'down' || (e.name === 'n' && e.ctrl)) {
      e.preventDefault?.()
      const n = visibleFor(buf).length
      setSelected((s) => moveCompletionIndex(s, 1, n))
    } else if (e.name === 'tab') {
      // Port opencode agent_cycle (tab): popup buka = accept; tutup =
      // toggle plan/build. shift+tab = arah balik (agent_cycle_reverse).
      if (popup) { e.preventDefault?.(); acceptSelected(buf); return }
      e.preventDefault?.()
      props.onModeToggle?.()
      return
    } else if (e.name === 'escape') {
      // Esc tutup popup (dismissed) tanpa ubah teks; Enter berikutnya
      // submit apa adanya. Ketikan berikutnya buka lagi (reset di
      // onContentChange). onEscape tetap dipanggil (kontrak lama: App/entry
      // pakai untuk batal/keluar).
      e.preventDefault?.()
      setSelected(0)
      setDismissed(true)
      props.onEscape?.()
    }
  }

  return (
    <box style={{ flexDirection: 'column', width: '100%' }}>
      {/* Floating overlay, port opencode prompt/autocomplete.tsx:724-736:
          position absolute di atas prompt (top = anchor - height), selebar
          prompt box, SplitBorder kiri+kanan (┃), scrollbox tanpa scrollbar,
          highlight bg primary + fg luminance, mouse hover/klik, tanpa footer. */}
      <Show when={popupOpen()}>
        <box
          style={{
            position: 'absolute',
            left: 2,
            right: 2,
            bottom: '100%',
            zIndex: 100,
            flexShrink: 0,
            flexDirection: 'column',
            border: ['left', 'right'],
            borderColor: ABELINK_THEME.border,
            customBorderChars: POPUP_BORDER_CHARS,
            backgroundColor: ABELINK_THEME.backgroundMenu,
          }}
        >
          <scrollbox
            backgroundColor={ABELINK_THEME.backgroundMenu}
            height={popupMaxHeight()}
            scrollbarOptions={{ visible: false }}
          >
            <Show
              when={popupRows().length > 0}
              fallback={
                <box style={{ flexDirection: 'row', flexShrink: 0, paddingLeft: 1, paddingRight: 1 }}>
                  <text fg={ABELINK_THEME.textMuted}>No matching items</text>
                </box>
              }
            >
              <For each={popupRows()}>
                {(c, i) => (
                  <box
                    style={{
                      flexDirection: 'row',
                      flexShrink: 0,
                      paddingLeft: 1,
                      paddingRight: 1,
                      backgroundColor:
                        i() === selected() % popupRows().length ? ABELINK_THEME.primary : undefined,
                    }}
                    onMouseOver={() => setSelected(i())}
                    onMouseUp={() => { setSelected(i()); acceptSelected(readText()) }}
                  >
                    <text fg={i() === selected() % popupRows().length ? selectedForeground() : ABELINK_THEME.text} flexShrink={0}>
                      {c.name}
                    </text>
                    <Show when={c.desc}>
                      <text fg={i() === selected() % popupRows().length ? selectedForeground() : ABELINK_THEME.textMuted} wrapMode="none">
                        {' ' + (c.desc ?? '').trimStart()}
                      </text>
                    </Show>
                  </box>
                )}
              </For>
            </Show>
          </scrollbox>
        </box>
      </Show>
      <box
        style={{
          width: '100%',
          // Port opencode: border netral theme.border; highlight agen
          // (tint + fade) ditunda jujur — tanpa itu cyan menyala tidak setia.
          border: ['left'],
          borderColor: ABELINK_THEME.border,
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
            // Port opencode: max(6, floor(height/3)) bongsor ikut terminal.
            maxHeight={props.maxHeight ?? Math.max(6, Math.floor(((dims()?.height ?? 24)) / 3))}
            focusedBackgroundColor={ABELINK_THEME.backgroundElement}
            cursorColor={ABELINK_THEME.text}
            keyBindings={props.picker?.() ? [] : (props.keyBindings ?? PROMPT_KEY_BINDINGS)}
            ref={(r: TextareaHandle) => {
              ta = r
              // Autofocus ala opencode: langsung ketik tanpa klik dulu.
              try { (r as unknown as { focus?: () => void }).focus?.() } catch {}
            }}
            onContentChange={() => {
              setSelected(0)
              // Ketikan baru = niat baru: buka lagi popup yang tadi di-Esc,
              // dan putus rantai recall histori (guard movePromptHistory).
              setDismissed(false)
              recallChain = false
              // Picu render ulang popup dari buffer live (lihat renderList).
              setBufTick((t) => t + 1)
              const t = readText()
              props.onInput?.(t)
              // Picker buka: ketikan jadi filter (pola fuzzy opencode).
              if (props.picker?.()) props.onPickerFilter?.(t)
            }}
            onKeyDown={onKeyDown}
            onSubmit={() => resolveEnter(readText())}
          />
          {/* Meta row, port opencode prompt/index.tsx:1442-1478: agen
              Titlecase + `auto` (bila permission auto) · model + provider
              SELALU (opencode tampilkan model di mode normal apa pun
              permission-nya). Tanpa fade/variant. */}
          <box style={{ flexDirection: 'row', flexShrink: 0, paddingTop: 1, gap: 1, justifyContent: 'space-between' }}>
            <box style={{ flexDirection: 'row', gap: 1 }}>
              <text fg={ABELINK_THEME.accent}>{agent()}</text>
              <Show when={permMode() === 'auto'}>
                <text fg={ABELINK_THEME.textMuted}>auto</text>
              </Show>
              <text fg={ABELINK_THEME.textMuted}>·</text>
              <text fg={ABELINK_THEME.text}>{meta()}</text>
            </box>
            <Show when={props.right}>
              <box style={{ flexDirection: 'row', gap: 1, alignItems: 'center' }}>
                <Show
                  when={props.spinRight === true}
                  fallback={<text fg={ABELINK_THEME.textMuted}>{props.right}</text>}
                >
                  <Spinner color={ABELINK_THEME.textMuted}>
                    {props.right as never}
                  </Spinner>
                </Show>
              </box>
            </Show>
          </box>
        </box>
      </box>
    </box>
  )
}
