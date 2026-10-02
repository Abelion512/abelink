// Test generator matrix Promptfoo: emit harus deterministik, jumlah fixture
// konsisten dengan PR46_TOTAL_FIXTURES, JSONL valid per baris, vars lengkap.
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import matrix from '../evaluation/pr46-matrix.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GEN = path.resolve(HERE, '../evaluation/promptfoo/generate-matrix.ts')

describe('generate-matrix (Promptfoo x AbelinkBench PR46)', () => {
  it('emit 30 fixture ke out-dir sementara dan manifest konsisten', () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'pf-matrix-'))
    try {
      execFileSync('bun', [GEN, '--out', tmp], { encoding: 'utf8' })
      const manifest = JSON.parse(readFileSync(path.join(tmp, 'manifest.json'), 'utf8'))
      expect(manifest.totalFixtures).toBe(30)
      expect(manifest.totalFixtures).toBe(manifest.expectedTotal)

      const jsonl = readFileSync(path.join(tmp, 'pr46-tests.jsonl'), 'utf8').trim().split('\n')
      expect(jsonl.length).toBe(30)
      const ids = jsonl.map((l) => JSON.parse(l).description.split(' ')[0])
      expect(new Set(ids).size).toBe(30)

      for (const line of jsonl) {
        const rec = JSON.parse(line)
        expect(typeof rec.vars.task).toBe('string')
        expect(rec.vars.task.length).toBeGreaterThan(10)
        expect(rec.vars.effort).toMatch(/^(low|medium|high|xhigh|max|ultra)$/)
        expect(rec.assert[0].metric).toBe('deterministic')
        expect(rec.assert[0].value).toContain('engineSuccess')
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }, 60000)

  it('deterministik: dua emit berurutan identik byte-per-byte', () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'pf-matrix-'))
    try {
      execFileSync('bun', [GEN, '--out', tmp], { encoding: 'utf8' })
      const j1 = readFileSync(path.join(tmp, 'pr46-tests.jsonl'), 'utf8')
      execFileSync('bun', [GEN, '--out', tmp], { encoding: 'utf8' })
      const j2 = readFileSync(path.join(tmp, 'pr46-tests.jsonl'), 'utf8')
      expect(j1).toBe(j2)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }, 60000)

  it('coverage lane: 6 lane PR46 semuanya terwakili di JSONL', () => {
    const tasks = matrix.listPr46Tasks()
    const lanes = new Set(tasks.map((t) => t.lane))
    expect(lanes.size).toBe(6)
    expect(matrix.PR46_TOTAL_FIXTURES).toBe(30)
    // minimal offline subset harus subset dari matrix
    for (const id of matrix.PR46_MINIMAL_OFFLINE) {
      expect(tasks.some((t) => t.taskId === id)).toBe(true)
    }
  })

  it('generated/ di repo sinkron dengan output generator (tidak basi)', () => {
    const genDir = path.resolve(HERE, '../evaluation/promptfoo/generated')
    expect(existsSync(path.join(genDir, 'pr46-tests.jsonl'))).toBe(true)
    const committed = readFileSync(path.join(genDir, 'pr46-tests.jsonl'), 'utf8')
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'pf-matrix-'))
    try {
      execFileSync('bun', [GEN, '--out', tmp], { encoding: 'utf8' })
      const fresh = readFileSync(path.join(tmp, 'pr46-tests.jsonl'), 'utf8')
      expect(committed).toBe(fresh)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }, 60000)
})
