#!/usr/bin/env node
// Mark agent adapter for MarkBench — talks to sidecar/engine.mjs over JSON-lines RPC.
// One persistent sidecar child per run; requests are multiplexed by id.

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SIDECAR = path.join(ROOT, 'sidecar', 'engine.mjs')
const BUN = process.env.BUN_BIN || 'bun'

const MAX_ITER = 5 // default; bisa ditimpa per task via task.maxTurns (turn-budget eval)
const TIMEOUT_MS = 300000

// ---- Persistent sidecar child with id-multiplexed JSON-lines RPC ----
function createSidecar() {
  const child = spawn(BUN, [SIDECAR], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, MARK_DEBUG_AI: '0' },
  })

  const pending = new Map() // id -> { resolve, reject, timer }
  let buf = ''

  child.stdout.on('data', (chunk) => {
    buf += chunk.toString()
    let idx
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line) continue
      let msg
      try {
        msg = JSON.parse(line)
      } catch {
        continue
      }
      const p = msg && msg.id != null ? pending.get(msg.id) : null
      if (!p) continue
      pending.delete(msg.id)
      clearTimeout(p.timer)
      p.resolve(msg)
    }
  })

  child.stderr.on('data', (chunk) => {
    process.stderr.write('[sidecar] ' + chunk.toString().trim() + '\n')
  })

  const rpc = (request) =>
    new Promise((resolve, reject) => {
      const entry = {
        resolve,
        reject,
        timer: setTimeout(() => {
          pending.delete(request.id)
          reject(new Error(`Sidecar timeout >${TIMEOUT_MS / 1000}s (id=${request.id})`))
        }, TIMEOUT_MS),
      }
      pending.set(request.id, entry)
      child.stdin.write(JSON.stringify(request) + '\n')
    })

  const dispose = () => {
    for (const [, p] of pending) {
      clearTimeout(p.timer)
      p.reject(new Error('Sidecar terminated before response'))
    }
    pending.clear()
    try {
      child.stdin.end()
    } catch {
      // noop: stdin may already be closed when the sidecar is gone
    }
    child.kill('SIGTERM')
    const killer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // noop: process already exited
      }
    }, 5000)
    child.once('exit', () => clearTimeout(killer))
  }

  child.once('error', (err) => {
    for (const [, p] of pending) p.reject(err)
  })

  return { rpc, dispose }
}

const newId = () => (Date.now() + Math.random() * 1e6) | 0

// ---- Parse tool calls from LLM text ----
// Format: [tool: name(key=value, key2="value with, comma")]
// Quote-aware so commas inside quoted values do not split pairs.
// Diekspor untuk smoke test CI (pure function, tanpa efek samping).
export function parseToolCalls(text) {
  const calls = []
  const callRe = /\[tool:\s*([^\s()]+)\(([^)]*)\)\]/g
  let m
  while ((m = callRe.exec(text)) !== null) {
    const name = m[1]
    const argsStr = m[2]
    const args = {}
    let cur = ''
    const pairs = []
    let quote = null
    for (const ch of argsStr) {
      if (quote) {
        cur += ch
        if (ch === quote) quote = null
      } else if (ch === '"' || ch === "'") {
        quote = ch
        cur += ch
      } else if (ch === ',') {
        pairs.push(cur)
        cur = ''
      } else {
        cur += ch
      }
    }
    if (cur.trim()) pairs.push(cur)
    for (const pair of pairs) {
      const eq = pair.indexOf('=')
      if (eq === -1) continue
      const key = pair.slice(0, eq).trim()
      let v = pair.slice(eq + 1).trim()
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1)
      } else if (v === 'true' || v === 'false') {
        v = v === 'true'
      } else if (/^-?\d+$/.test(v)) {
        v = parseInt(v, 10)
      }
      args[key] = v
    }
    calls.push({ name, arguments: args })
  }
  return calls
}

// ---- Run one Mark agent task ----
export async function runMarkAgent(task, model, provider) {
  const config = {
    aiProvider: provider || 'gemini-web',
    geminiWebModel: model || 'gemini-3.6-flash',
    temperature: 0,
  }

  const startedAt = Date.now()
  const messages = [{ role: 'user', content: task.prompt }]
  const stepLog = []
  let steps = 0
  let toolCalls = 0
  let response = ''

  const sidecar = createSidecar()
  try {
    // Turn budget: task.maxTurns menimpa default MAX_ITER (ala turn-limit
    // eval — MCP Atlas memakai limit 100 turn). Tidak ada loop tak terbatas.
    const maxIter = task.maxTurns || MAX_ITER
    for (let iter = 0; iter < maxIter; iter++) {
      const resp = await sidecar.rpc({
        id: newId(),
        action: 'ai:fetch',
        payload: [{ messages, config, isSmallTask: false, jsonSchema: null }],
      })

      if (!resp.success) {
        throw new Error(resp.error?.message || String(resp.error))
      }

      const data = resp.data
      response =
        typeof data === 'string'
          ? data
          : data?.content?.text || data?.content || data?.text || JSON.stringify(data)

      messages.push({ role: 'assistant', content: response })
      steps++
      stepLog.push({ step: steps, type: 'fetch', response: response.slice(0, 200) })

      const calls = parseToolCalls(response)
      if (calls.length === 0) break

      toolCalls += calls.length

      for (const call of calls) {
        let toolResult
        try {
          const toolResp = await sidecar.rpc({
            id: newId(),
            action: 'native-tool:execute',
            payload: [call.name, call.arguments, {}],
          })
          toolResult = toolResp.success
            ? toolResp.data || 'ok'
            : `ERROR: ${toolResp.error?.message || toolResp.error}`
        } catch (err) {
          toolResult = `ERROR: ${err.message}`
        }

        const toolText =
          typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
        messages.push({ role: 'tool', content: toolText, toolName: call.name })
        stepLog.push({
          step: steps,
          type: 'tool',
          tool: call.name,
          result: toolText.slice(0, 200),
        })
      }
    }
  } finally {
    sidecar.dispose()
  }

  return {
    response: response.trim(),
    trajectory: {
      steps,
      toolCalls,
      stepLog,
      startedAt,
      finishedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      tokenUsage: { promptTokens: null, completionTokens: null, totalTokens: null, estimated: false },
    },
    tokenUsage: { promptTokens: null, completionTokens: null, totalTokens: null, estimated: false },
  }
}

// ---- CLI self-test ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const task = { taskId: 'echo-01', prompt: 'Please respond with exactly: MarkBench is active' }
  const start = Date.now()
  runMarkAgent(task, 'gemini-3.6-flash', 'gemini-web')
    .then((r) => {
      console.log('RESPONSE:', r.response.slice(0, 200))
      console.log('TRAJECTORY:', JSON.stringify(r.trajectory, null, 2))
      console.log('DURATION:', Date.now() - start, 'ms')
    })
    .catch((e) => console.error('ERROR:', e.message))
}
