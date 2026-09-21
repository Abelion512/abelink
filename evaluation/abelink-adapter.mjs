#!/usr/bin/env node
// Abelink agent adapter for AbelinkBench — talks to sidecar/engine.mjs over JSON-lines RPC.
// One persistent sidecar child per run; requests are multiplexed by id.
//
// Effort override contract (owner request: task-level A/B, NOT process-global):
//   resolveTaskEffort precedence: task.effort > benchmark effort (opts) >
//   ABELINK_BENCH_EFFORT env > system default ('low').
// Effort is stamped into every task result + trajectory so reports can answer
// "which effort ran, did success/recovery/termination improve" per task.

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ARCH_VALUES, resolveBenchArch, currentBenchArch } from '../src/api/ai/benchArch.js'

export { ARCH_VALUES, resolveBenchArch, currentBenchArch }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SIDECAR = path.join(ROOT, 'sidecar', 'engine.mjs')
const BUN = process.env.BUN_BIN || 'bun'

const MAX_ITER = 5 // default; bisa ditimpa per task via task.maxTurns (turn-budget eval)
const TIMEOUT_MS = 300000

// ---- Effort ladder constants & resolution (pure, exported for smoke/unit tests)
// Loader-agnostic bridge into the new typed effort system so legacy tests and
// benchmark harness can still import these symbols without depending on a
// browser/worker module graph.

// Real constants from the typed effort system when available; otherwise
// real constants so tests and harness do not rely on a broken promise shape.
const _resolvedValues = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']

// The typed effort system exports real sync values; import() returns a
// Promise, so the module must be awaited before its exports are readable.
// Synchronous top-level consumers get the fallback values; the real
// constants are loaded lazily on first use via _loadEffortSystem().
let _effortModule = null
let _effortModulePromise = null

async function _loadEffortSystem() {
  if (_effortModule) return _effortModule
  if (_effortModulePromise) return _effortModulePromise
  _effortModulePromise = import('../src/api/ai/effortSystem.js')
    .then((mod) => {
      _effortModule = mod
      return mod
    })
    .catch(() => null)
  return _effortModulePromise
}

// Real constants from the typed effort system when available.
function _getEffortValues() {
  if (_effortModule && _effortModule.EFFORT_VALUES) return _effortModule.EFFORT_VALUES
  return _resolvedValues
}

function _getSystemDefaultEffort() {
  if (_effortModule && _effortModule.SYSTEM_DEFAULT_EFFORT != null) return _effortModule.SYSTEM_DEFAULT_EFFORT
  return 'low'
}

function _getAgentArchVersion() {
  if (_effortModule && _effortModule.AGENT_ARCH_VERSION != null) return _effortModule.AGENT_ARCH_VERSION
  return 'linux-1.0'
}

function _getBenchSchemaVersion() {
  if (_effortModule && _effortModule.BENCH_SCHEMA_VERSION != null) return _effortModule.BENCH_SCHEMA_VERSION
  return 3 // v3: +arch axis +worldState (Fase 2 bench)
}

export const EFFORT_VALUES = _getEffortValues()
export const SYSTEM_DEFAULT_EFFORT = _getSystemDefaultEffort()
export const AGENT_ARCH_VERSION = _getAgentArchVersion()
export const BENCH_SCHEMA_VERSION = _getBenchSchemaVersion()

// Backward-compatible sync aliases kept for existing importers that expect
// synchronous values from the evaluation package.
export const EFFORT_VALUES_sync = _resolvedValues
export const AGENT_ARCH_VERSION_sync = 'linux-1.0'
export const BENCH_SCHEMA_VERSION_sync = 3

// Lazily resolve the real constants after module load. This is best-effort;
// synchronous consumers continue to use the fallback values above.
_loadEffortSystem()


export function resolveTaskEffortSync({ taskEffort, benchmarkEffort, envEffort } = {}) {
  const values = _getEffortValues()
  if (values.includes(taskEffort)) return taskEffort
  if (values.includes(benchmarkEffort)) return benchmarkEffort
  if (values.includes(envEffort)) return envEffort
  return 'low'
}

// Precedence (explicit, spec-compliant):
//   1. task.effort            (task-level override in terminal-bench registry)
//   2. benchmark effort       (run.mjs --effort / --efforts value)
//   3. environment default    (ABELINK_BENCH_EFFORT, kept for CLI experiments)
//   4. system default         ('low')
export async function resolveTaskEffort({ taskEffort, benchmarkEffort, envEffort } = {}) {
  const values = _getEffortValues()
  if (values.includes(taskEffort)) return taskEffort
  if (values.includes(benchmarkEffort)) return benchmarkEffort
  if (values.includes(envEffort)) return envEffort
  return _getSystemDefaultEffort() || 'low'
}

export function normalizeEffort(value, fallback = 'low') {
  return _getEffortValues().includes(value) ? value : fallback
}



// ---- Persistent sidecar child with id-multiplexed JSON-lines RPC ----
// `representation` (PR46 browser ablation) is forwarded to the child so the
// observation path really renders differently: sidecar/main/tools/browserTools
// reads ABELINK_BROWSER_OBSERVATION via resolveObservationRepresentation().
// null/undefined means "unset" -> semantic-first (unchanged app behavior).
function createSidecar(arch = 'basic', representation = null) {
  const child = spawn(BUN, [SIDECAR], {
    stdio: ['pipe', 'pipe', 'pipe'],
    // ABELINK_BENCH_ARCH propagates the arch axis to the engine so executor-side
    // wiring (renderer Task 5 lineage/scoring, future engine gates) can read it.
    env: {
      ...process.env,
      ABELINK_DEBUG_AI: '0',
      ABELINK_BENCH_ARCH: arch,
      ...(representation ? { ABELINK_BROWSER_OBSERVATION: representation } : {}),
    },
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
// Scanner seimbang (bukan regex `[^)]*`): konten tak-berquote yang memuat
// ')' — mis. "(efek fotovoltaik)" — previously menggagalkan SELURUH call
// (pilot vanilla: tools 0 padahal model sudah bertindak). Quote-aware agar
// koma di dalam quote tidak memecah pasangan.
// Diekspor untuk smoke test CI (pure function, tanpa efek samping).
function splitArgs(argsStr) {
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
  return args
}

export function parseToolCalls(text) {
  const calls = []
  const src = String(text || '')
  let i = 0
  for (;;) {
    const at = src.indexOf('[tool:', i)
    if (at === -1) break
    let j = at + 6
    while (j < src.length && /\s/.test(src[j])) j++
    let k = j
    while (k < src.length && !/[\s()]/.test(src[k])) k++
    const name = src.slice(j, k)
    let m = k
    while (m < src.length && /\s/.test(src[m])) m++
    if (!name || src[m] !== '(') {
      i = k
      continue
    }
    // Pindai argumen dengan hitung depth + quote: ')' di dalam quote atau
    // depth>0 bukan penutup. Penutup = ')' yang mengembalikan depth ke 0
    // dan langsung diikuti ']'.
    let depth = 0
    let quote = null
    let argsStr = null
    let end = -1
    for (let p = m; p < src.length; p++) {
      const ch = src[p]
      if (quote) {
        if (ch === quote) quote = null
      } else if (ch === '"' || ch === "'") {
        quote = ch
      } else if (ch === '(') {
        depth++
      } else if (ch === ')') {
        depth--
        if (depth === 0) {
          argsStr = src.slice(m + 1, p)
          end = p
          break
        }
      }
    }
    if (argsStr === null || src[end + 1] !== ']') {
      i = m + 1
      continue
    }
    calls.push({ name, arguments: splitArgs(argsStr) })
    i = end + 2
  }
  return calls
}

// ---- Bench tool-call bridge (pilot-found fix) ----
// Dua bug yang membuat SEMUA task dunia gagal 0 tool call:
//  1. Protokol `[tool: ...]` tidak pernah diajarkan ke model (prompt mentah).
//  2. `native-tool:execute` menerima query STRING delimiter-'||'
//     (write-file: path||content, run-shell: perintah, git-commit:
//     message||cwd), tetapi adapter mengirim OBJECT arguments mentah ->
//     `query.split is not a function` di setiap handler.
// Preamble + mapper ini HANYA untuk bench; perilaku aplikasi tidak berubah.

// Argumen per tool yang dipakai task bench (sumber: sidecar/main/tools/*).
const TOOL_ARG_DOCS = {
  'write-file': 'path="..." content="..."',
  'read-file': 'path="..."',
  'run-shell': 'command="..." (awali dengan `cd <dir> &&` bila perintah harus jalan di direktori tertentu)',
  'git-commit': 'message="..." cwd="..."',
  'list-dir': 'path="..."'
}

// Identity of the bench prompt construction (task prompt + tool preamble).
// Recorded in the PR46 measurement report as `identity.promptTemplate` so the
// architecture A/B can verify that the prompt protocol was held fixed; bump the
// version whenever the preamble/format below changes its meaning.
export const BENCH_PROMPT_TEMPLATE = 'bench-tool-preamble-v1'

export function toolPreamble(requiredTools = [], hint = {}) {
  const tools = (requiredTools || []).filter((t) => TOOL_ARG_DOCS[t])
  if (tools.length === 0) return ''
  const lines = tools.map((t) => `- ${t}: [tool: ${t}(${TOOL_ARG_DOCS[t]})]`)
  const dir = typeof hint.workdir === 'string' && hint.workdir ? hint.workdir : 'WORKDIR'
  return (
    `\n\n[ALAT] Kamu memiliki akses tool berikut untuk menyelesaikan tugas ini:\n${lines.join('\n')}\n` +
    `Cara memakai tool: tulis satu baris persis berformat [tool: nama(kunci="nilai")].\n` +
    `Contoh (satu baris, tanpa blok kode):\n[tool: write-file(path="${dir}/report.md", content="laporan lengkap di sini")]\n` +
    `Mohon: mulai respons pertamamu langsung dengan satu baris tool call; ` +
    `tulis isi content dengan baris baru asli (bukan teks \\n); ` +
    `laporkan file tersimpan hanya setelah observasi tool mengonfirmasi. ` +
    `Setelah tiap observasi, lanjutkan tool berikutnya hingga tugas selesai, lalu jawab singkat.`
  )
}

// Ubah OBJECT arguments model menjadi query STRING sidecar.
export function toNativeQuery(name, args = {}) {
  const a = args && typeof args === 'object' ? args : { query: String(args ?? '') }
  const s = (v) => (v === undefined || v === null ? '' : String(v))
  const joinTail = (parts) => parts.filter((x, i) => i === 0 || x !== '').join('||')
  switch (name) {
    case 'write-file':
      return `${s(a.path)}||${s(a.content)}`
    case 'read-file':
      return joinTail([s(a.path), s(a.startLine ?? a.start), s(a.endLine ?? a.end)])
    case 'run-shell':
    case 'run-bash':
      return s(a.command ?? a.query ?? a.cmd)
    case 'run-task':
      return s(a.taskId) ? `${s(a.taskId)}||${s(a.command ?? a.query)}` : s(a.command ?? a.query)
    case 'git-commit':
      return joinTail([s(a.message ?? a.query), s(a.cwd ?? a.repo ?? a.path)])
    case 'list-dir':
      return s(a.path ?? a.query ?? '')
    case 'git-status':
    case 'git-diff':
    case 'git-revert':
      return s(a.query ?? a.path ?? a.cwd ?? '')
    default: {
      if (typeof a.query === 'string') return a.query
      const keys = Object.keys(a)
      if (keys.length === 1) return s(a[keys[0]])
      if (typeof a.path === 'string' && typeof a.content === 'string') return `${a.path}||${a.content}`
      return keys.map((k) => s(a[k])).join('||')
    }
  }
}

// Normalized step shape consumed by ABELINK-Eval (evaluation/abelink-eval.mjs):
// { step, kind, toolCalls: [{ tool, query, result }], observation, response }
function pushTrace(trace, step, kind, payload) {
  trace.push({
    step,
    kind,
    toolCalls: payload.toolCalls || [],
    observation: payload.observation || '',
    response: payload.response || '',
  })
  return trace
}

// ---- Run one Abelink agent task ----
// runAbelinkAgent(task, model, provider, options)
//   options.effort = benchmark-level default (from run.mjs --effort/--efforts)
//   task.effort    = task-level override (terminal-bench registry)
export async function runAbelinkAgent(task, model, provider, options = {}) {
  // Task-level effort override: task.effort > options.effort (benchmark
  // default) > ABELINK_BENCH_EFFORT (env) > 'low' (system default).
  const effort = await resolveTaskEffort({
    taskEffort: task?.effort,
    benchmarkEffort: options?.effort,
    envEffort: process.env.ABELINK_BENCH_EFFORT,
  })
  // Arch axis: vanilla = model-only, basic = thin supervisor. Default basic;
  // executor-side wiring reads the same env. `avo` dihapus 2026-09-12.
  const arch = currentBenchArch()
  const config = {
    aiProvider: provider || 'gemini-web',
    geminiWebModel: model || 'gemini-3.6-flash',
    customEndpoint: process.env.CUSTOM_ENDPOINT || process.env.OPENAI_BASE_URL || 'http://localhost:20128/v1',
    customApiKey: process.env.CUSTOM_API_KEY || process.env.OPENAI_API_KEY || '',
    customModel: model || process.env.CUSTOM_MODEL || 'gemini/gemini-2.5-flash',
    groqApiKey: process.env.GROQ_API_KEY || '',
    groqModel: model || 'llama-3.1-8b-instant',
    temperature: 0,
    effortLevel: effort,
  }

  const startedAt = Date.now()
  // Prompt mentah + protokol tool (hanya bila task mendeklarasikan requiredTools).
  // Tanpa ini model tidak tahu sintaks [tool: ...] dan loop berhenti di turn 1.
  const messages = [
    { role: 'user', content: `${task.prompt}${toolPreamble(task.requiredTools, { workdir: task.workdir })}` }
  ]
  const trace = [] // normalized trajectory for ABELINK-Eval verifiers
  const stepLog = []
  let steps = 0
  let toolCalls = 0
  let response = ''

  const sidecar = createSidecar(arch, task?.representation || null)
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
      pushTrace(trace, steps, 'decision', { response })
      stepLog.push({ step: steps, type: 'fetch', response: response.slice(0, 200) })

      const calls = parseToolCalls(response)
      if (calls.length === 0) break

      toolCalls += calls.length

      for (const call of calls) {
        let toolResult
        try {
          // Sidecar menunggu query STRING '||', bukan OBJECT arguments model.
          const nativeQuery = toNativeQuery(call.name, call.arguments)
          const toolResp = await sidecar.rpc({
            id: newId(),
            action: 'native-tool:execute',
            payload: [call.name, nativeQuery, {}],
          })
          toolResult = toolResp.success
            ? toolResp.data || 'ok'
            : `ERROR: ${toolResp.error?.message || toolResp.error}`
        } catch (err) {
          toolResult = `ERROR: ${err.message}`
        }

        const toolText =
          typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
        // Cap sukses eksplisit: RPC ok + bukan {success:false} + bukan "ERROR:".
        // tasks-student-corporate hasToolEvidence membaca field ini dulu.
        const toolOk =
          !toolText.startsWith('ERROR:') &&
          !(typeof toolResult === 'object' && toolResult !== null && toolResult.success === false)
        messages.push({ role: 'tool', content: toolText, toolName: call.name })
        stepLog.push({
          step: steps,
          type: 'tool',
          tool: call.name,
          result: toolText.slice(0, 200),
          success: toolOk,
        })
        // Normalized step: ABELINK-Eval reads toolCalls[].tool/query + observation
        // to score orchestration, recovery and termination correctness.
        pushTrace(trace, steps, 'tool', {
          toolCalls: [
            {
              tool: call.name,
              query: toNativeQuery(call.name, call.arguments),
              result: toolText,
            },
          ],
          observation: toolText,
        })
      }
    }
  } finally {
    sidecar.dispose()
  }

  const finishedAt = Date.now()
  const trajectory = {
    steps, // count of AI decision iterations
    toolCalls,
    trace, // normalized steps consumed by ABELINK-Eval verifiers
    stepLog,
    startedAt,
    finishedAt,
    durationMs: finishedAt - startedAt,      meta: {
      effort,
      arch,
      model,
      provider: provider || 'gemini-web',
      // PR46: observation representation actually used for this run (null =
      // runtime default, i.e. semantic-first).
      browserObservationRepresentation: task?.representation || null,
      architectureVersion: AGENT_ARCH_VERSION,
      benchmarkSchemaVersion: BENCH_SCHEMA_VERSION,
    },
    tokenUsage: { promptTokens: null, completionTokens: null, totalTokens: null, estimated: false },
  }

  return {
    effort,
    arch,
    // Observation representation the sidecar was launched with (PR46 ablation).
    representation: task?.representation || null,
    response: response.trim(),
    trajectory,
    // Additive top-level aliases so bench verifiers get evidence without
    // digging into trajectory (fix C ctx plumbing: { sentinel, workdir, stepLog }).
    stepLog,
    trace,
    tokenUsage: { promptTokens: null, completionTokens: null, totalTokens: null, estimated: false },
  }
}

// ---- CLI self-test ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const task = { taskId: 'echo-01', prompt: 'Please respond with exactly: AbelinkBench is active' }
  const start = Date.now()
  runAbelinkAgent(task, 'gemini-3.6-flash', 'gemini-web')
    .then((r) => {
      console.log('RESPONSE:', r.response.slice(0, 200))
      console.log('EFFORT:', r.effort)
      console.log('TRAJECTORY:', JSON.stringify(r.trajectory, null, 2))
      console.log('DURATION:', Date.now() - start, 'ms')
    })
    .catch((e) => console.error('ERROR:', e.message))
}
