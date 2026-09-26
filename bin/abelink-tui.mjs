#!/usr/bin/env bun
// bin/abelink-tui.mjs — Fase 2 interactive TUI host (plan §3).
// HOST SAJA (M2b/B-9): berkas ini memegang readline loop + main(). Seluruh
// logika non-host (parser, store sesi, client sidecar, konstanta, renderer)
// hidup di cli/core/* dan di-reexport di bawah supaya permukaan lama utuh
// untuk test/konsumen yang sudah ada. Stdlib node:readline, tanpa dependensi
// baru; bentuk client/auth/security-memori tetap sama seperti bin/abelink.mjs.
//
// Fase-1 contract (loadCliSession/saveCliSession/listCliSessions +
// options.initialHistory) SUDAH mendarat di headlessCli.js/agentRunner.js.
// loadFase1Store + blockedOn dipertahankan sebagai fallback jujur bila impor
// gagal. Streaming is a flag flip (TUI_STREAM_ENABLED, GAP-STREAM).

import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execFile } from 'node:child_process'
import readline from 'node:readline'
import 'fake-indexeddb/auto'

import {
  buildAiFetchBody,
  buildAgentsMd,
  checkTurnAborted,
  createSidecarClient,
  createTuiTurn,
  listTuiSessions,
  loadTuiSession,
  nextPromptAction,
  parseEffortLevel,
  parseShellLine,
  parseSlashCommand,
  parseTuiArgs,
  renderStepLine,
  renderThoughtLine,
  resolveFileRefs,
  resolveTuiModel,
  saveTuiSession,
  sessionToInitialHistory,
  TUI_HELP,
  TUI_VERSION
} from '../cli/core/index.mjs'

// Permukaan lama dipertahankan: test (tests/cli-tui*.test.mjs) dan konsumen
// lain masih mengimpor dari berkas ini.
export * from '../cli/core/index.mjs'

async function main() {
  const cliOptions = parseTuiArgs(process.argv)
  // ponytail: auto-mkdir workspace; tanpa ini --workspace ke dir hilang = /init ENOENT + shell cwd gagal.
  try { fs.mkdirSync(cliOptions.workspace, { recursive: true }) } catch {}

  // Piped-input race: kumpulkan stdin non-TTY sejak awal startup;
  // dikuras FIFO setelah loop siap (lihat bawah).
  const earlyChunks = []
  let earlyEnded = false
  const earlyCollector = (chunk) => {
    earlyChunks.push(String(chunk ?? ''))
  }
  const earlyEnd = () => {
    earlyEnded = true
  }
  if (!process.stdin.isTTY) {
    try {
      process.stdin.on('data', earlyCollector)
      process.stdin.on('end', earlyEnd)
      process.stdin.resume()
    } catch {}
  }

  const { runAgentLoop } = await import('../src/api/ai/agentRunner.js')
  const { evaluateHeadlessSecurity } = await import('../src/api/ai/headlessSecurity.js')
  const { NATIVE_TOOLS } = await import('../sidecar/main/node-tools.js')
  const headless = await import('../src/api/ai/headlessCli.js').catch(() => ({}))
  const {
    resolveApprovalDecision = null,
    loadCliFileConfig = null,
    resolveCliAuth = null,
    loadNineRouterKey = null,
    loadHeadlessMemories = null,
    MODEL_ALIASES = null,
    DEFAULT_CLI_MODEL = null,
    isForbiddenModel = null,
    forbiddenModelError = null
  } = headless
  const aliases = MODEL_ALIASES || {}

  // Lazy sidecar: JANGAN spawn saat startup. Sidecar child menahan event
  // loop (pipe stdin) sehingga proses tak pernah mencapai prompt/loop —
  // terutama saat stdin pipe (E2E/script). Spawn on first model turn.
  let sidecar = null
  const getSidecar = () => {
    if (!sidecar) sidecar = createSidecarClient()
    return sidecar
  }

  let fileConfig = {}
  try {
    if (typeof loadCliFileConfig === 'function') fileConfig = loadCliFileConfig({ cwd: cliOptions.workspace }) || {}
  } catch { fileConfig = {} }
  const auth = typeof resolveCliAuth === 'function'
    ? resolveCliAuth({
      flags: { provider: cliOptions.provider, model: cliOptions.model, modelVersion: null, apiKey: null },
      env: process.env,
      fileConfig
    })
    : { provider: cliOptions.provider, model: cliOptions.model, modelVersion: null, apiKey: null }
  if (!auth.apiKey && typeof loadNineRouterKey === 'function') {
    try {
      auth.apiKey = await loadNineRouterKey()
    } catch {}
  }

  // Keputusan owner: ID terlarang ditolak di entry, bukan diam-diam dipakai.
  const initialModel = auth.model || cliOptions.model || DEFAULT_CLI_MODEL || DEFAULT_TUI_MODEL
  const banned = typeof isForbiddenModel === 'function'
    ? isForbiddenModel(initialModel)
    : /^claude-work$/i.test(String(initialModel || ''))
  if (banned) {
    console.error(typeof forbiddenModelError === 'function'
      ? `[TUI] ${forbiddenModelError(initialModel)}`
      : `[TUI] Model "${initialModel}" dilarang (training-data).`)
    process.exit(2)
  }

  let headlessMemories = []
  try {
    if (typeof loadHeadlessMemories === 'function') {
      headlessMemories = await loadHeadlessMemories({ workspaceRoot: cliOptions.workspace })
    }
  } catch { headlessMemories = [] }

  const state = {
    provider: auth.provider || cliOptions.provider,
    model: initialModel,
    effort: cliOptions.effort,
    workspace: cliOptions.workspace,
    sessionId: `session-${Date.now()}`,
    history: [],
    showThinking: true,
    showDetails: false
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'abelink> ' })
  let currentTurn = null
  rl.on('SIGINT', () => {
    if (currentTurn) {
      currentTurn.controller.abort()
      console.log('\n[Turn dibatalkan (Ctrl-C). Sesi tetap jalan — ketik prompt berikutnya.]')
    } else {
      rl.prompt(true)
    }
  })

  const buildEnvironment = (signal) => ({
    fetchAI: async (...callArgs) => {
      let messages, config, isSmallTask, jsonSchema
      if (callArgs.length === 1 && callArgs[0] && typeof callArgs[0] === 'object' && Array.isArray(callArgs[0].messages)) {
        ;({ messages, config, isSmallTask, jsonSchema } = callArgs[0])
      } else {
        ;[messages, config, isSmallTask, jsonSchema] = callArgs
      }
      const combinedConfig = {
        aiProvider: state.provider,
        geminiWebModel: state.model,
        customModel: state.model,
        groqModel: state.model,
        customEndpoint: process.env.CUSTOM_ENDPOINT || process.env.OPENAI_BASE_URL || 'http://localhost:20128/v1',
        customApiKey: auth.apiKey || process.env.CUSTOM_API_KEY || process.env.OPENAI_API_KEY || '',
        groqApiKey: process.env.GROQ_API_KEY || '',
        temperature: 0,
        effortLevel: state.effort,
        ...(config || {})
      }
      const body = buildAiFetchBody({ messages, config: combinedConfig, isSmallTask, jsonSchema })
      const resp = await getSidecar().rpc('ai:fetch', [body])
      if (!resp || !resp.success) {
        const msg = String(resp?.error?.message || resp?.error || 'AI fetch gagal di sidecar.')
        // Tanpa fallback model (keputusan user): gagal = pesan jujur.
        throw new Error(msg)
      }
      return resp.data
    },

    executeTool: async (toolName, query, ctx = {}) => {
      const aborted = checkTurnAborted(signal, toolName)
      if (aborted) return aborted
      const secCheck = evaluateHeadlessSecurity(toolName, query, { workspaceRoot: state.workspace })
      if (!secCheck.allowed) {
        const decision = typeof resolveApprovalDecision === 'function'
          ? resolveApprovalDecision(secCheck, { approveAll: false, denyAll: false, mode: 'auto' })
          : { proceed: true, reason: 'auto default (logged, supervised)' }
        console.error(`[HEADLESS APPROVAL] tool=${toolName} proceed=${decision.proceed} (${decision.reason})`)
        if (!decision.proceed) {
          const errMsg = `[BLOCKED] Tool "${toolName}" ditolak oleh kebijakan keamanan headless: ${secCheck.message}`
          console.error(errMsg)
          return {
            ok: false,
            result: errMsg,
            error: { code: secCheck.code || 'unavailable-in-headless-mode', category: secCheck.category || 'security-denied', message: secCheck.message }
          }
        }
      }
      const toolDef = NATIVE_TOOLS[toolName]
      if (!toolDef || typeof toolDef.handler !== 'function') {
        const resp = await getSidecar().rpc('native-tool:execute', [toolName, query, { workspaceRoot: state.workspace, turn: ctx.step }])
        if (!resp || !resp.success) {
          return { ok: false, result: `[ERROR] Eksekusi tool ${toolName} gagal: ${resp?.error || 'Unknown error'}`, error: { code: 'tool-error', message: resp?.error } }
        }
        return { ok: true, result: typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data) }
      }
      try {
        const res = await toolDef.handler(query, { workspaceRoot: state.workspace, turn: ctx.step })
        const isSuccess = res && res.success !== false
        const output = isSuccess
          ? (res.output || res.data || res.content || res.message || JSON.stringify(res))
          : (res.error || res.message || 'Tool gagal tanpa rincian.')
        return { ok: isSuccess, result: isSuccess ? String(output) : `[ERROR] ${output}`, error: isSuccess ? null : { code: 'tool-error', message: output } }
      } catch (err) {
        return { ok: false, result: `[ERROR] Tool melempar pengecualian: ${err.message}`, error: { code: 'execution-exception', message: err.message } }
      }
    },

    onThought: (thought) => {
      if (state.showThinking === false) return
      const line = renderThoughtLine(thought)
      if (line) console.log(line)
    },

    onStep: (stepRecord) => {
      if (state.showDetails === false && stepRecord?.kind === 'tool') return
      const line = renderStepLine(stepRecord)
      if (line) console.log(line)
    }
  })

  async function runTurn(prompt) {
    const turn = createTuiTurn()
    currentTurn = turn
    try {
      const result = await runAgentLoop({
        prompt,
        options: {
          provider: state.provider,
          model: state.model,
          modelVersion: null,
          effort: state.effort,
          maxTurns: cliOptions.maxTurns,
          workspace: state.workspace,
          sessionId: state.sessionId,
          signal: turn.signal,
          initialHistory: state.history, // Fase-1: runAgentLoop seed loopMessages
          stream: TUI_STREAM_ENABLED // GAP-STREAM: flag flip; engine transport decides
        },
        environment: buildEnvironment(turn.signal)
      })
      if (result.reply) console.log(`\n${result.reply}\n`)
      console.log(`-- ${result.outcome} (${result.terminalReason}) | steps ${result.stepCount} | tools ${result.toolCallsCount} | sesi ${state.sessionId} --`)
      if (result.outcome === 'needs_user' && result.reply) {
        console.log('[TUI] Butuh input manusia — jawab langsung sebagai prompt berikutnya (sesi tetap jalan).')
      }
      state.history.push({ role: 'user', content: prompt })
      if (result.reply) state.history.push({ role: 'assistant', content: result.reply })
      // Persist sesi via Fase-1 store (best-effort, never fatal).
      const saved = await saveTuiSession({
        v: 1,
        id: state.sessionId,
        workspace: state.workspace,
        provider: state.provider,
        model: state.model,
        modelVersion: null,
        effort: state.effort,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        prompt,
        outcome: result.outcome,
        terminalReason: result.terminalReason,
        messages: state.history
      })
      if (saved.blockedOn) console.error(`[TUI] Persist sesi dilewati (${saved.blockedOn}): ${saved.reason}`)
      nextPromptAction(result) // always reprompt; never exits on turn end
    } catch (err) {
      console.error(`[TUI ERROR]: ${err?.message || err}`)
    } finally {
      currentTurn = null
    }
  }

  // Eksekutor !shell (ala opencode): tanpa model turn, tanpa histori.
  // Batas jujur: read-only aman + tolak pola berbahaya; BUKAN sandbox.
  async function runShellLine(command) {
    const { validateHeadlessShellCommand } = await import('../src/api/ai/headlessSecurity.js').catch(() => ({}))
    if (typeof validateHeadlessShellCommand === 'function') {
      const check = validateHeadlessShellCommand(command)
      if (!check.allowed) {
        console.error(`[SHELL DITOLAK]: ${check.message}`)
        return
      }
    }
    await new Promise((resolve) => {
      execFile('/bin/sh', ['-c', command], { cwd: state.workspace, timeout: 30000, maxBuffer: 512 * 1024 }, (err, stdout, stderr) => {
        if (stdout) process.stdout.write(stdout.endsWith('\n') ? stdout : stdout + '\n')
        if (stderr) process.stderr.write(stderr.endsWith('\n') ? stderr : stderr + '\n')
        if (err?.code) console.error(`[! exited ${err.code}]`)
        resolve()
      })
    })
  }

  async function handleSlash(cmd) {
    switch (cmd.kind) {
      case 'models': {
        const q = String(cmd.arg || '').toLowerCase()
        const rows = Object.entries(aliases).filter(([k]) => !q || k.includes(q))
        if (!rows.length) {
          console.log('Tak ada alias cocok. /model <ID-penuh> tetap bisa dipakai langsung.')
          return
        }
        for (const [k, v] of rows) console.log(`${k.padEnd(16)} -> ${v}`)
        console.log(`\nModel aktif: ${state.model}`)
        return
      }
      case 'model': {
        if (!cmd.arg) {
          console.log(`Model aktif: ${state.model}`)
          return
        }
        const r = resolveTuiModel(cmd.arg, aliases)
        if (!r.ok) {
          console.error(`[ERROR]: ${r.error}`)
          return
        }
        state.model = r.model
        console.log(r.alias ? `Model: ${r.alias} -> ${r.model}` : `Model: ${r.model} (ID langsung)`)
        return
      }
      case 'effort': {
        if (!cmd.arg) {
          console.log(`Effort aktif: ${state.effort}`)
          return
        }
        const r = parseEffortLevel(cmd.arg)
        if (!r.ok) {
          console.error(`[ERROR]: ${r.error}`)
          return
        }
        state.effort = r.effort
        console.log(`Effort: ${state.effort}`)
        return
      }
      case 'sessions': {
        const r = await listTuiSessions()
        if (r.blockedOn) {
          console.error(`[TUI] /sessions dilewati (${r.blockedOn}): ${r.reason}`)
          return
        }
        if (!r.ok) {
          console.error(`[ERROR]: ${r.error}`)
          return
        }
        if (!r.sessions.length) {
          console.log('Belum ada sesi tersimpan.')
          return
        }
        for (const s of r.sessions) console.log(`- ${s.id} | ${s.outcome || '?'} | ${s.updatedAt || ''}`)
        return
      }
      case 'continue': {
        if (!cmd.arg) {
          console.error('[ERROR]: Pakai: /continue <id> (lihat /sessions).')
          return
        }
        const r = await loadTuiSession(cmd.arg)
        if (r.blockedOn) {
          console.error(`[TUI] /continue dilewati (${r.blockedOn}): ${r.reason}`)
          return
        }
        if (!r.ok) {
          console.error(`[ERROR]: ${r.error}`)
          return
        }
        state.sessionId = r.session.id || cmd.arg
        state.history = sessionToInitialHistory(r.session)
        if (r.session.model) state.model = r.session.model
        if (r.session.effort) state.effort = r.session.effort
        console.log(`Lanjut sesi ${state.sessionId} (${state.history.length} pesan histori).`)
        return
      }
      case 'new': {
        state.sessionId = `session-${Date.now()}`
        state.history = []
        console.log(`Sesi baru: ${state.sessionId}`)
        return
      }
      case 'compact': {
        if (!state.history.length) {
          console.log('Histori kosong — tak ada yang diringkas.')
          return
        }
        const keep = 10
        const drop = Math.max(0, state.history.length - keep)
        state.history = state.history.slice(-keep)
        console.log(`[TUI] Histori dipadatkan: buang ${drop} pesan lama, simpan ${state.history.length} terakhir. (Ringkasan LLM menyusul; kini potong ekor.)`)
        return
      }
      case 'thinking': {
        state.showThinking = !state.showThinking
        console.log(`[TUI] Blok thinking: ${state.showThinking ? 'TAMPIL' : 'SEMBUNYI'} (tampilan saja; kemampuan reasoning model tak berubah).`)
        return
      }
      case 'editor': {
        const { spawnSync } = await import('node:child_process')
        const editor = process.env.EDITOR || 'nano'
        const tmpFile = path.join(os.tmpdir(), `abelink-tui-${Date.now()}.md`)
        try {
          fs.writeFileSync(tmpFile, '', 'utf8')
          const r = spawnSync(editor, [tmpFile], { stdio: 'inherit' })
          if ((r.status ?? 0) !== 0) {
            console.error(`[ERROR]: Editor keluar dengan kode ${r.status}.`)
            return
          }
          const text = fs.readFileSync(tmpFile, 'utf8').trim()
          if (!text) {
            console.log('[TUI] Editor kosong — batal.')
            return
          }
          console.log('[TUI] Teks editor dikirim sebagai prompt.')
          await runTurn(text)
        } catch (err) {
          console.error(`[ERROR]: ${err?.message || err}`)
        } finally {
          try { fs.unlinkSync(tmpFile) } catch {}
        }
        return
      }
      case 'help': console.log(TUI_HELP); return
      case 'details': {
        state.showDetails = !state.showDetails
        console.log(`[TUI] Detail eksekusi tool: ${state.showDetails ? 'TAMPIL' : 'SEMBUNYI'} (ringkas ala opencode /details).`)
        return
      }
      case 'init': {
        let entries = []
        try {
          const fsMod = await import('node:fs')
          entries = fsMod.readdirSync(state.workspace, { withFileTypes: true }).map((e) => e.name)
        } catch {
          entries = []
        }
        const draft = buildAgentsMd({ workspace: state.workspace, entries })
        const target = (cmd.arg && !cmd.arg.startsWith('-') ? cmd.arg : 'AGENTS.md')
        const abs = path.resolve(state.workspace, target)
        const root = path.resolve(state.workspace)
        if (abs !== root && !abs.startsWith(root + path.sep)) {
          console.error(`[ERROR]: Target ${target} di luar workspace — tolak.`)
          return
        }
        try {
          fs.writeFileSync(abs, draft + '\n', 'utf8')
          console.log(`[TUI] Draf AGENTS.md ditulis ke ${abs} — sunting manual sebelum dipakai.`)
        } catch (err) {
          console.error(`[ERROR]: ${err?.message || err}`)
        }
        return
      }
      case 'exit': rl.close(); return
      case 'unsupported': console.error(`[TUI] ${cmd.reason}`); return
      default: console.error(`[ERROR]: Perintah "${cmd.name || '?'}" tak dikenal. Ketik /help.`)
    }
  }

  // Banner opencode-style: model | effort | workspace | sesi + slash ringkas.
  console.log(`Abelink TUI v${TUI_VERSION}`)
  console.log(`  model    : ${state.model}`)
  console.log(`  effort   : ${state.effort}`)
  console.log(`  workspace: ${state.workspace}`)
  console.log(`  sesi     : ${state.sessionId}`)
  console.log(`\n${TUI_HELP}\n`)
  rl.prompt()
  let busy = false
  async function handleLine(line) {
    // !shell dulu (ala opencode): tanpa model turn, tanpa histori.
    const shellCmd = parseShellLine(line)
    if (shellCmd !== null) {
      await runShellLine(shellCmd)
      if (!rl.closed) rl.prompt()
      return
    }
    const cmd = parseSlashCommand(line)
    if (cmd.kind === 'prompt') {
      if (!cmd.text.trim()) {
        rl.prompt()
        return
      }
      if (busy) {
        console.error('[TUI] Turn masih jalan — Ctrl-C untuk batalkan dulu.')
        if (!rl.closed) rl.prompt()
        return
      }
      busy = true
      try {
        // @file reference: lampirkan isi file ke prompt sebelum kirim.
        const resolved = resolveFileRefs(cmd.text, { workspace: state.workspace })
        if (!resolved.ok) {
          console.error(`[ERROR]: ${resolved.error}`)
          return
        }
        if (resolved.attached.length) {
          console.log(`[TUI] Lampirkan ${resolved.attached.length} file: ${resolved.attached.map((a) => `${a.ref} (${a.bytes}B)`).join(', ')}`)
        }
        await runTurn(resolved.text)
      } finally {
        busy = false
        if (!rl.closed) rl.prompt()
      }
      return
    }
    await handleSlash(cmd)
    if (!rl.closed) rl.prompt()
  }
  // Close handler DULU sebelum replay: /exit di dalam replay menutup rl —
  // tanpa listener ini proses hang (sidecar menahan event loop) sampai timeout.
  rl.on('close', () => {
    console.log(`\n[TUI] Sesi ${state.sessionId} selesai.`)
    try {
      sidecar?.dispose()
    } catch {}
    process.exit(0)
  })
  // Replay stdin yang tiba selama startup (piped-input race), FIFO.
  // Listener 'data' awal dilepas agar readline menerima data berikutnya.
  try {
    process.stdin.removeListener('data', earlyCollector)
    process.stdin.removeListener('end', earlyEnd)
  } catch {}
  const earlyText = earlyChunks.join('')
  const earlyQueue = earlyText.split('\n')
  // Baris terakhir tanpa newline = prompt parsial (mis. EOF langsung);
  // tetap proses bila tak kosong.
  rl.on('line', handleLine)
  for (const early of earlyQueue) {
    if (rl.closed) break
    const text = String(early ?? '')
    if (!text.trim()) continue
    await handleLine(text)
    if (rl.closed) break
  }
  // EOF langsung (printf tanpa interaksi): tutup agar proses keluar,
  // bukan hang menunggu stdin yang sudah habis.
  if (earlyEnded && earlyQueue.every((t) => !String(t ?? '').trim())) {
    rl.close()
    return
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
