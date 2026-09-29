/** @jsxImportSource @opentui/solid */
// cli/tui/App.tsx — layout ikut opencode routes/session/index.tsx:1177-1358:
// row [kolom konten (padding 2, gap 1) | sidebar 42 bila wide>120],
// kolom: scrollbox pesan + Prompt + status line. Panel kanan ikut
// sidebar.tsx: bg panel, padding 2, Context/MCP/LSP.
// Referensi: /tmp/opencode-ref (sst/opencode, sparse packages/tui).
// V2-1: echo lokal; engine wiring = slice berikut.
import { createSignal, For, Show, onMount, onCleanup } from 'solid-js'
import { useKeyboard, useTerminalDimensions } from '@opentui/solid'
import { ABELINK_THEME, shortModel, SIDEBAR_WIDTH, isWide, isDialogKind, visibleWindow, homePlaceholder, statusRightText, abbreviateHome } from './theme.ts'
import { MessageLine } from './components/MessageLine.tsx'
import { PromptRow } from './components/PromptRow.tsx'
import { HomeView } from './components/HomeView.tsx'
import { CenterDialog } from './components/CenterDialog.tsx'
import type { AppProps, PickerRow } from './types.ts'

export { shortModel, SIDEBAR_WIDTH, isWide }

// Baca prop yang boleh string statis ATAU accessor reaktif (entry baca
// tick()/state di dalam agar ikut re-render). null = data tak tersedia.
function readOpt(p?: string | (() => string | null) | null): string | null {
  try {
    if (typeof p === 'function') return p() ?? null
    return p ?? null
  } catch {
    return null
  }
}

// Bottom cap prompt (pola opencode prompt/index.tsx): garis tipis `▀`
// di bawah kotak input. Didefinisikan lokal agar App tetap presentational.
// OpenTUI: `SpanProps` dideklarasikan `ComponentProps<{}, TextNodeRenderable>`,
// sehingga prop warna `fg` TIDAK ada di tipe walau runtime mendukungnya
// (TextNodeRenderable memang punya opsi fg; di PTY bullet ini benar berwarna).
// Wrapper ini memusatkan gap tipe itu di SATU tempat tanpa mengubah output:
// elemen yang dikirim tetap `<span fg=...>` apa adanya.
const ColoredSpan = (props: { fg?: string; children?: unknown }) => (
  // @ts-expect-error fg didukung TextNodeRenderable saat runtime; hilang dari tipe SpanProps.
  <span fg={props.fg}>{props.children as never}</span>
)

const PROMPT_CAP_BORDER = Object.freeze({
  topLeft: '', topRight: '', bottomLeft: '', bottomRight: '',
  horizontal: '▀', vertical: ' ', topT: '', bottomT: '', leftT: '', rightT: '', cross: '',
})

export function App(props: AppProps = {}) {
  // Presentational: engine (cli/tui/engine.mjs) memiliku messages.
  // `tick` = signal versi dari entry; dibaca agar For re-render saat
  // engine push (Solid tak tracking mutasi array luar).
  const [value, setValue] = createSignal('')
  const dims = useTerminalDimensions()
  // Rotasi placeholder HomeView (pola opencode Prompt placeholders): putar tiap
  // 6s saat messages kosong; berhenti + cleanup saat unmount. PromptRow terima
  // string tunggal (bukan array), jadi App yang mendorong nilai bergilir.
  const [phIndex, setPhIndex] = createSignal(0)
  let phTimer: ReturnType<typeof setInterval> | null = null
  onMount(() => {
    phTimer = setInterval(() => {
      if (messages().length === 0) setPhIndex((i) => i + 1)
    }, 6000)
  })
  onCleanup(() => { if (phTimer) clearInterval(phTimer) })
  const model = () => (typeof props.model === 'function' ? props.model() : props.model) ?? 'oc/muse-spark-1.3-contributor-free'
  const provider = () => (typeof props.providerLabel === 'function' ? props.providerLabel() : props.providerLabel) ?? '9router'
  const connected = () => props.connected ?? []
  const busy = () => props.busy?.() ?? false
  const wide = () => isWide(dims()?.width ?? 80)
  const title = () => props.title ?? 'Abelink'
  const sessionId = () => (typeof props.sessionId === 'function' ? props.sessionId() : props.sessionId) ?? ''
  // Batch C (sidebar opencode jujur): baca state tiap render agar
  // usage/mcp/lsp ikut segar (pola modelLabel/agentName di atas).
  const tokensLabel = () => {
    props.tick?.()
    return readOpt(props.tokens)
  }
  const usagePctLabel = () => {
    props.tick?.()
    return readOpt(props.usagePct)
  }
  const spentLabel = () => {
    props.tick?.()
    return readOpt(props.spent)
  }
  const mcpErr = () => {
    props.tick?.()
    return props.mcpError === true
  }
  const lspN = () => {
    props.tick?.()
    const n = Number(props.lspCount)
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
  }
  // Batch C (footer opencode: kiri direktori, kanan status): kanan =
  // statusChips (theme.ts) — LSP + MCP error + hint. Tanpa data ->
  // segmen di-skip (tanpa angka palsu). Prop statusRight (working Stream D)
  // menang saat busy — merge-review Critical #1.
  const statusRight = () => statusRightText({ busy: busy(), prop: props.statusRight, lspCount: lspN(), mcpError: mcpErr() })
  // Picker model (opencode dialog-model): daftar + jendela baris agar
  // katalog 1200+ ID tetap muat dan pilihan selalu terlihat.
  const picker = () => props.picker?.() ?? null
  // Slice 3: kind model/commands/sessions/effort render di dialog tengah
  // (CenterDialog); kind lain tetap picker bawah (filter inline prompt).
  const dialogPicker = () => {
    const p = picker()
    return p && isDialogKind(p.kind) ? p : null
  }
  const pickerWindow = (): { rows: PickerRow[] } => {
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

  useKeyboard((key: { ctrl?: boolean; name?: string; preventDefault?: () => void }) => {
    if (key.ctrl && key.name === 'c') props.onExit?.()
    // ctrl+p = command palette (pola opencode). Entry wajib mengoper onCommands.
    if (key.ctrl && key.name === 'p') { key.preventDefault?.(); props.onCommands?.() }
    // Stream D: ctrl+o = toggle mode plan/build. Cek konflik: 'o' polos tak
    // dipakai key handling mana pun (grep: hanya muncul di kata "model");
    // TAB ditolak (dipakai autocomplete-accept PromptRow:202, = opencode
    // prompt.autocomplete.select tab). Batasan: jangan ubah key textarea
    // selain tambah keybind ini — dipatuhi (hanya useKeyboard App-level).
    if (key.ctrl && key.name === 'o') { key.preventDefault?.(); props.onModeToggle?.() }
  })

  const submit = (text: string) => {
    const t = String(text ?? '')
    if (!t.trim() || busy()) return
    setValue('')
    props.onSubmitLine?.(t)
  }
  // Area prompt (PromptRow + bottom cap): SELALU full-width seperti opencode
  // session route (konten padding 2, prompt tanpa max-width). HomeView teks
  // boleh centered, tapi prompt + status line full-bleed.
  // Fungsi lokal (bukan komponen): Solid tak perlu, hindari remount textarea.
  // SATU box kolom (bukan fragment): anak-anak (PromptRow + cap) resolve
  // width terhadap SATU parent definite, sehingga maxWidth kolom tengah dari
  // pembungkus Show berlaku untuk keduanya. Terukur PTY R1: fragment membuat
  // cap border lolos dari constraint (full-width ▀) sementara PromptRow taat.
  const promptArea = () => (
    <box style={{ flexDirection: 'column', width: '100%', flexShrink: 0, gap: 1 }}>
      <PromptRow
        value={value}
        onInput={setValue}
        onSubmit={submit}
        placeholder={homePlaceholder(phIndex())}
        modelLabel={() => {
          // Baca `tick` supaya label ini ikut re-render saat engine ubah
          // model (Solid hanya tracking signal, bukan mutasi objek state).
          props.tick?.()
          return `${shortModel(model())} ${provider()}`
        }}
        right={busy() ? (props.statusRight ?? 'working…') : (props.statusRight ?? null)}
        spinRight={busy()}
        agentName={() => {
          // Baca `tick` agar label mode ikut re-render saat engine toggle
          // (pola modelLabel di atas: Solid tak tracking mutasi objek state).
          props.tick?.()
          const a = props.agentName
          // Port opencode prompt/index.tsx:1448: nama agen Titlecase.
          const raw = typeof a === 'function' ? (a() ?? 'Abelink') : (a ?? 'Abelink')
          return raw.charAt(0).toUpperCase() + raw.slice(1)
        }}
        picker={picker}
        onPickerMove={props.onPickerMove}
        onPickerSelect={props.onPickerSelect}
        onPickerCancel={props.onPickerCancel}
        onPickerFilter={props.onPickerFilter}
        promptHistory={props.promptHistory}
        permissionMode={props.permissionMode}
      />
      {/* Cap nested, port opencode prompt/index.tsx:1488-1511: box left +
          inner bottom, horizontal ▀ bila bg opaque else spasi. */}
      <box
        style={{
          width: '100%',
          height: 1,
          flexShrink: 0,
          border: ['left'],
          borderColor: ABELINK_THEME.border,
          customBorderChars: PROMPT_CAP_BORDER,
        }}
      >
        <box
          style={{
            width: '100%',
            height: 1,
            border: ['bottom'],
            borderColor: ABELINK_THEME.backgroundElement,
            customBorderChars: ABELINK_THEME.backgroundElement === 'transparent'
              ? { ...PROMPT_CAP_BORDER, horizontal: ' ' }
              : PROMPT_CAP_BORDER,
          }}
        />
      </box>
    </box>
  )

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
          paddingRight: 2,
          gap: 1,
        }}
      >
        <scrollbox style={{ flexGrow: 1, minHeight: 0 }} scrollbarOptions={{ visible: false }}>
          {/* Layar awal tengah (slice 4, pola opencode routes/home.tsx):
              kolom tengah HomeView saat messages kosong; non-kosong = daftar
              pesan seperti semula. Prompt pertama langsung jalan via submit. */}
          <Show when={messages().length === 0}>
            <HomeView
              version={props.version}
              workspace={props.workspace}
              title={title()}
              width={dims()?.width ?? 80}
              tipIndex={phIndex()}
              lastSessionId={props.lastSessionId ?? null}
            />
          </Show>
          <For each={messages()}>
            {(l) => (
              <MessageLine
                role={String(l.role ?? '')}
                text={String(l.text ?? '')}
                showThinking={typeof props.showThinking === 'function' ? props.showThinking() : props.showThinking}
                showDetails={typeof props.showDetails === 'function' ? props.showDetails() : props.showDetails}
              />
            )}
          </For>
        </scrollbox>
        {picker() && !dialogPicker() && (
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
              {picker()?.title ?? 'pilih model'}{picker()?.query ? ` — filter: ${picker()!.query}` : ''}
            </text>
            <For each={pickerWindow().rows}>
              {(row) => (
                <text fg={row.index === picker()!.index ? ABELINK_THEME.primary : undefined}>
                  {(row.index === picker()!.index ? '> ' : '  ') + row.label + ' — ' + row.section}
                </text>
              )}
            </For>
            <text fg={ABELINK_THEME.muted}>
              {picker()?.loading
                ? 'memuat katalog…'
                : (picker()?.rows?.length
                  ? `${picker()?.kindHint ?? '↑↓ pilih · Enter pakai · Esc batal · ketik untuk filter'} (${picker()!.rows!.length} baris${picker()?.total ? ` dari ${picker()!.total} model` : ''}${picker()?.stale ? ', katalog stale' : ''})${picker()?.hint ? ` · ${picker()!.hint}` : ''}`
                  : `Tidak ada model cocok. Esc untuk batal.${picker()?.error ? ` (${picker()!.error})` : ''}`)}
            </text>
          </box>
        )}
        {promptArea()}
        {/* Status line pola footer opencode (kiri direktori singkat ~,
            kanan status). abbreviateHome cegah wrap 2 baris di 100 kolom. */}
        <box style={{ flexDirection: 'row', justifyContent: 'space-between', flexShrink: 0 }}>
          <text fg={ABELINK_THEME.textMuted}>{abbreviateHome(props.workspace ?? '', typeof process !== 'undefined' ? process.env.HOME ?? '' : '')}</text>
          <box style={{ flexDirection: 'row', gap: 2 }}>
            <text fg={ABELINK_THEME.textMuted}>{statusRight()}</text>
          </box>
        </box>
      </box>
      {wide() && (
        <box
          style={{
            width: SIDEBAR_WIDTH,
            height: '100%',
            flexShrink: 0,
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
          {/* Sidebar isi ala opencode sidebar.tsx + slot context/mcp:
              judul + id sesi, Context (token estimasi nyata bila engine
              expose, persen hanya bila ctx model dikenal — else '—'),
              MCP (connected/error bila tersedia; TUI tanpa MCP server
              menampilkan 'none'), LSP 0 (faktual: tanpa language server). */}
          <box style={{ flexDirection: 'column', paddingTop: 2, gap: 1, flexGrow: 1 }}>
            <text fg={ABELINK_THEME.text}>Context</text>
            <text fg={ABELINK_THEME.textMuted}>{tokensLabel() ?? '—'}</text>
            <text fg={ABELINK_THEME.textMuted}>{usagePctLabel() ?? '—'}</text>
            <Show when={spentLabel()}>
              <text fg={ABELINK_THEME.textMuted}>{spentLabel()}</text>
            </Show>
            <text fg={ABELINK_THEME.text}>MCP</text>
            <Show when={connected().length > 0} fallback={<text fg={ABELINK_THEME.textMuted}>none connected</text>}>
              <For each={connected()}>
                {(c) => (
                  <text fg={ABELINK_THEME.text}>
                    <ColoredSpan fg={mcpErr() ? ABELINK_THEME.error : ABELINK_THEME.success}>{mcpErr() ? '⊙! ' : '⊙ '}</ColoredSpan>
                    {c}
                  </text>
                )}
              </For>
            </Show>
            <Show when={mcpErr() && connected().length === 0}>
              <text fg={ABELINK_THEME.error}>⊙! MCP error</text>
            </Show>
            <text fg={ABELINK_THEME.text}>LSP</text>
            <text fg={ABELINK_THEME.textMuted}>{lspN() === null ? '—' : `○ ${lspN()} LSP`}</text>
          </box>
          {/* Branding footer ala opencode: dot success + nama + versi. */}
          <box style={{ flexShrink: 0, paddingTop: 1 }}>
            <text fg={ABELINK_THEME.textMuted}>
              <ColoredSpan fg={ABELINK_THEME.success}>• </ColoredSpan>
              <b>Abelink</b> v{props.version ?? ''}
            </text>
          </box>
        </box>
      )}
      {/* Slice 3: dialog tengah untuk model/commands/sessions/effort.
          Picker bawah DIPERTAHANKAN untuk kind lain (filter inline prompt).
          Navigasi/filter dialog memakai handler picker yang sama. */}
      <CenterDialog
        open={Boolean(dialogPicker())}
        kind={dialogPicker()?.kind}
        title={dialogPicker()?.title ?? 'pilih'}
        rows={dialogPicker()?.rows}
        index={dialogPicker()?.index ?? 0}
        query={dialogPicker()?.query}
        loading={dialogPicker()?.loading}
        hint={dialogPicker()?.kindHint ?? dialogPicker()?.hint}
        error={dialogPicker()?.error}
        stale={dialogPicker()?.stale}
        total={dialogPicker()?.total}
        size={dialogPicker()?.size}
        footerHints={dialogPicker()?.footerHints}
      />
    </box>
  )
}
