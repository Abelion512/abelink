// cli/core/parser.mjs — parsing input TUI: slash, shell, effort, flag CLI.
// Dipindah dari bin/abelink-tui.mjs (M2b/B-9). Semua fungsi murni + testable.
import path from 'node:path'
import {
  DEFAULT_TUI_MODEL,
  EFFORT_LEVELS,
  TUI_HELP,
  TUI_STREAM_ENABLED,
  TUI_VERSION
} from './constants.mjs'

export function buildAiFetchBody({ messages, config, isSmallTask = false, jsonSchema = null } = {}) {
  const body = { messages, config, isSmallTask: Boolean(isSmallTask), jsonSchema: jsonSchema || null }
  if (TUI_STREAM_ENABLED) body.stream = true
  return body
}

// Slash parser: lines starting with ^/ never reach the model as prompt.
// Alias mengikuti opencode: /quit /q, /clear, /resume, /summarize.
export function parseSlashCommand(line = '') {
  const raw = String(line ?? '')
  const trimmed = raw.trim()
  if (!trimmed.startsWith('/')) return { kind: 'prompt', text: raw }
  const [head, ...rest] = trimmed.slice(1).split(/\s+/)
  const name = String(head || '').toLowerCase()
  const arg = rest.join(' ').trim()
  switch (name) {
    case 'model': return { kind: 'model', arg: arg || null }
    case 'models': return { kind: 'models', arg: arg || null }
    case 'effort': return { kind: 'effort', arg: arg || null }
    case 'sessions':
    case 'resume': return { kind: 'sessions', arg: arg || null }
    case 'commands': return { kind: 'commands', arg: arg || null }
    case 'continue': return { kind: 'continue', arg: arg || null }
    case 'new':
    case 'clear': return { kind: 'new', arg: null }
    case 'compact':
    case 'summarize': return { kind: 'compact', arg: null }
    case 'thinking': return { kind: 'thinking', arg: null }
    case 'details': return { kind: 'details', arg: null }
    case 'editor': return { kind: 'editor', arg: null }
    case 'init': return { kind: 'init', arg: arg || null }
    case 'help': return { kind: 'help', arg: null }
    case 'exit':
    case 'quit':
    case 'q': return { kind: 'exit', arg: null }
    case 'undo': return { kind: 'unsupported', name, reason: '/undo ditunda: tanpa primitif undo di engine.' }
    default: return { kind: 'unknown', name, arg: arg || null }
  }
}

// Alias resolve: MODEL_ALIASES shape from headlessCli.js; unknown id passes through.
export function resolveTuiModel(input, aliases = {}) {
  const raw = String(input ?? '').trim()
  if (!raw) return { ok: false, error: 'Pakai: /model [alias|id].' }
  const table = aliases && typeof aliases === 'object' ? aliases : {}
  const id = table[raw] || raw
  return { ok: true, model: id, alias: table[raw] ? raw : null }
}

export function parseEffortLevel(input) {
  const v = String(input ?? '').trim().toLowerCase()
  if (EFFORT_LEVELS.includes(v)) return { ok: true, effort: v }
  return { ok: false, error: `Effort harus salah satu: ${EFFORT_LEVELS.join(' | ')}.` }
}

// !shell mode (ala opencode): `!perintah` jalan lokal tanpa model turn,
// output TIDAK masuk histori (konteks bersih). Pure parser + testable.
export function parseShellLine(line = '') {
  const trimmed = String(line ?? '').trim()
  if (!trimmed.startsWith('!') || trimmed === '!') return null
  return trimmed.slice(1).trim()
}

export function parseTuiArgs(argv) {
  const args = argv.slice(2)
  const options = {
    provider: 'custom',
    model: DEFAULT_TUI_MODEL,
    effort: 'low',
    maxTurns: 15,
    workspace: process.cwd(),
    // true hanya bila user set flag eksplisit: supaya config GUI (shared.json)
    // diadopsi saat flag absen, tapi flag eksplisit tetap menang.
    providerExplicit: false,
    modelExplicit: false,
    effortExplicit: false
  }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--provider') { options.provider = args[++i]; options.providerExplicit = true }
    else if (arg === '--model' || arg === '-m') { options.model = args[++i]; options.modelExplicit = true }
    else if (arg === '--effort') { options.effort = args[++i]; options.effortExplicit = true }
    else if (arg === '--max-turns') options.maxTurns = Math.max(1, parseInt(args[++i], 10) || 15)
    else if (arg === '--workspace') options.workspace = path.resolve(args[++i])
    else if (arg === '-h' || arg === '--help') {
      console.log(`abelink-tui v${TUI_VERSION} — sesi interaktif.\n\nFlags: --provider --model/-m --effort --max-turns --workspace\n${TUI_HELP}`)
      process.exit(0)
    } else {
      console.error(`[ERROR]: Flag tidak dikenal "${arg}".`)
      process.exit(3)
    }
  }
  return options
}
