// Tes inti limit-ladder: kontrak artefak, matematika budget, dan verdict probe.
// Tanpa LLM, tanpa network: semua predikat dan perhitungan murni, kecuali satu
// blok verifier yang menulis berkas di direktori temporer.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ARTIFACT_MARGIN,
  LADDER,
  artifactName,
  artifactsFromRungId,
  buildLimitVerdict,
  chainSum,
  checkArtifactText,
  checkDoneText,
  effortBudgets,
  expectedArtifactLine,
  expectedDoneLine,
  failureNote,
  fitsBudget,
  largestFeasibleRung,
  maxSustainedArtifacts,
  minStepsForArtifacts,
  recommendedEffortFor,
  recommendedStepsForArtifacts,
  rungId,
  classifyLimitFailure,
} from '../evaluation/limit-ladder.mjs'
import { LIMIT_TASKS, listLimitTasks, rungMaxTurns, verifyChainArtifacts } from '../evaluation/tasks-limit.mjs'
import { defaultRungTimeoutMs, planRows, selectedRungs, summarizeRung } from '../evaluation/limit-probe.mjs'

const SENTINEL = 'S3N-testlimit'

describe('limit ladder - kontrak artefak', () => {
  it('nama berkas dan id rung bolak-balik konsisten', () => {
    expect(artifactName(1)).toBe('001.txt')
    expect(artifactName(64)).toBe('064.txt')
    expect(rungId(8)).toBe('limit-chain-008')
    expect(rungId(128)).toBe('limit-chain-128')
    expect(artifactsFromRungId('limit-chain-064')).toBe(64)
    expect(artifactsFromRungId('limit-chain-abc')).toBeNull()
    expect(artifactsFromRungId('tb-echo-01')).toBeNull()
  })

  it('jumlah kumulatif berbeda tiap indeks (isi tidak bisa disalin)', () => {
    expect(chainSum(1)).toBe(1)
    expect(chainSum(3)).toBe(6)
    expect(chainSum(8)).toBe(36)
    expect(chainSum(128)).toBe(8256)
    const sums = new Set(LADDER.map((n) => chainSum(n)))
    expect(sums.size).toBe(LADDER.length)
  })

  it('baris kanonik memuat sentinel, indeks, dan total yang benar', () => {
    expect(expectedArtifactLine(SENTINEL, 3)).toBe(`${SENTINEL} step 003 sum=6`)
    expect(checkArtifactText(expectedArtifactLine(SENTINEL, 3), SENTINEL, 3)).toBe(true)
  })

  it('checkArtifactText menolak isi yang salah', () => {
    const good = expectedArtifactLine(SENTINEL, 3)
    expect(checkArtifactText(good, SENTINEL, 4)).toBe(false) // indeks tertukar
    expect(checkArtifactText(good, 'S3N-lain', 3)).toBe(false) // sentinel run lain
    expect(checkArtifactText(`${SENTINEL} step 003 sum=999`, SENTINEL, 3)).toBe(false)
    expect(checkArtifactText('', SENTINEL, 3)).toBe(false)
    expect(checkArtifactText(null, SENTINEL, 3)).toBe(false)
  })

  it('checkDoneText butuh sentinel dan jumlah yang tepat', () => {
    expect(checkDoneText(`${SENTINEL}\ncount=8`, SENTINEL, 8)).toBe(true)
    expect(checkDoneText(`${SENTINEL}\ncount=7`, SENTINEL, 8)).toBe(false)
    expect(checkDoneText('count=8', SENTINEL, 8)).toBe(false)
  })
})

describe('limit ladder - budget langkah kanonis', () => {
  it('membaca budget dari effortSystem, bukan tabel lokal', () => {
    const budgets = effortBudgets()
    expect(budgets.low).toBe(8)
    expect(budgets.medium).toBe(24)
    expect(budgets.high).toBe(48)
    expect(budgets.xhigh).toBe(64)
    expect(budgets.max).toBe(128)
    expect(budgets.ultra).toBe(256)
  })

  it('prasyarat fisik = N + margin', () => {
    expect(ARTIFACT_MARGIN).toBe(2)
    expect(minStepsForArtifacts(32)).toBe(34)
    expect(recommendedStepsForArtifacts(32)).toBe(51)
    expect(recommendedStepsForArtifacts(8)).toBe(15)
  })

  it('effort rekomendasi naik seiring rung', () => {
    expect(recommendedEffortFor(8)).toBe('medium')
    expect(recommendedEffortFor(16)).toBe('high')
    expect(recommendedEffortFor(32)).toBe('xhigh')
    expect(recommendedEffortFor(64)).toBe('max')
    expect(recommendedEffortFor(128)).toBe('ultra')
  })

  it('fitsBudget memakai prasyarat minimum, bukan rekomendasi', () => {
    // high = 48 langkah: rung 16 (butuh 18) muat, rung 32 (butuh 34) muat,
    // rung 64 (butuh 66) tidak.
    expect(fitsBudget(16, 'high')).toBe(true)
    expect(fitsBudget(32, 'high')).toBe(true)
    expect(fitsBudget(64, 'high')).toBe(false)
    expect(largestFeasibleRung('high')).toBe(32)
    expect(largestFeasibleRung('low')).toBe(null) // low=8 < 10 langkah rung 8
    expect(largestFeasibleRung('ultra')).toBe(128)
  })
})

describe('limit ladder - verdict probe', () => {
  it('kegagalan rung kecil menghentikan tangga walau rung besar lolos', () => {
    expect(maxSustainedArtifacts([])).toBe(null)
    expect(
      maxSustainedArtifacts([
        { artifacts: 8, passed: true },
        { artifacts: 16, passed: false },
        { artifacts: 32, passed: true },
      ])
    ).toBe(8)
    expect(
      maxSustainedArtifacts([
        { artifacts: 8, passed: true },
        { artifacts: 16, passed: true },
      ])
    ).toBe(16)
  })

  it('klasifikasi penyebab pecah tidak menebak tanpa data', () => {
    expect(classifyLimitFailure({ passed: true })).toBe('none')
    expect(classifyLimitFailure({ runs: 0 })).toBe('not-run')
    expect(classifyLimitFailure({ runs: 1, timedOut: true })).toBe('timeout')
    expect(classifyLimitFailure({ runs: 1, stepsAvg: 0 })).toBe('no-progress')
    expect(classifyLimitFailure({ runs: 1, stepsAvg: 32, stepBudget: 32 })).toBe('budget-exhausted')
    expect(classifyLimitFailure({ runs: 1, stepsAvg: 20, stepBudget: 32 })).toBe('incorrect-artifact')
    expect(failureNote('budget-exhausted')).toContain('budget')
  })

  it('verdict memisahkan batas kemampuan dan batas produksi', () => {
    const verdict = buildLimitVerdict({
      effort: 'high',
      runs: 1,
      results: [
        { artifacts: 8, passed: true, runs: 1, stepsAvg: 12, durationMsAvg: 1000 },
        { artifacts: 16, passed: true, runs: 1, stepsAvg: 30, durationMsAvg: 2000 },
        { artifacts: 32, passed: false, runs: 1, stepsAvg: 48, durationMsAvg: 3000 },
      ],
    })
    expect(verdict.stepBudget).toBe(48)
    expect(verdict.sustainedArtifacts).toBe(16)
    // Rung 16 lolos dengan 30 langkah (<= 48), rung 8 dengan 12: keduanya muat.
    expect(verdict.maxWithinBudget).toBe(16)
    expect(verdict.firstFailureAt).toBe(32)
    expect(verdict.failureMode).toBe('budget-exhausted')
    expect(verdict.schemaVersion).toBe(1)
  })

  it('rung yang lolos tapi melebihi budget tidak dihitung sebagai batas produksi', () => {
    const verdict = buildLimitVerdict({
      effort: 'high',
      runs: 1,
      results: [
        { artifacts: 8, passed: true, runs: 1, stepsAvg: 10 },
        { artifacts: 16, passed: true, runs: 1, stepsAvg: 50 },
      ],
    })
    expect(verdict.sustainedArtifacts).toBe(16)
    expect(verdict.maxWithinBudget).toBe(8)
  })
})

describe('limit ladder - registry task', () => {
  it('satu rung per entri LADDER, tanpa duplikat', () => {
    const listed = listLimitTasks()
    expect(listed.length).toBe(LADDER.length)
    expect(listed.map((t) => t.artifacts).sort((a, b) => a - b)).toEqual([...LADDER])
    for (const t of listed) {
      expect(LIMIT_TASKS[t.taskId]).toBeTruthy()
      expect(t.requiredTools).toEqual(['write-file'])
      expect(t.maxTurns).toBe(rungMaxTurns(t.artifacts))
    }
  })

  it('prompt tiap rung memuat placeholder yang di-resolve orchestrator', () => {
    for (const artifacts of LADDER) {
      const { prompt } = LIMIT_TASKS[rungId(artifacts)]
      expect(prompt).toContain('{{SENTINEL}}')
      expect(prompt).toContain('{{WORKDIR}}')
      expect(prompt).toContain(`count=${artifacts}`)
      expect(prompt).toContain('001.txt')
    }
  })

  it('maxTurns longgar dan tetap di bawah hard limit langkah', () => {
    expect(rungMaxTurns(8)).toBe(20)
    expect(rungMaxTurns(128)).toBe(260)
    expect(rungMaxTurns(128)).toBeLessThan(512)
  })
})

describe('limit ladder - verifier memeriksa dunia', () => {
  let workdir
  const artifacts = 3

  beforeAll(() => {
    workdir = mkdtempSync(join(tmpdir(), 'limit-ladder-'))
  })

  afterAll(() => {
    rmSync(workdir, { recursive: true, force: true })
  })

  const writeChain = (dir, n, sentinel) => {
    mkdirSync(join(dir, 'chain'), { recursive: true })
    for (let k = 1; k <= n; k++) {
      writeFileSync(join(dir, 'chain', artifactName(k)), expectedArtifactLine(sentinel, k) + '\n')
    }
    writeFileSync(join(dir, 'chain', 'DONE.txt'), `${sentinel}\n${expectedDoneLine(n)}\n`)
  }

  const evidence = [{ tool: 'write-file', result: 'ok' }]
  const ctx = (dir, stepLog = evidence) => ({ sentinel: SENTINEL, workdir: dir, stepLog })

  it('PASS bila seluruh berkas dan penutup benar', () => {
    const dir = join(workdir, 'ok')
    writeChain(dir, artifacts, SENTINEL)
    expect(verifyChainArtifacts('jawaban', ctx(dir), artifacts)).toBe(true)
  })

  it('FAIL bila bukti tool tidak ada (teks saja tidak cukup)', () => {
    const dir = join(workdir, 'ok')
    expect(verifyChainArtifacts('jawaban', ctx(dir, []), artifacts)).toBe(false)
    expect(
      verifyChainArtifacts('jawaban', ctx(dir, [{ tool: 'write-file', result: 'ERROR: ditolak' }]), artifacts)
    ).toBe(false)
  })

  it('FAIL bila satu berkas hilang', () => {
    const dir = join(workdir, 'missing')
    writeChain(dir, artifacts, SENTINEL)
    rmSync(join(dir, 'chain', artifactName(2)))
    expect(verifyChainArtifacts('jawaban', ctx(dir), artifacts)).toBe(false)
  })

  it('FAIL bila total kumulatif salah', () => {
    const dir = join(workdir, 'wrongsum')
    writeChain(dir, artifacts, SENTINEL)
    writeFileSync(join(dir, 'chain', artifactName(3)), `${SENTINEL} step 003 sum=999\n`)
    expect(verifyChainArtifacts('jawaban', ctx(dir), artifacts)).toBe(false)
  })

  it('FAIL bila berkas penutup menghitung jumlah yang salah', () => {
    const dir = join(workdir, 'wrongcount')
    writeChain(dir, artifacts, SENTINEL)
    writeFileSync(join(dir, 'chain', 'DONE.txt'), `${SENTINEL}\ncount=2\n`)
    expect(verifyChainArtifacts('jawaban', ctx(dir), artifacts)).toBe(false)
  })

  it('FAIL bila sentinel milik run lain dipakai (anti-hafalan)', () => {
    const dir = join(workdir, 'othersentinel')
    writeChain(dir, artifacts, 'S3N-runlain')
    expect(verifyChainArtifacts('jawaban', ctx(dir), artifacts)).toBe(false)
  })
})

describe('limit probe - perencanaan dan ringkasan', () => {
  it('rung dipilih menaik sesuai --start/--max', () => {
    expect(selectedRungs({ start: 16, max: 64 })).toEqual([16, 32, 64])
    expect(selectedRungs({ start: 8, max: 8 })).toEqual([8])
    expect(selectedRungs({ start: 200, max: 300 })).toEqual([])
  })

  it('planRows menandai rung yang muat per effort', () => {
    const rows = planRows(effortBudgets(), { start: 8, max: 16 })
    expect(rows.map((r) => r.artifacts)).toEqual([8, 16])
    expect(rows[0].recommendedEffort).toBe('medium')
    expect(rows[1].fits.low).toBe(false)
    expect(rows[1].fits.high).toBe(true)
  })

  it('timeout per rung menskalakan jumlah run dan berhenti di 1 jam', () => {
    expect(defaultRungTimeoutMs(1)).toBe(720000)
    expect(defaultRungTimeoutMs(3)).toBe(1920000)
    expect(defaultRungTimeoutMs(100)).toBe(3600000)
  })

  it('summarizeRung membaca laporan aggregate run.mjs', () => {
    const report = {
      tasks: { 'limit-chain-008': { runs: 3, passRate: 1, stepsAvg: 14, durationMsAvg: 9000 } },
    }
    const s = summarizeRung(report, 8, { runs: 3 })
    expect(s.passed).toBe(true)
    expect(s.stepsAvg).toBe(14)
    expect(s.passRate).toBe(1)
  })

  it('summarizeRung menandai rung yang tidak menghasilkan laporan', () => {
    const s = summarizeRung(null, 32, { timedOut: true, runs: 2 })
    expect(s.passed).toBe(false)
    expect(s.runs).toBe(0)
    expect(s.timedOut).toBe(true)
    expect(classifyLimitFailure({ runs: s.runs })).toBe('not-run')
  })

  it('summarizeRung menerima key sweep taskId@effort', () => {
    const report = { tasks: { 'limit-chain-016@high': { runs: 1, passRate: 0, stepsAvg: 32, durationMsAvg: 100 } } }
    const s = summarizeRung(report, 16, { runs: 1 })
    expect(s.passed).toBe(false)
    expect(s.stepsAvg).toBe(32)
  })
})
