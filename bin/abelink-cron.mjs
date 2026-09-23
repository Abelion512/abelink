#!/usr/bin/env bun
// bin/abelink-cron.mjs — Fase 4: greenfield cron scheduler (kontrak §5).
//
// jobs.json di brandDir()/cron/jobs.json, tulis tmp+rename + mkdir -p.
// Daemon: tick 60 dtk -> due (nextRunAt<=now; catch-up = run sekali,
// nextRunAt=now+interval, missed:true) -> lock O_EXCL + stale-PID check ->
// spawn `bun bin/abelink.mjs --json` (ABELINK_CRON=1, ABELINK_JOB_ID) ->
// ledger JSONL -> update atomic -> release. At-most-once = lock + single-flight.
// Fresh session per fire (child process). Delivery: log dulu; telegram via
// sender service yang ada bila terjangkau, else tetap log (jujur).
// Recursion guard: helper checkCronRecursionGuard di headlessCli.js;
// child berjalan dengan ABELINK_CRON=1 sehingga guard itu menolak cron_*.
//
// Pure/testable helpers diekspor di bawah; efek daemon hanya jalan di main().

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { brandDir } from '../sidecar/main/utils/dataHome.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const AGENT_BIN = path.join(ROOT, 'bin', 'abelink.mjs')
const BUN_BIN = process.env.BUN_BIN || 'bun'

export const CRON_VERSION = 1
export const TICK_MS = 60_000
export const REPLY_CAP = 2000

// Single-flight dalam proses (at-most-once lapis 2; lapis 1 = lock file).
const inFlight = new Set()

// ---- paths (env-injected, testable) ----

export function cronDir(env = process.env) {
  return path.join(brandDir(env), 'cron')
}

export function jobsFilePath(env = process.env) {
  return path.join(cronDir(env), 'jobs.json')
}

export function ledgerPath(env = process.env) {
  return path.join(cronDir(env), 'runs.jsonl')
}

export function locksDir(env = process.env) {
  return path.join(cronDir(env), 'locks')
}

// ---- schedule ----

function parseCronField(field, min, max) {
  // Validasi bentuk saja; matching di cronFieldMatch(). Throw bila tak valid.
  if (field === '*') return true
  for (const part of String(field).split(',')) {
    const m = part.match(/^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/)
    if (!m) throw new Error(`field cron tak valid: "${part}"`)
    const [, a, b, step] = m
    const lo = a === '*' ? min : Number(a)
    const hi = b !== undefined ? Number(b) : (a === '*' ? max : Number(a))
    if (lo < min || hi > max || lo > hi) throw new Error(`rentang cron di luar batas: "${part}"`)
    if (step !== undefined && Number(step) <= 0) throw new Error(`step cron tak valid: "${part}"`)
  }
  return true
}

export function parseSchedule(schedule = {}) {
  if (!schedule || typeof schedule !== 'object') throw new Error('schedule harus objek.')
  if (schedule.kind === 'intervalSec') {
    const everySec = Number(schedule.everySec)
    if (!Number.isFinite(everySec) || everySec < 60) {
      throw new Error('intervalSec.everySec harus angka >= 60 (detik).')
    }
    return { kind: 'intervalSec', everySec: Math.floor(everySec) }
  }
  if (schedule.kind === 'cron') {
    const expr = String(schedule.expr || '').trim()
    const fields = expr.split(/\s+/)
    if (fields.length !== 5) throw new Error('cron.expr harus 5 field: "m h dom mon dow".')
    const bounds = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]]
    fields.forEach((f, i) => parseCronField(f, bounds[i][0], bounds[i][1]))
    return { kind: 'cron', expr: fields.join(' ') }
  }
  throw new Error(`schedule.kind tak dikenal: "${schedule.kind}" (intervalSec|cron).`)
}

function cronValueMatch(value, field, min, max) {
  if (field === '*') return true
  const v = value === 7 && max === 7 ? 0 : value // dow: 7 = Sunday
  for (const part of String(field).split(',')) {
    const m = part.match(/^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/)
    if (!m) return false
    const [, a, b, step] = m
    const lo = a === '*' ? min : Number(a)
    const hi = b !== undefined ? Number(b) : (a === '*' ? max : Number(a))
    const st = step !== undefined ? Number(step) : 1
    for (let x = lo; x <= hi; x += st) {
      const norm = max === 7 && x === 7 ? 0 : x
      if (norm === v) return true
    }
  }
  return false
}

function cronPartsInTz(dateMs, timezone) {
  // stdlib Intl — tanpa dep baru. Throw eksplisit bila timezone tak valid.
  let fmt
  try {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || undefined,
      hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', weekday: 'short'
    })
  } catch (e) {
    throw new Error(`timezone tak valid: "${timezone}" (${e?.message || e})`)
  }
  const parts = Object.fromEntries(fmt.formatToParts(new Date(dateMs)).map((p) => [p.type, p.value]))
  const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    minute: Number(parts.minute),
    hour: Number(parts.hour),
    dom: Number(parts.day),
    month: Number(parts.month),
    dow: dowMap[parts.weekday]
  }
}

export function nextCronRun(expr, fromMs, timezone = null) {
  const fields = String(expr).trim().split(/\s+/)
  if (fields.length !== 5) throw new Error('cron.expr harus 5 field.')
  let cursor = Math.floor(Number(fromMs) / 60000) * 60000 + 60000
  const limit = cursor + 366 * 24 * 60 * 60000
  while (cursor <= limit) {
    const p = cronPartsInTz(cursor, timezone)
    if (
      cronValueMatch(p.minute, fields[0], 0, 59) &&
      cronValueMatch(p.hour, fields[1], 0, 23) &&
      cronValueMatch(p.dom, fields[2], 1, 31) &&
      cronValueMatch(p.month, fields[3], 1, 12) &&
      cronValueMatch(p.dow, fields[4], 0, 7)
    ) {
      return cursor
    }
    cursor += 60000
  }
  throw new Error(`cron "${expr}": tak ada kemunculan dalam 366 hari.`)
}

export function computeNextRun(job, fromMs) {
  const sched = parseSchedule(job.schedule)
  const from = Number(fromMs)
  if (sched.kind === 'intervalSec') return from + sched.everySec * 1000
  return nextCronRun(sched.expr, from, job.timezone || null)
}

// Missed-occurrence contract (§5): due = nextRunAt<=now; catch-up = run
// SEKALI, nextRunAt dihitung ulang dari now (periode terlewat dilewati),
// missed:true dicatat di ledger + lastStatus.
export function dueStatus(job, nowMs) {
  const now = Number(nowMs)
  const next = Number(job?.nextRunAt)
  if (!Number.isFinite(next)) return { due: true, missed: false }
  if (next > now) return { due: false, missed: false }
  const sched = parseSchedule(job.schedule)
  const overdueBy = now - next
  const missed = sched.kind === 'intervalSec'
    ? overdueBy >= sched.everySec * 1000
    : overdueBy > TICK_MS
  return { due: true, missed }
}

// ---- store (atomic tmp+rename) ----

export function blankStore() {
  return { version: CRON_VERSION, jobs: [] }
}

export function loadJobs({ env = process.env, file = null } = {}) {
  const f = file || jobsFilePath(env)
  try {
    const raw = fs.readFileSync(f, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.jobs)) return blankStore()
    return { version: 1, jobs: parsed.jobs }
  } catch {
    return blankStore() // missing/corrupt -> store kosong (tak pernah throw)
  }
}

export function saveJobsAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
    fs.renameSync(tmp, file)
  } catch (e) {
    try { fs.unlinkSync(tmp) } catch {}
    throw e
  }
  return file
}

export function makeJobId() {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function createJob(input = {}, nowMs = Date.now()) {
  const sched = parseSchedule(input.schedule)
  const now = Number(nowMs)
  const delivery = input.delivery || { platform: 'log', target: null }
  if (!['log', 'telegram'].includes(delivery.platform)) {
    throw new Error('delivery.platform harus "log"|"telegram".')
  }
  if (!input.prompt || !String(input.prompt).trim()) throw new Error('prompt wajib diisi.')
  const job = {
    id: input.id || makeJobId(),
    name: input.name || 'cron-job',
    prompt: String(input.prompt),
    schedule: sched,
    timezone: input.timezone || null,
    enabled: input.enabled !== false,
    delivery: { platform: delivery.platform, target: delivery.target || null },
    effort: input.effort || 'low',
    maxTurns: Number(input.maxTurns) > 0 ? Number(input.maxTurns) : 15,
    workspace: input.workspace || process.cwd(),
    createdAt: new Date(now).toISOString(),
    lastRunAt: null,
    nextRunAt: now,
    lastStatus: null
  }
  job.nextRunAt = computeNextRun(job, now)
  return job
}

// ---- locking (O_EXCL + stale-PID) ----

export function lockPathFor(jobId, env = process.env) {
  const safe = String(jobId).replace(/[^a-zA-Z0-9_-]/g, '_')
  return path.join(locksDir(env), `${safe}.lock`)
}

export function isPidAlive(pid) {
  try {
    process.kill(Number(pid), 0)
    return true
  } catch (e) {
    if (e?.code === 'EPERM') return true // ada, tapi bukan milik kita
    return false // ESRCH / tak valid -> mati
  }
}

// Sync (penting untuk at-most-once intra-proses: dua tick konkuren tak bisa
// sama-sama menang). Return {acquired:true} atau throw Error('locked').
export function acquireJobLock(lockPath) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true })
  const payload = JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })
  try {
    fs.writeFileSync(lockPath, payload, { flag: 'wx', mode: 0o600 })
    return { acquired: true, stale: false }
  } catch (e) {
    if (e?.code !== 'EEXIST') throw e
  }
  // Kontensi: cek stale-PID; stale -> reap sekali lalu coba lagi.
  try {
    const prev = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
    if (prev?.pid && !isPidAlive(prev.pid)) {
      try { fs.unlinkSync(lockPath) } catch {}
      fs.writeFileSync(lockPath, payload, { flag: 'wx', mode: 0o600 })
      return { acquired: true, stale: true }
    }
  } catch (e) {
    if (e?.code !== 'EEXIST') throw new Error(`locked: ${lockPath}`)
  }
  throw new Error(`locked: ${lockPath}`)
}

export function releaseJobLock(lockPath) {
  try { fs.unlinkSync(lockPath) } catch {}
}

// ---- ledger ----

export function validateLedgerEnvelope(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'envelope harus objek.' }
  if (obj.v !== 1) return { ok: false, error: 'envelope.v harus 1.' }
  if (!obj.ts) return { ok: false, error: 'envelope.ts wajib.' }
  if (!obj.jobId || typeof obj.jobId !== 'string') return { ok: false, error: 'envelope.jobId wajib string.' }
  if (!obj.outcome || typeof obj.outcome !== 'string') return { ok: false, error: 'envelope.outcome wajib string.' }
  return { ok: true, error: null }
}

export function appendLedger(ledgerFile, envelope) {
  const check = validateLedgerEnvelope(envelope)
  if (!check.ok) throw new Error(`ledger envelope tak valid: ${check.error}`)
  fs.mkdirSync(path.dirname(ledgerFile), { recursive: true })
  fs.appendFileSync(ledgerFile, JSON.stringify(envelope) + '\n', { mode: 0o600 })
  return ledgerFile
}

// ---- fire ----

function defaultSpawnFn({ argv, env }) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const child = spawn(BUN_BIN, argv, { cwd: ROOT, env })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (c) => { stdout += c.toString() })
    child.stderr?.on('data', (c) => { stderr += c.toString() })
    child.on('error', (err) => resolve({ code: 1, stdout, stderr: String(err?.message || err), durationMs: Date.now() - t0 }))
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr, durationMs: Date.now() - t0 }))
  })
}

// Delivery: log dulu (selalu tercatat). Telegram dicoba via sender service
// yang ada; bila bot tak terhubung / import gagal -> tetap log, jujur di
// envelope (delivery:'log-fallback', deliveryError).
async function defaultDeliverFn({ job, reply, outcome }) {
  if (job?.delivery?.platform === 'telegram' && job?.delivery?.target) {
    try {
      const svc = await import('../sidecar/main/telegram/telegram-service.js')
      if (typeof svc.sendTelegramMessage === 'function') {
        const res = await svc.sendTelegramMessage(job.delivery.target, String(reply || outcome).slice(0, 4000))
        if (res?.success) return { delivered: true, platform: 'telegram' }
        return { delivered: false, platform: 'log-fallback', deliveryError: res?.error || 'telegram send gagal' }
      }
    } catch (e) {
      return { delivered: false, platform: 'log-fallback', deliveryError: `telegram tak terjangkau: ${e?.message || e}` }
    }
  }
  return { delivered: true, platform: 'log' }
}

function buildChildArgv(job) {
  const argv = [AGENT_BIN, String(job.prompt), '--json']
  if (job.workspace) argv.push('--workspace', String(job.workspace))
  if (job.effort) argv.push('--effort', String(job.effort))
  if (job.maxTurns) argv.push('--max-turns', String(job.maxTurns))
  return argv
}

export async function runJobOnce(jobId, { env = process.env, now = Date.now(), spawnFn = defaultSpawnFn, deliverFn = defaultDeliverFn, force = false } = {}) {
  const file = jobsFilePath(env)
  const store = loadJobs({ env, file })
  const job = store.jobs.find((j) => j.id === jobId)
  if (!job) return { fired: false, reason: 'job tak ditemukan' }
  if (!job.enabled && !force) return { fired: false, reason: 'job disabled' }
  if (inFlight.has(jobId)) return { fired: false, reason: 'single-flight: sudah berjalan' }

  const lockPath = lockPathFor(jobId, env)
  try {
    acquireJobLock(lockPath)
  } catch {
    return { fired: false, reason: 'locked: pemegang lain' }
  }
  inFlight.add(jobId)
  const t0 = Date.now()
  try {
    const nowMs = Number(now)
    const { missed } = force ? { missed: false } : dueStatus(job, nowMs)
    const childEnv = { ...env, ABELINK_CRON: '1', ABELINK_JOB_ID: job.id }
    const res = await spawnFn({ job, argv: buildChildArgv(job), env: childEnv, cwd: ROOT })
    let outcome = 'failed'
    let reply = ''
    let terminalReason = `exit-${res?.code ?? '?'}`
    try {
      const parsed = JSON.parse(String(res?.stdout || ''))
      if (parsed && typeof parsed === 'object') {
        outcome = parsed.outcome || (parsed.success ? 'completed' : 'failed')
        reply = String(parsed.reply || '')
        terminalReason = parsed.terminalReason || terminalReason
      }
    } catch {
      reply = String(res?.stdout || res?.stderr || '').slice(0, REPLY_CAP)
    }
    const delivery = await deliverFn({ job, reply, outcome }).catch((e) => ({
      delivered: false, platform: 'log-fallback', deliveryError: String(e?.message || e)
    }))
    const envelope = {
      v: 1,
      ts: new Date(nowMs).toISOString(),
      jobId: job.id,
      jobName: job.name,
      outcome,
      terminalReason,
      reply: String(reply).slice(0, REPLY_CAP),
      missed,
      durationMs: Date.now() - t0,
      delivery: delivery.platform,
      ...(delivery.deliveryError ? { deliveryError: delivery.deliveryError } : {})
    }
    appendLedger(ledgerPath(env), envelope)
    const fresh = loadJobs({ env, file })
    const idx = fresh.jobs.findIndex((j) => j.id === jobId)
    if (idx >= 0) {
      fresh.jobs[idx].lastRunAt = new Date(nowMs).toISOString()
      fresh.jobs[idx].nextRunAt = computeNextRun(fresh.jobs[idx], nowMs) // catch-up dari now
      fresh.jobs[idx].lastStatus = { ts: envelope.ts, outcome, missed }
      saveJobsAtomic(file, fresh)
    }
    return { fired: true, outcome, missed, delivery: delivery.platform }
  } finally {
    inFlight.delete(jobId)
    releaseJobLock(lockPath)
  }
}

export async function tickOnce({ env = process.env, now = Date.now(), spawnFn, deliverFn } = {}) {
  const store = loadJobs({ env })
  const nowMs = Number(now)
  const results = []
  for (const job of store.jobs) {
    if (!job.enabled) continue
    let status
    try {
      status = dueStatus(job, nowMs)
    } catch {
      continue // schedule rusak -> lewati, jangan matikan tick
    }
    if (!status.due) continue
    results.push({ jobId: job.id, ...(await runJobOnce(job.id, { env, now: nowMs, spawnFn, deliverFn })) })
  }
  return results
}

// ---- CLI (kelola jobs.json saja; tak menyentuh run path) ----

function printCronHelp() {
  console.log(`
abelink-cron — penjadwal cron Abelink (Fase 4)

Usage:
  bun bin/abelink-cron.mjs [cron] <command> [flags]   # daemon default tanpa command
  bun bin/abelink-cron.mjs --once                     # satu tick lalu exit

Commands (kelola jobs.json saja):
  list [--json]                                       daftar job
  create --name N --prompt P (--every SEC | --cron "EXPR")
         [--timezone TZ] [--delivery log|telegram:<target>]
         [--effort E] [--max-turns N] [--workspace DIR] [--disabled]
  pause <id> | resume <id> | remove <id> | run <id>    kelola / picu manual

Daemon:
  (tanpa command)                                     tick tiap 60 dtk, at-most-once
`)
}

function takeFlag(args, ...names) {
  for (const n of names) {
    const i = args.indexOf(n)
    if (i >= 0 && args[i + 1] && !String(args[i + 1]).startsWith('-')) return args[i + 1]
  }
  return null
}

function hasFlag(args, ...names) {
  return names.some((n) => args.includes(n))
}

async function main() {
  const raw = process.argv.slice(2)
  const args = raw[0] === 'cron' ? raw.slice(1) : raw
  const cmd = args[0]

  if (!cmd || cmd === 'daemon') {
    if (hasFlag(args, '--once')) {
      const res = await tickOnce({})
      console.log(JSON.stringify({ tick: 'once', fired: res }, null, 2))
      process.exit(0)
    }
    const tickMs = Number(takeFlag(args, '--tick-ms')) > 0 ? Number(takeFlag(args, '--tick-ms')) : TICK_MS
    console.log(`[cron] daemon jalan: tick ${tickMs}ms, store ${jobsFilePath()}`)
    const loop = async () => {
      try {
        const res = await tickOnce({})
        const fired = res.filter((r) => r.fired)
        if (fired.length) console.log(`[cron] fired: ${JSON.stringify(fired)}`)
      } catch (e) {
        console.error(`[cron] tick error: ${e?.message || e}`)
      }
    }
    await loop()
    const timer = setInterval(loop, tickMs)
    const stop = () => { clearInterval(timer); process.exit(0) }
    process.on('SIGTERM', stop)
    process.on('SIGINT', stop)
    return
  }

  if (cmd === '-h' || cmd === '--help' || cmd === 'help') {
    printCronHelp()
    process.exit(0)
  }

  const file = jobsFilePath()

  if (cmd === 'list') {
    const store = loadJobs({})
    if (hasFlag(args, '--json')) {
      console.log(JSON.stringify(store, null, 2))
    } else {
      for (const j of store.jobs) {
        const sched = j.schedule?.kind === 'intervalSec' ? `tiap ${j.schedule.everySec}s` : `cron "${j.schedule?.expr}"`
        console.log(`${j.enabled ? '[on] ' : '[off]'} ${j.id} "${j.name}" ${sched} -> ${j.delivery?.platform}${j.delivery?.target ? ':' + j.delivery.target : ''} next=${j.nextRunAt ? new Date(j.nextRunAt).toISOString() : '-'}`)
      }
      if (!store.jobs.length) console.log('(tak ada job)')
    }
    process.exit(0)
  }

  if (cmd === 'create') {
    try {
      const every = takeFlag(args, '--every')
      const expr = takeFlag(args, '--cron')
      const schedule = every ? { kind: 'intervalSec', everySec: Number(every) } : { kind: 'cron', expr }
      const delRaw = takeFlag(args, '--delivery') || 'log'
      const [platform, ...tgt] = String(delRaw).split(':')
      const job = createJob({
        name: takeFlag(args, '--name') || 'cron-job',
        prompt: takeFlag(args, '--prompt'),
        schedule,
        timezone: takeFlag(args, '--timezone'),
        delivery: { platform, target: tgt.join(':') || null },
        effort: takeFlag(args, '--effort') || 'low',
        maxTurns: takeFlag(args, '--max-turns') ? Number(takeFlag(args, '--max-turns')) : 15,
        workspace: takeFlag(args, '--workspace') || process.cwd(),
        enabled: !hasFlag(args, '--disabled')
      })
      const store = loadJobs({})
      store.jobs.push(job)
      saveJobsAtomic(file, store)
      console.log(JSON.stringify({ created: job.id, nextRunAt: new Date(job.nextRunAt).toISOString() }, null, 2))
      process.exit(0)
    } catch (e) {
      console.error(`[ERROR] create gagal: ${e?.message || e}`)
      process.exit(3)
    }
  }

  if (['pause', 'resume', 'remove', 'run'].includes(cmd)) {
    const id = args[1]
    if (!id) {
      console.error(`[ERROR] ${cmd} butuh <id>.`)
      process.exit(3)
    }
    if (cmd === 'run') {
      const res = await runJobOnce(id, {})
      console.log(JSON.stringify(res, null, 2))
      process.exit(res.fired ? 0 : 1)
    }
    const store = loadJobs({})
    const idx = store.jobs.findIndex((j) => j.id === id)
    if (idx < 0) {
      console.error(`[ERROR] job tak ditemukan: ${id}`)
      process.exit(1)
    }
    if (cmd === 'remove') store.jobs.splice(idx, 1)
    else store.jobs[idx].enabled = cmd === 'resume'
    saveJobsAtomic(file, store)
    console.log(JSON.stringify({ [cmd]: id }, null, 2))
    process.exit(0)
  }

  console.error(`[ERROR] command tak dikenal: "${cmd}". Lihat --help.`)
  process.exit(3)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
