// Regression tests: task-level effort override + effort precedence + per-task
// effort reporting (PR #22 audit, requirement 4-5).
//
// Precedence contract: task override > benchmark override > env > system default.
// Every task result must record the effort actually used so A/B comparisons on
// the SAME task (low vs medium vs high) are possible.

import { describe, it, expect } from 'vitest'
import {
  resolveTaskEffort,
  normalizeEffort,
  SYSTEM_DEFAULT_EFFORT,
  EFFORT_VALUES,
  AGENT_ARCH_VERSION,
  BENCH_SCHEMA_VERSION
} from '../evaluation/mark-adapter.mjs'
import { aggregateRuns, detectCheat, compareReports } from '../evaluation/run.mjs'
import { TASKS } from '../evaluation/terminal-bench.mjs'

describe('effort resolution — explicit precedence', () => {
  it('system default = low', () => {
    expect(SYSTEM_DEFAULT_EFFORT).toBe('low')
    expect(resolveTaskEffort({})).toBe('low')
  })

  it('env default beats system default', () => {
    expect(resolveTaskEffort({ envEffort: 'high' })).toBe('high')
  })

  it('benchmark override beats env', () => {
    expect(resolveTaskEffort({ benchmarkEffort: 'medium', envEffort: 'high' })).toBe('medium')
  })

  it('task override beats benchmark + env', () => {
    expect(
      resolveTaskEffort({ taskEffort: 'low', benchmarkEffort: 'medium', envEffort: 'high' })
    ).toBe('low')
  })

  it('invalid values fall back', () => {
    expect(normalizeEffort('ultra', 'medium')).toBe('medium')
    expect(normalizeEffort(undefined, SYSTEM_DEFAULT_EFFORT)).toBe('low')
    expect(EFFORT_VALUES).toEqual(['low', 'medium', 'high'])
  })
})

describe('benchmark task registry — task-level effort pins exist and win', () => {
  it('pinned tasks declare effort in registry', () => {
    expect(TASKS['tb-context-01'].effort).toBe('medium')
    expect(TASKS['tb-plan-01'].effort).toBe('high')
    expect(TASKS['tb-echo-01'].effort).toBeUndefined()
  })

  it('pinned task effort wins over a benchmark default when both flow to adapter', () => {
    // Mimic runTask: task.effort is passed as task-level, opts.effort is the
    // benchmark default from run.mjs. resolveTaskEffort must keep the pin.
    const taskEffort = TASKS['tb-plan-01'].effort // 'high'
    const resolved = resolveTaskEffort({ taskEffort, benchmarkEffort: 'low', envEffort: null })
    expect(resolved).toBe('high')
  })

  it('unpinned task follows the benchmark default', () => {
    const resolved = resolveTaskEffort({
      taskEffort: undefined,
      benchmarkEffort: 'medium',
      envEffort: 'low'
    })
    expect(resolved).toBe('medium')
  })
})

const mkRun = (taskId, effort, passed, extra = {}) => ({
  taskId,
  effort,
  passed,
  durationMs: extra.durationMs ?? 100,
  steps: extra.steps ?? 1,
  toolCalls: extra.toolCalls ?? 0,
  cheatSuspected: false
})

describe('aggregateRuns — per-task effort reporting', () => {
  it('single effort keeps taskId key and records effort per run', () => {
    const agg = aggregateRuns([mkRun('a', 'medium', true), mkRun('a', 'medium', false)])
    expect(agg.schemaVersion).toBe(BENCH_SCHEMA_VERSION)
    expect(agg.tasks.a).toBeDefined()
    expect(agg.tasks.a.effort).toBe('medium')
    expect(agg.tasks.a.passRate).toBe(0.5)
    expect(agg.tasks.a.details.every((d) => d.effort === 'medium')).toBe(true)
    expect(agg.summary.byEffort.medium.runs).toBe(2)
  })

  it('mixed efforts split into taskId@effort keys (same task, low vs high)', () => {
    const agg = aggregateRuns([
      mkRun('x', 'low', true, { durationMs: 50 }),
      mkRun('x', 'low', true, { durationMs: 50 }),
      mkRun('x', 'high', true, { durationMs: 400, steps: 4, toolCalls: 2 }),
      mkRun('x', 'high', false, { durationMs: 600, steps: 6, toolCalls: 3 })
    ])
    expect(agg.tasks['x@low']).toBeDefined()
    expect(agg.tasks['x@high']).toBeDefined()
    expect(agg.tasks['x@low'].effort).toBe('low')
    expect(agg.tasks['x@high'].effort).toBe('high')
    expect(agg.tasks['x@high'].passRate).toBe(0.5)
    expect(agg.tasks['x@high'].durationMsAvg).toBe(500)
    // effort scaling reported empirically, no monotonicity assumed
    expect(agg.effortScaling.map((e) => e.effort)).toEqual(['low', 'high'])
    expect(agg.effortScaling.find((e) => e.effort === 'high').passRate).toBe(0.5)
    expect(agg.effortScaling.find((e) => e.effort === 'high').avgSteps).toBe(5)
  })

  it('per-run details carry effort, latency, steps, tool calls for analysis', () => {
    const agg = aggregateRuns([
      mkRun('y', 'high', true, { durationMs: 777, steps: 9, toolCalls: 4 })
    ])
    const d = agg.tasks.y.details[0]
    expect(d.effort).toBe('high')
    expect(d.durationMs).toBe(777)
    expect(d.steps).toBe(9)
    expect(d.toolCalls).toBe(4)
  })
})

describe('report meta — capability vs architecture separation', () => {
  it('records model/effort/architecture/toolConfig so runs are attributable', () => {
    const agg = aggregateRuns([mkRun('a', 'high', true)], {
      runs: 1,
      model: 'gemini-x',
      provider: 'gemini-web',
      runId: 'r-1',
      toolConfig: 'core+groups'
    })
    expect(agg.meta.model).toBe('gemini-x')
    expect(agg.meta.provider).toBe('gemini-web')
    expect(agg.meta.architectureVersion).toBe(AGENT_ARCH_VERSION)
    expect(agg.meta.benchmarkVersion).toBe('1.0')
    expect(agg.meta.toolConfig).toBe('core+groups')
    expect(agg.meta.runId).toBe('r-1')
    expect(agg.config.effort).toBeNull()
  })
})

describe('sweep override — explicit A/B beats task pins', () => {
  it('overrideTaskEffort semantics: forcing effort for the same task is supported by the adapter contract', () => {
    // run.mjs sweep sends opts.effort per run; runTask drops the task pin when
    // overrideTaskEffort is set so the adapter resolves to the sweep effort.
    const pinned = 'high' // e.g. tb-plan-01
    const forced = 'low'
    const adapterResolved = resolveTaskEffort({
      taskEffort: undefined, // pin dropped by runTask in sweep mode
      benchmarkEffort: forced,
      envEffort: process.env.MARK_BENCH_EFFORT
    })
    expect(adapterResolved).toBe('low')
    expect(pinned).toBe('high') // pin exists, but sweep may override it
  })
})

describe('compareReports — cross-key regression gate', () => {
  it('catches a regression when current run is a sweep (taskId@effort) vs plain baseline', () => {
    const prev = { tasks: { x: { passRate: 1.0, runs: 3 }, y: { passRate: 0.5, runs: 3 } } }
    const cur = {
      tasks: {
        'x@low': { taskId: 'x', effort: 'low', passRate: 0.0, runs: 3 },
        'x@high': { taskId: 'x', effort: 'high', passRate: 1.0, runs: 3 },
        y: { taskId: 'y', effort: 'low', passRate: 0.0, runs: 3 }
      }
    }
    const regs = compareReports(cur, prev, 5)
    // x@low turun 100% vs baseline x; y turun 50%. Keduanya WAJIB terdeteksi —
    // sebelumnya key x@low tidak cocok dengan x dan regresi dilewati diam-diam.
    expect(regs.map((r) => r.taskId).sort()).toEqual(['x', 'y'])
    const xReg = regs.find((r) => r.taskId === 'x')
    expect(xReg.effort).toBe('low')
    expect(xReg.before).toBe(1.0)
    expect(xReg.after).toBe(0.0)
  })

  it('matches prev sweep baseline when current is single-effort (plain key)', () => {
    const prev = {
      tasks: {
        'x@low': { passRate: 1.0, runs: 3 },
        'x@high': { passRate: 0.3, runs: 3 }
      }
    }
    const cur = { tasks: { x: { taskId: 'x', effort: 'low', passRate: 0.2, runs: 3 } } }
    const regs = compareReports(cur, prev, 5)
    expect(regs.length).toBe(1)
    expect(regs[0].taskId).toBe('x')
    expect(regs[0].effort).toBe('low')
  })

  it('regression below threshold stays silent', () => {
    const prev = { tasks: { x: { passRate: 0.9, runs: 3 } } }
    const cur = { tasks: { 'x@high': { taskId: 'x', effort: 'high', passRate: 0.88, runs: 3 } } }
    expect(compareReports(cur, prev, 5).length).toBe(0)
  })
})

describe('anti-cheat unaffected by effort changes', () => {
  it('detectCheat still flags memorized output without sentinel', () => {
    expect(detectCheat({ sentinel: true, expected: 'X' }, { output: 'X' }, 'S3N-a')).toBe(true)
    expect(detectCheat({ sentinel: true, expected: 'X' }, { output: 'X S3N-a' }, 'S3N-a')).toBe(
      false
    )
  })
})
