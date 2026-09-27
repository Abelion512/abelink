// Adapter Promptfoo tipis di atas `abelink agent run` (One Engine, Many Surfaces).
// Kontrak Promptfoo (docs resmi providers/custom-api): default-export class
// dengan id() + callApi(prompt, context) -> ProviderResponse { output, error?, metadata? }.
//
// Pemakaian (promptfooconfig.yaml):
//   providers:
//     - file://evaluation/promptfoo/abelink-provider.mjs
//       config:
//         workspace: /path/ke/workspace   # default: cwd
//         timeoutMs: 180000               # default 180s
//         extraArgs: ["--effort", "high"] # flag tambahan untuk CLI
//
// Prinsip:
// - BUKAN runtime kedua. Adapter hanya spawn CLI, mengirim task, mengumpulkan
//   hasil; eksekusi tetap 100% milik engine Abelink (runAgentLoop + governance).
// - Sinyal sukses berasal dari field hasil engine (success/outcome/toolCalls),
//   bukan dari teks jawaban model (anti-fabrikasi, selaras AbelinkBench).
// - Tanpa dependensi baru: hanya node:child_process.

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../bin/abelink.mjs')

const DEFAULT_TIMEOUT_MS = 180000

function runCli(args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn('bun', [CLI_PATH, ...args], {
      cwd: process.cwd(),
      env: process.env,
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* sudah exit */ }
      finish({ error: `abelink CLI timeout setelah ${timeoutMs}ms` })
    }, timeoutMs)
    child.stdout.on('data', (d) => { stdout += String(d) })
    child.stderr.on('data', (d) => { stderr += String(d) })
    child.on('error', (err) => finish({ error: `spawn gagal: ${err?.message || err}` }))
    child.on('close', (code) => finish({ code, stdout, stderr }))
  })
}

// Ambil object JSON terakhir dari stdout (CLI human-mode bisa mencetak teks lain).
function extractLastJson(stdout) {
  const lines = String(stdout || '').split('\n').filter((l) => l.trim().startsWith('{'))
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]) } catch { /* coba baris sebelumnya */ }
  }
  return null
}

export default class AbelinkProvider {
  constructor(options) {
    this.providerId = options?.id || 'abelink-agent'
    this.config = options?.config || {}
  }

  id() {
    return this.providerId
  }

  async callApi(prompt, context) {
    const cfg = this.config || {}
    const args = ['agent', 'run', String(prompt ?? ''), '--json']
    if (cfg.workspace) args.push('--workspace', String(cfg.workspace))
    if (cfg.provider) args.push('--provider', String(cfg.provider))
    if (cfg.model) args.push('--model', String(cfg.model))
    if (cfg.effort) args.push('--effort', String(cfg.effort))
    for (const extra of cfg.extraArgs || []) args.push(String(extra))

    const timeoutMs = Number(cfg.timeoutMs) || DEFAULT_TIMEOUT_MS
    const run = await runCli(args, timeoutMs)
    if (run.error) {
      return { output: null, error: run.error, metadata: { adapter: 'abelink-promptfoo', phase: 'spawn' } }
    }

    const result = extractLastJson(run.stdout)
    if (!result) {
      return {
        output: null,
        error: `output CLI bukan JSON yang valid (exit=${run.code})`,
        metadata: { adapter: 'abelink-promptfoo', stderrTail: String(run.stderr || '').slice(-500) },
      }
    }

    const toolCalls = Number(result.toolCalls ?? result.tool_calls ?? 0)
    const durationMs = Number(result.durationMs ?? result.duration_ms ?? 0)
    return {
      // Jawaban model HANYA tampilan; penilaian deterministik pakai metadata.
      output: String(result.answer ?? result.finalAnswer ?? ''),
      error: result.success ? undefined : String(result.error || result.terminalReason || 'engine melaporkan kegagalan'),
      metadata: {
        adapter: 'abelink-promptfoo',
        engineSuccess: result.success === true,
        outcome: result.outcome ?? null,
        terminalReason: result.terminalReason ?? null,
        verificationState: result.verificationState ?? null,
        objectiveKind: result.objectiveKind ?? null,
        steps: result.steps ?? null,
        toolCalls,
        modelCalls: result.modelCalls ?? null,
        retries: result.retries ?? null,
        durationMs,
        exitCode: run.code,
        sessionId: result.sessionId ?? null,
        vars: context?.vars ?? {},
      },
    }
  }
}
