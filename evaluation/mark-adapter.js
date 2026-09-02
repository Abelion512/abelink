#!/usr/bin/env node
// Minimal Mark agent adapter via sidecar protocol.
// Reuses sidecar/engine.mjs + ai-bridge.js — same path Tauri uses.

import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SIDECAR = path.join(ROOT, 'sidecar', 'engine.mjs')
const BUN = process.env.BUN_BIN || 'bun'

const MAX_ITER = 5
const TIMEOUT_MS = 300000

// ---- RPC: send request, match response line by requestId ----
function sidecarRpc(child, request) {
  return new Promise((resolve, reject) => {
    let buf = ''
    let done = false
    const rid = request.id

    const to = setTimeout(() => {
      if (done) return
      done = true
      child.kill('SIGKILL')
      reject(new Error(`Timeout >${TIMEOUT_MS / 1000}s`))
    }, TIMEOUT_MS)

    const onData = (chunk) => {
      buf += chunk.toString()
      // Try to match response from accumulated buffer
      for (const line of buf.split('\n')) {
        if (!line.trim() || !line.includes(String(rid))) continue
        try {
          const obj = JSON.parse(line)
          if (obj.id === rid) {
            clearTimeout(to)
            done = true
            child.stdout.removeListener('data', onData)
            child.kill('SIGKILL')
            resolve(obj)
            return
          }
        } catch { continue }
      }
    }

    child.stdout.on('data', onData)
    child.stderr.on('data', (chunk) => {
      process.stderr.write('[sidecar] ' + chunk.toString().trim() + '\n')
    })

    child.on('error', (err) => {
      clearTimeout(to)
      if (done) return
      done = true
      reject(err)
    })

    child.stdin.write(JSON.stringify(request) + '\n')
  })
}

// ---- Parse tool calls from LLM text ----
function parseToolCalls(text) {
  const calls = []
  const regex = /\[tool:\s*(\S+)\(([^)]*)\)\]/g
  let m
  while ((m = regex.exec(text)) !== null) {
    const name = m[1]
    const argsStr = m[2]
    const args = {}
    const pairRe = /(\w+)=([^,]*?)(?=,|$)/g
    let p
    while ((p = pairRe.exec(argsStr)) !== null) {
      const v = p[2].trim()
      args[p[1].trim()] = v === 'true' ? true : v === 'false' ? false
        : /^\d+$/.test(v) ? parseInt(v, 10) : v.replace(/^["']|["']$/g, '')
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

  const messages = [{ role: 'user', content: task.prompt }]
  const stepLog = []
  let steps = 0
  let toolCalls = 0
  let response = ''

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const rid = (Date.now() + Math.random() * 1e6) | 0
    const req = {
      id: rid,
      action: 'ai:fetch',
      payload: [{ messages, config, isSmallTask: false, jsonSchema: null }],
    }

    const child = spawn(BUN, [SIDECAR], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, MARK_DEBUG_AI: '0' },
    })

    const resp = await sidecarRpc(child, req)

    if (!resp.success) {
      throw new Error(resp.error?.message || String(resp.error))
    }

    const data = resp.data
    response = typeof data === 'string' ? data
      : data?.content?.text || data?.content || data?.text || JSON.stringify(data)

    messages.push({ role: 'assistant', content: response })
    steps++
    stepLog.push({ step: steps, type: 'fetch', response: response.slice(0, 200) })

    const calls = parseToolCalls(response)
    if (calls.length === 0) break

    toolCalls += calls.length

    for (const call of calls) {
      const toolRid = (Date.now() + Math.random() * 1e6) | 0
      const toolReq = {
        id: toolRid,
        action: 'native-tool:execute',
        payload: [call.name, call.arguments, {}],
      }

      const toolChild = spawn(BUN, [SIDECAR], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, MARK_DEBUG_AI: '0' },
      })

      let toolResult
      try {
        const toolResp = await sidecarRpc(toolChild, toolReq)
        toolResult = toolResp.success ? (toolResp.data || 'ok') : `ERROR: ${toolResp.error?.message || toolResp.error}`
      } catch {
        toolResult = 'ERROR: tool timeout'
      }

      const toolText = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
      messages.push({ role: 'tool', content: toolText, toolName: call.name })
      stepLog.push({ step: steps, type: 'tool', tool: call.name, result: toolText.slice(0, 200) })
    }
  }

  return {
    response: response.trim(),
    trajectory: {
      steps,
      toolCalls,
      stepLog,
      tokenUsage: { promptTokens: null, completionTokens: null, totalTokens: null, estimated: false },
    },
    tokenUsage: { promptTokens: null, completionTokens: null, totalTokens: null, estimated: false },
  }
}

export const availableTools = () => {
  try {
    const nt = require('./sidecar/main/node-tools.js')
    return Object.keys(nt.NATIVE_TOOLS)
  } catch { return [] }
}

// ---- CLI self-test ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const task = { taskId: 'echo-01', prompt: 'Please respond with exactly: MarkBench is active' }
  const start = Date.now()
  runMarkAgent(task, 'gemini-3.6-flash', 'gemini-web')
    .then(r => {
      console.log('RESPONSE:', r.response.slice(0, 200))
      console.log('TRAJECTORY:', JSON.stringify(r.trajectory, null, 2))
      console.log('DURATION:', Date.now() - start, 'ms')
    })
    .catch(e => console.error('ERROR:', e.message))
}
