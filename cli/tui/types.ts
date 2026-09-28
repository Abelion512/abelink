// cli/tui/types.ts — kontrak tipe permukaan TUI (M2a).
//
// Kenapa terpisah: engine (`engine.mjs`) tetap JS (keputusan D3: `.mjs` tidak
// di-rename tanpa nilai), jadi tipe harus tinggal di satu tempat yang bisa
// dirujuk komponen .tsx DAN entry `bin/abelink-tui-v2.tsx`. Tanpa ini setiap
// berkas mendefinisikan bentuk props sendiri dan error `TS2339 property does
// not exist on type '{}'` muncul kembali (114 error pra-M2a).
//
// Kontrak runtime TIDAK berubah: semua field opsional mengikuti perilaku
// pemanggil yang memang sudah memakai `?.`/`??`.
import type { KeyBinding } from '@opentui/core'

/** Satu baris percakapan/UI di state engine. `role` bebas (meta/error/thought). */
export interface TuiMessage {
  role: string
  text: string
}

/** Baris overlay (picker model, command palette, daftar sesi). */
export interface PickerRow {
  id?: string
  label?: string
  section?: string
  /** Port dialog-select: penanda baris aktif (●) — mis. model/effort aktif. */
  current?: boolean
  /** Port dialog-select `details`: baris kedua muted di bawah label. */
  detail?: string | null
  /** Diisi App saat jendela baris digeser (indeks absolut untuk highlight). */
  index?: number
}

/**
 * State overlay. `kind` menentukan aksi Enter di entry:
 * `model` -> `/model <id>`, `commands` -> jalankan perintah, `sessions` -> `/continue <id>`,
 * `effort` -> `/effort <level>`.
 */
export interface PickerState {
  kind?: 'model' | 'commands' | 'sessions' | 'effort' | string
  title?: string
  kindHint?: string
  rows?: PickerRow[]
  index?: number
  query?: string
  loading?: boolean
  hint?: string | null
  /** Jumlah model di katalog (bukan jumlah baris terlihat). */
  total?: number
  stale?: boolean
  error?: string | null
  /** Port dialog.setSize: sesi pakai 'large' (88). Default medium (60). */
  size?: 'medium' | 'large' | 'xlarge'
  /** Port dialog-select footerHints kanan (mis. "switch ctrl+1-9"). */
  footerHints?: string[]
  /** Port dialog-confirm: aksi yang dijalankan bila tombol Ya dipilih. */
  confirmAction?: string | null
}

/** State engine (`createTuiState` di cli/tui/engine.mjs). */
export interface TuiState {
  provider: string
  model: string
  effort: string
  workspace: string
  sessionId: string
  history: TuiMessage[]
  messages: TuiMessage[]
  showThinking: boolean
  showDetails: boolean
  busy: boolean
  // Batch C: sinyal usage sesi berjalan (null = belum terukur) + MCP/LSP
  // (null = engine belum expose) + hook alih sesi.
  usage?: { tokensEst: number | null; modelCtx: number | null }
  modelCapabilities?: { ctx?: number | null } | null
  mcpConnected?: string[] | null
  mcpError?: boolean
  lspCount?: number | null
  onSessionSwitch?: ((sessionId: string) => void) | null
  // Stream D: mode plan/build (default 'build') + status working per turn
  // ({ steps, tool } — ditulis engine via noteWorking, dibaca entry).
  mode?: string
  working?: { steps?: number; tool?: string | null }
  /** Diisi entry dari fileConfig (recent models) saat bootstrap. */
  recentModels?: string[]
  /**
   * Hook repaint milik entry TUI. Engine memanggilnya setiap push pesan;
   * tanpa ini TUI tampak beku selama turn panjang.
   */
  onPush?: (() => void) | null
}

/** Handle textarea OpenTUI yang dipakai PromptRow (bukan React ref). */
export interface TextareaHandle {
  isDestroyed?: boolean
  plainText?: string
  setText?: (text: string) => void
}

/** Event keydown dari OpenTUI. */
export interface TuiKeyEvent {
  name?: string
  shift?: boolean
  ctrl?: boolean
  meta?: boolean
  preventDefault?: () => void
}

/** Event progres dari engine (diteruskan ke state.messages). */
export interface TuiProgressEvent {
  line?: string
  type?: string
}

/** Satu entri model custom bebas (cli.json customModels). */
export interface CustomModelEntry {
  id: string
  ctx?: number | null
  maxOut?: number | null
  reasoning?: boolean
  lastSeen?: number
}

/** Isi cli.json / shared.json yang dibaca TUI (bentuk longgar, key asing diizinkan). */
export interface TuiFileConfig {
  effort?: string | null
  recentModels?: string[]
  favModels?: string[]
  customModels?: CustomModelEntry[]
  [key: string]: unknown
}

/** Client sidecar (dibuat oleh `createSidecarClient` di cli/core/sidecar-client.mjs). */
export interface SidecarClient {
  dispose?: () => void
  [key: string]: unknown
}

/** Opsi CLI hasil `parseTuiArgs` (cli/core/parser.mjs — tetap JS, M2b). */
export interface TuiCliOptions {
  workspace: string
  provider?: string | null
  providerExplicit?: boolean
  model?: string | null
  modelExplicit?: boolean
  effort?: string | null
  effortExplicit?: boolean
  maxTurns?: number
  homeDir?: string | null
}

/** Props `App` (presentational). */
export interface AppProps {
  messages?: () => TuiMessage[]
  /** Signal versi dari entry; dibaca agar `For` re-render saat engine push. */
  tick?: () => number
  busy?: () => boolean
  model?: string | (() => string)
  providerLabel?: string | (() => string)
  version?: string
  sessionId?: string | (() => string)
  title?: string
  workspace?: string
  // Batch C (footer opencode: kiri direktori, kanan status): string statis
  // atau accessor reaktif (entry baca tick() di dalam agar ikut re-render).
  // null = data tak tersedia -> App tampilkan '—' (tanpa fabrikasi angka).
  tokens?: string | (() => string | null) | null
  usagePct?: string | (() => string | null) | null
  spent?: string | (() => string | null) | null
  // MCP error + LSP count ala footer opencode (kiri direktori, kanan status).
  // null/undefined = data tak tersedia -> segmen di-skip (tanpa angka palsu).
  // LSP 0 = faktual (TUI tanpa language server), bukan fabrikasi.
  mcpError?: boolean
  lspCount?: number | null
  // Sesi terakhir tersimpan (session-destination opencode): HomeView tawarkan
  // `/continue <id>` bila ada; null = belum ada sesi.
  lastSessionId?: string | null
  statusRight?: string | null
  connected?: string[]
  onSubmitLine?: (text: string) => void
  onExit?: () => void
  picker?: () => PickerState | null
  onPickerMove?: (delta: number) => void
  onPickerSelect?: () => void
  onPickerCancel?: () => void
  onPickerFilter?: (text: string) => void
  onCommands?: () => void
  // Stream D: nama agen aktif (plan/build) + toggle mode via keybind.
  // accessor agar ikut re-render saat engine ubah mode (pola model tick).
  agentName?: string | (() => string)
  onModeToggle?: () => void
  // Paritas opencode thinking toggle: diteruskan ke MessageLine.
  showThinking?: boolean | (() => boolean)
  showDetails?: boolean | (() => boolean)
}

  /** Props `CenterDialog` (slice 3): presentasi daftar pilih di tengah. */
export interface CenterDialogProps {
  open?: boolean
  kind?: string
  title?: string
  rows?: PickerRow[]
  index?: number
  query?: string
  loading?: boolean
  hint?: string | null
  error?: string | null
  /** Katalog stale (footer jujur, cermin format picker bawah App). */
  stale?: boolean
  /** Ukuran panel ala opencode dialog.tsx: medium 60 / large 88 / xlarge 116. */
  size?: 'medium' | 'large' | 'xlarge'
  /** Jumlah model katalog (bukan baris terlihat). */
  total?: number
  /** Port dialog-select footerHints kanan (mis. "switch ctrl+1-9"). */
  footerHints?: string[]
}

/** Props `HomeView` (slice 4): kolom tengah layar awal saat messages kosong. */
export interface HomeViewProps {
  version?: string
  workspace?: string
  title?: string
  /** Lebar terminal (untuk max-width kolom via homePromptMaxWidth). */
  width?: number
  /** Indeks tip rotasi (didorong App tiap 6s, pola placeholder). */
  tipIndex?: number
  /** Sesi terakhir tersimpan (session-destination opencode). */
  lastSessionId?: string | null
}

/** Props `PromptRow`. */export interface PromptRowProps {
  value?: () => string
  onInput?: (text: string) => void
  onSubmit?: (text: string) => void
  modelLabel?: string | (() => string)
  right?: string | null
  /** true = right dirender dengan Spinner animasi (port opencode). */
  spinRight?: boolean
  picker?: () => PickerState | null
  onPickerMove?: (delta: number) => void
  onPickerSelect?: () => void
  onPickerCancel?: () => void
  onPickerFilter?: (text: string) => void
  accent?: string
  inputFocused?: () => boolean
  placeholder?: string
  maxHeight?: number
  /** Binding key textarea. Tipe diambil dari OpenTUI agar `action` tetap union sempitnya. */
  keyBindings?: KeyBinding[]
  fileCompletions?: () => string[]
  onEscape?: () => void
  // Stream D: accessor didukung agar label mode ikut re-render (pola
  // modelLabel: nilai dibaca di dalam render yang reaktif).
  agentName?: string | (() => string)
  permissionMode?: string
}

/** Item autocomplete prompt (`/` slash dan `@` file). */
export interface PromptCompletion {
  name: string
  desc?: string
}
