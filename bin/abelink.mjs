#!/usr/bin/env bun
// bin/abelink.mjs — Abelink CLI binary entry point.
// Subcommands:
//   abelink agent run "<prompt>" [flags]
//
// Flags:
//   --provider <provider>     AI provider (gemini-web, groq, custom, lm-studio). Default: gemini-web
//   --model <model>           Model identifier
//   --model-version <version> Model version / release tag
//   --effort <effort>         Effort level: low | medium | high | xhigh | max | ultra (default: low)
//   --max-turns <n>           Maximum ReAct loop turns (budget)
//   --workspace <dir>         Active workspace root directory (default: cwd)
//   --json                    Output machine-readable JSON result
//   --trace                   Include execution trace in output
//   --help, -h                Show usage information
//   --version, -v             Show CLI version

import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import 'fake-indexeddb/auto'

const { runAgentLoop } = await import('../src/api/ai/agentRunner.js')
const { evaluateHeadlessSecurity } = await import('../src/api/ai/headlessSecurity.js')
const { NATIVE_TOOLS } = await import('../sidecar/main/node-tools.js')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SIDECAR_ENTRY = path.join(ROOT, 'sidecar', 'engine.mjs')
const BUN_BIN = process.env.BUN_BIN || 'bun'

const VERSION = '1.1.0-alpha.5'

function printHelp() {
  console.log(`
Abelink CLI — Autonomous AI OS Companion (Linux)

Usage:
  abelink agent run "<prompt>" [flags]

Flags:
  --provider <name>       AI provider (gemini-web | groq | custom | lm-studio) [default: gemini-web]
  --model <id>            Model identifier (e.g. gemini-2.5-flash, llama-3.1-8b-instant)
  --model-version <ver>   Model version string
  --effort <level>        Reasoning effort: low | medium | high | xhigh | max | ultra [default: low]
  --max-turns <n>         Maximum turns before terminating [default: 15]
  --workspace <path>      Workspace directory boundary [default: current directory]
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

export function parseCliArgs(argv) {
  const args = argv.slice(2)
  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    printHelp()
    process.exit(args.length === 0 ? 3 : 0)
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

  if (args[0] !== 'agent' || args[1] !== 'run') {
    console.error(`[ERROR]: Subcommand tidak dikenal. Gunakan: abelink agent run "<prompt>" [flags]`)
    process.exit(3)
  }

  const promptArg = args[2]
  if (!promptArg || promptArg.startsWith('-')) {
    console.error('[ERROR]: Argumen prompt wajib disediakan setelah "agent run".')
    process.exit(3)
  }

  const options = {
    prompt: promptArg,
    provider: 'gemini-web',
    model: null,
    modelVersion: null,
    effort: 'low',
    maxTurns: 15,
    workspace: process.cwd(),
    json: false,
    trace: false
  }

  for (let i = 3; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--provider') {
      options.provider = args[++i]
    } else if (arg === '--model') {
      options.model = args[++i]
    } else if (arg === '--model-version') {
      options.modelVersion = args[++i]
    } else if (arg === '--effort') {
      options.effort = args[++i]
    } else if (arg === '--max-turns') {
      const turns = parseInt(args[++i], 10)
      if (Number.isNaN(turns) || turns <= 0) {
        console.error('[ERROR]: --max-turns harus berupa integer positif.')
        process.exit(3)
      }
      options.maxTurns = turns
    } else if (arg === '--workspace') {
      options.workspace = path.resolve(args[++i])
    } else if (arg === '--json') {
      options.json = true
    } else if (arg === '--trace') {
      options.trace = true
    } else if (arg === '-h' || arg === '--help') {
      printHelp()
      process.exit(0)
    } else {
      console.error(`[ERROR]: Flag tidak dikenal "${arg}".`)
      process.exit(3)
    }
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
  const sidecar = createSidecarClient()

  let hadSecurityDenial = false

  try {
    // Construct environment adapter for agentRunner
    const environment = {
      fetchAI: async (messages, config, isSmallTask, jsonSchema, onStatus, onToken) => {
        const combinedConfig = {
          aiProvider: cliOptions.provider || config?.aiProvider || 'gemini-web',
          geminiWebModel: cliOptions.model || config?.geminiWebModel || 'gemini-3.6-flash',
          customModel: cliOptions.model || config?.customModel || 'gemini/gemini-2.5-flash',
          groqModel: cliOptions.model || config?.groqModel || 'llama-3.1-8b-instant',
          customEndpoint: process.env.CUSTOM_ENDPOINT || process.env.OPENAI_BASE_URL || 'http://localhost:20128/v1',
          customApiKey: process.env.CUSTOM_API_KEY || process.env.OPENAI_API_KEY || '',
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
          throw new Error(resp?.error?.message || resp?.error || 'AI fetch gagal di sidecar.')
        }

        return resp.data
      },

      executeTool: async (toolName, query, ctx = {}) => {
        // 1. Headless Security Preflight (authoritative fail-closed)
        const secCheck = evaluateHeadlessSecurity(toolName, query, {
          workspaceRoot: cliOptions.workspace
        })

        if (!secCheck.allowed) {
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

    // Run the agent loop
    const result = await runAgentLoop({
      prompt: cliOptions.prompt,
      options: {
        provider: cliOptions.provider,
        model: cliOptions.model,
        effort: cliOptions.effort,
        maxTurns: cliOptions.maxTurns,
        workspace: cliOptions.workspace
      },
      environment
    })

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
        ...(cliOptions.trace ? { trace: result.trace } : {})
      }
      console.log(JSON.stringify(outputObj, null, 2))
    } else {
      console.log('\n----------------------------------------')
      console.log(`Outcome: ${result.outcome.toUpperCase()} (${result.terminalReason})`)
      console.log(`Steps: ${result.stepCount} | Tools executed: ${result.toolCallsCount}`)
      console.log('----------------------------------------')
      if (result.reply) {
        console.log(`\n${result.reply}\n`)
      }
    }

    // Determine deterministic exit code
    if (result.success) {
      process.exit(0)
    } else if (hadSecurityDenial || result.terminalReason?.includes('policy') || result.terminalReason?.includes('security')) {
      process.exit(2)
    } else {
      process.exit(1)
    }
  } catch (err) {
    if (cliOptions.json) {
      console.log(JSON.stringify({
        success: false,
        outcome: 'failed',
        terminalReason: 'fatal-exception',
        error: err.message
      }, null, 2))
    } else {
      console.error(`\x1b[31m[FATAL]: ${err.message}\x1b[0m`)
    }
    process.exit(1)
  } finally {
    sidecar.dispose()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
