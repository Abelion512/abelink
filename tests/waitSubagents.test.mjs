// wait_subagents completeness contract: success:true ONLY when every target
// agent is COMPLETE. FAILED/RUNNING/TRUNCATED => success:false + concrete
// recovery, so truncated sub-agent output never silently becomes synthesis
// input (RI-11/12/13).
//
// Pure-function style: tests buildWaitReport/getAgentCompleteness directly
// with plain agent objects. No store mock needed — the report builder takes
// final agent snapshots, never touches Dexie itself.
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { buildWaitReport, getAgentCompleteness } from '../src/hooks/agent/plan/agentTools.js'

const agent = (overrides = {}) => ({
  id: 'sub_1',
  name: 'Riset',
  role: 'Researcher',
  goal: 'Kumpulkan data',
  status: 'idle',
  turnCount: 3,
  finalAnswer: 'Laporan lengkap.',
  ...overrides
})

describe('getAgentCompleteness', () => {
  it('idle + finalAnswer tanpa marker => COMPLETE', () => {
    expect(getAgentCompleteness(agent())).toBe('COMPLETE')
  })
  it('finalAnswer memuat DIPOTONG => TRUNCATED', () => {
    expect(
      getAgentCompleteness(agent({ finalAnswer: 'Data... [...SISA DATA DIPOTONG (Total: 9 karakter)...]' }))
    ).toBe('TRUNCATED')
  })
  it('failed/killed => FAILED', () => {
    expect(getAgentCompleteness(agent({ status: 'failed' }))).toBe('FAILED')
    expect(getAgentCompleteness(agent({ status: 'killed' }))).toBe('FAILED')
  })
  it('running => RUNNING', () => {
    expect(getAgentCompleteness(agent({ status: 'running', finalAnswer: null }))).toBe('RUNNING')
  })
  it('idle tanpa jawaban (tidak ada bahan sintesis) => FAILED', () => {
    expect(getAgentCompleteness(agent({ finalAnswer: null }))).toBe('FAILED')
  })
})

describe('buildWaitReport — success hanya bila semua COMPLETE', () => {
  it('semua COMPLETE => success:true', () => {
    const r = buildWaitReport([agent(), agent({ id: 'sub_2', name: 'Analis' })])
    expect(r.success).toBe(true)
    expect(r.data).toContain('SEMUA SELESAI')
    expect(r.data).toContain('[COMPLETE]')
  })

  it('satu TRUNCATED => success:false + tag + instruksi send_message', () => {
    const r = buildWaitReport([
      agent(),
      agent({ id: 'sub_2', name: 'Analis', finalAnswer: 'Parsial... [SISA OUTPUT DIPOTONG (Total: 5 karakter)]' })
    ])
    expect(r.success).toBe(false)
    expect(r.data).toContain('[TRUNCATED]')
    expect(r.data).toContain('OUTPUT TERPOTONG')
    expect(r.data).toContain('send_message')
    expect(r.data).toContain('sub_2')
  })

  it('FAILED => success:false + instruksi send_message', () => {
    const r = buildWaitReport([agent({ id: 'sub_9', status: 'failed', finalAnswer: null })])
    expect(r.success).toBe(false)
    expect(r.data).toContain('[FAILED]')
    expect(r.data).toContain('send_message')
    expect(r.data).toContain('sub_9')
  })

  it('RUNNING => success:false + instruksi panggil ulang wait_subagents', () => {
    const r = buildWaitReport([agent({ status: 'running', finalAnswer: null })])
    expect(r.success).toBe(false)
    expect(r.data).toContain('[RUNNING]')
    expect(r.data).toContain("panggil kembali 'wait_subagents'")
  })

  it('campuran FAILED + RUNNING + TRUNCATED => success:false, semua disebut', () => {
    const r = buildWaitReport([
      agent({ id: 'sub_f', status: 'failed', finalAnswer: null }),
      agent({ id: 'sub_r', status: 'running', finalAnswer: null }),
      agent({ id: 'sub_t', finalAnswer: 'x [SISA DATA DIPOTONG (Total: 1 karakter)]' })
    ])
    expect(r.success).toBe(false)
    expect(r.data).toContain('sub_f')
    expect(r.data).toContain('sub_r')
    expect(r.data).toContain('sub_t')
  })

  it('daftar kosong (ID tak dikenal) => success:false, bukan sintesis kosong', () => {
    const r = buildWaitReport([])
    expect(r.success).toBe(false)
    expect(r.data).toContain('TIDAK ADA DATA')
  })
})
