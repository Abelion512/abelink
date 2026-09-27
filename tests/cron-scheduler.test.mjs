// tests/cron-scheduler.test.mjs — Fase 4 (kontrak §5 plan 2026-09-22_cli-engine-4fase).
// Pure: parseSchedule/nextDue/missed; lock O_EXCL+stale; tmp+rename;
// at-most-once konkurensi; recursion guard; ledger envelope; e2e mock.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  TICK_MS,
  parseSchedule,
  computeNextRun,
  nextCronRun,
  dueStatus,
  blankStore,
  loadJobs,
  saveJobsAtomic,
  createJob,
  lockPathFor,
  acquireJobLock,
  releaseJobLock,
  validateLedgerEnvelope,
  appendLedger,
  runJobOnce,
  tickOnce,
  jobsFilePath,
  ledgerPath,
  locksDir
} from '../bin/abelink-cron.mjs'
import { checkCronRecursionGuard } from '../src/api/ai/headlessCli.js'

let tmp = null
let env = null

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-cron-test-'))
  env = { ABELINK_DATA_HOME: tmp }
})

afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
  tmp = null
  env = null
})

const okSpawn = (reply = 'kerjaan selesai') => async () => ({
  code: 0,
  stdout: JSON.stringify({ success: true, outcome: 'completed', terminalReason: 'verified', reply }),
  stderr: '',
  durationMs: 1
})
const logDeliver = async () => ({ delivered: true, platform: 'log' })

function seedDueJob(over = {}) {
  const now = Date.now()
  const job = createJob({
    name: 'uji',
    prompt: 'kerjakan X',
    schedule: { kind: 'intervalSec', everySec: 60 },
    workspace: tmp
  }, now)
  job.nextRunAt = now - 1000 // due, belum lewat satu periode -> missed:false
  Object.assign(job, over)
  saveJobsAtomic(jobsFilePath(env), { version: 1, jobs: [job] })
  return job
}

// ---- parseSchedule ----

describe('cron — parseSchedule', () => {
  it('terima intervalSec >= 60', () => {
    expect(parseSchedule({ kind: 'intervalSec', everySec: 60 })).toEqual({ kind: 'intervalSec', everySec: 60 })
    expect(parseSchedule({ kind: 'intervalSec', everySec: 3600 }).everySec).toBe(3600)
  })

  it('tolak intervalSec < 60', () => {
    expect(() => parseSchedule({ kind: 'intervalSec', everySec: 59 })).toThrow(/>= 60/)
    expect(() => parseSchedule({ kind: 'intervalSec' })).toThrow()
  })

  it('terima cron 5 field valid', () => {
    expect(parseSchedule({ kind: 'cron', expr: '0 9 * * 1' })).toEqual({ kind: 'cron', expr: '0 9 * * 1' })
  })

  it('tolak cron bukan 5 field / field rusak / kind asing', () => {
    expect(() => parseSchedule({ kind: 'cron', expr: '* * *' })).toThrow(/5 field/)
    expect(() => parseSchedule({ kind: 'cron', expr: 'xx * * * *' })).toThrow()
    expect(() => parseSchedule({ kind: 'harian' })).toThrow(/tak dikenal/)
    expect(() => parseSchedule(null)).toThrow()
  })
})

// ---- nextDue / missed ----

describe('cron — nextDue/missedPolicy', () => {
  it('intervalSec: next = from + everySec*1000', () => {
    const from = 1_700_000_000_000
    expect(computeNextRun({ schedule: { kind: 'intervalSec', everySec: 300 } }, from)).toBe(from + 300_000)
  })

  it('cron "* * * * *": menit berikutnya, sejajar menit', () => {
    const from = 1_700_000_000_000
    const next = nextCronRun('* * * * *', from, 'UTC')
    expect(next).toBeGreaterThan(from)
    expect(next % 60000).toBe(0)
    expect(next - from).toBeLessThanOrEqual(60000)
  })

  it('cron timezone tak valid throw eksplisit', () => {
    expect(() => nextCronRun('* * * * *', Date.now(), 'Mars/Olympus')).toThrow(/timezone/)
  })

  it('belum due bila nextRunAt > now', () => {
    const now = Date.now()
    expect(dueStatus({ nextRunAt: now + 60_000, schedule: { kind: 'intervalSec', everySec: 60 } }, now).due).toBe(false)
  })

  it('due tanpa missed bila baru lewat sedikit', () => {
    const now = Date.now()
    const s = dueStatus({ nextRunAt: now - 1000, schedule: { kind: 'intervalSec', everySec: 60 } }, now)
    expect(s).toEqual({ due: true, missed: false })
  })

  it('missed:true bila lewat >= satu periode interval', () => {
    const now = Date.now()
    const s = dueStatus({ nextRunAt: now - 120_000, schedule: { kind: 'intervalSec', everySec: 60 } }, now)
    expect(s).toEqual({ due: true, missed: true })
  })

  it('cron: missed bila overdue > satu tick', () => {
    const now = Date.now()
    const s = dueStatus({ nextRunAt: now - TICK_MS - 1000, schedule: { kind: 'cron', expr: '0 9 * * *' } }, now)
    expect(s).toEqual({ due: true, missed: true })
  })
})

// ---- lock O_EXCL + stale ----

describe('cron — lock contention + stale-PID', () => {
  it('kontensi: pemegang kedua ditolak', () => {
    const lp = path.join(tmp, 'a.lock')
    expect(acquireJobLock(lp).acquired).toBe(true)
    expect(() => acquireJobLock(lp)).toThrow(/locked/)
    releaseJobLock(lp)
    expect(acquireJobLock(lp).acquired).toBe(true)
    releaseJobLock(lp)
  })

  it('stale lock (PID mati) di-reap sekali', () => {
    const lp = path.join(tmp, 'stale.lock')
    fs.mkdirSync(path.dirname(lp), { recursive: true })
    fs.writeFileSync(lp, JSON.stringify({ pid: 999999999, startedAt: new Date().toISOString() }))
    const r = acquireJobLock(lp)
    expect(r.acquired).toBe(true)
    expect(r.stale).toBe(true)
    releaseJobLock(lp)
  })

  it('lock path aman dari injeksi (per-job file)', () => {
    const lp = lockPathFor('../../etc/x', env)
    expect(path.dirname(lp)).toBe(locksDir(env))
  })
})

// ---- tmp+rename ----

describe('cron — store atomic tmp+rename', () => {
  it('tulis valid + tanpa sisa .tmp', () => {
    const f = jobsFilePath(env)
    saveJobsAtomic(f, { version: 1, jobs: [{ id: 'j1' }] })
    expect(JSON.parse(fs.readFileSync(f, 'utf8'))).toEqual({ version: 1, jobs: [{ id: 'j1' }] })
    expect(fs.readdirSync(path.dirname(f)).filter((n) => n.endsWith('.tmp'))).toEqual([])
  })

  it('loadJobs tak pernah throw (missing/corrupt -> kosong)', () => {
    expect(loadJobs({ env })).toEqual(blankStore())
    const f = jobsFilePath(env)
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, '{{{rusak')
    expect(loadJobs({ env })).toEqual(blankStore())
  })

  it('createJob validasi prompt + delivery', () => {
    expect(() => createJob({ prompt: '  ', schedule: { kind: 'intervalSec', everySec: 60 } })).toThrow(/prompt/)
    expect(() => createJob({ prompt: 'p', schedule: { kind: 'intervalSec', everySec: 60 }, delivery: { platform: 'sms' } })).toThrow(/log.*telegram/)
  })
})

// ---- recursion guard ----

describe('cron — recursion guard (headlessCli)', () => {
  it('tolak cron_* di bawah ABELINK_CRON=1', () => {
    const r = checkCronRecursionGuard('cron_create', { ABELINK_CRON: '1' })
    expect(r.denied).toBe(true)
    expect(r.reason).toMatch(/cron_create/)
  })

  it('lolos: non-cron tool di bawah CRON=1, dan cron_* tanpa CRON=1', () => {
    expect(checkCronRecursionGuard('read_file', { ABELINK_CRON: '1' }).denied).toBe(false)
    expect(checkCronRecursionGuard('cron_create', {}).denied).toBe(false)
    expect(checkCronRecursionGuard('cron_list').denied).toBe(false)
  })
})

// ---- ledger envelope ----

describe('cron — ledger envelope', () => {
  const good = { v: 1, ts: new Date().toISOString(), jobId: 'j1', outcome: 'completed' }

  it('valid lolos, field hilang ditolak', () => {
    expect(validateLedgerEnvelope(good).ok).toBe(true)
    expect(validateLedgerEnvelope({ ...good, v: 2 }).ok).toBe(false)
    expect(validateLedgerEnvelope({ ...good, jobId: null }).ok).toBe(false)
    expect(validateLedgerEnvelope({ ...good, outcome: null }).ok).toBe(false)
    expect(validateLedgerEnvelope(null).ok).toBe(false)
  })

  it('appendLedger tulis JSONL satu baris; envelope rusak throw', () => {
    const lf = ledgerPath(env)
    appendLedger(lf, good)
    const lines = fs.readFileSync(lf, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(validateLedgerEnvelope(JSON.parse(lines[0])).ok).toBe(true)
    expect(() => appendLedger(lf, { v: 1 })).toThrow(/tak valid/)
  })
})

// ---- at-most-once konkurensi ----

describe('cron — at-most-once dua tick konkuren', () => {
  it('spawn stub hanya dipanggil sekali', async () => {
    const job = seedDueJob()
    let calls = 0
    const spawnFn = async () => {
      calls += 1
      await new Promise((r) => setTimeout(r, 50))
      return { code: 0, stdout: JSON.stringify({ success: true, outcome: 'completed', reply: 'ok' }), stderr: '', durationMs: 50 }
    }
    const [a, b] = await Promise.all([
      runJobOnce(job.id, { env, spawnFn, deliverFn: logDeliver }),
      runJobOnce(job.id, { env, spawnFn, deliverFn: logDeliver })
    ])
    const fired = [a, b].filter((r) => r.fired)
    expect(fired).toHaveLength(1)
    expect(calls).toBe(1)
    expect(fs.readdirSync(locksDir(env))).toEqual([]) // lock dilepas
  })
})

// ---- e2e mock ----

describe('cron — e2e intervalSec mock fire sekali', () => {
  it('tick -> fire -> ledger + lastStatus + nextRunAt maju', async () => {
    const job = seedDueJob()
    const res = await tickOnce({ env, now: Date.now(), spawnFn: okSpawn('ringkasan kerja'), deliverFn: logDeliver })
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({ jobId: job.id, fired: true, outcome: 'completed', missed: false })

    const lines = fs.readFileSync(ledgerPath(env), 'utf8').trim().split('\n')
    expect(lines).toHaveLength(1)
    const env1 = JSON.parse(lines[0])
    expect(validateLedgerEnvelope(env1).ok).toBe(true)
    expect(env1.reply).toContain('ringkasan kerja')
    expect(env1.missed).toBe(false)

    const store = loadJobs({ env })
    const upd = store.jobs.find((j) => j.id === job.id)
    expect(upd.lastRunAt).toBeTruthy()
    expect(upd.nextRunAt).toBeGreaterThan(Date.now() - 1000)
    expect(upd.lastStatus).toMatchObject({ outcome: 'completed', missed: false })
  })

  it('catch-up: overdue dua periode -> missed:true, nextRunAt dari now', async () => {
    const now = Date.now()
    const job = seedDueJob({ nextRunAt: now - 180_000 })
    const res = await tickOnce({ env, now, spawnFn: okSpawn(), deliverFn: logDeliver })
    expect(res[0].missed).toBe(true)
    const upd = loadJobs({ env }).jobs.find((j) => j.id === job.id)
    expect(upd.nextRunAt).toBeGreaterThan(now)
    expect(upd.lastStatus.missed).toBe(true)
  })

  it('job disabled tak fire; run paksa (force) tetap jalan', async () => {
    const job = seedDueJob({ enabled: false })
    expect(await tickOnce({ env, spawnFn: okSpawn(), deliverFn: logDeliver })).toEqual([])
    const forced = await runJobOnce(job.id, { env, spawnFn: okSpawn(), deliverFn: logDeliver, force: true })
    expect(forced.fired).toBe(true)
  })
})
