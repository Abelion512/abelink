// PR46 matrix: lane coverage, non-duplication, deterministic world-state oracles.
// Offline: worlds are synthesized on disk, no LLM, no network.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import {
  PR46_LANES,
  PR46_LANE_COUNTS,
  PR46_TOTAL_FIXTURES,
  PR46_TASKS,
  PR46_ABLATION_PAIRS,
  listPr46Tasks,
  laneCounts,
  seedPr46Fixture,
  failureThenSuccess,
} from '../evaluation/pr46-matrix.mjs'
import { validateAblationPair } from '../evaluation/pr46-experiments.mjs'
import { ALL_TASKS } from '../evaluation/terminal-bench.mjs'
import { ARCH_TASKS } from '../evaluation/bench/tasks.mjs'

const SENTINEL = 'S3N-pr46t'

const writeWorldFile = (workdir, rel, content) => {
  const p = join(workdir, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, content)
}

let root
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'pr46-matrix-'))
})
afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

const caseDir = (name) => {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  return dir
}

// One representative fixture per lane with the world it needs to PASS.
const LANE_CASES = {
  research: {
    taskId: 'pr46-research-01',
    artifact: ['laporan.md', `FAKTA-A1 kode ${SENTINEL}`],
    stepLog: [
      { tool: 'read-file', result: 'ok' },
      { tool: 'write-file', result: 'ok' },
    ],
  },
  browser: {
    taskId: 'pr46-browser-01',
    artifact: ['halaman.md', `Beranda-UTAMA TEKS-UTAMA kode ${SENTINEL}`],
    stepLog: [
      { tool: 'browser-navigate', result: 'ok' },
      { tool: 'write-file', result: 'ok' },
    ],
  },
  os: {
    taskId: 'pr46-os-01',
    artifact: ['arsip/2026/catatan.txt', `${SENTINEL}`],
    stepLog: [{ tool: 'write-file', result: 'ok' }],
  },
  study: {
    taskId: 'pr46-study-01',
    artifact: ['catatan.md', `## Konsep\n## Contoh\nENERGIK dan FOTOVOLT ${SENTINEL}`],
    stepLog: [
      { tool: 'read-file', result: 'ok' },
      { tool: 'write-file', result: 'ok' },
    ],
  },
  recovery: {
    taskId: 'pr46-recovery-01',
    artifact: ['hasil/laporan-cadangan.md', `terhalang, memakai fallback ${SENTINEL}`],
    stepLog: [{ tool: 'write-file', result: 'ok' }],
  },
  reuse: {
    taskId: 'pr46-reuse-01',
    artifact: ['reuse.md', `sesi-2026-A HASIL-UTAMA ${SENTINEL}`],
    stepLog: [
      { tool: 'read-file', result: 'ok' },
      { tool: 'write-file', result: 'ok' },
    ],
  },
}

describe('PR46 matrix composition', () => {
  it('has exactly 30 fixtures across the documented lanes', () => {
    expect(Object.keys(PR46_TASKS).length).toBe(PR46_TOTAL_FIXTURES)
    expect(PR46_TOTAL_FIXTURES).toBe(30)
    expect(laneCounts()).toEqual(PR46_LANE_COUNTS)
    expect(PR46_LANE_COUNTS[PR46_LANES.RESEARCH]).toBe(6)
    expect(PR46_LANE_COUNTS[PR46_LANES.BROWSER]).toBe(5)
    expect(PR46_LANE_COUNTS[PR46_LANES.OS]).toBe(5)
    expect(PR46_LANE_COUNTS[PR46_LANES.STUDY]).toBe(5)
    expect(PR46_LANE_COUNTS[PR46_LANES.RECOVERY]).toBe(5)
    expect(PR46_LANE_COUNTS[PR46_LANES.REUSE]).toBe(4)
  })

  it('does not duplicate existing benchmark registries', () => {
    for (const id of Object.keys(PR46_TASKS)) {
      expect(ALL_TASKS[id], `id ${id} collides with legacy registry`).toBeUndefined()
      expect(ARCH_TASKS.some((t) => t.taskId === id)).toBe(false)
    }
  })

  it('every fixture has a distinct id, and variants are unique except the ablation pair', () => {
    const ids = Object.keys(PR46_TASKS)
    expect(new Set(ids).size).toBe(ids.length)
    const variants = Object.values(PR46_TASKS).map((t) => t.variant)
    const seen = new Set()
    const duplicated = new Set()
    for (const v of variants) {
      if (seen.has(v)) duplicated.add(v)
      seen.add(v)
    }
    // The only permitted variant collision is the documented ablation pair.
    const pair = PR46_ABLATION_PAIRS[0]
    expect([...duplicated]).toEqual([PR46_TASKS[pair.raw].variant])
    expect(PR46_TASKS[pair.raw].variant).toBe(PR46_TASKS[pair.semanticFirst].variant)
  })

  it('every fixture has the required runner contract fields + a sentinel', () => {
    for (const t of listPr46Tasks()) {
      expect(t.maxTurns).toBeGreaterThan(0)
      expect(typeof PR46_TASKS[t.taskId].prompt).toBe('string')
      expect(PR46_TASKS[t.taskId].prompt).toContain('{{WORKDIR}}')
      expect(PR46_TASKS[t.taskId].prompt).toContain('{{SENTINEL}}')
      expect(PR46_TASKS[t.taskId].sentinel).toBe(true)
      expect(typeof PR46_TASKS[t.taskId].verify).toBe('function')
    }
  })
})

describe('PR46 deterministic oracles (one per lane)', () => {
  for (const [lane, c] of Object.entries(LANE_CASES)) {
    it(`${lane}: oracle FAILs without evidence and PASSes on a correct world`, () => {
      const task = PR46_TASKS[c.taskId]
      const dir = caseDir(`${lane}-${c.taskId}`)
      seedPr46Fixture(task, dir, SENTINEL)

      // FAIL before the artifact exists.
      expect(task.verify('klaim selesai tanpa bukti', { sentinel: SENTINEL, workdir: dir, stepLog: [] })).toBe(false)

      // PASS once the world matches the oracle.
      writeWorldFile(dir, ...c.artifact)
      expect(task.verify('selesai', { sentinel: SENTINEL, workdir: dir, stepLog: c.stepLog })).toBe(true)

      // Deterministic: repeating the same check yields the same verdict.
      expect(task.verify('selesai', { sentinel: SENTINEL, workdir: dir, stepLog: c.stepLog })).toBe(true)
    })
  }

  it('rejects a world seeded with another run sentinel (anti-memorization)', () => {
    const task = PR46_TASKS['pr46-research-01']
    const dir = caseDir('foreign-sentinel')
    seedPr46Fixture(task, dir, 'S3N-lain')
    writeWorldFile(dir, 'laporan.md', 'FAKTA-A1 kode S3N-lain')
    expect(task.verify('x', { sentinel: SENTINEL, workdir: dir, stepLog: [{ tool: 'read-file' }, { tool: 'write-file' }] })).toBe(false)
  })

  it('recovery lane requires a different-tool success after a failure', () => {
    const task = PR46_TASKS['pr46-recovery-04']
    const dir = caseDir('recovery-loop')
    seedPr46Fixture(task, dir, SENTINEL)
    writeWorldFile(dir, 'perbaikan.md', `gagal membaca, kode ${SENTINEL}`)
    // Repeated failure with no successful different tool is not recovery.
    const stuck = [
      { tool: 'read-file', result: 'ERROR: rusak' },
      { tool: 'read-file', result: 'ERROR: rusak' },
      { tool: 'read-file', result: 'ERROR: rusak' },
    ]
    expect(task.verify('x', { sentinel: SENTINEL, workdir: dir, stepLog: stuck })).toBe(false)
    const recovered = [
      { tool: 'read-file', result: 'ERROR: rusak' },
      { tool: 'run-shell', result: 'ok' },
      { tool: 'write-file', result: 'ok' },
    ]
    expect(task.verify('x', { sentinel: SENTINEL, workdir: dir, stepLog: recovered })).toBe(true)
  })

  it('identical-tool retry is not counted as recovery', () => {
    // failureThenSuccess only credits a DIFFERENT tool after the failure.
    const sameTool = [
      { tool: 'read-file', result: 'ERROR: rusak' },
      { tool: 'read-file', result: 'ok' },
    ]
    const differentTool = [
      { tool: 'read-file', result: 'ERROR: rusak' },
      { tool: 'run-shell', result: 'ok' },
    ]
    expect(failureThenSuccess(sameTool)).toBe(false)
    expect(failureThenSuccess(differentTool)).toBe(true)
  })

  it('bounded-repeat oracle rejects an unbounded loop', () => {
    const task = PR46_TASKS['pr46-recovery-05']
    const dir = caseDir('bounded-repeat')
    seedPr46Fixture(task, dir, SENTINEL)
    writeWorldFile(dir, 'verifikasi.md', `STATUS-OK ${SENTINEL}`)
    const looping = [
      { tool: 'read-file', query: 'status.txt' },
      { tool: 'read-file', query: 'status.txt' },
      { tool: 'read-file', query: 'status.txt' },
      { tool: 'write-file', result: 'ok' },
    ]
    expect(task.verify('x', { sentinel: SENTINEL, workdir: dir, stepLog: looping })).toBe(false)
    expect(task.verify('x', { sentinel: SENTINEL, workdir: dir, stepLog: [{ tool: 'read-file', query: 's' }, { tool: 'write-file' }] })).toBe(true)
  })

  it('seeding writes the lane world to disk', () => {
    const task = PR46_TASKS['pr46-study-01']
    const dir = caseDir('seed-world')
    seedPr46Fixture(task, dir, SENTINEL)
    expect(existsSync(join(dir, 'kuliah.txt'))).toBe(true)
  })
})

describe('PR46 representation ablation pair', () => {
  it('ablation fixtures are identical except observation representation', () => {
    for (const pair of PR46_ABLATION_PAIRS) {
      const result = validateAblationPair(PR46_TASKS[pair.raw], PR46_TASKS[pair.semanticFirst])
      expect(result.valid, JSON.stringify(result.mismatches)).toBe(true)
      expect(result.representationDiffers).toBe(true)
      expect(PR46_TASKS[pair.raw].representation).toBe('raw')
      expect(PR46_TASKS[pair.semanticFirst].representation).toBe('semantic-first')
    }
  })
})
