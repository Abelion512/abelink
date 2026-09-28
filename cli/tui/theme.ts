import type { KeyBinding } from '@opentui/core'

// cli/tui/theme.ts — TUI-V2-1: token tema tunggal, dipetik dari tema DaisyUI
// `abelink` (src/assets/main.css). Satu sumber: ubah di sini, seluruh TUI ikut.
// Token mengikuti SEMANTIK opencode theme (`background`/`backgroundPanel`/
// `backgroundElement`/`text`/`textMuted`/`border*`) supaya komponen bisa
// dipetakan 1:1 dari theme/index.ts opencode, sambil mempertahankan nama
// warisan (base100/base200/baseContent/muted) yang sudah dipakai test + komponen.
export interface AbelinkTheme {
  base100: string
  base200: string
  base300: string
  baseContent: string
  primary: string
  success: string
  warning: string
  error: string
  muted: string
  background: string
  backgroundPanel: string
  backgroundElement: string
  backgroundMenu: string
  text: string
  textMuted: string
  secondary: string
  accent: string
  info: string
  border: string
  borderActive: string
  borderSubtle: string
}

export const ABELINK_THEME: AbelinkTheme = Object.freeze({
  // --- warisan (jangan hapus: test + komponen lama bergantung) ---
  base100: '#161618',
  base200: '#121214',
  base300: '#0a0a0c',
  baseContent: '#ffffff',
  primary: '#0a84ff',
  success: '#30d158',
  warning: '#ff9f0a',
  error: '#ff453a',
  muted: '#8e8e93',
  // --- semantik opencode (theme/index.ts Theme) ---
  background: '#161618', // = base100
  backgroundPanel: '#121214', // = base200 (sidebar)
  backgroundElement: '#1e1e21', // = area prompt/elemen
  backgroundMenu: '#1e1e21', // = popup/picker
  text: '#ffffff',
  textMuted: '#8e8e93',
  secondary: '#bf5af2',
  accent: '#0a84ff',
  info: '#64d2ff',
  border: '#2c2c2e',
  borderActive: '#0a84ff',
  borderSubtle: '#232325',
}) as AbelinkTheme

export interface TuiCommand {
  name: string
  desc: string
}

export const TUI_COMMANDS: TuiCommand[] = Object.freeze([
  { name: '/model', desc: 'Lihat/ganti model' },
  { name: '/models', desc: 'Daftar model + alias' },
  { name: '/effort', desc: 'Lihat/ganti effort' },
  { name: '/sessions', desc: 'Dialog sesi tersimpan (Enter = lanjut)' },
  { name: '/commands', desc: 'Command palette (alias ctrl+p)' },
  { name: '/continue', desc: 'Lanjut sesi tersimpan' },
  { name: '/new', desc: 'Mulai sesi baru' },
  { name: '/compact', desc: 'Ringkas histori sesi' },
  { name: '/thinking', desc: 'Tampilkan/sembunyikan thinking' },
  { name: '/details', desc: 'Tampilkan/sembunyikan detail tool' },
  { name: '/editor', desc: 'Tulis prompt di $EDITOR' },
  { name: '/init', desc: 'Buat/perbarui AGENTS.md' },
  { name: '/help', desc: 'Tampilkan bantuan' },
  { name: '/exit', desc: 'Keluar' },
]) as TuiCommand[]

// Label model ala opencode: nama pendek (setelah / terakhir) + effort.
export function shortModel(id: string = ''): string {
  const s = String(id ?? '')
  const slash = s.lastIndexOf('/')
  return slash >= 0 ? s.slice(slash + 1) : s
}

// Konstanta layout ikut opencode routes/session (index.tsx:270-278,
// sidebar.tsx:28-36): sidebar 42 kolom, tampil bila lebar > 120.
export const SIDEBAR_WIDTH = 42
export const WIDE_THRESHOLD = 120

export function isWide(width: number = 80): boolean {
  return Number(width) > WIDE_THRESHOLD
}

// Key bindings prompt: Shift+Enter & kawan = newline (Enter ditangani
// manual di onKeyDown PromptRow: submit bila popup tutup, pilih bila buka).
// Pola opencode keybind.ts input_newline. `linefeed` WAJIB: TTY asli kirim
// LF untuk Enter (terverifikasi script/tty, 2026-09-25).
// Alasan Enter tak di sini: preventDefault di onKeyDown menekan action
// binding, tapi action binding jalan SEBELUM onKeyDown konsumen sehingga
// Enter-submit via binding tak bisa dibatalkan saat popup terbuka.
//
// Tipe dirujuk LANGSUNG dari OpenTUI supaya `action` tetap union sempit
// miliknya (`newline`, ...) — bukan `string` yang bikin tidak assignable
// ke prop `KeyBinding[]` (Textarea.d.ts:22).
export const PROMPT_KEY_BINDINGS: KeyBinding[] = Object.freeze([
  { name: 'return', shift: true, action: 'newline' },
  { name: 'linefeed', shift: true, action: 'newline' },
  { name: 'return', ctrl: true, action: 'newline' },
  { name: 'linefeed', ctrl: true, action: 'newline' },
  { name: 'return', meta: true, action: 'newline' },
  { name: 'linefeed', meta: true, action: 'newline' },
  { name: 'j', ctrl: true, action: 'newline' },
]) as KeyBinding[]

// Pewarnaan pesan scrollbox per role (single source; App presentational).
// Semantik opencode messages: user = accent/primary, teks asisten = text
// (netral), meta/tool = textMuted, error = error.
export function messageColor(role: string = ''): string {
  switch (String(role)) {
    case 'user': return ABELINK_THEME.accent
    case 'error': return ABELINK_THEME.error
    case 'shell':
    case 'meta': return ABELINK_THEME.textMuted
    case 'info': return ABELINK_THEME.info
    default: return ABELINK_THEME.text
  }
}

// Prefix baris pesan (opencode memakai penanda minimal, bukan ikon dekoratif).
export function messagePrefix(role: string = ''): string {
  switch (String(role)) {
    case 'user': return '> '
    case 'shell': return '! '
    case 'error': return '× '
    case 'meta': return '— '
    case 'info': return '· '
    default: return '◆ '
  }
}

// Warna teks di atas highlight primary (cermin opencode
// `selectedForeground`: background opak -> pakai background).
export function selectedForeground(): string {
  return ABELINK_THEME.background
}

// Tinggi popup autocomplete (cermin opencode autocomplete.tsx:712-717):
// min(10, jumlah, ruang di atas prompt). Minimal 1 (empty-state).
export function popupHeight(count: number = 0, spaceAbove: number = 10): number {
  return Math.min(
    AUTOCOMPLETE_MAX_ROWS,
    Math.max(1, Math.floor(Number(count) || 0) || 1),
    Math.max(1, Math.floor(Number(spaceAbove) || 0)),
  )
}

export interface DialogFooterInput {
  loading?: boolean
  rowCount?: number
  hint?: string | null
  total?: number | null
  stale?: boolean
  error?: string | null
}

// Footer dialog tengah, cermin format picker bawah (App.tsx): hint +
// `(N baris [dari TOTAL model][, katalog stale])`, error SELALU tampil
// (bukan hanya saat kosong — bug stale/total tertelan).
export function dialogFooterText(inp: DialogFooterInput = {}): string {
  if (inp.loading) return 'memuat…'
  const n = Math.max(0, Math.floor(Number(inp.rowCount) || 0))
  if (n > 0) {
    const base =
      `${inp.hint ?? '↑↓ pilih · Enter pakai · Esc batal · ketik untuk filter'}` +
      ` (${n} baris${inp.total ? ` dari ${inp.total} model` : ''}${inp.stale ? ', katalog stale' : ''})`
    return inp.error ? `${base} · ${inp.error}` : base
  }
  return `Tidak ada yang cocok. Esc untuk batal.${inp.error ? ` (${inp.error})` : ''}`
}

// Cap baris popup autocomplete (ikut opencode height max 10).
export const AUTOCOMPLETE_MAX_ROWS = 10

// Dialog tengah (slice 3, pola opencode ui/dialog.tsx + dialog-select.tsx):
// backdrop dim fullscreen (RGBA 0,0,0,150), panel tengah lebar 60,
// zIndex 3000 di atas picker bawah (100) dan popup (100).
export const DIALOG_PANEL_WIDTH = 60
export const DIALOG_Z_INDEX = 3000

/** Kind picker yang render di dialog tengah (bukan picker bawah). */
export const DIALOG_KINDS: readonly string[] = Object.freeze(['model', 'commands', 'sessions', 'effort'])

/** True bila kind picker dibuka sebagai dialog tengah. */
export function isDialogKind(kind: string = ''): boolean {
  return DIALOG_KINDS.includes(String(kind ?? ''))
}

/** Baris terlihat di dialog: min(rows, floor(height/2)-6), minimal 1. */
export function dialogVisibleRows(rowCount: number = 0, termHeight: number = 24): number {
  const cap = Math.max(1, Math.floor((Number(termHeight) || 0) / 2) - 6)
  return Math.min(Math.max(0, Math.floor(Number(rowCount) || 0)), cap)
}

// Subsequence case-insensitive (fuzzy minimal): cukup untuk typo ringan
// (`/mdl` -> /model) tanpa membawa skor/bobot yang butuh tuning.
function subsequenceMatch(hay: string = '', needle: string = ''): boolean {
  const h = String(hay)
  const n = String(needle)
  let j = 0
  for (let i = 0; i < h.length && j < n.length; i++) {
    if (h[i] === n[j]) j++
  }
  return j === n.length
}

// Filter autocomplete murni + testable: prefix match atas nama slash,
// ditambah fuzzy subsequence atas nama + deskripsi untuk query >= 2 huruf
// (satu huruf prefix-only: minim noise, pertahankan kontrak lama /m, /x).
// Hasil di-cap AUTOCOMPLETE_MAX_ROWS; baris tanpa leading `/` -> [].
/** Item autocomplete dari baris yang diawali '/'. */
export function filterCompletions(line: string = ''): TuiCommand[] {
  const text = String(line ?? '')
  if (!text.startsWith('/')) return []
  const q = text.slice(1).toLowerCase()
  if (!q) return TUI_COMMANDS.slice(0, AUTOCOMPLETE_MAX_ROWS)
  const isPrefix = (c: TuiCommand) => c.name.slice(1).toLowerCase().startsWith(q)
  const prefix = TUI_COMMANDS.filter(isPrefix)
  if (q.length < 2) return prefix.slice(0, AUTOCOMPLETE_MAX_ROWS)
  const fuzzy = TUI_COMMANDS.filter(
    (c) => !isPrefix(c) && subsequenceMatch(`${c.name} ${c.desc}`.toLowerCase(), q),
  )
  return [...prefix, ...fuzzy].slice(0, AUTOCOMPLETE_MAX_ROWS)
}

export interface AutocompleteTrigger {
  mode: 'slash' | 'file'
  query: string
}

// Trigger autocomplete ala opencode prompt/display.ts mentionTriggerIndex:
// `@` setelah awal/spasi tanpa spasi setelahnya -> mode file; baris mulai
// `/` tanpa spasi -> mode slash.
/** Deteksi pemicu autocomplete ('/' slash atau '@' file) di baris terakhir. */
export function autocompleteTrigger(text: string = ''): AutocompleteTrigger | null {
  const t = String(text ?? '')
  const slashMatch = /^\/(\S*)$/.exec(t.split('\n').pop() ?? '')
  if (slashMatch) return { mode: 'slash', query: slashMatch[1] }
  const atIdx = t.lastIndexOf('@')
  if (atIdx >= 0) {
    const before = atIdx === 0 ? '' : t[atIdx - 1]
    const query = t.slice(atIdx + 1)
    if ((before === '' || /\s/.test(before)) && !/\s/.test(query)) {
      return { mode: 'file', query }
    }
  }
  return null
}

// Terapkan pilihan autocomplete ke teks: ganti token trigger dengan value.
// Return teks baru (atau teks asal bila trigger hilang).
/** Terapkan item autocomplete ke teks. */
export function applyCompletion(text: string = '', trigger: AutocompleteTrigger | null = null, value: string = ''): string {
  if (!trigger) return String(text ?? '')
  const t = String(text ?? '')
  if (trigger.mode === 'slash') {
    const lines = t.split('\n')
    lines[lines.length - 1] = String(value ?? '')
    return lines.join('\n')
  }
  const atIdx = t.lastIndexOf('@')
  if (atIdx < 0) return t
  return t.slice(0, atIdx) + String(value ?? '') + ' '
}

// Navigasi index sirkular (Up/Down ala opencode prompt.autocomplete).
/** Indeks terpilih setelah navigasi (melingkar). */
export function moveCompletionIndex(current: number = 0, delta: number = 1, count: number = 0): number {
  if (!Number.isFinite(count) || count <= 0) return 0
  return (((current + delta) % count) + count) % count
}

// Layar awal tengah (slice 4, pola opencode routes/home.tsx): kolom tengah
// logo Abelink + shortcut + footer, max-width prompt 75 (atau 70% lebar
// bila "auto"). Placeholder rotasi: opencode memutarnya di dalam Prompt;
// PromptRow kita terima string tunggal, jadi rotasi didorong App via interval.
export const HOME_PLACEHOLDERS: readonly string[] = Object.freeze([
  'Tanya apa saja, atau / untuk perintah...',
  'Cari TODO di codebase dan perbaiki satu',
  'Ringkas sesi terakhir jadi poin aksi',
  '/sessions lanjut sesi lama · /models ganti model',
])

/** Placeholder ke-`index` (melingkar, aman untuk negatif/NaN). */
export function homePlaceholder(index: number = 0): string {
  const n = HOME_PLACEHOLDERS.length
  if (!n) return ''
  const i = ((Math.floor(Number(index) || 0) % n) + n) % n
  return HOME_PLACEHOLDERS[i]
}

/** Lebar maks kolom tengah: configured ?? 75; "auto" = max(75, 70% lebar). */
export function homePromptMaxWidth(termWidth: number = 80, configured?: number | 'auto' | null): number {
  if (configured === 'auto') return Math.max(75, Math.floor((Number(termWidth) || 0) * 0.7))
  const c = Math.floor(Number(configured) || 0)
  return c > 0 ? c : 75
}

export interface VisibleWindow {
  start: number
  end: number
}

// Jendela baris picker (murni + testable): pilihan selalu terlihat dan
// daftar panjang (katalog 1200+ ID) tetap muat di layar.
export function visibleWindow(index: number = 0, total: number = 0, size: number = 12): VisibleWindow {
  const n = Math.max(0, Math.floor(Number(total) || 0))
  const s = Math.max(1, Math.floor(Number(size) || 1))
  if (n <= s) return { start: 0, end: n }
  const i = Math.min(Math.max(0, Math.floor(Number(index) || 0)), n - 1)
  const start = Math.min(Math.max(0, i - Math.floor(s / 2)), n - s)
  return { start, end: start + s }
}
