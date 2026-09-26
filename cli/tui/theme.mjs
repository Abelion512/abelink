/** @jsxImportSource @opentui/solid */
// cli/tui/theme.mjs — TUI-V2-1: token tema tunggal, dipetik dari tema DaisyUI
// `abelink` (src/assets/main.css). Satu sumber: ubah di sini, seluruh TUI ikut.
// Token mengikuti SEMANTIK opencode theme (`background`/`backgroundPanel`/
// `backgroundElement`/`text`/`textMuted`/`border*`) supaya komponen bisa
// dipetakan 1:1 dari theme/index.ts opencode, sambil mempertahankan nama
// warisan (base100/base200/baseContent/muted) yang sudah dipakai test + komponen.
export const ABELINK_THEME = Object.freeze({
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
})

export const TUI_COMMANDS = Object.freeze([
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
])

// Label model ala opencode: nama pendek (setelah / terakhir) + effort.
export function shortModel(id = '') {
  const s = String(id ?? '')
  const slash = s.lastIndexOf('/')
  return slash >= 0 ? s.slice(slash + 1) : s
}

// Konstanta layout ikut opencode routes/session (index.tsx:270-278,
// sidebar.tsx:28-36): sidebar 42 kolom, tampil bila lebar > 120.
export const SIDEBAR_WIDTH = 42
export const WIDE_THRESHOLD = 120

export function isWide(width = 80) {
  return Number(width) > WIDE_THRESHOLD
}

// Key bindings prompt: Shift+Enter & kawan = newline (Enter ditangani
// manual di onKeyDown PromptRow: submit bila popup tutup, pilih bila buka).
// Pola opencode keybind.ts input_newline. `linefeed` WAJIB: TTY asli kirim
// LF untuk Enter (terverifikasi script/tty, 2026-09-25).
// Alasan Enter tak di sini: preventDefault di onKeyDown menekan action
// binding, tapi action binding jalan SEBELUM onKeyDown konsumen sehingga
// Enter-submit via binding tak bisa dibatalkan saat popup terbuka.
export const PROMPT_KEY_BINDINGS = Object.freeze([
  { name: 'return', shift: true, action: 'newline' },
  { name: 'linefeed', shift: true, action: 'newline' },
  { name: 'return', ctrl: true, action: 'newline' },
  { name: 'linefeed', ctrl: true, action: 'newline' },
  { name: 'return', meta: true, action: 'newline' },
  { name: 'linefeed', meta: true, action: 'newline' },
  { name: 'j', ctrl: true, action: 'newline' },
])

// Pewarnaan pesan scrollbox per role (single source; App presentational).
// Semantik opencode messages: user = accent/primary, teks asisten = text
// (netral), meta/tool = textMuted, error = error.
export function messageColor(role = '') {
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
export function messagePrefix(role = '') {
  switch (String(role)) {
    case 'user': return '> '
    case 'shell': return '! '
    case 'error': return '× '
    case 'meta': return '— '
    case 'info': return '· '
    default: return '◆ '
  }
}

// Filter autocomplete murni + testable: prefix match case-insensitive atas
// nama slash; baris tanpa leading `/` tidak memicu saran (return []).
export function filterCompletions(line = '') {
  const text = String(line ?? '')
  if (!text.startsWith('/')) return []
  const q = text.slice(1).toLowerCase()
  return TUI_COMMANDS.filter((c) => c.name.slice(1).toLowerCase().startsWith(q))
}

// Trigger autocomplete ala opencode prompt/display.ts mentionTriggerIndex:
// `@` setelah awal/spasi tanpa spasi setelahnya -> mode file; baris mulai
// `/` tanpa spasi -> mode slash. Return { mode:'slash'|'file', query } | null.
export function autocompleteTrigger(text = '') {
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
export function applyCompletion(text = '', trigger = null, value = '') {
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
export function moveCompletionIndex(current = 0, delta = 1, count = 0) {
  if (!Number.isFinite(count) || count <= 0) return 0
  return (((current + delta) % count) + count) % count
}

// Jendela baris picker (murni + testable): pilihan selalu terlihat dan
// daftar panjang (katalog 1200+ ID) tetap muat di layar.
export function visibleWindow(index = 0, total = 0, size = 12) {
  const n = Math.max(0, Math.floor(Number(total) || 0))
  const s = Math.max(1, Math.floor(Number(size) || 1))
  if (n <= s) return { start: 0, end: n }
  const i = Math.min(Math.max(0, Math.floor(Number(index) || 0)), n - 1)
  const start = Math.min(Math.max(0, i - Math.floor(s / 2)), n - s)
  return { start, end: start + s }
}
