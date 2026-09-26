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
  /** Diisi App saat jendela baris digeser (indeks absolut untuk highlight). */
  index?: number
}

/**
 * State overlay. `kind` menentukan aksi Enter di entry:
 * `model` -> `/model <id>`, `commands` -> jalankan perintah, `sessions` -> `/continue <id>`.
 */
export interface PickerState {
  kind?: 'model' | 'commands' | 'sessions' | string
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

/** Isi cli.json / shared.json yang dibaca TUI (bentuk longgar, key asing diizinkan). */
export interface TuiFileConfig {
  effort?: string | null
  recentModels?: string[]
  favModels?: string[]
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
  tokens?: string
  usagePct?: string
  spent?: string
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
}

/** Props `PromptRow`. */
export interface PromptRowProps {
  value?: () => string
  onInput?: (text: string) => void
  onSubmit?: (text: string) => void
  modelLabel?: string | (() => string)
  right?: string | null
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
  agentName?: string
  permissionMode?: string
}

/** Item autocomplete prompt (`/` slash dan `@` file). */
export interface PromptCompletion {
  name: string
  desc?: string
}
