#!/usr/bin/env bun
// bin/abelink.mjs — Abelink CLI binary entry point.
// Subcommands:
//   abelink agent run "<prompt>" [flags]
//
// Flags:
//   --provider <provider>     AI provider (custom, groq, lm-studio, gemini-web). Default: custom
//   --model <model>           Model identifier (default: oc/muse-spark-1.3-contributor-free, alias 9Router)
//   --model-version <version> Model version / release tag
//   --effort <effort>         Effort level: low | medium | high | xhigh | max | ultra (default: low)
//   --max-turns <n>           Maximum ReAct loop turns (budget)
//   --workspace <dir>         Active workspace root directory (default: cwd)
//   --approve-all             Eksplisit auto (default sudah auto; flag ini compat)
//   --deny-all                Mode dont-ask: butuh prompt = deny (untuk CI)
//   --permission-mode <mode>  auto (default) | manual | dont-ask
//   --json                    Output machine-readable JSON result
//   --trace                   Include execution trace in output
//   --help, -h                Show usage information
//   --version, -v             Show CLI version

import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import 'fake-indexeddb/auto'

// M2c (PLAN-T1 + H5): audit harness headless + tool hooks. Impor statis dari
// cli/core (barrel) — tanpa dependensi baru, flag ABELINK_TRAJECTORY_HEADLESS=1.
import {
  createHarnessWriter,
  createHeadlessHarnessLogger,
  createToolAuditLogger,
  executeToolWithHooks,
  trajectoryHeadlessEnabled
} from '../cli/core/index.mjs'

const { runAgentLoop } = await import('../src/api/ai/agentRunner.js')
const { evaluateHeadlessSecurity } = await import('../src/api/ai/headlessSecurity.js')
const { NATIVE_TOOLS } = await import('../sidecar/main/node-tools.js')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SIDECAR_ENTRY = path.join(ROOT, 'sidecar', 'engine.mjs')
const BUN_BIN = process.env.BUN_BIN || 'bun'

// Versi TIDAK hardcoded: dibaca dari package.json, yang di-sync dari
// src-tauri/tauri.conf.json oleh scripts/sync-version.mjs. Bump alpha-6
// otomatis ikut tanpa mengedit file ini (satu sumber kebenaran versi).
const VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || 'dev'
  } catch {
    return 'dev'
  }
})()

function printHelp() {
  console.log(`
Abelink CLI — Autonomous AI OS Companion (Linux)

Usage:
  abelink                             # TUI interaktif (bila TTY; ala opencode)
  abelink "<prompt>" [flags]            # singkat: prompt langsung
  abelink agent run "<prompt>" [flags]  # bentuk panjang (sama saja)
  abelink setup                         # wizard: tulis ~/.config/abelink/cli.json
  abelink models [filter]               # daftar model frontier + alias
  abelink sessions                      # daftar sesi CLI tersimpan (resume headless)
  abelink "lanjutkan" --continue        # resume sesi terakhir workspace ini
  abelink --session <id> "prompt..."    # resume sesi spesifik (prompt opsional)

Flags:
  --provider <name>       AI provider (custom | groq | lm-studio | gemini-web) [default: custom]
  --model <id>            Model: nama pendek (zen, qwen, mimo, nara, xkiro, free) atau ID penuh [default: oc/muse-spark-1.3-contributor-free]
  -m <id>                 Singkatan --model
  --api-key <key>         API key (default: ABELINK_API_KEY/CUSTOM_API_KEY env, cli.json, atau DB 9Router)
  --model-version <ver>   Model version string
  --effort <level>        Reasoning effort: low | medium | high | xhigh | max | ultra [default: low]
  --max-turns <n>         Maximum turns before terminating [default: 15]
  --workspace <path>      Workspace directory boundary [default: current directory]
  --permission-mode <mode> auto (default) | manual | dont-ask — manual = fail-closed butuh --approve-all per aksi
  --approve-all           Eksplisit auto (compat; default sudah auto)
  --deny-all              Sama dengan dont-ask (untuk CI)
  --session/-s <id>       Resume sesi spesifik (prompt opsional saat resume)
  --continue/-c           Resume sesi terakhir untuk workspace ini
  --json                  Output raw structured JSON
  --trace                 Include step-by-step decision/tool trace
  -h, --help              Show this help message
  -v, --version           Show version

Exit Codes:
  0  Task completed successfully and verified
  1  Task failed, was blocked, or step budget was exhausted
  2  Action rejected by security boundary (policy-denied / fail-closed)
  3  Command line usage error or invalid arguments
`)
}

// Bare `abelink` tanpa arg: TUI interaktif bila TTY (ala opencode),
// help bila pipe/non-TTY. Pure (stdin/stdout di-inject) agar testable.
export function resolveNoArgsCommand({ stdinTTY = false, stdoutTTY = false } = {}) {
  return stdinTTY && stdoutTTY ? 'tui' : 'help'
}

export function parseCliArgs(argv) {
  const args = argv.slice(2)
  // Bare `abelink` (tanpa arg): launch TUI interaktif bila TTY (ala opencode),
  // print help bila pipe/non-TTY (skrip aman, bukan hang nunggu stdin).
  if (args.length === 0) {
    if (resolveNoArgsCommand({ stdinTTY: process.stdin?.isTTY, stdoutTTY: process.stdout?.isTTY }) === 'tui') {
      return { command: 'tui', prompt: null }
    }
    printHelp()
    process.exit(3)
  }
  if (args[0] === '-h' || args[0] === '--help') {
    printHelp()
    process.exit(0)
  }

  if (args[0] === '-v' || args[0] === '--version') {
    console.log(`abelink v${VERSION}`)
    process.exit(0)
  }

  // Detect explicit illegal bypass flags
  const forbiddenFlags = ['--yolo', '--unsafe', '--bypass-security', '--no-sandbox', '--allow-all']
  for (const flag of forbiddenFlags) {
    if (args.includes(flag)) {
      console.error(`[ERROR]: Flag keamanan terlarang "${flag}". Abelink menolak bypass keamanan di mode headless.`)
      process.exit(3)
    }
  }

  // Subcommand ringan (tanpa prompt): setup + models + sessions.
  if (args[0] === 'setup') {
    return { command: 'setup', prompt: null }
  }
  if (args[0] === 'models') {
    return { command: 'models', prompt: null, filter: args[1] && !args[1].startsWith('-') ? args[1] : null }
  }
  if (args[0] === 'sessions') {
    return { command: 'sessions', prompt: null }
  }

  // Bentuk panjang: abelink agent run "<prompt>".
  // Bentuk singkat: abelink "<prompt>" (arg pertama bukan flag/subcommand).
  let promptArg = null
  let flagStart = 0
  if (args[0] !== 'agent' || args[1] !== 'run') {
    if (args[0] === 'agent' && args[1] !== 'run') {
      console.error(`[ERROR]: Subcommand tidak dikenal. Gunakan: abelink "<prompt>" [flags]`)
      process.exit(3)
    }
    if (String(args[0] || '').startsWith('-')) {
      // Tanpa prompt posisi-0: hanya flag resume yang boleh (-c/-s).
      // Selain itu tetap error (perilaku lama dipertahankan).
      if (!['--continue', '-c', '--session', '-s'].includes(args[0])) {
        console.error(`[ERROR]: Subcommand tidak dikenal. Gunakan: abelink "<prompt>" [flags]`)
        process.exit(3)
      }
      promptArg = null
      flagStart = 0
    } else {
      promptArg = args[0]
      flagStart = 1
    }
  } else {
    promptArg = args[2]
    flagStart = 3
    // Prompt opsional saat resume: `agent run --session <id>` (tanpa prompt).
    if (promptArg && promptArg.startsWith('-')) {
      promptArg = null
      flagStart = 2
    }
  }

  const options = {
    command: 'run',
    prompt: promptArg,
    // Headless default = custom (9Router/LM Studio di localhost:20128).
    // gemini-web butuh sesi browser Google (hanya GUI) -> gagal 100% headless.
    provider: 'custom',
    model: 'oc/muse-spark-1.3-contributor-free',
    // Ditandai true HANYA bila user menyetel flag eksplisit. Dipakai agar
    // config GUI (shared.json) / cli.json bisa diadopsi saat flag tidak diberi
    // (satu sumber setting), tapi flag eksplisit selalu menang.
    providerExplicit: false,
    modelExplicit: false,
    modelVersion: null,
    apiKey: null,
    effort: 'low',
    maxTurns: null,
    maxTurnsExplicit: false,
    workspace: process.cwd(),
    json: false,
    trace: false,
    approveAll: false,
    denyAll: false,
    session: null,
    continueLatest: false,
    // auto (default) | manual | dont-ask. manual = fail-closed klasik
    // (butuh --approve-all per aksi); dont-ask = deny untuk CI.
    permissionMode: 'auto'
  }

  for (let i = flagStart; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--provider') {
      options.provider = args[++i]
      options.providerExplicit = true
    } else if (arg === '--model' || arg === '-m') {
      options.model = args[++i]
      options.modelExplicit = true
    } else if (arg === '--model-version') {
      options.modelVersion = args[++i]
    } else if (arg === '--api-key') {
      options.apiKey = args[++i]
    } else if (arg === '--effort') {
      options.effort = args[++i]
    } else if (arg === '--max-turns') {
      const turns = parseInt(args[++i], 10)
      if (Number.isNaN(turns) || turns <= 0) {
        console.error('[ERROR]: --max-turns harus berupa integer positif.')
        process.exit(3)
      }
      options.maxTurns = turns
      options.maxTurnsExplicit = true
    } else if (arg === '--workspace') {
      options.workspace = path.resolve(args[++i])
    } else if (arg === '--json') {
      options.json = true
    } else if (arg === '--trace') {
      options.trace = true
    } else if (arg === '--approve-all') {
      options.approveAll = true
    } else if (arg === '--session' || arg === '-s') {
      options.session = args[++i]
      if (!options.session || options.session.startsWith('-')) {
        console.error('[ERROR]: --session butuh <id>.')
        process.exit(3)
      }
    } else if (arg === '--continue' || arg === '-c') {
      options.continueLatest = true
    } else if (arg === '--deny-all') {
      options.denyAll = true
      options.permissionMode = 'dont-ask'
    } else if (arg === '--permission-mode') {
      const mode = String(args[++i] || '').toLowerCase()
      if (!['auto', 'manual', 'dont-ask'].includes(mode)) {
        console.error('[ERROR]: --permission-mode harus auto|manual|dont-ask.')
        process.exit(3)
      }
      options.permissionMode = mode
      if (mode === 'dont-ask') options.denyAll = true
    } else if (arg === '-h' || arg === '--help') {
      printHelp()
      process.exit(0)
    } else if (!arg.startsWith('-') && (options.session || options.continueLatest) && !options.prompt) {
      // Prompt trailing saat resume: `abelink --session <id> "lanjutkan X"`.
      options.prompt = arg
    } else {
      console.error(`[ERROR]: Flag tidak dikenal "${arg}".`)
      process.exit(3)
    }
  }

  if (options.command === 'run' && !options.prompt && !options.session && !options.continueLatest) {
    console.error('[ERROR]: Argumen prompt wajib disediakan (atau resume via --session/-s atau --continue/-c).')
    process.exit(3)
  }

  return options
}

/**
 * Start isolated sidecar engine process for AI fetch and native tool execution.
 */
export function createSidecarClient() {
  const child = spawn(BUN_BIN, [SIDECAR_ENTRY], {
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env }
  })

  let reqIdCounter = 1
  const pending = new Map()
  let buf = ''

  child.stdout.on('data', (chunk) => {
    buf += chunk.toString()
    let idx
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line) continue
      try {
        const msg = JSON.parse(line)
        if (msg && msg.id != null && pending.has(msg.id)) {
          const p = pending.get(msg.id)
          pending.delete(msg.id)
          clearTimeout(p.timer)
          p.resolve(msg)
        }
      } catch {}
    }
  })

  child.stderr.on('data', (chunk) => {
    if (process.env.ABELINK_DEBUG_SIDECAR) {
      process.stderr.write(`[sidecar:err] ${chunk.toString()}`)
    }
  })

  const rpc = (action, payload) =>
    new Promise((resolve, reject) => {
      const id = reqIdCounter++
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`Sidecar RPC timeout (action=${action}, id=${id})`))
      }, 120000)
      pending.set(id, { resolve, reject, timer })
      child.stdin.write(JSON.stringify({ id, action, payload }) + '\n')
    })

  const dispose = () => {
    for (const [, p] of pending) {
      clearTimeout(p.timer)
      p.reject(new Error('Sidecar process terminated.'))
    }
    pending.clear()
    try {
      child.stdin.end()
    } catch {}
    child.kill('SIGTERM')
  }

  child.once('error', (err) => {
    for (const [, p] of pending) p.reject(err)
  })

  return { rpc, dispose }
}

async function main() {
  const cliOptions = parseCliArgs(process.argv)
  // ponytail: auto-mkdir workspace; cermin TUI — dir hilang = tool cwd gagal.
  try { fs.mkdirSync(cliOptions.workspace, { recursive: true }) } catch {}

  // Stream 3: headless helpers (pure module; engine stays untouched).
  const headless = await import('../src/api/ai/headlessCli.js').catch(() => ({}))
  const {
    resolveApprovalDecision = null,
    loadCliFileConfig = null,
    resolveCliAuth = null,
    loadNineRouterKey = null,
    loadHeadlessMemories = null,
    runHeadlessSubagent = null,
    loadCliSession = null,
    saveCliSession = null,
    listCliSessions = null,
    newCliSessionId = null,
    MODEL_ALIASES = null,
    DEFAULT_CLI_MODEL = null,
    isForbiddenModel = null,
    forbiddenModelError = null
  } = headless

  // Subcommand ringan: tanpa sidecar, tanpa LLM.
  // `tui`: exec ke host interaktif v2 OpenTUI (proses diganti; sinyal/TTY utuh).
  // Fallback v1 readline bila v2 exit non-nol (mis. TTY tak didukung).
  if (cliOptions.command === 'tui') {
    const { spawnSync } = await import('node:child_process')
    const v2 = spawnSync(BUN_BIN, [path.join(ROOT, 'bin', 'abelink-tui-v2.tsx'), ...process.argv.slice(2)], { stdio: 'inherit' })
    if ((v2.status ?? 0) === 0) process.exit(0)
    console.error(`[TUI] v2 keluar kode ${v2.status ?? '?'} — fallback ke v1 readline.`)
    const r = spawnSync(BUN_BIN, [path.join(ROOT, 'bin', 'abelink-tui.mjs'), ...process.argv.slice(2)], { stdio: 'inherit' })
    process.exit(r.status ?? 0)
  }

  // Subcommand ringan: tanpa sidecar, tanpa LLM.
  // Fase 1: `sessions` daftar sesi CLI tersimpan (newest first).
  if (cliOptions.command === 'sessions') {
    const sessions = typeof listCliSessions === 'function' ? listCliSessions() : []
    if (!sessions.length) {
      console.log('Belum ada sesi CLI tersimpan.')
      process.exit(0)
    }
    for (const s of sessions) {
      console.log(`${s.id}  [${s.outcome || '?'}]  ${s.updatedAt || ''}  ${(s.prompt || '').slice(0, 80)}`)
    }
    process.exit(0)
  }

  // Subcommand ringan: tanpa sidecar, tanpa LLM.
  if (cliOptions.command === 'models') {
    const aliases = MODEL_ALIASES || {}
    const q = String(cliOptions.filter || '').toLowerCase()
    const rows = Object.entries(aliases).filter(([k]) => !q || k.includes(q))
    console.log(`Model default: ${DEFAULT_CLI_MODEL || 'oc/muse-spark-1.3-contributor-free'}\n`)
    console.log('Alias                  -> ID penuh')
    for (const [k, v] of rows) console.log(`${k.padEnd(22)} -> ${v}`)
    console.log('\nPakai: abelink "prompt..." -m <alias|ID>')
    process.exit(0)
  }
  if (cliOptions.command === 'setup') {
    const { writeCliSetup = null } = headless
    if (typeof writeCliSetup !== 'function') {
      console.error('[ERROR]: setup helper tidak tersedia.')
      process.exit(3)
    }
    const res = await writeCliSetup({ argv: process.argv.slice(2) })
    console.log(res.message)
    process.exit(res.ok ? 0 : 1)
  }

  // Fase 1 resume (opencode run -c/-s semantics, file store ganti SQLite):
  // --session/-s <id> spesifik; --continue/-c = sesi terakhir workspace ini.
  // Prompt opsional saat resume (tanpa prompt = lanjutkan sesi apa adanya).
  // Tanpa helper store -> resume gagal jujur exit 1 (bukan silent fresh).
  let resumeSession = null
  let sessionId = typeof newCliSessionId === 'function' ? newCliSessionId() : `cli-${Date.now()}`
  if (cliOptions.command === 'run' && (cliOptions.session || cliOptions.continueLatest)) {
    if (typeof loadCliSession !== 'function' || typeof listCliSessions !== 'function') {
      console.error('[ERROR]: Resume sesi tidak tersedia (helper store hilang).')
      process.exit(1)
    }
    if (cliOptions.session) {
      resumeSession = loadCliSession(cliOptions.session)
      if (!resumeSession) {
        console.error(`[ERROR]: Sesi "${cliOptions.session}" tidak ditemukan. Lihat: abelink sessions`)
        process.exit(1)
      }
    } else {
      const all = listCliSessions().filter((s) => !s.workspace || s.workspace === cliOptions.workspace)
      resumeSession = all[0] || null
      if (!resumeSession) {
        console.error('[ERROR]: Belum ada sesi CLI untuk workspace ini. Jalankan prompt baru dulu.')
        process.exit(1)
      }
    }
    sessionId = resumeSession.id
    if (!cliOptions.prompt && !(resumeSession.messages || []).length && !resumeSession.prompt) {
      console.error('[ERROR]: Sesi resume kosong dan tanpa prompt baru — tidak ada yang dijalankan.')
      process.exit(3)
    }
  }

  const sidecar = createSidecarClient()

  // PLAN-T1 (M2c): audit harness headless (flag-gated ABELINK_TRAJECTORY_HEADLESS=1).
  // Patch sesi lewat store Fase-1 yang sama — harness:diagnose --session <id>
  // dan /usage menemukan jejak sesi CLI ini (akar masalah: sesi TUI/CLI lama
  // tidak pernah menulis harness, /usage selalu kosong).
  let harnessAudit = null
  if (trajectoryHeadlessEnabled()) {
    const harnessWriter = createHarnessWriter({ fsMod: fs })
    const harnessLogger = createHeadlessHarnessLogger({ writer: harnessWriter, sessionId })
    harnessAudit = createToolAuditLogger({
      logger: harnessLogger,
      sessionId,
      deps: {
        loadFn: async (id) => (typeof loadCliSession === 'function' ? loadCliSession(id) : null),
        saveFn: async (s) => { if (typeof saveCliSession === 'function') saveCliSession(s) }
      }
    })
  }
  const hooks = { onBeforeTool: null, onAfterTool: null, audit: harnessAudit }

  // Auth fallback chain: flags > env > config file > default.
  let fileConfig = {}
  try {
    if (typeof loadCliFileConfig === 'function') {
      fileConfig = loadCliFileConfig({ cwd: cliOptions.workspace }) || {}
    }
  } catch { fileConfig = {} }
  const auth = typeof resolveCliAuth === 'function'
    ? resolveCliAuth({
      flags: {
        // Hanya kirim provider/model bila user set flag eksplisit; selain itu
        // biarkan GUI/cli.json/default menentukan (tanpa override palsu).
        provider: cliOptions.providerExplicit ? cliOptions.provider : null,
        model: cliOptions.modelExplicit ? cliOptions.model : null,
        modelVersion: cliOptions.modelVersion,
        apiKey: cliOptions.apiKey || null
      },
      env: process.env,
      fileConfig
    })
    : { provider: cliOptions.provider, model: cliOptions.model, modelVersion: cliOptions.modelVersion, apiKey: cliOptions.apiKey || null }
  // Key terakhir: DB lokal 9Router (best-effort). Tanpa key apa pun, CLI
  // gagal jujur dengan pesan missing-key (bukan "nyalakan aplikasinya").
  if (!auth.apiKey && typeof loadNineRouterKey === 'function') {
    try {
      auth.apiKey = await loadNineRouterKey()
    } catch {}
  }

  // Keputusan owner: ID terlarang ditolak di entry, bukan diam-diam dipakai.
  const banned = typeof isForbiddenModel === 'function'
    ? isForbiddenModel(auth.model)
    : /^claude-work$/i.test(String(auth.model || ''))
  if (banned) {
    console.error(typeof forbiddenModelError === 'function'
      ? `[CLI] ${forbiddenModelError(auth.model)}`
      : `[CLI] Model "${auth.model}" dilarang (training-data).`)
    process.exit(2)
  }

  // Memory: file-backed working memory (best-effort, never fatal).
  let headlessMemories = []
  try {
    if (typeof loadHeadlessMemories === 'function') {
      headlessMemories = await loadHeadlessMemories({ workspaceRoot: cliOptions.workspace })
    }
  } catch { headlessMemories = [] }

  let hadSecurityDenial = false
  const subagentState = { spawnCount: 0 }

  try {
    // Construct environment adapter for agentRunner
    const environment = {
      // Shape HARUS cocok dengan core.js fetchTransport call:
      //   fetchTransport({ messages, config, isSmallTask, jsonSchema, stream })
      // (satu objek). Bentuk positional lama (messages, config, ...) tetap
      // didukung sebagai fallback agar mock/test lama tidak pecah.
      fetchAI: async (...callArgs) => {
        let messages,
          config,
          isSmallTask,
          jsonSchema,
          onStatus,
          onToken
        if (callArgs.length === 1 && callArgs[0] && typeof callArgs[0] === 'object' && Array.isArray(callArgs[0].messages)) {
          ;({ messages, config, isSmallTask, jsonSchema } = callArgs[0])
        } else {
          ;[messages, config, isSmallTask, jsonSchema, onStatus, onToken] = callArgs
        }
        const combinedConfig = {
          // Headless default jujur: custom -> localhost:20128 (9Router),
          // model zen-free 9Router. auth (flags > env >
          // file > default) menang atas hardcode. Tanpa fallback model:
          // gagal = pesan jujur (keputusan user).
          aiProvider: auth.provider || cliOptions.provider || config?.aiProvider || 'custom',
          geminiWebModel: cliOptions.model || config?.geminiWebModel || 'gemini-3.6-flash',
          customModel: auth.model || cliOptions.model || config?.customModel || 'oc/muse-spark-1.3-contributor-free',
          groqModel: cliOptions.model || config?.groqModel || 'llama-3.1-8b-instant',
          // Endpoint diadopsi dari auth (flag/env/GUI shared.json) dulu.
          customEndpoint: auth.customEndpoint || process.env.CUSTOM_ENDPOINT || process.env.OPENAI_BASE_URL || 'http://localhost:20128/v1',
          // Key chain: auth (flag/env/file) > 9Router DB autodetect > env
          // legacy. Tanpa key, server jawab missing-key — pesan jujur di bawah.
          customApiKey: auth.apiKey || process.env.CUSTOM_API_KEY || process.env.OPENAI_API_KEY || '',
          groqApiKey: process.env.GROQ_API_KEY || '',
          temperature: 0,
          effortLevel: cliOptions.effort || 'low',
          ...(config || {})
        }

        const resp = await sidecar.rpc('ai:fetch', [{
          messages,
          config: combinedConfig,
          isSmallTask: Boolean(isSmallTask),
          jsonSchema: jsonSchema || null
        }])

        if (!resp || !resp.success) {
          const msg = String(resp?.error?.message || resp?.error || 'AI fetch gagal di sidecar.')
          // Tanpa fallback model (keputusan user): gagal = pesan jujur.
          throw new Error(msg)
        }

        return resp.data
      },

      coreExecuteTool: async (toolName, query, ctx = {}) => {
        // 0. Subagent delegation (Stream 3): sequential, depth-capped, condensed.
        if (toolName === 'spawn_subagent' && typeof runHeadlessSubagent === 'function') {
          const sub = await runHeadlessSubagent({
            query,
            depth: Number(ctx.depth) || 0,
            state: subagentState,
            runLoop: async ({ prompt, options, environment: subEnv }) =>
              runAgentLoop({ prompt, options, environment: subEnv && Object.keys(subEnv).length ? subEnv : environment }),
            // Depth HARUS mengalir (MAX_SUBAGENT_DEPTH mati tanpanya):
            // runAgentLoop meneruskan options.depth -> executeTool ctx.depth.
            createEnvironment: (d) => ({ ...environment, depth: d }),
            baseOptions: { maxTurns: cliOptions.maxTurns, workspace: cliOptions.workspace }
          }).catch((e) => ({ ok: false, result: `[ERROR] Subagent gagal: ${e?.message || e}` }))
          return sub.ok
            ? { ok: true, result: sub.result }
            : { ok: false, result: sub.result || '[ERROR] Subagent ditolak.', error: { code: 'subagent-denied' } }
        }

        // 1. Headless Security Preflight (authoritative fail-closed)
        const secCheck = evaluateHeadlessSecurity(toolName, query, {
          workspaceRoot: cliOptions.workspace
        })

        if (!secCheck.allowed) {
          // Approval relay — DEFAULT AUTO (keputusan owner 2026-09-22).
          // Satu sumber kebenaran: resolveApprovalDecision(mode). manual =
          // fail-closed klasik; dont-ask/--deny-all = deny (CI).
          // Hardline tidak pernah relay. Semua logged.
          const decision = typeof resolveApprovalDecision === 'function'
            ? resolveApprovalDecision(secCheck, {
              approveAll: cliOptions.approveAll,
              denyAll: cliOptions.denyAll,
              mode: cliOptions.permissionMode || 'auto'
            })
            : { proceed: false, reason: 'no relay' }
          if (!cliOptions.json) {
            console.error(`[HEADLESS APPROVAL] tool=${toolName} proceed=${decision.proceed} (${decision.reason})`)
          }
          if (!decision.proceed) {
            hadSecurityDenial = true
            const errMsg = `[BLOCKED] Tool "${toolName}" ditolak oleh kebijakan keamanan headless: ${secCheck.message}`
            if (!cliOptions.json) {
              console.error(`\x1b[31m${errMsg}\x1b[0m`)
            }
            return {
              ok: false,
              result: errMsg,
              error: {
                code: secCheck.code || 'unavailable-in-headless-mode',
                category: secCheck.category || 'security-denied',
                message: secCheck.message
              }
            }
          }
          // Operator consent explicit: lanjutkan ke dispatch di bawah.
        }

        // 2. Format query and dispatch to native tool handler
        const toolDef = NATIVE_TOOLS[toolName]
        if (!toolDef || typeof toolDef.handler !== 'function') {
          // Fallback to sidecar RPC native-tool:execute
          const resp = await sidecar.rpc('native-tool:execute', [
            toolName,
            query,
            { workspaceRoot: cliOptions.workspace, turn: ctx.step }
          ])
          if (!resp || !resp.success) {
            return {
              ok: false,
              result: `[ERROR] Eksekusi tool ${toolName} gagal: ${resp?.error || 'Unknown error'}`,
              error: { code: 'tool-error', message: resp?.error }
            }
          }
          return {
            ok: true,
            result: typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)
          }
        }

        try {
          const res = await toolDef.handler(query, {
            workspaceRoot: cliOptions.workspace,
            turn: ctx.step
          })
          const isSuccess = res && res.success !== false
          const output = isSuccess
            ? (res.output || res.data || res.content || res.message || JSON.stringify(res))
            : (res.error || res.message || 'Tool gagal tanpa rincian.')

          return {
            ok: isSuccess,
            result: isSuccess ? String(output) : `[ERROR] ${output}`,
            error: isSuccess ? null : { code: 'tool-error', message: output }
          }
        } catch (err) {
          return {
            ok: false,
            result: `[ERROR] Tool melempar pengecualian: ${err.message}`,
            error: { code: 'execution-exception', message: err.message }
          }
        }
      },

      onThought: (thought) => {
        if (!cliOptions.json && thought) {
          process.stdout.write(`\x1b[36m[THOUGHT]:\x1b[0m ${thought}\n`)
        }
      },

      onStep: (stepRecord) => {
        if (!cliOptions.json) {
          if (stepRecord.kind === 'decision') {
            const dec = stepRecord.decision
            if (dec?.action) {
              const acts = Array.isArray(dec.action) ? dec.action : [dec.action]
              for (const a of acts) {
                console.log(`\x1b[33m[ACTION]:\x1b[0m ${a.tool} ${a.query ? `(${a.query.slice(0, 100)})` : ''}`)
              }
            }
          } else if (stepRecord.kind === 'tool') {
            const status = stepRecord.ok ? '\x1b[32mOK\x1b[0m' : '\x1b[31mFAIL\x1b[0m'
            console.log(`\x1b[34m[TOOL RESULT ${stepRecord.tool}]:\x1b[0m [${status}] ${stepRecord.result.slice(0, 150)}...`)
          }
        }
      }
    }

    // H5 (M2c): wrapper publik executeTool — pre/post hooks + audit JSONL.
    // coreExecuteTool diselesaikan saat call time (environment sudah utuh).
    environment.executeTool = (toolName, query, ctx = {}) =>
      executeToolWithHooks(environment.coreExecuteTool, hooks, toolName, query, ctx)

    // Run the agent loop (Fase 1: seed initialHistory dari sesi resume;
    // prompt efektif = prompt baru bila ada, else prompt sesi lama).
    const effectivePrompt = cliOptions.prompt || resumeSession?.prompt || '(lanjutkan sesi)'
    const resumedHistory = Array.isArray(resumeSession?.messages) ? resumeSession.messages : []
    // PLAN-T1: frame turn-start (prompt efektif + provider/model/effort).
    try {
      harnessAudit?.beginTurn({
        prompt: effectivePrompt,
        provider: resumeSession?.provider || auth.provider || cliOptions.provider,
        model: resumeSession?.model || auth.model || cliOptions.model,
        effort: cliOptions.effort || resumeSession?.effort
      })
    } catch { }
    const result = await runAgentLoop({
      prompt: effectivePrompt,
      options: {
        provider: resumeSession?.provider || auth.provider || cliOptions.provider,
        model: resumeSession?.model || auth.model || cliOptions.model,
        modelVersion: resumeSession?.modelVersion || auth.modelVersion || cliOptions.modelVersion,
        effort: cliOptions.effort || resumeSession?.effort,
        maxTurns: cliOptions.maxTurns,
        workspace: cliOptions.workspace,
        sessionId,
        ...(resumedHistory.length ? { initialHistory: resumedHistory } : {}),
        unifiedContext: {
          memories: headlessMemories,
          archives: [],
          documents: [],
          turnPairs: []
        }
      },
      environment
    })

    // PLAN-T1: turn-end + patch outcome ke sesi sebelum persist (satu tulisan).
    try { await harnessAudit?.finalize({ outcome: result.outcome, terminalReason: result.terminalReason, turn: result.stepCount }) } catch { }

    // Fase 1: persist sesi (newest-first via updatedAt). Never fatal.
    try {
      if (typeof saveCliSession === 'function') {
        const history = Array.isArray(result.history) ? result.history : []
        const appended = [...resumedHistory]
        if (cliOptions.prompt) appended.push({ role: 'user', content: cliOptions.prompt })
        if (result.reply) appended.push({ role: 'assistant', content: result.reply })
        // runner history sudah mencakup seed+turn ini; pakai yang terlengkap.
        const messages = history.length >= appended.length ? history : appended
        saveCliSession({
          id: sessionId,
          workspace: cliOptions.workspace,
          provider: resumeSession?.provider || auth.provider || cliOptions.provider,
          model: resumeSession?.model || auth.model || cliOptions.model,
          modelVersion: resumeSession?.modelVersion || auth.modelVersion || cliOptions.modelVersion,
          effort: cliOptions.effort || resumeSession?.effort,
          createdAt: resumeSession?.createdAt,
          updatedAt: new Date().toISOString(),
          prompt: effectivePrompt,
          outcome: result.outcome,
          terminalReason: result.terminalReason,
          messages
        })
      }
    } catch {}

    if (cliOptions.json) {
      const outputObj = {
        success: result.success,
        outcome: result.outcome,
        terminalReason: result.terminalReason,
        reply: result.reply,
        thought: result.thought,
        stepCount: result.stepCount,
        toolCallsCount: result.toolCallsCount,
        executedTools: result.executedTools,
        sessionId,
        ...(cliOptions.trace ? { trace: result.trace } : {})
      }
      console.log(JSON.stringify(outputObj, null, 2))
    } else {
      console.log('\n----------------------------------------')
      console.log(`Outcome: ${result.outcome.toUpperCase()} (${result.terminalReason})`)
      console.log(`Steps: ${result.stepCount} | Tools executed: ${result.toolCallsCount}`)
      console.log(`session ${sessionId}`)
      console.log('----------------------------------------')
      // Headless tak interaktif: NEEDS_USER = terminal jujur (blocked),
      // bukan suruhan 'ketik lanjutkan' yang tak terbaca siapa pun.
      if (result.outcome === 'needs_user' && result.reply) {
        console.log(`\n${result.reply}\n`)
        console.error('[CLI] Butuh input manusia — sesi one-shot berhenti di sini (exit 1). Jalankan ulang dengan info yang diminta sebagai bagian prompt, atau pakai --deny-all untuk mode CI.')
      } else if (result.reply) {
        console.log(`\n${result.reply}\n`)
      }
    }

    // Determine deterministic exit code
    if (result.success) {
      process.exit(0)
    } else if (result.outcome === 'needs_user') {
      process.exit(1)
    } else if (hadSecurityDenial || result.terminalReason?.includes('policy') || result.terminalReason?.includes('security')) {
      process.exit(2)
    } else {
      process.exit(1)
    }
  } catch (err) {
    // PLAN-T1: crash path juga dapat turn-end (start tanpa end = red flag
    // interupsi di harness:diagnose — catat jujur sebagai kegagalan run).
    try { await harnessAudit?.finalize({ outcome: 'failed', terminalReason: 'fatal-exception', turn: null }) } catch { }
    const msg = String(err?.message || err)
    // Auth gagal tanpa key: beri jalan keluar konkret, bukan "nyalakan aplikasi"
    // (server 9Router hidup tapi menolak tanpa key — pesan lama menyesatkan).
    const keyHint =
      !auth.apiKey && /missing api key|invalid_api_key|authentication_error|401/i.test(msg)
        ? '\n[HINT] Tanpa API key. Isi salah satu: --api-key <key> | ABELINK_API_KEY/CUSTOM_API_KEY env | ~/.config/abelink/cli.json {"apiKey": ...} | DB 9Router (~/.9router/db/data.sqlite tabel apiKeys).'
        : ''
    if (cliOptions.json) {
      console.log(JSON.stringify({
        success: false,
        outcome: 'failed',
        terminalReason: 'fatal-exception',
        error: msg + keyHint
      }, null, 2))
    } else {
      console.error(`\x1b[31m[FATAL]: ${msg}${keyHint}\x1b[0m`)
    }
    process.exit(1)
  } finally {
    sidecar.dispose()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
